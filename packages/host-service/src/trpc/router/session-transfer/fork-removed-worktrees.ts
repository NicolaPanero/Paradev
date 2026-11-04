import { realpath } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../db/db";
import { projects } from "../../../db/schema";
import { getHostWorktreeBaseDir } from "../settings/worktree-location";
import {
	defaultWorktreesRoot,
	projectWorktreesFolderCandidates,
	projectWorktreesRoot,
} from "../workspace-creation/shared/worktree-paths";

/**
 * The folders that hold a project's worktrees. A chat records the folder it
 * ran in, so after `git worktree remove` the chat is only found by scanning
 * under the folder that held that worktree.
 */
export async function removedWorktreeRoots(
	db: HostDb,
	projectId: string | null | undefined,
): Promise<string[]> {
	if (!projectId) return [];
	const project = db
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (!project) return [];
	const configured =
		project.worktreeBaseDir ?? getHostWorktreeBaseDir({ db }) ?? null;
	const real = await realpath(configured ?? defaultWorktreesRoot()).catch(
		() => configured,
	);
	// An agent records the path it was started in, which may or may not be
	// the resolved one.
	return [
		...new Set(
			[real, configured].flatMap((base) =>
				projectWorktreesFolderCandidates(project).map((folder) =>
					projectWorktreesRoot(folder, base),
				),
			),
		),
	];
}

/** A chat from a removed worktree shows its own folder, not the shared root. */
export function sessionFolder(
	folder: string,
	sessionCwd: string | null,
	roots: string[],
): string {
	return sessionCwd && roots.includes(folder) ? sessionCwd : folder;
}
