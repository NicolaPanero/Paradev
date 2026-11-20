import type { SimpleGit } from "simple-git";

export async function fetchForkOriginBranch(git: SimpleGit, branch: string) {
	await git.raw(["check-ref-format", "--branch", branch]);
	const ref = `refs/remotes/origin/${branch}`;
	await git.raw([
		"fetch",
		"--no-tags",
		"origin",
		`+refs/heads/${branch}:${ref}`,
	]);
	const commit = (
		await git.raw(["rev-parse", "--verify", `${ref}^{commit}`])
	).trim();
	if (!/^[0-9a-f]{40,64}$/.test(commit))
		throw new Error(`Cannot resolve origin/${branch}`);
	return commit;
}
