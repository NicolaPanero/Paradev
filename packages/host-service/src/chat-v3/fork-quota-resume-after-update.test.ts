import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ChatRuntime,
	ResumeSessionInput,
	UnfinishedSession,
} from "@superset/chat-runtime";
import {
	quotaRecoveryNeedsManualResume,
	recoveryControllers,
	recoveryKey,
} from "./forkQuotaRecoveryStore";
import {
	recordUnfinishedChats,
	resumeUnfinishedChats,
} from "./resumeAfterUpdate";

test("an update offers quota-held chats for manual resume and continues other interrupted chats", () => {
	const directory = mkdtempSync(join(tmpdir(), "fork-quota-resume-"));
	const markerPath = join(directory, "update.json");
	const sessions = ["waiting", "switching", "active"].map(
		(sessionId): UnfinishedSession => ({
			sessionId,
			scopeId: "quota-update-workspace",
			harness: "claude-acp",
			harnessSessionId: `native-${sessionId}`,
			terminalId: sessionId,
			interrupted: true,
			prompts: [],
			pausedPrompts: [[{ type: "text", text: "a paused prompt" }]],
		}),
	);
	const resumed: ResumeSessionInput[] = [];
	const runtime = {
		live: { unfinished: () => sessions, supports: () => true },
		commands: {
			resumeSession: (input: ResumeSessionInput) => resumed.push(input),
		},
	} as unknown as ChatRuntime;
	const keys = ["waiting", "switching"].map((phase) =>
		recoveryKey("quota-update-workspace", phase),
	);
	try {
		for (const phase of ["waiting", "switching"] as const)
			recoveryControllers.set(recoveryKey("quota-update-workspace", phase), {
				status: { phase },
				changed: () => {},
			});
		writeFileSync(markerPath, JSON.stringify({ requestedAt: 1_000 }));
		expect(
			recordUnfinishedChats(
				runtime,
				markerPath,
				quotaRecoveryNeedsManualResume,
			),
		).toBe(true);
		for (const key of keys) recoveryControllers.delete(key);
		const result = resumeUnfinishedChats({
			markerPath,
			runtime: () => runtime,
			resolveCwd: () => directory,
			now: 2_000,
		});
		expect(resumed.map((input) => input.sourceSessionId)).toEqual(["active"]);
		expect(result.offer.map((chat) => chat.sessionId)).toEqual([
			"waiting",
			"switching",
		]);
		expect(result.offer[0]?.pausedPrompts).toEqual(sessions[0]?.pausedPrompts);
	} finally {
		for (const key of keys) recoveryControllers.delete(key);
		rmSync(directory, { recursive: true, force: true });
	}
});
