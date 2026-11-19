import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { simpleGit } from "simple-git";
import { workspaces } from "../../src/db/schema";
import { createGitFixture } from "../helpers/git-fixture";
import { createBasicScenario } from "../helpers/scenarios";
import { seedProject } from "../helpers/seed";

test("composed projects reuse existing repositories with independent worktrees and reftable branches", async () => {
	const s = await createBasicScenario();
	const extra = await createGitFixture();
	try {
		await extra.git.raw(["refs", "migrate", "--ref-format=reftable"]);
		const { id: extraProject } = seedProject(s.host, {
			repoPath: extra.repoPath,
		});
		const create = (name: string) =>
			s.host.trpc.project.createGroup.mutate({
				name,
				primaryPath: s.repo.repoPath,
				folders: [extra.repoPath],
			});
		const first = await create("Atlante BTCore");
		const second = await create("Atlante integration");
		expect(first.projectId).not.toBe(second.projectId);
		expect(first.projectId).not.toBe(s.projectId);
		expect(first.repoPath).toBe(s.repo.repoPath);
		const sources = await s.host.trpc.project.groupSources.query();
		expect(
			sources.filter((folder) => folder.path === extra.repoPath),
		).toHaveLength(1);
		expect(
			sources.find((folder) => folder.path === extra.repoPath)?.projectNames,
		).toContain("Atlante BTCore");
		expect(
			await s.host.trpc.project.groupSources.query({
				projectId: first.projectId,
			}),
		).toEqual([]);
		const createWorkspace = (projectId: string) =>
			s.host.trpc.workspaces.create.mutate({
				id: randomUUID(),
				projectId,
				branch: "integration",
				runSetup: false,
			});
		const a = await createWorkspace(first.projectId);
		const b = await createWorkspace(second.projectId);
		expect(a.workspace.branch).not.toBe(b.workspace.branch);
		const [aExtra] = await s.host.trpc.projectFolders.listForWorkspace.query({
			workspaceId: a.workspace.id,
		});
		const [bExtra] = await s.host.trpc.projectFolders.listForWorkspace.query({
			workspaceId: b.workspace.id,
		});
		expect(aExtra?.isolated).toBe(true);
		expect(bExtra?.isolated).toBe(true);
		expect(aExtra?.branch).toBe(a.workspace.branch);
		expect(bExtra?.branch).toBe(b.workspace.branch);
		if (!aExtra || !bExtra) throw new Error("Missing folder worktrees");
		expect(aExtra.path).not.toBe(bExtra.path);
		const common = (path: string) =>
			simpleGit(path).raw([
				"rev-parse",
				"--path-format=absolute",
				"--git-common-dir",
			]);
		expect(await common(aExtra.path)).toBe(await common(extra.repoPath));
		expect(await common(bExtra.path)).toBe(await common(extra.repoPath));
		expect(
			(await extra.git.raw(["symbolic-ref", "--short", "HEAD"])).trim(),
		).toBe("main");
		writeFileSync(join(aExtra.path, "README.md"), "independent changes");
		expect(readFileSync(join(bExtra.path, "README.md"), "utf8")).toBe(
			"initial commit",
		);
		const git = simpleGit(aExtra.path);
		await git.checkoutLocalBranch("actual-reftable-branch");
		expect(
			(
				await s.host.trpc.projectFolders.listForWorkspace.query({
					workspaceId: a.workspace.id,
				})
			)[0]?.branch,
		).toBe("actual-reftable-branch");
		await git.checkout(["--detach"]);
		expect(
			(
				await s.host.trpc.projectFolders.listForWorkspace.query({
					workspaceId: a.workspace.id,
				})
			)[0]?.branch,
		).toBeNull();
		expect(
			await s.host.trpc.projectFolders.list.query({ projectId: extraProject }),
		).toEqual([]);
		const main = s.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, a.workspace.id))
			.get();
		expect(main?.worktreePath).not.toBe(s.repo.repoPath);
		expect(await common(main?.worktreePath ?? "")).toBe(
			await common(s.repo.repoPath),
		);
		expect(existsSync(join(extra.repoPath, ".git", "reftable"))).toBe(true);
	} finally {
		await s.dispose();
		extra.dispose();
	}
});

test("reusing folders is idempotent, rejects two checkouts of one repository, and restores shared project roots", async () => {
	const s = await createBasicScenario();
	const extra = await createGitFixture();
	try {
		const group = await s.host.trpc.project.createGroup.mutate({
			name: "Shared",
			primaryPath: s.repo.repoPath,
			folders: [],
		});
		expect(
			await s.host.trpc.project.attachFolders.mutate({
				projectId: group.projectId,
				folders: [extra.repoPath, extra.repoPath],
			}),
		).toEqual({ added: 1 });
		expect(
			await s.host.trpc.project.attachFolders.mutate({
				projectId: group.projectId,
				folders: [extra.repoPath],
			}),
		).toEqual({ added: 0 });
		const other = join(extra.repoPath, "other-checkout");
		await extra.git.raw(["worktree", "add", "-b", "other", other]);
		await expect(
			s.host.trpc.project.createGroup.mutate({
				name: "Invalid",
				primaryPath: extra.repoPath,
				folders: [other],
			}),
		).rejects.toThrow("one checkout");
		await expect(
			s.host.trpc.project.attachFolders.mutate({
				projectId: group.projectId,
				folders: [other],
			}),
		).rejects.toThrow("one checkout");
		await s.host.trpc.project.remove.mutate({ projectId: group.projectId });
		await expect(
			s.host.trpc.project.restore.mutate({ projectId: group.projectId }),
		).resolves.toEqual({ restoredWorkspaceCount: 0 });
		expect(existsSync(join(s.repo.repoPath, ".git"))).toBe(true);
		await expect(
			s.host.trpc.workspaces.create.mutate({
				id: randomUUID(),
				projectId: group.projectId,
				branch: "main",
				skipBranchPrefix: true,
				runSetup: false,
			}),
		).rejects.toThrow();
		expect(
			s.host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, group.projectId))
				.all(),
		).toEqual([]);
	} finally {
		await s.dispose();
		extra.dispose();
	}
});
