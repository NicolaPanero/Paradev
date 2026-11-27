import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { useId, useState } from "react";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
} from "renderer/routes/_authenticated/components/AgentComposer/constants";
import {
	type ForkAutoCompactTarget,
	useForkAutoCompact,
} from "./useForkAutoCompact";

export function ForkAutoCompactMenu({
	target,
}: {
	target: ForkAutoCompactTarget;
}) {
	const { t } = useLingui();
	const [draft, setDraft] = useState<string | null>(null);
	const inputId = useId();
	const { setting, mutation } = useForkAutoCompact(target, true);
	if (!setting) return null;
	const percent = setting.unit === "percent";
	const min = setting.unit === "reserved" ? 0 : 1;
	const thresholdLabel =
		setting.unit === "reserved"
			? t({ message: "Reserved tokens" })
			: percent
				? t({ message: "Threshold (%)" })
				: t({ message: "Threshold (tokens)" });
	const configured = setting.value ?? setting.configured;
	const formatValue = (value: number) =>
		percent
			? formatNumber(value / 100, { style: "percent" })
			: formatNumber(value);
	const text = draft ?? (configured === null ? "" : String(configured));
	const value = Number(text);
	const valid =
		text.trim() !== "" &&
		Number.isSafeInteger(value) &&
		value >= min &&
		(!percent || value <= 100);
	const save = (next: number | null) => {
		mutation.mutate(next, { onSuccess: () => setDraft(null) });
	};
	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (!open) {
					setDraft(null);
					if (!mutation.isPending) mutation.reset();
				}
			}}
		>
			<DropdownMenuSubTrigger className={MENU_ROW_CLASS}>
				<span className="min-w-0 flex-1 truncate">
					<Trans>Auto-compact</Trans>
				</span>
				<span className="shrink-0 text-muted-foreground">
					{setting.value === null && <Trans>Default</Trans>}
					{configured !== null &&
						(setting.value === null
							? ` · ${formatValue(configured)}`
							: formatValue(configured))}
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuPortal>
				<DropdownMenuSubContent className={`${MENU_PANEL_CLASS} w-56 p-2`}>
					<form
						className="space-y-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (valid && !mutation.isPending) save(value);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Escape") event.stopPropagation();
						}}
					>
						<label className="block text-xs font-medium" htmlFor={inputId}>
							{thresholdLabel}
						</label>
						<Input
							id={inputId}
							type="number"
							inputMode="numeric"
							min={min}
							max={percent ? 100 : undefined}
							step={1}
							className="h-7"
							value={text}
							onChange={(event) => setDraft(event.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							<Trans>Applies at the next agent launch.</Trans>
						</p>
						{mutation.isError && (
							<p role="alert" className="text-xs text-destructive">
								<Trans>Could not save auto-compact.</Trans>
							</p>
						)}
						<div className="flex flex-wrap justify-between gap-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 px-2"
								disabled={setting.value === null || mutation.isPending}
								onClick={() => save(null)}
							>
								<Trans>Reset to default</Trans>
							</Button>
							<Button
								type="submit"
								size="sm"
								className="h-7 px-2"
								disabled={
									!valid || setting.value === value || mutation.isPending
								}
							>
								<Trans>Save</Trans>
							</Button>
						</div>
					</form>
				</DropdownMenuSubContent>
			</DropdownMenuPortal>
		</DropdownMenuSub>
	);
}
