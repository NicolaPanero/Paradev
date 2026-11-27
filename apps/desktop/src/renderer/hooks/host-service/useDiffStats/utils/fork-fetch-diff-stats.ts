import { TRPCClientError } from "@trpc/client";
import type { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type HostClient = ReturnType<typeof getHostServiceClientByUrl>;

export interface ForkDiffStats {
	additions: number;
	deletions: number;
}

function isMissingProcedure(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
}

/**
 * Totals only: the full status snapshot of a busy worktree is large, and the
 * sidebar shows two numbers. Hosts without the batch procedure fall back to it.
 */
export async function forkFetchDiffStats(
	client: HostClient,
	workspaceId: string,
): Promise<ForkDiffStats | null> {
	try {
		const { workspaces } = await client.git.getDiffStatsByWorkspaces.query({
			workspaceIds: [workspaceId],
			inferOrigin: true,
		});
		const row = workspaces.find((entry) => entry.workspaceId === workspaceId);
		return row ? { additions: row.additions, deletions: row.deletions } : null;
	} catch (error) {
		if (!isMissingProcedure(error)) throw error;
	}
	const base = await client.git.getBaseBranch
		.query({ workspaceId, inferOrigin: true })
		.catch((error: unknown) => {
			if (!isMissingProcedure(error)) throw error;
			return undefined;
		});
	const status = await client.git.getStatus.query({
		workspaceId,
		baseBranch: base?.needsSelection ? "HEAD" : (base?.baseBranch ?? undefined),
		priority: "background",
	});
	const byPath = new Map<
		string,
		{ additions: number | null; deletions: number | null }
	>();
	for (const file of status.againstBase) byPath.set(file.path, file);
	for (const file of status.staged) byPath.set(file.path, file);
	for (const file of status.unstaged) byPath.set(file.path, file);
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions ?? 0;
		deletions += file.deletions ?? 0;
	}
	return { additions, deletions };
}
