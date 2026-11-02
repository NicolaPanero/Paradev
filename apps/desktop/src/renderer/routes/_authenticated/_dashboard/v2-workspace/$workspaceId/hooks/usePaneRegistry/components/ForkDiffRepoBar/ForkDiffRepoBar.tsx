import type { RendererContext } from "@superset/panes";
import { RepoSelector } from "../../../../components/WorkspaceSidebar/components/RepoSelector";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { useWorkspaceFolders } from "../../../useWorkspaceFolders";

/** Switches the Changes pane between the main repository and the project's git folders. */
export function ForkDiffRepoBar({
	context,
	workspaceId,
}: {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}) {
	const { folders } = useWorkspaceFolders(workspaceId);
	if (!folders.some((folder) => folder.isGitRepo)) return null;
	const data = context.pane.data as DiffPaneData;
	return (
		<RepoSelector
			workspaceId={workspaceId}
			gitOnly
			value={data.repoKey ?? null}
			onValueChange={(repoKey) => {
				if ((repoKey ?? undefined) === data.repoKey) return;
				context.store.getState().setPaneData({
					paneId: context.pane.id,
					data: {
						...data,
						repoKey: repoKey ?? undefined,
						path: "",
						changeKey: undefined,
						collapsedFiles: [],
					} as PaneViewerData,
				});
			}}
		/>
	);
}
