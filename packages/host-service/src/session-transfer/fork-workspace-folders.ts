import { realpath } from "node:fs/promises";
import type { HostDb } from "../db";
import { listWorkspaceFolders } from "../project-folders";

type WorkspaceRoot = { id: string; worktreePath: string };

async function* nativeWorkspaceFolders(db: HostDb, workspace: WorkspaceRoot) {
	const primary = await realpath(workspace.worktreePath);
	yield { cwd: primary, path: workspace.worktreePath };
	const seen = new Set([primary]);
	for (const { path } of listWorkspaceFolders(db, workspace.id)) {
		const cwd = await realpath(path).catch(() => null);
		if (cwd && !seen.has(cwd)) {
			seen.add(cwd);
			yield { cwd, path };
		}
	}
}

export async function requireNativeWorkspaceFolder(
	db: HostDb,
	workspace: WorkspaceRoot,
	cwd: string,
) {
	for await (const folder of nativeWorkspaceFolders(db, workspace)) {
		if (folder.cwd === cwd) return folder.path;
	}
	throw new Error("lineage_workspace_changed");
}

export async function inNativeSourceFolder<T>(
	db: HostDb,
	workspace: WorkspaceRoot,
	findSource: (folder: { cwd: string; path: string }) => Promise<T>,
) {
	let mismatch: Error | undefined;
	for await (const folder of nativeWorkspaceFolders(db, workspace)) {
		try {
			return await findSource(folder);
		} catch (error) {
			// txcript reports these errors during source validation, before writing.
			if (!(error instanceof Error)) throw error;
			if (error.message === "source_cwd_mismatch") mismatch = error;
			else if (error.message !== "source_unavailable") throw error;
		}
	}
	throw mismatch ?? new Error("source_unavailable");
}
