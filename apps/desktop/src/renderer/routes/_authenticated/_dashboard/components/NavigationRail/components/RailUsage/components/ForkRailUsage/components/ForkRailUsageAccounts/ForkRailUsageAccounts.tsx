import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { ForkUsageStatus } from "renderer/components/ForkUsageStatus";
import { ForkUsageSummary } from "renderer/components/ForkUsageSummary";
import { useAgentAccountAliases } from "renderer/hooks/host-service/useAgentAccountAliases";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { QUOTA_AGENT_LABELS } from "renderer/utils/usage/quotaAgentLabels";
import type { RailUsageEntry } from "../../../../utils/selectRailUsage";
import { RailUsageRing } from "../../../RailUsageRing";

export function ForkRailUsageAccounts({
	entry,
	accounts,
	hostUrl,
	onOpen,
}: {
	entry: RailUsageEntry;
	accounts: UsageAccount[];
	hostUrl: string | null;
	onOpen: (account: UsageAccount) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const aliases = useAgentAccountAliases(open ? hostUrl : null);
	const dark = useIsDarkTheme();
	const agent = QUOTA_AGENT_LABELS[entry.account.agent];
	const icon = getPresetIcon(entry.account.agent, dark);
	const count = formatNumber(accounts.length);
	const title = t({ message: `${agent} account usage (${count})` });

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<RailUsageRing
				entry={entry}
				Trigger={PopoverTrigger}
				triggerLabel={title}
				badge={
					<span
						aria-hidden="true"
						className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-0.5 text-[9px] font-semibold leading-none text-background ring-2 ring-background tabular-nums"
					>
						{count}
					</span>
				}
			/>
			{open && (
				<PopoverContent
					side="right"
					align="end"
					sideOffset={10}
					aria-label={title}
					className="flex max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[min(20rem,calc(100vw-5rem))] flex-col overflow-hidden rounded-xl p-0 shadow-lg data-[state=open]:animate-none"
				>
					<div className="flex shrink-0 items-center gap-2.5 border-b bg-muted/30 px-3 py-2.5">
						{icon && (
							<img
								src={icon}
								alt=""
								className="size-7 rounded-lg border border-border/70 bg-background p-1.5 object-contain"
							/>
						)}
						<div className="min-w-0">
							<div className="truncate text-[13px] font-semibold">{agent}</div>
							<div className="text-[11px] text-muted-foreground">
								<Trans>Account usage</Trans>
							</div>
						</div>
					</div>
					<ul className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-2">
						{accounts.map((account) => {
							const alias = aliases.data?.find(
								(row) =>
									row.agent === account.agent &&
									row.selection === account.selection,
							)?.label;
							const name = alias ?? account.email ?? account.sourceLabel;
							return (
								<li
									key={account.accountKey}
									className="overflow-hidden rounded-lg border border-border/70 bg-background/50"
								>
									<button
										type="button"
										onClick={() => {
											setOpen(false);
											onOpen(account);
										}}
										title={t({ message: "Open settings" })}
										className="group flex w-full items-center gap-2 border-b border-border/60 px-2.5 py-2 text-start outline-none transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-xs font-semibold">
												{name}
											</span>
											{account.sourceLabel !== name && (
												<span className="block truncate text-[10px] text-muted-foreground">
													{account.sourceLabel}
												</span>
											)}
										</span>
										{account.isDefault && (
											<span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
												<Trans>Default</Trans>
											</span>
										)}
										<LuArrowUpRight
											aria-hidden="true"
											className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
										/>
									</button>
									<div className="space-y-1.5 px-2.5 py-2">
										<ForkUsageStatus account={account} chip />
										<ForkUsageSummary
											account={account}
											hideStatus
											hideUpdatedAt={
												account.status === "ok" ||
												account.status === "signed_out"
											}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				</PopoverContent>
			)}
		</Popover>
	);
}
