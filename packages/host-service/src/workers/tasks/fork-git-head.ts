import { createUserSimpleGit } from "../../runtime/git/simple-git";
import { defineWorkerTask } from "../define-worker-task";

export const forkReadGitBranchTask = defineWorkerTask<
	{ path: string },
	string | null
>({
	type: "git/forkReadGitBranch",
	handler: async ({ path }) => {
		try {
			const branch = (
				await createUserSimpleGit(path).raw([
					"symbolic-ref",
					"--quiet",
					"--short",
					"HEAD",
				])
			).trim();
			return branch && branch !== ".invalid" ? branch : null;
		} catch {
			return null;
		}
	},
});
