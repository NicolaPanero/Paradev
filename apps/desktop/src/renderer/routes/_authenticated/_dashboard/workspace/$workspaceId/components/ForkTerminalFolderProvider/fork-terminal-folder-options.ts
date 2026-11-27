import { getBaseName } from "renderer/lib/pathBasename/pathBasename";

export interface ForkTerminalFolderOption {
	cwd: string;
	name: string;
	sourcePath: string;
	isGitRepo: boolean;
}

export interface WorkspaceTerminalFolder {
	path: string;
	name: string;
	sourcePath: string;
	exists: boolean;
	isGitRepo: boolean;
}

export function forkTerminalFolderOptions({
	worktreePath,
	repoPath,
	mainLabel,
	folders,
}: {
	worktreePath: string;
	repoPath?: string | null;
	mainLabel: string;
	folders: readonly WorkspaceTerminalFolder[];
}): ForkTerminalFolderOption[] {
	const primary: ForkTerminalFolderOption = {
		cwd: worktreePath,
		name: repoPath ? getBaseName(repoPath) : mainLabel,
		sourcePath: repoPath ?? worktreePath,
		isGitRepo: true,
	};
	const byPath = new Map([[primary.cwd, primary]]);
	for (const folder of folders) {
		if (!folder.exists || byPath.has(folder.path)) continue;
		byPath.set(folder.path, {
			cwd: folder.path,
			name: folder.name,
			sourcePath: folder.sourcePath,
			isGitRepo: folder.isGitRepo,
		});
	}
	return [...byPath.values()];
}
