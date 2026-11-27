import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { simpleGit } from "simple-git";
import { createGitFixture } from "../../../test/helpers/git-fixture";
import { gitPushTask } from "./git";

test.each([
	{ name: "linked PR", linkedPrHeadBranch: "feature" },
	{ name: "standalone branch", linkedPrHeadBranch: null },
])("uses the intended push remote for a same-name $name", async (scenario) => {
	const { repoPath, git, commit, dispose } = await createGitFixture();
	try {
		const origin = join(repoPath, "origin.git");
		const fork = join(repoPath, "fork.git");
		const forkUrl = pathToFileURL(fork).href;
		const branchRef = "refs/heads/feature";
		const refspec = `HEAD:${branchRef}`;
		const previous = (await git.revparse(["HEAD"])).trim();
		await git.raw(["init", "--bare", origin]);
		await git.raw(["init", "--bare", fork]);
		await git.addRemote("origin", origin);
		await git.checkoutLocalBranch("feature");
		await git.push(["origin", refspec]);
		await git.push([forkUrl, refspec]);
		await git.addConfig("branch.feature.remote", forkUrl);
		await git.addConfig("branch.feature.merge", branchRef);
		await git.addConfig("remote.pushDefault", "origin");
		await git.addConfig("push.default", "simple");
		await commit("review work");
		const latest = (await git.revparse(["HEAD"])).trim();

		expect(
			await gitPushTask.handler({
				worktreePath: repoPath,
				linkedPrHeadBranch: scenario.linkedPrHeadBranch,
				gitEnv: {},
			}),
		).toEqual({ ok: true });
		expect((await simpleGit(fork).revparse([branchRef])).trim()).toBe(
			scenario.linkedPrHeadBranch ? latest : previous,
		);
		expect((await simpleGit(origin).revparse([branchRef])).trim()).toBe(
			scenario.linkedPrHeadBranch ? previous : latest,
		);
	} finally {
		dispose();
	}
});
