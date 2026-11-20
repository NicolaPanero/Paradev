import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { GitBranch } from "lucide-react";
import type { useForkFolderBases } from "../../hooks/useForkFolderBases";

type Props = { bases: ReturnType<typeof useForkFolderBases> };
export function ForkFolderBasePicker({ bases }: Props) {
	const { t } = useLingui();
	const { selection, setSelection, query } = bases;
	const folders = query.data ?? [];
	const common =
		folders[0]?.branches.filter((b) =>
			folders.every((f) => f.branches.includes(b)),
		) ?? [];
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-2 text-xs"
				>
					<GitBranch className="size-3" />
					<Trans>Origin branches</Trans>
					{Object.keys(selection).length > 0 && (
						<span>({Object.keys(selection).length})</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-96 max-w-[90vw] space-y-3" align="start">
				<p className="text-xs text-muted-foreground">
					<Trans>
						Choose a branch for each repository. Selected branches are fetched
						from origin before creation.
					</Trans>
				</p>
				{query.isLoading ? (
					<p className="text-xs">
						<Trans>Loading branches…</Trans>
					</p>
				) : query.isError ? (
					<p role="alert" className="text-xs text-destructive">
						<Trans>
							Could not load origin branches. Check the connection and host
							version.
						</Trans>
					</p>
				) : (
					<>
						{common.length > 0 && (
							<label className="flex flex-col gap-1 text-xs">
								<Trans>Use the same origin branch for all folders</Trans>
								<select
									aria-label={t({
										message: "Use the same origin branch for all folders",
									})}
									value=""
									className="h-8 rounded border border-border bg-background px-2"
									onChange={(e) => {
										if (e.target.value)
											setSelection(
												Object.fromEntries(
													folders.map((f) => [
														f.id,
														`origin/${e.target.value}`,
													]),
												),
											);
									}}
								>
									<option value="">{t({ message: "Choose a branch" })}</option>
									{common.map((b) => (
										<option key={b} value={b}>
											origin/{b}
										</option>
									))}
								</select>
							</label>
						)}
						<div className="max-h-72 space-y-3 overflow-y-auto">
							{folders.map((folder) => (
								<label key={folder.id} className="flex flex-col gap-1 text-xs">
									<span className="truncate font-medium" title={folder.path}>
										{folder.name}
									</span>
									<select
										aria-label={folder.name}
										className="h-8 w-full rounded border border-border bg-background px-2"
										value={selection[folder.id] ?? ""}
										onChange={(e) => {
											const next = { ...selection };
											if (e.target.value) next[folder.id] = e.target.value;
											else delete next[folder.id];
											setSelection(next);
										}}
									>
										<option value="">
											{folder.id === "primary"
												? t({ message: "Default branch" })
												: `${t({ message: "Current checkout" })}${folder.currentBranch ? ` (${folder.currentBranch})` : ""}`}
										</option>
										{folder.branches.map((branch) => (
											<option value={`origin/${branch}`} key={branch}>
												origin/{branch}
											</option>
										))}
									</select>
								</label>
							))}
						</div>
					</>
				)}
				<div className="flex justify-between">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setSelection({})}
					>
						<Trans>Reset</Trans>
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={query.isFetching}
						onClick={() => {
							void bases.refresh();
						}}
					>
						<Trans>Refresh</Trans>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
