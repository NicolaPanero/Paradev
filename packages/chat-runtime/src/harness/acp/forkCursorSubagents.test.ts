import { expect, test } from "bun:test";
import type { AdapterEvent } from "../types";
import { AcpAdapter } from "./acpAdapter";
import type { AcpTransportHandlers } from "./rpcClient";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function startCursor(protocolVersion = 1, cursor = true, resume = false) {
	let handlers!: AcpTransportHandlers;
	let subagentsEnabled = false;
	let promptId = 0;
	const events: AdapterEvent[] = [];
	const initialized: Record<string, unknown>[] = [];
	const notify = (sessionId: string, update: unknown) =>
		handlers.onLine(
			JSON.stringify({
				jsonrpc: "2.0",
				method: "session/update",
				params: { sessionId, update },
			}),
		);
	const reply = (id: number, result: unknown) =>
		handlers.onLine(JSON.stringify({ jsonrpc: "2.0", id, result }));
	const spawn = (id: string) => {
		notify("parent", {
			sessionUpdate: "tool_call",
			toolCallId: `task-${id}`,
			title: "Task: Review schema",
			kind: "other",
			status: "in_progress",
			rawInput: { _toolName: "task", description: "Review schema" },
		});
		if (subagentsEnabled)
			notify("parent", {
				sessionUpdate: "subagent_spawned",
				subagentSessionId: id,
				name: "explore",
				task: "Review schema",
				capabilities: {},
				_meta: { cursor: { toolCallId: `task-${id}`, agentId: id } },
			});
		notify("parent", {
			sessionUpdate: "tool_call_update",
			toolCallId: `task-${id}`,
			status: "completed",
			rawOutput: { durationMs: 120, isBackground: true },
		});
	};
	const end = (id: string, state = "completed") =>
		notify("parent", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: id,
			state,
		});
	const adapter = new AcpAdapter({
		command: "fake-cursor",
		forkCursorModelSelection: cursor,
		backgroundDetailIntervalMs: 0,
		createTransport: (_options, target) => {
			handlers = target;
			return {
				close: async () => {},
				send(line) {
					const frame = JSON.parse(line);
					if (frame.method === "session/prompt") {
						promptId = frame.id;
						return;
					}
					if (frame.id === undefined) return;
					if (frame.method === "initialize") {
						initialized.push(frame.params);
						const caps =
							protocolVersion === 1
								? frame.params.clientCapabilities
								: frame.params.capabilities;
						subagentsEnabled = caps._meta?.subagents !== undefined;
						queueMicrotask(() => reply(frame.id, { protocolVersion }));
						return;
					}
					queueMicrotask(() => {
						if (
							frame.method === "session/load" ||
							frame.method === "session/resume"
						) {
							spawn("old");
							end("old");
						}
						reply(frame.id, {
							sessionId: "parent",
							configOptions: [
								{
									id: "model",
									name: "Model",
									category: "model",
									type: "select",
									currentValue: "auto",
									options: [{ value: "auto", name: "Auto" }],
								},
							],
						});
					});
				},
			};
		},
	});
	const pump = (async () => {
		for await (const event of adapter.start({
			cwd: "/tmp",
			...(resume ? { resume: { harnessSessionId: "parent" } } : {}),
		}))
			events.push(event);
	})();
	await tick();
	return {
		adapter,
		events,
		initialized,
		spawn,
		end,
		notify,
		tasks: () =>
			events
				.flatMap((event) =>
					event.kind === "session" && event.session.backgroundTasks
						? [event.session.backgroundTasks]
						: [],
				)
				.at(-1),
		finishPrompt: () => reply(promptId, { stopReason: "end_turn" }),
		close: async () => {
			await adapter.dispose();
			await pump;
		},
	};
}

test.each([
	1, 2,
])("Cursor ACP %i publishes its real subagents after the Task launch completes", async (version) => {
	const agent = await startCursor(version);
	try {
		agent.adapter.prompt([{ type: "text", text: "Review the schema" }]);
		await tick();
		agent.spawn("child");
		agent.notify("child", {
			sessionUpdate: "tool_call",
			toolCallId: "read",
			title: "Read schema.prisma",
			kind: "read",
			status: "in_progress",
		});
		await tick();
		expect(agent.tasks()).toMatchObject([
			{
				id: "subagent:child",
				kind: "subagent",
				name: "explore",
				canStop: false,
			},
		]);
		expect(agent.events).toContainEqual({
			kind: "delta",
			delta: {
				type: "background",
				itemId: "subagent:child",
				append: "Read schema.prisma",
			},
		});
		expect(
			agent.events.some(
				(event) =>
					event.kind === "item" && event.item.parentItemId === "subagent:child",
			),
		).toBe(true);
		agent.finishPrompt();
		await tick();
		expect(agent.tasks()).toHaveLength(1);
		agent.end("child");
		await tick();
		expect(agent.tasks()).toEqual([]);
	} finally {
		await agent.close();
	}
});

test.each([
	"failed",
	"cancelled",
	"disconnected",
])("Cursor removes a subagent when its native state is %s", async (state) => {
	const agent = await startCursor();
	try {
		agent.spawn("child");
		await tick();
		expect(agent.tasks()).toHaveLength(1);
		agent.end("child", state);
		await tick();
		expect(agent.tasks()).toEqual([]);
	} finally {
		await agent.close();
	}
});

test.each([
	1, 2,
])("Cursor ACP %i resumes without keeping finished historical subagents active", async (version) => {
	const agent = await startCursor(version, true, true);
	try {
		expect(agent.tasks()).toEqual([]);
		agent.spawn("new");
		await tick();
		expect(agent.tasks()).toMatchObject([{ id: "subagent:new" }]);
		agent.end("new");
		await tick();
		expect(agent.tasks()).toEqual([]);
	} finally {
		await agent.close();
	}
});

test("other ACP agents keep their existing client metadata", async () => {
	const agent = await startCursor(1, false);
	try {
		for (const key of ["capabilities", "clientCapabilities"]) {
			const caps = agent.initialized[0]?.[key] as {
				_meta: Record<string, unknown>;
			};
			expect(caps._meta.subagents).toBeUndefined();
			expect(caps._meta.parameterizedModelPicker).toBeUndefined();
			expect(caps._meta.jetbrains).toBeDefined();
		}
	} finally {
		await agent.close();
	}
});
