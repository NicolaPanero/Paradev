import { useCallback } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

/**
 * Creates a worktree workspace on the source workspace's host, branched from
 * its current branch. Returns the id of the created workspace.
 */
export function useForkWorktreeCreate(): (
	source: HostShapedWorkspace & { projectId: string },
	name: string,
) => Promise<string> {
	const { submit } = useWorkspaceCreates();
	return useCallback(
		async (source, name) => {
			const { completed } = submit({
				hostId: source.hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: source.projectId,
					name,
					...(source.branch ? { baseBranch: source.branch } : {}),
				},
			});
			const outcome = await completed;
			if (!outcome.ok) throw new Error(outcome.error);
			return outcome.workspaceId;
		},
		[submit],
	);
}
