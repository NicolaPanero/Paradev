import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChatRuntime, FakeHarness } from "@superset/chat-runtime";
import {
	agentMessage,
	createBunChatDb,
	createRecordingSink,
	turn,
	waitFor,
} from "@superset/chat-runtime/testing";
import type { UsageAccount } from "../trpc/router/usage/types";
import { ForkQuotaRecoveryAdapter } from "./forkQuotaRecoveryAdapter";

test("the host resumes and journals quota-waiting work while its workspace has no subscriber", async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "fork-quota-background-"));
	const initialTime = 1_800_000_000_000;
	const resetAt = initialTime + 5 * 60_000;
	let now = initialTime;
	let waits = 0;
	const advance = Promise.withResolvers<void>();
	const source = new FakeHarness({
		start: [
			{
				kind: "session",
				session: { status: "idle", harnessSessionId: "native" },
			},
		],
		turns: [
			[
				{ kind: "turn", turn: turn("interrupted") },
				{
					kind: "turn",
					turn: turn("interrupted", {
						status: "failed",
						error: { message: "You've hit your limit · resets 5pm" },
					}),
				},
			],
		],
	});
	const reply = agentMessage(
		"background",
		"Completed while the workspace was closed",
	);
	const resumed = new FakeHarness({
		start: [
			{
				kind: "session",
				session: { status: "idle", harnessSessionId: "native" },
			},
		],
		turns: [
			[
				{ kind: "turn", turn: turn("resumed") },
				{ kind: "item", item: reply, turnId: "resumed" },
				{ kind: "turn", turn: turn("resumed", { status: "completed" }) },
				{ kind: "session", session: { status: "idle" } },
			],
		],
	});
	const workers = [source, resumed];
	const account = {
		agent: "claude" as const,
		selection: null,
		credentialKind: "subscription" as const,
		identity: "fixture",
		email: "fixture@example.invalid",
	};
	const runtime = createChatRuntime({
		dataDir,
		openDatabase: createBunChatDb,
		harnesses: new Map([
			[
				"claude-acp",
				() =>
					new ForkQuotaRecoveryAdapter({
						create: () => {
							const worker = workers.shift();
							if (!worker) throw new Error("Unexpected replacement worker");
							return worker;
						},
						account: () => account,
						settings: () => ({ switchAccounts: false, resumeAtReset: true }),
						quota: async (): Promise<UsageAccount[]> => [
							{
								...account,
								accountKey: account.identity,
								sourceLabel: "Default",
								plan: "max",
								status: "ok",
								statusDetail: null,
								windows: [
									{
										id: "five_hour",
										label: "Session",
										usedPercent: now < resetAt ? 100 : 0,
										resetsAt: new Date(
											now < resetAt ? resetAt : now + 5 * 60_000,
										),
									},
								],
								creditsBalance: null,
								extraUsage: null,
								isDefault: true,
								fetchedAt: new Date(now),
							},
						],
						move: async () => {
							throw new Error("Unexpected account switch");
						},
						selected: () => {},
						status: () => {},
						now: () => now,
						wait: async (delay) => {
							waits++;
							await advance.promise;
							now += delay;
						},
					}),
			],
		]),
	});
	try {
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace",
			harness: "claude-acp",
			terminalId: "pane",
			cwd: dataDir,
		});
		const firstView = createRecordingSink();
		const subscription = runtime.subscribe(
			sessionId,
			{ deltas: ["text"] },
			firstView.sink,
		);
		await waitFor(() => runtime.live.get(sessionId)?.state.status === "idle");
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId,
			clientId: "prompt",
			content: [{ type: "text", text: "Perform the original task" }],
		});
		await waitFor(() => waits > 0);
		subscription.unsubscribe();
		expect(runtime.subscriptions.subscriberCount(sessionId)).toBe(0);
		expect(resumed.prompted).toHaveLength(0);
		advance.resolve();
		await waitFor(
			() => runtime.live.get(sessionId)?.turn?.status === "completed",
		);
		expect(resumed.prompted).toHaveLength(1);
		const returnedView = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: ["text"] }, returnedView.sink);
		expect(returnedView.envelopes).toContainEqual(
			expect.objectContaining({
				event: expect.objectContaining({ type: "item", item: reply }),
			}),
		);
	} finally {
		advance.resolve();
		try {
			await runtime.dispose();
		} finally {
			rmSync(dataDir, { recursive: true, force: true });
		}
	}
});
