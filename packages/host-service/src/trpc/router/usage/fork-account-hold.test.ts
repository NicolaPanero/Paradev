import { expect, test } from "bun:test";
import {
	ACCOUNT_LAPSE_CONFIRM_MS,
	holdLapsedAccounts,
} from "./fork-account-hold";
import type { UsageAccount } from "./types";

const good: UsageAccount = {
	agent: "claude",
	credentialKind: "subscription",
	accountKey: "/profiles/work",
	sourceLabel: "~/work",
	email: "dev@example.invalid",
	plan: "team",
	status: "ok",
	statusDetail: null,
	windows: [
		{ id: "five_hour", label: "Session (5h)", usedPercent: 40, resetsAt: null },
	],
	creditsBalance: null,
	extraUsage: null,
	selection: "/profiles/work",
	isDefault: false,
	fetchedAt: new Date(0),
};
const signedOut: UsageAccount = {
	...good,
	status: "signed_out",
	statusDetail: null,
	windows: [],
};

test("one failed read keeps the last good row until the lapse is confirmed", () => {
	const state = new Map();
	const logs: string[] = [];
	const read = (account: UsageAccount, at: number) =>
		holdLapsedAccounts([account], state, at, (line) => logs.push(line))[0];

	expect(read(good, 0)?.status).toBe("ok");
	expect(read(signedOut, 15_000)).toEqual(good);
	expect(read(good, 30_000)?.status).toBe("ok");

	expect(read(signedOut, 45_000)?.status).toBe("ok");
	expect(read(signedOut, 45_000 + ACCOUNT_LAPSE_CONFIRM_MS)?.status).toBe(
		"signed_out",
	);
	expect(logs).toHaveLength(4);
});

test("a stale token, another account or a different login is not held", () => {
	const state = new Map();
	const read = (account: UsageAccount) =>
		holdLapsedAccounts([account], state, 1_000, () => {})[0];

	read(good);
	expect(read({ ...good, status: "token_stale", windows: [] })?.status).toBe(
		"token_stale",
	);
	expect(
		read({ ...signedOut, email: "someone-else@example.invalid" })?.status,
	).toBe("signed_out");
	expect(read({ ...signedOut, selection: "/profiles/other" })?.status).toBe(
		"signed_out",
	);
});
