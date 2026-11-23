import { useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Check, GitBranch, RotateCcw } from "lucide-react";

interface ForkBranchChoicesProps {
	branches: string[];
	selected?: string;
	fallback?: { label: string; branch: string | null };
	onSelect: (branch?: string) => void;
}

export function ForkBranchChoices({
	branches,
	selected,
	fallback,
	onSelect,
}: ForkBranchChoicesProps) {
	const { t } = useLingui();
	const searchLabel = t({ message: "Search branches..." });
	return (
		<Command
			className="col-start-1 row-start-1 h-auto min-h-0 rounded-none [&_[cmdk-input-wrapper]]:shrink-0"
			label={searchLabel}
		>
			<CommandInput placeholder={searchLabel} autoFocus />
			<CommandList className="max-h-none min-h-0 flex-1 overscroll-contain p-1.5">
				<CommandEmpty className="text-xs">
					{t({ message: "No branches found" })}
				</CommandEmpty>
				{fallback && (
					<CommandItem
						value={fallback.label}
						keywords={fallback.branch ? [fallback.branch] : undefined}
						aria-current={!selected ? "true" : undefined}
						onSelect={() => onSelect()}
						className="min-h-9 rounded-md"
					>
						<RotateCcw className="size-3.5" />
						<span className="min-w-0 truncate">{fallback.label}</span>
						{fallback.branch && (
							<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
								{fallback.branch}
							</span>
						)}
						{!selected && <Check className="ml-auto size-3.5 text-highlight" />}
					</CommandItem>
				)}
				<CommandGroup
					heading={t({ message: "Origin branches" })}
					className="p-0"
				>
					{branches.map((branch) => {
						const ref = `origin/${branch}`;
						return (
							<CommandItem
								key={ref}
								value={ref}
								aria-current={ref === selected ? "true" : undefined}
								onSelect={() => onSelect(ref)}
								className="min-h-9 rounded-md"
							>
								<GitBranch className="size-3.5" />
								<span
									className="min-w-0 flex-1 truncate font-mono text-xs"
									title={ref}
								>
									{ref}
								</span>
								{ref === selected && (
									<Check className="size-3.5 text-highlight" />
								)}
							</CommandItem>
						);
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}
