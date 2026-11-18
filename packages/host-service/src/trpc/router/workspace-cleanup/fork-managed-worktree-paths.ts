import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { resolveUserHomeDir } from "@superset/agent-setup/paths";
import { isInsideSessionsRoot } from "../workspace-creation/shared/session-paths";
import {
	isInsideProjectWorktreesRoot,
	type WorktreeFolderProject,
} from "../workspace-creation/shared/worktree-paths";

export const FORK_APP_HOMES = [
	".superset-fork",
	".paradev-fork",
	".superset",
	".paradev",
] as const;

export function forkCanonicalPath(path: string): string {
	let parent = resolve(path);
	const suffix: string[] = [];
	while (true) {
		try {
			return join(realpathSync(parent), ...suffix);
		} catch (error) {
			if (
				!["ENOENT", "ENOTDIR"].includes(
					(error as NodeJS.ErrnoException).code ?? "",
				)
			)
				throw error;
			const next = dirname(parent);
			if (next === parent) throw error;
			suffix.unshift(basename(parent));
			parent = next;
		}
	}
}

export function forkPathsOverlap(left: string, right: string): boolean {
	const a = forkCanonicalPath(left);
	const b = forkCanonicalPath(right);
	return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
}

export function isInsideForkProjectWorktreesRoot(
	path: string,
	project: WorktreeFolderProject,
	baseDir?: string | null,
	userHome = resolveUserHomeDir(),
): boolean {
	return (
		isInsideProjectWorktreesRoot(path, project, baseDir) ||
		FORK_APP_HOMES.some((name) =>
			isInsideProjectWorktreesRoot(
				path,
				project,
				join(userHome, name, "worktrees"),
			),
		)
	);
}

export function isInsideForkSessionsRoot(
	path: string,
	userHome = resolveUserHomeDir(),
): boolean {
	if (isInsideSessionsRoot(path)) return true;
	const resolved = forkCanonicalPath(path);
	return FORK_APP_HOMES.some((name) => {
		const root = forkCanonicalPath(join(userHome, name, "sessions"));
		return resolved.startsWith(root + sep);
	});
}
