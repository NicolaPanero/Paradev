import { existsSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { resolveUserHomeDir } from "@superset/agent-setup/paths";
import { TRPCError } from "@trpc/server";
import Database from "better-sqlite3";
import { inArray, isNotNull, isNull } from "drizzle-orm";
import {
	projectFolders,
	workspaceFolderWorktrees,
} from "../../../db/fork-schema";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import {
	FORK_APP_HOMES,
	forkCanonicalPath,
	forkPathsOverlap,
} from "./fork-managed-worktree-paths";

type ProfileReader = {
	prepare(sql: string): { all(): unknown[] };
	close(): void;
};

export function forkOtherProfilePaths(
	userHome: string,
	open: (path: string) => ProfileReader = (path) =>
		new Database(path, { readonly: true, fileMustExist: true }),
): string[] {
	const databases = new Set<string>();
	for (const name of FORK_APP_HOMES) {
		const appHome = join(userHome, name);
		const hostHome = join(appHome, "host");
		const paths = [join(appHome, "local.db")];
		if (existsSync(hostHome)) {
			for (const org of readdirSync(hostHome))
				paths.push(join(hostHome, org, "host.db"));
		}
		for (const path of paths)
			if (existsSync(path)) databases.add(forkCanonicalPath(path));
	}
	const protectedPaths: string[] = [];
	for (const path of databases) {
		const db = open(path);
		try {
			const tables = new Set(
				(
					db
						.prepare("SELECT name FROM sqlite_master WHERE type='table'")
						.all() as { name: string }[]
				).map((row) => row.name),
			);
			const paths = (sql: string) => {
				for (const row of db.prepare(sql).all() as { path: string }[])
					if (row.path) protectedPaths.push(row.path);
			};
			if (tables.has("projects")) {
				const columns = db.prepare("PRAGMA table_info(projects)").all() as {
					name: string;
				}[];
				const repo = columns.some((c) => c.name === "repo_path")
					? "repo_path"
					: "main_repo_path";
				paths(`SELECT ${repo} AS path FROM projects`);
			}
			if (tables.has("workspaces")) {
				const columns = db.prepare("PRAGMA table_info(workspaces)").all() as {
					name: string;
				}[];
				if (columns.some((c) => c.name === "worktree_path")) {
					paths(
						"SELECT worktree_path AS path FROM workspaces WHERE archived_at IS NULL",
					);
					if (tables.has("workspace_folder_worktrees"))
						paths(
							"SELECT f.worktree_path AS path FROM workspace_folder_worktrees f JOIN workspaces w ON w.id=f.workspace_id WHERE w.archived_at IS NULL",
						);
				} else if (tables.has("worktrees")) {
					paths(
						"SELECT t.path FROM worktrees t JOIN workspaces w ON w.worktree_id=t.id",
					);
				}
			}
			if (tables.has("project_folders"))
				paths("SELECT path FROM project_folders");
		} finally {
			db.close();
		}
	}
	return protectedPaths;
}

export function assertForkWorktreeUnshared(
	ctx: Pick<HostServiceContext, "db">,
	workspaceId: string,
	path: string,
	userHome = resolveUserHomeDir(),
): void {
	const live = ctx.db
		.select()
		.from(workspaces)
		.where(isNull(workspaces.archivedAt))
		.all();
	const liveIds = new Set(
		live.filter((row) => row.id !== workspaceId).map((row) => row.id),
	);
	const sourcePaths = [
		...ctx.db
			.select({ path: projects.repoPath })
			.from(projects)
			.where(isNotNull(projects.repoPath))
			.all()
			.map((row) => row.path),
		...ctx.db
			.select({ path: projectFolders.path })
			.from(projectFolders)
			.where(isNotNull(projectFolders.path))
			.all()
			.map((row) => row.path),
	].map((source) => {
		try {
			return forkCanonicalPath(source);
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to open project repo at ${source}: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	});
	const resolved = forkCanonicalPath(path);
	const protectedPaths = [
		...live
			.filter((row) => row.id !== workspaceId)
			.map((row) => row.worktreePath),
		...ctx.db
			.select()
			.from(workspaceFolderWorktrees)
			.where(inArray(workspaceFolderWorktrees.workspaceId, [...liveIds]))
			.all()
			.map((row) => row.worktreePath),
	].filter(
		(keep) =>
			!sourcePaths.some(
				(source) =>
					forkCanonicalPath(source) === forkCanonicalPath(keep) &&
					resolved.startsWith(forkCanonicalPath(source) + sep),
			),
	);
	if (
		sourcePaths.some((source) => {
			const keep = forkCanonicalPath(source);
			return keep === resolved || keep.startsWith(resolved + sep);
		})
	)
		throw new Error(`Folder contains a project repository: ${path}`);
	const managedByProfile = FORK_APP_HOMES.some((name) =>
		["sessions", "worktrees"].some((folder) =>
			resolved.startsWith(
				forkCanonicalPath(join(userHome, name, folder)) + sep,
			),
		),
	);
	if (managedByProfile) protectedPaths.push(...forkOtherProfilePaths(userHome));
	if (protectedPaths.some((keep) => forkPathsOverlap(path, keep)))
		throw new Error(`Folder is still used by a workspace or project: ${path}`);
}
