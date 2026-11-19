import { TRPCError } from "@trpc/server";

export function forkProjectGroupError(
	key: "folder" | "primary" | "commit" | "duplicate" | "branch",
) {
	const messages = {
		folder: "Choose an existing folder with an absolute path.",
		primary: "Choose a Git repository as the main folder.",
		commit:
			"Each Git repository must have a commit before creating grouped worktrees.",
		duplicate: "Choose only one checkout of each Git repository in a project.",
		branch:
			"Choose a new workspace branch for a project that reuses repositories.",
	};
	return new TRPCError({
		code: key === "branch" ? "CONFLICT" : "BAD_REQUEST",
		message: messages[key],
		cause: { i18nKey: `serverError.forkProjectGroups.${key}` },
	});
}
