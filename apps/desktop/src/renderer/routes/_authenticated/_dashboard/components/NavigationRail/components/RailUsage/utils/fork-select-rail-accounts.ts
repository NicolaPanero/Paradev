import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { dedupeUsageAccounts } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/dedupeUsageAccounts";
import { isManagedAgent } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/visibleQuotaAgents";
import { selectRailUsage } from "./selectRailUsage";

const EMPTY_CLAUDE_LOGIN = "claude:system";

export function selectForkRailAccounts(
	accounts: ReadonlyArray<UsageAccount>,
	showCliOptions = false,
) {
	const subscriptions = accounts.filter(
		(account) =>
			account.credentialKind === "subscription" &&
			account.accountKey !== EMPTY_CLAUDE_LOGIN,
	);
	const isolatedAgents = new Set(
		subscriptions
			.filter(
				(account) =>
					account.selection !== null && isManagedAgent(account.agent),
			)
			.map((account) => account.agent),
	);
	const visible = subscriptions.filter(
		(account) =>
			showCliOptions ||
			account.selection !== null ||
			!isolatedAgents.has(account.agent),
	);
	const distinct = dedupeUsageAccounts(visible);
	const ringAccounts = visible.filter(
		(account) => selectRailUsage([account]).length > 0,
	);

	return selectRailUsage(ringAccounts).map((entry) => ({
		entry,
		accounts: distinct
			.filter((account) => account.agent === entry.account.agent)
			.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
	}));
}
