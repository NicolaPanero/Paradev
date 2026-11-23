import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import {
	ArrowLeft,
	ChevronDown,
	FolderGit2,
	GitBranch,
	Layers2,
	RotateCw,
} from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FormPickerTrigger } from "renderer/routes/_authenticated/components/FormPickerTrigger";
import type { useForkFolderBases } from "../../hooks/useForkFolderBases";
import { ForkBranchChoices } from "./components/ForkBranchChoices";
import { ForkFolderBaseRow } from "./components/ForkFolderBaseRow";

type Bases = ReturnType<typeof useForkFolderBases>;
const ALL_REPOSITORIES = "all-repositories";
const NO_FOLDERS: NonNullable<Bases["query"]["data"]> = [];

export function ForkFolderBasePicker({ bases }: { bases: Bases }) {
	const { t } = useLingui();
	const { selection, setSelection, query } = bases;
	const [open, setOpen] = useState(false);
	const [target, setTarget] = useState<string | null>(null);
	const returnFocus = useRef<HTMLButtonElement | null>(null);
	const titleId = useId();
	const folders = query.data ?? NO_FOLDERS;
	const common = useMemo(() => {
		const [first, ...others] = folders;
		if (!first || !others.length) return [];
		const branchSets = others.map((folder) => new Set(folder.branches));
		return first.branches.filter((branch) =>
			branchSets.every((branches) => branches.has(branch)),
		);
	}, [folders]);
	const firstSelected = selection[folders[0]?.id];
	const sharedBase = folders.every(
		(folder) => selection[folder.id] === firstSelected,
	)
		? firstSelected
		: undefined;
	const allFolders = target === ALL_REPOSITORIES && common.length > 0;
	const folder = folders.find(({ id }) => id === target);
	const editing = !query.isError && (allFolders || !!folder);
	const selectionCount = Object.keys(selection).length;
	const pickerLabel = t({ message: "Origin branches" });
	const allLabel = t({ message: "All repositories" });
	const defaultBranch = (id: string) =>
		id === "primary"
			? t({ message: "Default branch" })
			: t({ message: "Current checkout" });

	useLayoutEffect(() => {
		if (open && !editing && returnFocus.current?.isConnected) {
			returnFocus.current.focus();
			returnFocus.current = null;
		}
	}, [open, editing]);

	function changeOpen(next: boolean) {
		setOpen(next);
		if (!next) {
			setTarget(null);
			returnFocus.current = null;
		}
	}

	function edit(nextTarget: string, button: HTMLButtonElement) {
		returnFocus.current = button;
		setTarget(nextTarget);
	}

	function selectBranch(branch?: string) {
		if (folder) {
			const next = { ...selection };
			if (branch) next[folder.id] = branch;
			else delete next[folder.id];
			setSelection(next);
		} else if (allFolders && branch) {
			setSelection(Object.fromEntries(folders.map(({ id }) => [id, branch])));
		}
		setTarget(null);
	}

	return (
		<Popover open={open} onOpenChange={changeOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="group max-w-full" title={pickerLabel}>
					<GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
					<span className="truncate">{pickerLabel}</span>
					{selectionCount > 0 && (
						<span className="rounded bg-highlight/12 px-1 tabular-nums text-highlight">
							{formatNumber(selectionCount)}
						</span>
					)}
					<ChevronDown className="size-3 shrink-0 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				aria-labelledby={titleId}
				align="start"
				side="top"
				sideOffset={8}
				collisionPadding={12}
				className="flex max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[480px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg p-0 shadow-lg"
				onEscapeKeyDown={(event) => {
					if (!editing) return;
					event.preventDefault();
					setTarget(null);
				}}
			>
				<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-4">
					{editing ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							className="-ml-1"
							aria-label={t({ message: "Back" })}
							onClick={() => setTarget(null)}
						>
							<ArrowLeft className="size-4" />
						</Button>
					) : (
						<GitBranch className="size-4 shrink-0 text-muted-foreground" />
					)}
					<h2
						id={titleId}
						title={folder?.name}
						className="min-w-0 truncate text-sm font-semibold"
					>
						{editing ? (folder?.name ?? allLabel) : pickerLabel}
					</h2>
				</div>
				<div className="grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)]">
					<div
						className={cn(
							"col-start-1 row-start-1 min-h-0 overflow-y-auto overscroll-contain p-3",
							editing && "invisible",
						)}
						inert={editing}
						aria-hidden={editing || undefined}
					>
						{query.isLoading ? (
							<output className="block px-2 py-4 text-xs text-muted-foreground">
								{t({ message: "Loading branches…" })}
							</output>
						) : query.isError ? (
							<p role="alert" className="px-2 py-4 text-xs text-destructive">
								{t({
									message:
										"Could not load origin branches. Check the connection and host version.",
								})}
							</p>
						) : folders.length === 0 ? (
							<p className="px-2 py-4 text-xs text-muted-foreground">
								{t({ message: "No repositories found." })}
							</p>
						) : (
							<>
								<p className="mb-3 px-1 text-xs text-muted-foreground">
									{t({
										message:
											"Choose a branch for each repository. Selected branches are fetched from origin before creation.",
									})}
								</p>
								{common.length > 0 && (
									<div className="mb-3 overflow-hidden rounded-md border border-border/70 bg-muted/30">
										<ForkFolderBaseRow
											icon={Layers2}
											label={allLabel}
											detail={t({
												message: "Use the same origin branch for all folders",
											})}
											selected={sharedBase}
											fallbackLabel={t({ message: "Choose a branch" })}
											onClick={(event) =>
												edit(ALL_REPOSITORIES, event.currentTarget)
											}
										/>
									</div>
								)}
								<div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/70">
									{folders.map((item) => (
										<ForkFolderBaseRow
											key={item.id}
											icon={FolderGit2}
											label={item.name}
											detail={
												item.id === "primary"
													? t({ message: "Main repository" })
													: item.path
											}
											path={item.path}
											selected={selection[item.id]}
											fallbackLabel={defaultBranch(item.id)}
											fallbackBranch={
												item.id === "primary" ? null : item.currentBranch
											}
											onClick={(event) => edit(item.id, event.currentTarget)}
										/>
									))}
								</div>
							</>
						)}
					</div>
					{editing && (
						<ForkBranchChoices
							key={target}
							branches={folder?.branches ?? common}
							selected={folder ? selection[folder.id] : sharedBase}
							fallback={
								folder
									? {
											label: defaultBranch(folder.id),
											branch:
												folder.id === "primary" ? null : folder.currentBranch,
										}
									: undefined
							}
							onSelect={selectBranch}
						/>
					)}
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/70 px-3 py-2">
					{!editing && (
						<Button
							type="button"
							size="xs"
							variant="ghost"
							disabled={selectionCount === 0}
							onClick={() => setSelection({})}
						>
							{t({ message: "Reset" })}
						</Button>
					)}
					<div className="flex-1" />
					{!editing && (
						<Button
							type="button"
							size="xs"
							variant="ghost"
							disabled={query.isFetching}
							onClick={() => void bases.refresh()}
						>
							<RotateCw
								className={cn(
									"size-3.5",
									query.isFetching && "motion-safe:animate-spin",
								)}
							/>
							{t({ message: "Refresh" })}
						</Button>
					)}
					<Button type="button" size="xs" onClick={() => changeOpen(false)}>
						{t({ message: "Done" })}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
