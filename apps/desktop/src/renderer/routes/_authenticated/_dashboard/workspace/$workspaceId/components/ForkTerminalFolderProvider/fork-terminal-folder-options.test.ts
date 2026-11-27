import { expect, test } from "bun:test";
import { forkTerminalFolderOptions } from "./fork-terminal-folder-options";

test("uses original names and mapped worktree paths while omitting duplicates and missing folders", () => {
	const extra = {
		path: "/worktrees/extra-45/topic",
		name: "api",
		sourcePath: "/repos/api",
		exists: true,
		isGitRepo: true,
	};
	expect(
		forkTerminalFolderOptions({
			worktreePath: "/worktrees/topic",
			repoPath: "/repos/web",
			mainLabel: "Main repository",
			folders: [
				{ ...extra, path: "/worktrees/topic" },
				extra,
				{ ...extra, name: "duplicate" },
				{ ...extra, name: "missing", path: "/gone", exists: false },
			],
		}),
	).toEqual([
		{
			cwd: "/worktrees/topic",
			name: "web",
			sourcePath: "/repos/web",
			isGitRepo: true,
		},
		{
			cwd: "/worktrees/extra-45/topic",
			name: "api",
			sourcePath: "/repos/api",
			isGitRepo: true,
		},
	]);
});
