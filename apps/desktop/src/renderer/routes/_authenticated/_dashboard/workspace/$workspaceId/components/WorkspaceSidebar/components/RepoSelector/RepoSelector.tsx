import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { LuFolderPlus, LuFolderTree } from "react-icons/lu";
import { addProjectFolders } from "renderer/lib/addProjectFolders";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getBaseName } from "renderer/lib/pathBasename/pathBasename";
import { notifyProjectFoldersChanged } from "renderer/lib/projectFoldersChanged";
import { useWorkspaceFolders } from "../../../../hooks/useWorkspaceFolders";
import { useSelectedRepoStore } from "../../../../state/selectedRepoStore";
import { RepoOptionLabel } from "./components/RepoOptionLabel";

const MAIN_REPO_VALUE = "__main__";
const ADD_FOLDER_VALUE = "__add__";

interface RepoSelectorProps {
	workspaceId: string;
	/** Controls the choice instead of the workspace-wide selection; `null` is the main repository. */
	value?: string | null;
	onValueChange?: (repoKey: string | null) => void;
	/** Lists only folders that are git repositories. */
	gitOnly?: boolean;
	className?: string;
}

export function RepoSelector({
	workspaceId,
	value,
	onValueChange,
	gitOnly = false,
	className = "border-b px-2 py-1.5",
}: RepoSelectorProps) {
	const { t } = useLingui();
	const { folders: allFolders, selected } = useWorkspaceFolders(workspaceId);
	const folders = gitOnly
		? allFolders.filter((folder) => folder.isGitRepo)
		: allFolders;
	const selectShared = useSelectedRepoStore((state) => state.select);
	const select = (repoKey: string | null) =>
		onValueChange ? onValueChange(repoKey) : selectShared(workspaceId, repoKey);
	const current =
		value === undefined
			? (selected?.workspaceKey ?? null)
			: folders.some((folder) => folder.workspaceKey === value)
				? value
				: null;
	const utils = workspaceTrpc.useUtils();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const addFolder = workspaceTrpc.projectFolders.add.useMutation();
	const workspace = workspaceTrpc.workspace.get.useQuery({ id: workspaceId });
	const projectId = workspace.data?.projectId ?? null;
	const project = workspaceTrpc.project.get.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: projectId !== null },
	);

	if (!projectId) return null;

	const mainLabel = project.data?.repoPath
		? getBaseName(project.data.repoPath)
		: t({ message: "Main repository" });

	const pickAndAddFolder = async () => {
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Add a folder to the project" }),
				multiple: true,
			});
			if (picked.canceled) return;
			const ids = await addProjectFolders(picked.paths, (path) =>
				addFolder.mutateAsync({ projectId, path }),
			);
			const updated = await utils.projectFolders.listForWorkspace.fetch({
				workspaceId,
			});
			notifyProjectFoldersChanged();
			const added = updated.find((folder) => folder.id === ids[0]);
			if (added) select(added.workspaceKey);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<div className={className}>
			<Select
				value={current ?? MAIN_REPO_VALUE}
				onValueChange={(value) => {
					if (value === ADD_FOLDER_VALUE) {
						void pickAndAddFolder();
						return;
					}
					select(value === MAIN_REPO_VALUE ? null : value);
				}}
			>
				<SelectTrigger
					size="sm"
					className="h-7 w-full gap-1.5 text-xs *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1"
					aria-label={t({ message: "Repository" })}
				>
					<LuFolderTree className="size-3.5 shrink-0 text-muted-foreground" />
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={MAIN_REPO_VALUE}>
						<RepoOptionLabel
							name={mainLabel}
							isGitRepo
							branch={workspace.data?.branch ?? null}
						/>
					</SelectItem>
					{folders.map((folder) => (
						<SelectItem key={folder.id} value={folder.workspaceKey}>
							<RepoOptionLabel
								name={folder.name}
								isGitRepo={folder.isGitRepo}
								branch={folder.branch ?? null}
							/>
						</SelectItem>
					))}
					<SelectSeparator />
					<SelectItem value={ADD_FOLDER_VALUE}>
						<span className="flex items-center gap-1.5">
							<LuFolderPlus className="size-3.5" />
							{t({ message: "Add folder…" })}
						</span>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
