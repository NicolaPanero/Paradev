import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { resolveUserHomeDir } from "@superset/agent-setup/paths";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../db/schema";
import { deferForkHistoricalDelete } from "../fork-worktree-maintenance/fork-worktree-maintenance";
import { getHostWorktreeBaseDir } from "../trpc/router/settings/worktree-location";
import {
	isInsideForkProjectWorktreesRoot,
	isInsideForkSessionsRoot,
} from "../trpc/router/workspace-cleanup/fork-managed-worktree-paths";
import { assertForkWorktreeUnshared } from "../trpc/router/workspace-cleanup/fork-worktree-ownership";
import type { HostServiceContext } from "../types";

export function canReconcileForkWorktree(
	ctx: Pick<HostServiceContext, "db">,
	row: {
		id: string;
		worktreePath: string;
		branch: string;
		archivedAt: number | null;
	},
	matchingBranch: boolean,
	userHome = resolveUserHomeDir(),
): boolean {
	try {
		if (deferForkHistoricalDelete(ctx, row.archivedAt)) return false;
		const local = ctx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, row.id))
			.get();
		if (
			!local ||
			local.type === "local" ||
			local.archivedAt === null ||
			local.archivedAt !== row.archivedAt ||
			local.branch !== row.branch ||
			local.worktreePath !== row.worktreePath
		)
			return false;
		const stat = lstatSync(row.worktreePath);
		if (
			!stat.isDirectory() ||
			stat.birthtimeMs <= 0 ||
			stat.birthtimeMs > local.archivedAt
		)
			return false;
		assertForkWorktreeUnshared(ctx, row.id, row.worktreePath, userHome);
		if (matchingBranch) return true;
		if (local.type === "session") {
			if (!isInsideForkSessionsRoot(row.worktreePath, userHome)) return false;
		} else {
			if (!local.projectId) return false;
			const project = ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, local.projectId))
				.get();
			if (
				!project ||
				project.deletedAt !== null ||
				!isInsideForkProjectWorktreesRoot(
					row.worktreePath,
					project,
					project.worktreeBaseDir ?? getHostWorktreeBaseDir(ctx),
					userHome,
				)
			)
				return false;
		}
		const dotGit = join(row.worktreePath, ".git");
		try {
			if (!lstatSync(dotGit).isFile()) return false;
		} catch (error) {
			return isMissing(error);
		}
		const pointer = readFileSync(dotGit, "utf8").match(/^gitdir: (.+)$/m)?.[1];
		if (!pointer) return false;
		const target = isAbsolute(pointer)
			? pointer
			: resolve(row.worktreePath, pointer);
		if (basename(dirname(target)) !== "worktrees") return false;
		try {
			lstatSync(target);
			return false;
		} catch (error) {
			return isMissing(error);
		}
	} catch {
		return false;
	}
}

function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
