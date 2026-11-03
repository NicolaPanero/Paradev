import { Trans, useLingui } from "@lingui/react/macro";
import type { UsageLimitAction } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Check, ChevronDown, Clock } from "lucide-react";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "renderer/routes/_authenticated/components/AgentComposer/constants";
import { useForkQuotaRecovery } from "../ForkQuotaRecoveryControls/useForkQuotaRecovery";

const ARMED_CLASS =
	"bg-amber-400/10 text-amber-400 hover:bg-amber-400/15 hover:text-amber-300";

/**
 * The usage limit notice's "Resume at reset" as a menu of what the chat does
 * when quota runs out: the same choice, stored the same way, as Automatic
 * continuation. Without a host that can continue by itself it stays the plain
 * button that arms the runtime's own timer.
 */
export function ForkUsageLimitContinue({
	workspaceId,
	terminalId,
	agent,
	onRespond,
}: {
	workspaceId: string;
	terminalId: string | undefined;
	agent: string;
	onRespond: (action: UsageLimitAction) => void;
}) {
	const { t } = useLingui();
	const recovery = useForkQuotaRecovery({
		workspaceId,
		terminalId: terminalId ?? "",
		enabled: !!terminalId,
		agent,
	});
	const { mode, offered, state, choices, choose, save } = recovery;
	if (!terminalId || !offered)
		return (
			<button
				className={PILL_TRIGGER_CLASS}
				onClick={() => onRespond("resume_at_reset")}
				title={t({ message: "Continue this chat once the limit resets" })}
				type="button"
			>
				<Clock className="size-3.5" />
				<Trans>Resume at reset</Trans>
			</button>
		);
	const label =
		state?.phase === "switching" ? (
			<Trans>Continuing on {state.accountLabel}…</Trans>
		) : mode === "wait" ? (
			<Trans>Resuming at reset</Trans>
		) : mode === "switch" ? (
			<Trans>Switch account</Trans>
		) : mode === "both" ? (
			<Trans>Switch, or wait</Trans>
		) : (
			<Trans>Resume at reset</Trans>
		);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					className={cn(
						PILL_TRIGGER_CLASS,
						"group",
						mode !== "stop" && ARMED_CLASS,
					)}
					type="button"
				>
					<Clock className="size-3.5" />
					{label}
					<ChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className={cn(MENU_PANEL_CLASS, "w-[280px] p-1")}
				side="top"
			>
				{choices
					.filter((choice) => choice.available)
					.map((choice) => (
						<DropdownMenuItem
							className={cn(MENU_ROW_CLASS, "h-auto items-start py-1.5")}
							disabled={save.isPending}
							key={choice.value}
							onSelect={() => choose(choice.value)}
						>
							<span className="flex size-3.5 shrink-0 items-center justify-center pt-0.5">
								{mode === choice.value && <Check className="size-3.5" />}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block">{choice.title}</span>
								<span className="block text-[11px] text-muted-foreground">
									{choice.detail}
								</span>
							</span>
						</DropdownMenuItem>
					))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
