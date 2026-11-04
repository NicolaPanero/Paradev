import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projects } from "../../../db/schema";
import { createTestDb } from "../pull-requests/shared/test-db";
import { removedWorktreeRoots, sessionFolder } from "./fork-removed-worktrees";

const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

test("a project's worktree folders are scanned for chats whose worktree was removed", async () => {
	const base = realpathSync(mkdtempSync(join(tmpdir(), "fork-worktrees-")));
	folders.push(base);
	const db = createTestDb();
	const id = "00000000-0000-4000-8000-000000000001";
	db.insert(projects)
		.values({ id, repoPath: "/repo", name: "My App", worktreeBaseDir: base })
		.run();

	expect(await removedWorktreeRoots(db, id)).toEqual([
		join(base, "My App"),
		join(base, "My App-00000000"),
		join(base, id),
	]);
	expect(await removedWorktreeRoots(db, "missing")).toEqual([]);
	expect(await removedWorktreeRoots(db, null)).toEqual([]);
	db.$client.close();
});

test("a worktree folder reached through a symlink is scanned under both paths", async () => {
	const real = realpathSync(mkdtempSync(join(tmpdir(), "fork-worktrees-")));
	const link = `${real}-link`;
	symlinkSync(real, link);
	folders.push(real, link);
	const db = createTestDb();
	const id = "00000000-0000-4000-8000-000000000002";
	db.insert(projects)
		.values({ id, repoPath: "/repo", name: "App", worktreeBaseDir: link })
		.run();

	const roots = await removedWorktreeRoots(db, id);
	expect(roots).toContain(join(real, "App"));
	expect(roots).toContain(join(link, "App"));
	db.$client.close();
});

test("a chat from a removed worktree shows its own folder, a live folder stays", () => {
	const roots = ["/w/app"];
	expect(sessionFolder("/w/app", "/w/app/fix-login", roots)).toBe(
		"/w/app/fix-login",
	);
	expect(sessionFolder("/w/app/live", "/w/app/live/src", roots)).toBe(
		"/w/app/live",
	);
	expect(sessionFolder("/w/app", null, roots)).toBe("/w/app");
});
