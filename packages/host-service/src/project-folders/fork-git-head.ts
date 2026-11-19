import { getHostWorkerPool } from "../workers/host-worker-pool";
import { forkReadGitBranchTask } from "../workers/tasks/fork-git-head";

export function readForkGitHead(head: string): string | null {
	const prefix = "ref: refs/heads/";
	return head.startsWith(prefix) && head !== `${prefix}.invalid`
		? head.slice(prefix.length)
		: null;
}

export async function resolveForkGitBranch(
	path: string,
	branch: string | null,
): Promise<string | null> {
	if (branch !== null) return branch;
	try {
		return await getHostWorkerPool().run(
			forkReadGitBranchTask,
			{ path },
			{ timeoutMs: 2000 },
		);
	} catch {
		return null;
	}
}

export async function resolveForkFolderBranches<
	T extends { path: string; isGitRepo: boolean; branch: string | null },
>(folders: T[]): Promise<T[]> {
	return Promise.all(
		folders.map(async (folder) => ({
			...folder,
			branch: folder.isGitRepo
				? await resolveForkGitBranch(folder.path, folder.branch)
				: null,
		})),
	);
}
