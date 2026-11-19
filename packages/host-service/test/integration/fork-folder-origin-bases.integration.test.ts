import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { simpleGit } from "simple-git";
import { workspaces } from "../../src/db/schema";
import { createGitFixture } from "../helpers/git-fixture";
import { createBasicScenario } from "../helpers/scenarios";

test("workspace creation carries separate origin bases through the API and registers every isolated folder", async () => {
	const scenario = await createBasicScenario();
	const remote = await createGitFixture();
	const extra = await createGitFixture();
	try {
		await remote.git.checkoutLocalBranch("develop");
		const mainHead = await remote.commit("develop source");
		await remote.git.checkoutLocalBranch("release");
		const extraHead = await remote.commit("release source");
		await scenario.repo.git.addRemote("origin", remote.repoPath);
		await extra.git.addRemote("origin", remote.repoPath);
		const { id: folderId } = await scenario.host.trpc.projectFolders.add.mutate(
			{ projectId: scenario.projectId, path: extra.repoPath },
		);
		const choices =
			await scenario.host.trpc.projectFolders.originBranches.query({
				projectId: scenario.projectId,
				refresh: true,
			});
		expect(choices).toHaveLength(2);
		expect(choices.every((f) => f.branches.includes("release"))).toBe(true);
		const created = await scenario.host.trpc.workspaces.create.mutate({
			id: randomUUID(),
			projectId: scenario.projectId,
			branch: "chosen-origin-bases",
			skipBranchPrefix: true,
			runSetup: false,
			folderBaseBranches: {
				primary: "origin/develop",
				[folderId]: "origin/release",
			},
		});
		const mainPath = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, created.workspace.id))
			.get()?.worktreePath;
		const folders =
			await scenario.host.trpc.projectFolders.listForWorkspace.query({
				workspaceId: created.workspace.id,
			});
		const isolated = folders.find((f) => f.id === folderId);
		expect(isolated?.isolated).toBe(true);
		expect((await simpleGit(mainPath).revparse(["HEAD"])).trim()).toBe(
			mainHead,
		);
		expect((await simpleGit(isolated?.path).revparse(["HEAD"])).trim()).toBe(
			extraHead,
		);
		expect((await extra.git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe(
			"main",
		);
	} finally {
		await scenario.dispose();
		extra.dispose();
		remote.dispose();
	}
});
