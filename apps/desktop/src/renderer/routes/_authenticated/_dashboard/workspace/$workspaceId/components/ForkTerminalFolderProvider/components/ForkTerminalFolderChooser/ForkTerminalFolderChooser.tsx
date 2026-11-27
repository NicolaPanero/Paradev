import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { LuFolder, LuFolderGit2 } from "react-icons/lu";
import type { ForkTerminalFolderOption } from "../../fork-terminal-folder-options";

export function ForkTerminalFolderChooser({
	options,
	onCancel,
	onSelect,
}: {
	options: ForkTerminalFolderOption[];
	onCancel: () => void;
	onSelect: (cwd: string) => void;
}) {
	const { t } = useLingui();
	return (
		<Dialog open modal onOpenChange={(open) => !open && onCancel()}>
			<DialogContent
				aria-describedby={undefined}
				className="gap-0 overflow-hidden p-0 sm:max-w-md"
			>
				<DialogHeader className="px-4 pt-4 pb-2">
					<DialogTitle>
						<Trans>New terminal</Trans>
					</DialogTitle>
				</DialogHeader>
				<Command label={t({ message: "Folder" })} className="rounded-none">
					<CommandInput placeholder={t({ message: "Search" })} />
					<CommandList className="p-1">
						<CommandEmpty>
							<Trans>No results found.</Trans>
						</CommandEmpty>
						{options.map((option) => {
							const Icon = option.isGitRepo ? LuFolderGit2 : LuFolder;
							return (
								<CommandItem
									key={option.cwd}
									value={option.cwd}
									keywords={[option.name, option.sourcePath]}
									className="gap-3 rounded-md px-2.5 py-2"
									onSelect={() => onSelect(option.cwd)}
								>
									<Icon aria-hidden="true" />
									<span className="flex min-w-0 flex-col gap-0.5">
										<span className="truncate font-medium">{option.name}</span>
										<span
											className="truncate text-xs text-muted-foreground"
											title={option.sourcePath}
										>
											{option.sourcePath}
										</span>
									</span>
								</CommandItem>
							);
						})}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
