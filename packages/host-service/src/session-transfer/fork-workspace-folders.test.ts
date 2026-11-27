import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectFolders, workspaceFolderWorktrees } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import { projects, workspaces } from "../db/schema";
import { createTestDb } from "../trpc/router/pull-requests/shared/test-db";
import {
	inNativeSourceFolder,
	requireNativeWorkspaceFolder,
} from "./fork-workspace-folders";

test("a native handoff uses the registered worktree of its source project folder", async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "native-folders-")));
	const workspace = { id: "workspace", worktreePath: join(root, "primary") };
	const checkout = join(root, "backend");
	const worktree = join(root, "backend-worktree");
	const db = createTestDb();
	try {
		for (const path of [workspace.worktreePath, checkout, worktree])
			mkdirSync(path);
		ensureForkTables(db.$client);
		db.insert(projects).values({ id: "project", repoPath: root }).run();
		db.insert(workspaces)
			.values({
				...workspace,
				projectId: "project",
				name: "Feature",
				type: "worktree",
				branch: "feature",
			})
			.run();
		db.insert(projectFolders)
			.values({ id: "backend", projectId: "project", path: checkout })
			.run();
		db.insert(workspaceFolderWorktrees)
			.values({
				workspaceId: workspace.id,
				folderId: "backend",
				branch: "feature",
				worktreePath: worktree,
			})
			.run();
		const attempts: string[] = [];
		const converted = await inNativeSourceFolder(
			db,
			workspace,
			async ({ cwd }) => {
				attempts.push(cwd);
				if (cwd !== worktree) throw new Error("source_cwd_mismatch");
				return { cwd };
			},
		);
		expect(attempts).toEqual([workspace.worktreePath, worktree]);
		await expect(
			requireNativeWorkspaceFolder(db, workspace, converted.cwd),
		).resolves.toBe(worktree);
		await expect(
			requireNativeWorkspaceFolder(db, workspace, checkout),
		).rejects.toThrow("lineage_workspace_changed");
		attempts.length = 0;
		await expect(
			inNativeSourceFolder(db, workspace, async ({ cwd }) => {
				attempts.push(cwd);
				throw new Error("target_session_unavailable");
			}),
		).rejects.toThrow("target_session_unavailable");
		expect(attempts).toEqual([workspace.worktreePath]);
	} finally {
		db.$client.close();
		rmSync(root, { recursive: true, force: true });
	}
});
