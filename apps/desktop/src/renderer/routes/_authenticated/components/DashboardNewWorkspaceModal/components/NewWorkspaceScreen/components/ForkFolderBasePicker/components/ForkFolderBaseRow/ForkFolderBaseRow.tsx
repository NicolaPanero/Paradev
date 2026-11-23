import { cn } from "@superset/ui/utils";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import type { MouseEventHandler } from "react";

interface ForkFolderBaseRowProps {
	icon: LucideIcon;
	label: string;
	detail: string;
	path?: string;
	selected?: string;
	fallbackLabel: string;
	fallbackBranch?: string | null;
	onClick: MouseEventHandler<HTMLButtonElement>;
}

export function ForkFolderBaseRow({
	icon: Icon,
	label,
	detail,
	path,
	selected,
	fallbackLabel,
	fallbackBranch,
	onClick,
}: ForkFolderBaseRowProps) {
	return (
		<button
			type="button"
			className="group flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
			onClick={onClick}
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/60 text-muted-foreground">
				<Icon className="size-4" aria-hidden="true" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium" title={label}>
					{label}
				</span>
				<span
					className="block truncate text-left text-[11px] text-muted-foreground"
					title={path ?? detail}
					dir={detail === path ? "rtl" : undefined}
				>
					<bdi>{detail}</bdi>
				</span>
			</span>
			<span
				className={cn(
					"flex max-w-[42%] min-w-0 items-center gap-1 rounded-md px-2 py-1",
					selected
						? "bg-highlight/12 text-highlight"
						: "bg-muted/55 text-muted-foreground",
				)}
			>
				{selected && <Check className="size-3 shrink-0" aria-hidden="true" />}
				<span className="min-w-0 text-right">
					<span
						className={cn("block truncate text-xs", selected && "font-mono")}
						title={selected ?? fallbackLabel}
					>
						{selected?.replace(/^origin\//, "") ?? fallbackLabel}
					</span>
					{!selected && fallbackBranch && (
						<span
							className="block truncate font-mono text-[11px]"
							title={fallbackBranch}
						>
							{fallbackBranch}
						</span>
					)}
				</span>
			</span>
			<ChevronRight
				className="size-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground"
				aria-hidden="true"
			/>
		</button>
	);
}
