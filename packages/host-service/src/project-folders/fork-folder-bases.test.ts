import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { projectFolders, workspaceFolderWorktrees } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import { projects, workspaces } from "../db/schema";
import { createTestDb } from "../trpc/router/pull-requests/shared/test-db";
import {
	addForkBranchWorktree,
	applyForkFolderBranchPlan,
	prepareForkFolderBases,
	provisionForkFolderBases,
} from "./fork-folder-bases";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const run of cleanup.splice(0).reverse()) run();
});
async function fixture() {
	const root = mkdtempSync(join(tmpdir(), "fork-origin-bases-"));
	cleanup.push(() => rmSync(root, { recursive: true, force: true }));
	const db = createTestDb();
	cleanup.push(() => db.$client.close());
	ensureForkTables(db.$client);
	async function repo(name: string) {
		const remote = join(root, `${name}-origin`);
		const path = join(root, name);
		mkdirSync(remote);
		const upstream = simpleGit(remote);
		await upstream.init(["-b", "main"]);
		await upstream.addConfig("user.name", "test");
		await upstream.addConfig("user.email", "test@example.com");
		writeFileSync(join(remote, "tracked"), "initial");
		await upstream.add(".");
		await upstream.commit("initial");
		await upstream.checkoutLocalBranch("develop");
		await simpleGit().clone(remote, path);
		const git = simpleGit(path);
		await git.checkoutLocalBranch("local-feature");
		writeFileSync(join(remote, "tracked"), "latest origin");
		await upstream.add(".");
		await upstream.commit("remote advanced");
		return { path, git, head: (await upstream.revparse(["HEAD"])).trim() };
	}
	const main = await repo("main");
	const extra = await repo("extra");
	db.insert(projects)
		.values({ id: "project", repoPath: main.path, name: "Project" })
		.run();
	db.insert(projectFolders)
		.values({
			id: "extra-folder",
			projectId: "project",
			path: extra.path,
			position: 0,
			isolateInWorktrees: true,
		})
		.run();
	const ctx = {
		db,
		git: async (path: string) => simpleGit(path),
		credentials: { resolve: async () => ({ gitEnv: {} }) },
	} as unknown as Parameters<typeof prepareForkFolderBases>[0];
	const target = join(root, "feature");
	const plan = {
		branch: "new-feature",
		startPoint: { kind: "head" as const },
		usedExistingBranch: false,
	};
	return { root, db, main, extra, ctx, target, plan };
}

test("each folder starts at the freshly fetched origin commit while source checkouts stay on their own branches", async () => {
	const f = await fixture();
	const prepared = await prepareForkFolderBases(f.ctx, {
		projectId: "project",
		folderBaseBranches: {
			primary: "origin/develop",
			"extra-folder": "origin/develop",
		},
	});
	const plan = applyForkFolderBranchPlan(f.plan, prepared);
	await addForkBranchWorktree(
		{ git: f.main.git, plan, worktreePath: f.target, sparsePaths: [] },
		f.ctx,
		prepared,
	);
	f.db
		.insert(workspaces)
		.values({
			id: "workspace",
			projectId: "project",
			worktreePath: f.target,
			branch: plan.branch,
			type: "worktree",
		})
		.run();
	expect(
		await provisionForkFolderBases(f.ctx, "workspace", prepared, plan.branch),
	).toEqual([]);
	const extraPath = f.db
		.select()
		.from(workspaceFolderWorktrees)
		.get()?.worktreePath;
	expect((await simpleGit(f.target).revparse(["HEAD"])).trim()).toBe(
		f.main.head,
	);
	expect((await simpleGit(extraPath).revparse(["HEAD"])).trim()).toBe(
		f.extra.head,
	);
	expect((await f.main.git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe(
		"local-feature",
	);
	expect((await f.extra.git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe(
		"local-feature",
	);
	expect(
		(await f.extra.git.raw(["config", "branch.new-feature.base"])).trim(),
	).toBe("origin/develop");
});

test("a missing remote branch cannot fall back to local HEAD or leave a worktree behind", async () => {
	const f = await fixture();
	await expect(
		prepareForkFolderBases(f.ctx, {
			projectId: "project",
			folderBaseBranches: {
				primary: "origin/develop",
				"extra-folder": "origin/missing",
			},
		}),
	).rejects.toThrow("Cannot fetch origin/missing");
	expect(existsSync(f.target)).toBe(false);
	expect(f.db.select().from(workspaceFolderWorktrees).all()).toHaveLength(0);
});

test("an existing folder branch is preserved and blocks creation before the primary worktree is made", async () => {
	const f = await fixture();
	const prepared = await prepareForkFolderBases(f.ctx, {
		projectId: "project",
		folderBaseBranches: { "extra-folder": "origin/develop" },
	});
	await f.extra.git.branch(["new-feature"]);
	await expect(
		addForkBranchWorktree(
			{
				git: f.main.git,
				plan: f.plan,
				worktreePath: f.target,
				sparsePaths: [],
			},
			f.ctx,
			prepared,
		),
	).rejects.toThrow("already exists");
	expect(existsSync(f.target)).toBe(false);
	expect((await f.extra.git.branchLocal()).all).toContain("new-feature");
});

test("failure in an extra repository rolls back the new worktrees without deleting source files", async () => {
	const f = await fixture();
	const prepared = await prepareForkFolderBases(f.ctx, {
		projectId: "project",
		folderBaseBranches: { "extra-folder": "origin/develop" },
	});
	const selected = prepared[0];
	if (!selected) throw new Error("Missing prepared folder");
	selected.commit = "0000000000000000000000000000000000000000";
	await expect(
		addForkBranchWorktree(
			{
				git: f.main.git,
				plan: f.plan,
				worktreePath: f.target,
				sparsePaths: [],
			},
			f.ctx,
			prepared,
		),
	).rejects.toThrow("Could not create");
	expect(existsSync(f.target)).toBe(false);
	expect(existsSync(selected.createdPath ?? "")).toBe(false);
	expect((await f.main.git.branchLocal()).all).not.toContain("new-feature");
	expect(existsSync(join(f.extra.path, "tracked"))).toBe(true);
});
