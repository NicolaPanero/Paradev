import { TRPCError } from "@trpc/server";

export function forkFolderBaseError(
	code: TRPCError["code"],
	key: "invalid" | "fetch" | "conflict" | "create" | "kept",
	params?: Record<string, string>,
	originalError?: unknown,
) {
	const messages = {
		invalid: "Folder base branches require a new worktree",
		fetch: `Cannot fetch ${params?.branch} for ${params?.folder}`,
		conflict:
			"A worktree folder or branch already exists. Choose a new workspace branch.",
		create: "Could not create the selected folder worktrees",
		kept: `Worktree creation failed; kept modified folders: ${params?.paths}`,
	};
	return new TRPCError({
		code,
		message: messages[key],
		cause: {
			i18nKey: `serverError.forkFolderBases.${key}`,
			i18nParams: params,
			originalError,
		},
	});
}
