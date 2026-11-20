import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
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
import {
	deferForkHistoricalDelete,
	ForkWorktreeMaintenance,
} from "./fork-worktree-maintenance";

const root = mkdtempSync(join(tmpdir(), "fork-native-cleanup-"));
const databases: Database[] = [];
afterAll(() => {
	for (const db of databases) db.close();
	rmSync(root, { recursive: true, force: true });
});

function fixture(refFormat: "files" | "reftable" = "files") {
	const home = mkdtempSync(join(root, "case-"));
	const repo = join(home, "repo");
	mkdirSync(repo);
	const git = (...args: string[]) =>
		execFileSync(
			"git",
			[
				"-c",
				"core.hooksPath=/dev/null",
				"-c",
				"commit.gpgsign=false",
				"-C",
				repo,
				...args,
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
	git("init", "-b", "main", `--ref-format=${refFormat}`);
	git("config", "user.name", "Test Runner");
	git("config", "user.email", "test@example.invalid");
	writeFileSync(join(repo, "README.md"), "initial\n");
	writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
	git("add", ".");
	git("commit", "-qm", "initial");
	const base = join(home, "managed");
	const path = join(base, "project", "deleted");
	const visible = join(base, "project", "visible");
	git("worktree", "add", "-b", "deleted", path);
	git("worktree", "add", "-b", "visible", visible);
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
	});
	ensureForkTables(sqlite);
	db.insert(projects)
		.values({ id: "p", name: "project", repoPath: repo, worktreeBaseDir: base })
		.run();
	db.insert(workspaces)
		.values([
			{
				id: "deleted",
				name: "Deleted task",
				projectId: "p",
				branch: "deleted",
				worktreePath: path,
				archivedAt: Math.ceil(statSync(path).birthtimeMs),
			},
			{
				id: "visible",
				projectId: "p",
				branch: "visible",
				worktreePath: visible,
			},
		])
		.run();
	let sizes = 0;
	let profilePaths: string[] = [];
	let busy: string[] = [];
	const ctx = { db, organizationId: "org" };
	const options = {
		home,
		appHome: join(home, "app"),
		profiles: () => profilePaths,
		busy: async () => busy,
		bytes: async () => {
			sizes++;
			return 4096;
		},
	};
	return {
		ctx,
		options,
		db,
		repo,
		path,
		visible,
		home,
		git,
		sizes: () => sizes,
		profiles: (paths: string[]) => {
			profilePaths = paths;
		},
		busy: (paths: string[]) => {
			busy = paths;
		},
	};
}

test("the update scans once, persists the preview across restarts, and offers manual rescanning after dismissal", async () => {
	const f = fixture();
	const unknown = join(f.home, "managed", "project", "unknown");
	mkdirSync(unknown);
	writeFileSync(join(unknown, "notes"), "unknown");
	const service = new ForkWorktreeMaintenance(f.ctx, f.options);
	const preview = await service.initialPreview();
	expect(preview?.entries.map((row) => row.path)).toEqual([f.path]);
	expect(existsSync(f.path)).toBe(true);
	expect(await service.initialPreview()).toEqual(preview);
	const restarted = new ForkWorktreeMaintenance(f.ctx, f.options);
	expect(await restarted.initialPreview()).toEqual(preview);
	expect(f.sizes()).toBe(1);
	restarted.dismissInitial();
	expect(
		await new ForkWorktreeMaintenance(f.ctx, f.options).initialPreview(),
	).toBeNull();
	expect((await restarted.preview()).entries).toHaveLength(1);
	expect(f.sizes()).toBe(2);
	expect(existsSync(unknown)).toBe(true);
	expect(existsSync(f.visible)).toBe(true);
	expect(deferForkHistoricalDelete(f.ctx, 1)).toBe(true);
});

test("installed-data inspection refuses deletion before any cleanup starts", async () => {
	const f = fixture();
	const service = new ForkWorktreeMaintenance(f.ctx, {
		...f.options,
		readOnly: true,
	});
	const preview = await service.preview();
	expect(preview).toMatchObject({
		readOnly: true,
		activeWorkspaces: 1,
		archivedWorkspaces: 1,
	});
	await expect(
		service.apply(
			preview.id,
			preview.entries.map((entry) => entry.id),
		),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
	expect(existsSync(f.path)).toBe(true);
	expect(f.git("worktree", "list", "--porcelain")).toContain("deleted");
});

test("restoring a workspace after preview prevents removal even with an existing cleanup selection", async () => {
	const f = fixture();
	const service = new ForkWorktreeMaintenance(f.ctx, f.options);
	const preview = await service.preview();
	f.db
		.update(workspaces)
		.set({ archivedAt: null })
		.where(eq(workspaces.id, "deleted"))
		.run();
	const result = await service.apply(
		preview.id,
		preview.entries.map((entry) => entry.id),
	);
	expect(result).toMatchObject({ removed: 0, skipped: 1, failed: 0 });
	expect(existsSync(f.path)).toBe(true);
});

test("a running process or another local profile protects a deleted folder at apply time", async () => {
	const f = fixture();
	const service = new ForkWorktreeMaintenance(f.ctx, f.options);
	let preview = await service.preview();
	f.busy([f.path]);
	expect(
		(
			await service.apply(
				preview.id,
				preview.entries.map((entry) => entry.id),
			)
		).skipped,
	).toBe(1);
	f.busy([]);
	preview = await service.preview();
	f.profiles([f.path]);
	expect(
		(
			await service.apply(
				preview.id,
				preview.entries.map((entry) => entry.id),
			)
		).skipped,
	).toBe(1);
	expect(existsSync(f.path)).toBe(true);
});

test("confirmed cleanup preserves branches and backs up changes while deleting generated files", async () => {
	const f = fixture();
	writeFileSync(join(f.path, "README.md"), "local changes\n");
	writeFileSync(join(f.path, "notes.txt"), "notes\n");
	mkdirSync(join(f.path, "node_modules", "cache"), { recursive: true });
	writeFileSync(join(f.path, "node_modules", "cache", "generated"), "cache");
	const service = new ForkWorktreeMaintenance(f.ctx, f.options);
	const preview = await service.preview();
	const entry = preview.entries[0];
	if (!entry) throw new Error("Preview missing");
	const result = await service.apply(preview.id, [entry.id]);
	expect(result).toMatchObject({ removed: 1, skipped: 0, failed: 0 });
	expect(existsSync(f.path)).toBe(false);
	expect(existsSync(f.visible)).toBe(true);
	expect(f.git("rev-parse", "deleted")).toBe(f.git("rev-parse", "main"));
	if (!result.backup) throw new Error("Backup missing");
	expect(
		readFileSync(join(result.backup, entry.id, "tracked.patch"), "utf8"),
	).toContain("local changes");
	expect(
		readFileSync(
			join(result.backup, entry.id, "untracked", "notes.txt"),
			"utf8",
		),
	).toBe("notes\n");
	expect(existsSync(join(result.backup, "report.json"))).toBe(true);
	await expect(service.apply(preview.id, [entry.id])).rejects.toThrow(
		"preview expired",
	);
});

test("a checkout that changed branch after preview is preserved", async () => {
	const f = fixture();
	const service = new ForkWorktreeMaintenance(f.ctx, f.options);
	const preview = await service.preview();
	f.git("-C", f.path, "checkout", "-b", "reused");
	expect(
		(
			await service.apply(
				preview.id,
				preview.entries.map((entry) => entry.id),
			)
		).skipped,
	).toBe(1);
	expect(existsSync(f.path)).toBe(true);
});

test("an active workspace extra folder is protected even when an archived workspace names its path", async () => {
	const f = fixture();
	f.db
		.insert(projectFolders)
		.values({ id: "extra", projectId: "p", path: join(f.home, "extra-repo") })
		.run();
	f.db
		.insert(workspaceFolderWorktrees)
		.values({
			workspaceId: "visible",
			folderId: "extra",
			worktreePath: f.path,
			branch: "deleted",
		})
		.run();
	const preview = await new ForkWorktreeMaintenance(f.ctx, f.options).preview();
	expect(preview.entries).toEqual([]);
	expect(existsSync(f.path)).toBe(true);
});

test.each([
	"files",
	"reftable",
] as const)("a partially deleted %s checkout without a git pointer is backed up and unregistered through its project repository", async (format) => {
	const f = fixture(format);
	rmSync(join(f.path, ".git"));
	writeFileSync(join(f.path, "notes.txt"), "recover me\n");
	const service = new ForkWorktreeMaintenance(f.ctx, f.options);
	const preview = await service.preview();
	const entry = preview.entries[0];
	if (!entry) throw new Error("Partial checkout missing");
	const result = await service.apply(preview.id, [entry.id]);
	expect(result.removed).toBe(1);
	expect(f.git("worktree", "list", "--porcelain")).not.toContain(f.path);
	if (!result.backup) throw new Error("Backup missing");
	expect(
		readFileSync(join(result.backup, entry.id, "files", "notes.txt"), "utf8"),
	).toBe("recover me\n");
});
