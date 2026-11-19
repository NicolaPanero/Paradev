import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useId, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { notifyProjectFoldersChanged } from "renderer/lib/projectFoldersChanged";
import type { ForkProjectComposerMode } from "renderer/stores/fork-project-composer";

type Source = {
	path: string;
	name: string;
	projectNames: string[];
	isGitRepo: boolean | null;
};

export function ForkProjectComposerDialog({
	mode,
	client,
	canBrowse,
	hostUrl,
	onClose,
	onCreated,
}: {
	mode: ForkProjectComposerMode;
	client: HostServiceClient | null;
	canBrowse: boolean;
	hostUrl: string | null;
	onClose: () => void;
	onCreated: (result: { projectId: string; repoPath: string }) => void;
}) {
	const { t } = useLingui();
	const id = useId();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [primary, setPrimary] = useState("");
	const [browsed, setBrowsed] = useState<Source[]>([]);
	const sources = useQuery({
		queryKey: [
			"fork-group-sources",
			hostUrl,
			mode.kind === "add" ? mode.projectId : null,
		],
		queryFn: () => {
			if (!client) throw new Error("Host is unavailable");
			return client.project.groupSources.query(
				mode.kind === "add" ? { projectId: mode.projectId } : undefined,
			);
		},
		enabled: !!client,
		retry: false,
	});
	const catalog: Source[] = sources.data ?? [];
	const all = [
		...catalog,
		...browsed.filter(
			(folder) => !catalog.some((known) => known.path === folder.path),
		),
	];
	const primaryChoices = all.filter(
		(folder) => selected.includes(folder.path) && folder.isGitRepo !== false,
	);
	const main = primaryChoices.some((folder) => folder.path === primary)
		? primary
		: (primaryChoices[0]?.path ?? "");
	const pick = electronTrpc.window.selectDirectory.useMutation({
		onSuccess: (result) => {
			if (result.canceled) return;
			setBrowsed((current) => [
				...current,
				...result.paths
					.filter((path) => !current.some((folder) => folder.path === path))
					.map((path) => ({
						path,
						name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
						projectNames: [],
						isGitRepo: null,
					})),
			]);
			setSelected((current) => [...new Set([...current, ...result.paths])]);
		},
	});
	const save = useMutation({
		mutationFn: async () => {
			if (!client) throw new Error("Host is unavailable");
			if (mode.kind === "add") {
				await client.project.attachFolders.mutate({
					projectId: mode.projectId,
					folders: selected,
				});
				return null;
			}
			return client.project.createGroup.mutate({
				name: name.trim(),
				primaryPath: main,
				folders: selected.filter((path) => path !== main),
			});
		},
		onSuccess: (result) => {
			void queryClient.invalidateQueries({ queryKey: ["project-folders"] });
			void queryClient.invalidateQueries({ queryKey: ["fork-group-sources"] });
			notifyProjectFoldersChanged();
			if (result) onCreated(result);
			onClose();
		},
	});
	const pending = save.isPending || pick.isPending;
	const error = sources.error || save.error || pick.error;
	const unavailable =
		sources.error instanceof TRPCClientError &&
		sources.error.data?.code === "NOT_FOUND";
	const filter = search.toLowerCase();
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{mode.kind === "create" ? (
							<Trans>Project from existing folders</Trans>
						) : (
							<Trans>Reuse existing folders</Trans>
						)}
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Repositories can belong to several projects without cloning them.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{mode.kind === "create" && (
					<div className="space-y-2">
						<Label htmlFor={`${id}-name`}>
							<Trans>Project name</Trans>
						</Label>
						<Input
							id={`${id}-name`}
							value={name}
							disabled={pending}
							onChange={(event) => setName(event.target.value)}
							autoFocus
						/>
					</div>
				)}
				<Input
					aria-label={t({ message: "Search folders or projects" })}
					placeholder={t({ message: "Search folders or projects" })}
					value={search}
					disabled={pending}
					onChange={(event) => setSearch(event.target.value)}
				/>
				<div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
					{sources.isPending && (
						<p className="p-2 text-sm text-muted-foreground">
							<Trans>Loading…</Trans>
						</p>
					)}
					{sources.isSuccess && all.length === 0 && (
						<p className="p-2 text-sm text-muted-foreground">
							{canBrowse ? (
								<Trans>No existing folders found. Browse to add one.</Trans>
							) : (
								<Trans>No extra folders.</Trans>
							)}
						</p>
					)}
					{all
						.filter((folder) =>
							[folder.name, folder.path, ...folder.projectNames].some((value) =>
								value.toLowerCase().includes(filter),
							),
						)
						.map((folder) => (
							<label
								key={folder.path}
								className="flex cursor-pointer items-start gap-2 rounded p-2 hover:bg-muted"
							>
								<input
									type="checkbox"
									className="mt-1"
									aria-label={folder.path}
									disabled={pending || !sources.isSuccess}
									checked={selected.includes(folder.path)}
									onChange={(event) => {
										const checked = event.currentTarget.checked;
										setSelected((current) =>
											checked
												? [...current, folder.path]
												: current.filter((path) => path !== folder.path),
										);
									}}
								/>
								<span className="min-w-0">
									<span className="block text-sm">{folder.name}</span>
									<span className="block break-all text-xs text-muted-foreground">
										{folder.path}
									</span>
									{folder.projectNames.length > 0 && (
										<span className="block text-xs text-muted-foreground">
											{folder.projectNames.join(", ")}
										</span>
									)}
								</span>
							</label>
						))}
				</div>
				{canBrowse && (
					<Button
						variant="outline"
						disabled={pending || !sources.isSuccess}
						onClick={() =>
							pick.mutate({
								title: t({ message: "Add a folder to the project" }),
								multiple: true,
							})
						}
					>
						<Trans>Browse folders</Trans>
					</Button>
				)}
				{mode.kind === "create" && (
					<div className="space-y-2">
						<Label htmlFor={`${id}-primary`}>
							<Trans>Main repository</Trans>
						</Label>
						<select
							id={`${id}-primary`}
							className="h-9 w-full rounded-md border bg-background px-3 text-sm"
							value={main}
							disabled={pending || !primaryChoices.length}
							onChange={(event) => setPrimary(event.target.value)}
						>
							<option value="" disabled>
								{t({ message: "Select a Git repository" })}
							</option>
							{primaryChoices.map((folder) => (
								<option key={folder.path} value={folder.path}>
									{folder.name} — {folder.path}
								</option>
							))}
						</select>
					</div>
				)}
				<p className="text-xs text-muted-foreground">
					<Trans>
						Worktrees use new branches for each repository; local workspaces
						share the original files.
					</Trans>
				</p>
				{!client && (
					<output className="text-sm">
						<Trans>Connecting to host…</Trans>
					</output>
				)}
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{unavailable ? (
							<Trans>
								Update Paradev++ on this host to reuse project folders.
							</Trans>
						) : (
							errorMessage(error)
						)}
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" disabled={pending} onClick={onClose}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						disabled={
							pending ||
							!sources.isSuccess ||
							!selected.length ||
							(mode.kind === "create" && (!name.trim() || !main))
						}
						onClick={() => save.mutate()}
					>
						{save.isPending ? (
							<Trans>Saving…</Trans>
						) : mode.kind === "create" ? (
							<Trans>Create project</Trans>
						) : (
							<Trans>Add folders</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
