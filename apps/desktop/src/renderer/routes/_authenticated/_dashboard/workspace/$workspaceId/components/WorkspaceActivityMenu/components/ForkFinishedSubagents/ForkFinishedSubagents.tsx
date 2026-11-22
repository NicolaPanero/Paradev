import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import type { FinishedSubagent } from "../../stores/activityPanelStore";
import { FinishedSubagentRow } from "../FinishedSubagentRow";

const VISIBLE_FINISHED_LIMIT = 5;

export function ForkFinishedSubagents({
	entries,
	sourceOf,
	onOpen,
}: {
	entries: readonly FinishedSubagent[];
	sourceOf: (terminalId: string) => string | undefined;
	onOpen: (entry: FinishedSubagent) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const listId = useId();
	const olderCount = Math.max(0, entries.length - VISIBLE_FINISHED_LIMIT);
	const visible = expanded ? entries : entries.slice(0, VISIBLE_FINISHED_LIMIT);
	const Icon = expanded ? ChevronUp : ChevronDown;

	return (
		<>
			<div id={listId}>
				{visible.map((entry) => (
					<FinishedSubagentRow
						key={entry.key}
						entry={entry}
						source={sourceOf(entry.terminalId)}
						onOpen={onOpen}
					/>
				))}
			</div>
			{olderCount > 0 && (
				<button
					type="button"
					aria-expanded={expanded}
					aria-controls={listId}
					onClick={() => setExpanded((value) => !value)}
					className="flex min-h-7 w-full items-center gap-2 rounded-sm px-2 py-0.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
				>
					<Icon className="size-3.5 shrink-0" />
					<span className="flex-1">
						{expanded ? <Trans>Show less</Trans> : <Trans>Show older</Trans>}
					</span>
					{!expanded && (
						<span className="tabular-nums">{formatNumber(olderCount)}</span>
					)}
				</button>
			)}
		</>
	);
}
