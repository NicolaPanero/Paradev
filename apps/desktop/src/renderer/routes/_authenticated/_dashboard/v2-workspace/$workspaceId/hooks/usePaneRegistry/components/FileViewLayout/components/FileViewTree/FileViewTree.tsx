import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { FilesTab } from "../../../../../../components/WorkspaceSidebar/components/FilesTab";
import { FolderFiles } from "../../../../../../components/WorkspaceSidebar/components/FolderFiles";
import { RepoSelector } from "../../../../../../components/WorkspaceSidebar/components/RepoSelector";
import { useWorkspaceFolders } from "../../../../../../hooks/useWorkspaceFolders";
import { useWorkspaceGitStatus } from "../../../../../../providers/WorkspaceGitStatusProvider";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { openFileFromTree } from "../../../../../../utils/openFileFromTree";

interface FileViewTreeProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onSearch?: () => void;
}

export function FileViewTree({
	context,
	workspaceId,
	onSearch,
}: FileViewTreeProps) {
	const { store } = context;
	const paneId = context.pane.id;
	const gitStatus = useWorkspaceGitStatus();
	const { workspace } = useWorkspace();
	const { selected: selectedFolder } = useWorkspaceFolders(workspace.id);
	const selectedFilePath =
		context.pane.kind === "file"
			? (context.pane.data as FilePaneData).filePath
			: undefined;

	const handleSelectFile = useCallback(
		(filePath: string, openInNewTab?: boolean) =>
			openFileFromTree({
				store,
				filePath,
				sourcePaneId: paneId,
				pin: openInNewTab,
			}),
		[store, paneId],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<RepoSelector workspaceId={workspace.id} className="px-2 pt-2" />
			<div className="min-h-0 flex-1">
				{selectedFolder ? (
					<FolderFiles
						key={selectedFolder.workspaceKey}
						repoKey={selectedFolder.workspaceKey}
						isGitRepo={selectedFolder.isGitRepo}
						variant="fileView"
						onSelectFile={handleSelectFile}
						selectedFilePath={selectedFilePath}
						onSearch={onSearch}
					/>
				) : (
					<FilesTab
						variant="fileView"
						onSelectFile={handleSelectFile}
						selectedFilePath={selectedFilePath}
						workspaceId={workspaceId}
						gitStatus={gitStatus.data}
						onSearch={onSearch}
					/>
				)}
			</div>
		</div>
	);
}
