import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	EventQueue,
	type HarnessAdapter,
	type HarnessFactoryOptions,
} from "@superset/chat-runtime";
import { createTestRuntime } from "@superset/chat-runtime/testing";
import { forkSwitchChatAccount } from "./forkSwitchChatAccount";

const flush = async () => {
	for (let index = 0; index < 30; index++) await Promise.resolve();
};

test("a chat that died on an expired login can still move to another login", async () => {
	const nativeId = randomUUID();
	const created: HarnessFactoryOptions[] = [];
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"claude-acp",
				(options: HarnessFactoryOptions) => {
					created.push(options);
					const queue = new EventQueue();
					return {
						start() {
							queue.push({
								kind: "session",
								session:
									options.accountSelection === "/expired"
										? { status: "dead" }
										: { status: "idle", harnessSessionId: nativeId },
							});
							return queue.iterable();
						},
						prompt() {},
						cancelTurn() {},
						respondToApproval() {},
						setMode() {},
						async dispose() {
							queue.close();
						},
					} as unknown as HarnessAdapter;
				},
			],
		]),
	});
	const chat = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace",
		terminalId: "terminal",
		harness: "claude-acp",
		cwd: "/tmp/project",
		accountSelection: "/expired",
		strictResume: true,
		resume: { harnessSessionId: nativeId },
	});
	await flush();
	expect(runtime.live.get(chat.sessionId)?.state.status).toBe("dead");

	let time = 0;
	const result = await forkSwitchChatAccount(
		runtime,
		{
			workspaceId: "workspace",
			terminalId: "terminal",
			chatSessionId: chat.sessionId,
			sessionId: nativeId,
			targetSelection: "/target",
		},
		{
			validateTarget: async () => {},
			move: async () => ({ moved: true }),
			clearRecovery: () => {},
			graceMs: 0,
			readinessMs: 100,
			now: () => time,
			wait: async (ms) => {
				time += ms;
				await flush();
			},
		},
	);
	expect(result.switched).toBe(true);
	expect(created.at(-1)).toMatchObject({
		accountSelection: "/target",
		resume: { harnessSessionId: nativeId },
	});
});
