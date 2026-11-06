import { expect, test } from "bun:test";
import type { HarnessAdapter } from "@superset/chat-runtime";
import { EventQueue } from "@superset/chat-runtime";
import { ForkQuotaRecoveryAdapter } from "./forkQuotaRecoveryAdapter";

test("a chat moved to another login says so and keeps that login for later restarts", async () => {
	const created: (string | null | undefined)[] = [];
	const worker = (): HarnessAdapter =>
		({
			start: () => new EventQueue().iterable(),
			prompt() {},
			cancelTurn() {},
			decide() {},
			dispose: async () => {},
		}) as unknown as HarnessAdapter;
	const adapter = new ForkQuotaRecoveryAdapter(
		{
			agent: "claude",
			create: (selection) => {
				created.push(selection);
				return worker();
			},
			settings: () => ({ switchAccounts: false, resumeAtReset: false }),
			account: () => undefined,
			quota: async () => [],
			move: async () => {},
			selected: () => {},
			status: () => {},
			now: () => 1000,
		},
		"/expired",
	);
	const events = adapter.start({ cwd: "/repo" })[Symbol.asyncIterator]();
	adapter.accountReplaced("/default", "The account old can no longer be used.");
	const turn = (await events.next()).value;
	const notice = (await events.next()).value;
	expect(turn).toMatchObject({ kind: "turn", turn: { status: "completed" } });
	expect(notice).toMatchObject({
		kind: "item",
		turnId: turn.turn.id,
		item: {
			kind: "notice",
			noticeKind: "info",
			text: "The account old can no longer be used.",
		},
	});
	expect(created).toEqual(["/expired"]);
	expect((adapter as unknown as { selection: string }).selection).toBe(
		"/default",
	);
});
