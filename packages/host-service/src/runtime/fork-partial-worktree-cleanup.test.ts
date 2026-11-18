import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import { projectFolders, workspaceFolderWorktrees } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import { finishForkFolderWorktreeRemoval } from "../project-folders/fork-folder-worktree-cleanup";
import {
	isInsideForkProjectWorktreesRoot,
	isInsideForkSessionsRoot,
} from "../trpc/router/workspace-cleanup/fork-managed-worktree-paths";
import {
	assertForkWorktreeUnshared,
	forkOtherProfilePaths,
} from "../trpc/router/workspace-cleanup/fork-worktree-ownership";
import { canReconcileForkWorktree } from "./fork-partial-worktree-cleanup";

const root = mkdtempSync(join(tmpdir(), "fork-delete-recovery-"));
const databases: Database[] = [];
afterAll(() => {
	for (const db of databases) db.close();
	rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const home = mkdtempSync(join(root, "case-"));
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
	});
	ensureForkTables(sqlite);
	const base = join(home, "custom-worktrees");
	const path = join(base, "project", "feature");
	mkdirSync(path, { recursive: true });
	db.insert(projects)
		.values({
			id: "p",
			name: "project",
			repoPath: join(home, "main"),
			worktreeBaseDir: base,
		})
		.run();
	const row = {
		id: "deleted",
		worktreePath: path,
		branch: "feature",
		archivedAt: Math.ceil(statSync(path).birthtimeMs) + 1,
	};
	db.insert(workspaces)
		.values({ ...row, projectId: "p" })
		.run();
	return { ctx: { db }, row, path, home, db };
}

test("legacy roots remain managed after changing the data home without allowing symlink escapes", () => {
	const home = mkdtempSync(join(root, "roots-"));
	const project = { id: "p", name: "project" };
	const old = join(home, ".superset", "worktrees", "project");
	const path = join(old, "branch");
	mkdirSync(path, { recursive: true });
	expect(
		isInsideForkProjectWorktreesRoot(path, project, join(home, "new"), home),
	).toBe(true);
	expect(isInsideForkProjectWorktreesRoot(old, project, null, home)).toBe(
		false,
	);
	const outside = join(home, "important");
	mkdirSync(outside);
	symlinkSync(outside, join(old, "escape"));
	expect(
		isInsideForkProjectWorktreesRoot(join(old, "escape"), project, null, home),
	).toBe(false);
	const sessions = join(home, ".superset", "sessions");
	mkdirSync(join(sessions, "old"), { recursive: true });
	expect(isInsideForkSessionsRoot(join(sessions, "old"), home)).toBe(true);
	expect(isInsideForkSessionsRoot(sessions, home)).toBe(false);
});

test("only an archived managed folder predating its delete can resume without its git metadata", () => {
	const { ctx, row, path, home, db } = fixture();
	expect(canReconcileForkWorktree(ctx, row, false, home)).toBe(true);
	writeFileSync(
		join(path, ".git"),
		`gitdir: ${join(home, "main", ".git", "worktrees", "feature")}\n`,
	);
	expect(canReconcileForkWorktree(ctx, row, false, home)).toBe(true);
	mkdirSync(join(home, "main", ".git", "worktrees", "feature"), {
		recursive: true,
	});
	expect(canReconcileForkWorktree(ctx, row, false, home)).toBe(false);
	expect(canReconcileForkWorktree(ctx, row, true, home)).toBe(true);
	const beforeBirth = Math.floor(statSync(path).birthtimeMs) - 1;
	db.update(workspaces)
		.set({ archivedAt: beforeBirth })
		.where(eq(workspaces.id, row.id))
		.run();
	expect(
		canReconcileForkWorktree(
			ctx,
			{ ...row, archivedAt: beforeBirth },
			false,
			home,
		),
	).toBe(false);
});

test("a live auxiliary folder or nested workspace prevents cleanup of its ancestor", () => {
	const { ctx, row, path, home, db } = fixture();
	db.insert(workspaces)
		.values({
			id: "live",
			projectId: "p",
			branch: "live",
			worktreePath: join(home, "live"),
		})
		.run();
	db.insert(projectFolders)
		.values({ id: "extra", projectId: "p", path: join(home, "extra-repo") })
		.run();
	db.insert(workspaceFolderWorktrees)
		.values({
			workspaceId: "live",
			folderId: "extra",
			worktreePath: join(path, "nested"),
			branch: "live",
		})
		.run();
	expect(() => assertForkWorktreeUnshared(ctx, row.id, path, home)).toThrow(
		"still used",
	);
	expect(canReconcileForkWorktree(ctx, row, true, home)).toBe(false);
	db.delete(workspaceFolderWorktrees).run();
	db.update(workspaces)
		.set({ worktreePath: join(path, "nested") })
		.where(eq(workspaces.id, "live"))
		.run();
	expect(canReconcileForkWorktree(ctx, row, true, home)).toBe(false);
});

test("other app profiles protect live workspaces and auxiliary checkouts through aliases", () => {
	const home = mkdtempSync(join(root, "profiles-"));
	const app = join(home, ".superset");
	mkdirSync(join(app, "host", "org"), { recursive: true });
	const sqlite = new Database(join(app, "host", "org", "host.db"));
	sqlite.exec(
		"CREATE TABLE projects(repo_path TEXT); CREATE TABLE workspaces(id TEXT, worktree_path TEXT, archived_at INTEGER); CREATE TABLE workspace_folder_worktrees(workspace_id TEXT, worktree_path TEXT)",
	);
	sqlite.exec(
		"INSERT INTO projects VALUES ('/main'); INSERT INTO workspaces VALUES ('live', '/keep', NULL), ('deleted', '/old', 1); INSERT INTO workspace_folder_worktrees VALUES ('live', '/extra'), ('deleted', '/old-extra')",
	);
	sqlite.close();
	symlinkSync(app, join(home, ".paradev"));
	const paths = forkOtherProfilePaths(
		home,
		(path) => new Database(path, { readonly: true }),
	);
	expect(paths.sort()).toEqual(["/extra", "/keep", "/main"]);
});

test("an auxiliary worktree removal finishes deleting files after git unregisters it", async () => {
	const { ctx, path, home } = fixture();
	const row = {
		folderId: "extra123",
		folderPath: join(home, "extra"),
		worktreePath: `${path}--extra-extra1`,
	};
	mkdirSync(join(row.worktreePath, "node_modules"), { recursive: true });
	writeFileSync(join(row.worktreePath, "node_modules", "cache"), "cache");
	await expect(
		finishForkFolderWorktreeRemoval(ctx, "deleted", row, {
			stillRegistered: true,
			removeError: "dirty",
		}),
	).rejects.toThrow("dirty");
	expect(existsSync(row.worktreePath)).toBe(true);
	await finishForkFolderWorktreeRemoval(ctx, "deleted", row, {
		stillRegistered: false,
		removeError: "partial deletion",
	});
	expect(existsSync(row.worktreePath)).toBe(false);
});
