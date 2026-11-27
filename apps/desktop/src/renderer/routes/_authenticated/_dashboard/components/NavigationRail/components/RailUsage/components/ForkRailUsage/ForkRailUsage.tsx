import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import { selectForkRailAccounts } from "../../utils/fork-select-rail-accounts";
import { RailUsageRing } from "../RailUsageRing";
import { ForkRailUsageAccounts } from "./components/ForkRailUsageAccounts";

export function ForkRailUsage({
	accounts,
	hostUrl,
	onOpen,
}: {
	accounts: ReadonlyArray<UsageAccount>;
	hostUrl: string | null;
	onOpen: (account: UsageAccount) => void;
}) {
	const showCliOptions = useForkCliOptions();
	return selectForkRailAccounts(accounts, showCliOptions).map((group) =>
		group.accounts.length > 1 ? (
			<ForkRailUsageAccounts
				key={group.entry.account.agent}
				entry={group.entry}
				accounts={group.accounts}
				hostUrl={hostUrl}
				onOpen={onOpen}
			/>
		) : (
			<RailUsageRing
				key={group.entry.account.agent}
				entry={group.entry}
				onOpen={() => onOpen(group.entry.account)}
			/>
		),
	);
}
