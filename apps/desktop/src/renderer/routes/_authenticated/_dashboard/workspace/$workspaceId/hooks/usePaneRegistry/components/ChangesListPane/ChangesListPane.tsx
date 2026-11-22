import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { FolderRepoChanges } from "../../../../components/WorkspaceSidebar/components/FolderRepoChanges";
import { RepoSelector } from "../../../../components/WorkspaceSidebar/components/RepoSelector";
import { useChangesTab } from "../../../../components/WorkspaceSidebar/hooks/useChangesTab";
import type {
	DiffPaneData,
	FilePaneData,
	PaneViewerData,
} from "../../../../types";
import { openBesidePane } from "../../../../utils/openBesidePane";
import { useDiffPaneTarget } from "../../../useDiffPaneTarget";
import { useWorkspaceFolders } from "../../../useWorkspaceFolders";

interface ChangesListPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function ChangesListPane({
	context,
	workspaceId,
}: ChangesListPaneProps) {
	const { store } = context;
	const paneId = context.pane.id;
	const selectedDiffTarget = useDiffPaneTarget(store);
	const { selected: selectedFolder } = useWorkspaceFolders(workspaceId);
	const selectedRepoKey = selectedFolder?.isGitRepo
		? selectedFolder.workspaceKey
		: undefined;

	const handleSelectFile = useCallback(
		(
			path: string,
			openInNewTab?: boolean,
			changeKey?: string,
			repoKey?: string,
		) => {
			openBesidePane(
				store,
				paneId,
				{
					kind: "diff",
					data: {
						path,
						changeKey,
						repoKey,
						collapsedFiles: [],
						focusTick: Date.now(),
					} as DiffPaneData,
				},
				openInNewTab,
			);
		},
		[store, paneId],
	);

	const handleOpenFile = useCallback(
		(filePath: string, openInNewTab?: boolean) => {
			openBesidePane(
				store,
				paneId,
				{ kind: "file", data: { filePath, mode: "editor" } as FilePaneData },
				openInNewTab,
			);
		},
		[store, paneId],
	);

	const changesTab = useChangesTab({
		workspaceId,
		selectedDiffTarget: selectedDiffTarget?.repoKey
			? undefined
			: selectedDiffTarget,
		onSelectFile: handleSelectFile,
		onOpenFile: handleOpenFile,
	});

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<RepoSelector workspaceId={workspaceId} />
			{selectedFolder && !selectedFolder.isGitRepo ? (
				<p className="px-3 py-4 text-xs text-muted-foreground">
					<Trans>This folder is not a git repository.</Trans>
				</p>
			) : selectedRepoKey ? (
				<FolderRepoChanges
					key={selectedRepoKey}
					repoKey={selectedRepoKey}
					selectedDiffTarget={
						selectedDiffTarget?.repoKey === selectedRepoKey
							? selectedDiffTarget
							: undefined
					}
					onSelectDiffFile={(
						path,
						openInNewTab,
						_l,
						_s,
						changeKey,
						_f,
						repoKey,
					) => handleSelectFile(path, openInNewTab, changeKey, repoKey)}
					onSelectFile={handleOpenFile}
				/>
			) : (
				changesTab.content
			)}
		</div>
	);
}
