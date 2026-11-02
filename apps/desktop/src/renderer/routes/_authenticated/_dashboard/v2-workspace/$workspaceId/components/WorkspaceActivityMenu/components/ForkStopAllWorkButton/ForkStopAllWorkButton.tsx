import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Square } from "lucide-react";

export function ForkStopAllWorkButton({
	count,
	onStopAll,
}: {
	count: number;
	onStopAll: () => void;
}) {
	const { t } = useLingui();
	if (count === 0) return null;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Stop all agent background processes" })}
					onClick={onStopAll}
					className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
				>
					<Square className="size-2.5 fill-current" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				<Trans>Stop all agent background processes</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
