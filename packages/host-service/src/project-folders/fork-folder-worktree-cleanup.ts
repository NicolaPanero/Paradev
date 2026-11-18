import { basename, dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../db/schema";
import { isMissingPath } from "../runtime/path-state";
import { getHostWorktreeBaseDir } from "../trpc/router/settings/worktree-location";
import { isInsideForkProjectWorktreesRoot } from "../trpc/router/workspace-cleanup/fork-managed-worktree-paths";
import { assertForkWorktreeUnshared } from "../trpc/router/workspace-cleanup/fork-worktree-ownership";
import { removeDirectoryTree } from "../trpc/router/workspace-cleanup/remove-directory-tree";
import type { HostServiceContext } from "../types";
import { removeFolderWorktrees } from "./folder-worktrees";

export async function finishForkFolderWorktreeRemoval(
	ctx: Pick<HostServiceContext, "db">,
	workspaceId: string,
	row: { worktreePath: string; folderId: string; folderPath: string },
	result: { stillRegistered: boolean; removeError?: string },
): Promise<void> {
	if (result.stillRegistered)
		throw new Error(result.removeError ?? "Worktree is still registered");
	if (isMissingPath(row.worktreePath, { followSymlinks: false })) return;
	const workspace = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const project = workspace?.projectId
		? ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, workspace.projectId))
				.get()
		: undefined;
	const expected =
		workspace &&
		join(
			dirname(workspace.worktreePath),
			`${basename(workspace.worktreePath)}--${basename(row.folderPath)}-${row.folderId.slice(0, 6)}`,
		);
	if (
		!project ||
		expected !== row.worktreePath ||
		!isInsideForkProjectWorktreesRoot(
			row.worktreePath,
			project,
			project.worktreeBaseDir ?? getHostWorktreeBaseDir(ctx),
		)
	)
		throw new Error(
			"Unregistered folder is outside its managed worktree location",
		);
	assertForkWorktreeUnshared(ctx, workspaceId, row.worktreePath);
	await removeDirectoryTree(row.worktreePath);
}

export async function removeForkFolderWorktrees(
	ctx: Pick<HostServiceContext, "db" | "credentials">,
	workspaceId: string,
): Promise<string[]> {
	const warnings = await removeFolderWorktrees(ctx, workspaceId);
	if (warnings.length) throw new Error(warnings.join("; "));
	return warnings;
}
