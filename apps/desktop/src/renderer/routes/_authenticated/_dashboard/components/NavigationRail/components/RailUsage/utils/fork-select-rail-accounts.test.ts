import { describe, expect, it } from "bun:test";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { selectForkRailAccounts } from "./fork-select-rail-accounts";

function quotaWindow(id: string, usedPercent: number): UsageQuotaWindow {
	return { id, label: id, usedPercent, resetsAt: null };
}

function account(
	accountKey: string,
	overrides: Partial<UsageAccount> = {},
): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey,
		sourceLabel: accountKey,
		email: null,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [quotaWindow("five_hour", 25)],
		creditsBalance: null,
		extraUsage: null,
		selection: `/profiles/${accountKey}`,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	};
}

describe("selectForkRailAccounts", () => {
	it("lists unique subscriptions including distinct unreadable accounts", () => {
		const primary = account("primary", {
			isDefault: true,
			quotaIdentity: "shared",
		});
		const other = account("other");
		const stale = account("stale", { status: "token_stale", windows: [] });
		const signedOut = account("signed-out", {
			quotaIdentity: "shared",
			status: "signed_out",
			windows: [],
		});

		const [group] = selectForkRailAccounts([
			account("mirror", { quotaIdentity: "shared" }),
			other,
			stale,
			signedOut,
			primary,
			account("api", { credentialKind: "api_key" }),
		]);

		expect(group?.accounts).toEqual([primary, other, stale, signedOut]);
	});

	it("uses the readable default for the provider ring", () => {
		const primary = account("primary", { isDefault: true });
		const [group] = selectForkRailAccounts([account("other"), primary]);

		expect(group?.entry.account).toEqual(primary);
	});

	it("keeps a readable mirror for the ring while showing the default account status", () => {
		const primary = account("primary", {
			isDefault: true,
			quotaIdentity: "shared",
			status: "unavailable",
		});
		const mirror = account("mirror", { quotaIdentity: "shared" });
		const other = account("other");

		expect(selectForkRailAccounts([primary, mirror, other])).toEqual([
			{
				entry: { account: mirror, rings: mirror.windows },
				accounts: [primary, other],
			},
		]);
	});

	it("does not count the missing system login as a configured account", () => {
		const profile = account("profile");
		const placeholder = account("claude:system", {
			selection: null,
			status: "signed_out",
			windows: [],
		});
		const [group] = selectForkRailAccounts([profile, placeholder], true);

		expect(group?.accounts).toEqual([profile]);
	});

	it("respects hidden CLI options alongside managed accounts and keeps standalone CLI rings", () => {
		const cli = account("cli", { selection: null, isDefault: true });
		const profile = account("profile");

		expect(selectForkRailAccounts([cli, profile], false)).toEqual([
			{
				entry: { account: profile, rings: profile.windows },
				accounts: [profile],
			},
		]);
		expect(selectForkRailAccounts([profile, cli], true)[0]?.accounts).toEqual([
			cli,
			profile,
		]);
		expect(selectForkRailAccounts([cli], false)[0]?.entry.account).toBe(cli);
	});

	it("falls back to a ringable peer while keeping the true default first", () => {
		const primary = account("primary", {
			isDefault: true,
			windows: [quotaWindow("seven_day_sonnet", 95)],
		});
		const other = account("other", {
			windows: [quotaWindow("five_hour", 0), quotaWindow("seven_day", 50)],
		});
		const [group] = selectForkRailAccounts([other, primary]);

		expect(group).toEqual({
			entry: { account: other, rings: other.windows },
			accounts: [primary, other],
		});
	});

	it("keeps the existing two-provider limit and priority", () => {
		const entries = selectForkRailAccounts([
			account("grok", { agent: "grok" }),
			account("codex", { agent: "codex" }),
			account("claude"),
		]);

		expect(entries.map(({ entry }) => entry.account.agent)).toEqual([
			"claude",
			"codex",
		]);
	});

	it("leaves the rail empty when no subscription has a usable quota ring", () => {
		expect(selectForkRailAccounts([])).toEqual([]);
		expect(
			selectForkRailAccounts([
				account("scoped", { windows: [quotaWindow("seven_day_sonnet", 95)] }),
				account("non-finite", { windows: [quotaWindow("five_hour", NaN)] }),
				account("unreadable", { status: "unavailable" }),
				account("api", { credentialKind: "api_key" }),
			]),
		).toEqual([]);
	});
});
