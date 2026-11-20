import { forkProjectGroupError } from "../projects/fork-project-group-error";
import { isForkProjectGroup } from "../projects/fork-project-groups";
import type { HostServiceContext } from "../types";
import type { ForkPreparedFolderBases } from "./fork-folder-bases";
import { listProjectFolders } from "./project-folders";

export async function prepareForkGroupFolderBases(
	ctx: Pick<HostServiceContext, "db" | "git">,
	input: {
		projectId: string;
		checkout?: string;
		pr?: number;
		worktreePath?: string;
	},
	prepared: ForkPreparedFolderBases,
) {
	if (
		!isForkProjectGroup(ctx.db, input.projectId) ||
		input.checkout === "local"
	)
		return prepared;
	if (input.pr || input.worktreePath) throw forkProjectGroupError("branch");
	for (const folder of listProjectFolders(ctx.db, input.projectId)) {
		if (
			!folder.isGitRepo ||
			!folder.isolateInWorktrees ||
			prepared.some((entry) => entry.id === folder.id)
		)
			continue;
		const git = await ctx.git(folder.path);
		let commit: string;
		try {
			commit = (
				await git.raw(["rev-parse", "--verify", "HEAD^{commit}"])
			).trim();
		} catch {
			throw forkProjectGroupError("commit");
		}
		prepared.push({ id: folder.id, path: folder.path, base: "HEAD", commit });
	}
	return prepared;
}
