import { msg } from "@lingui/core/macro";
import { i18n } from "./index";

export const forkFolderBaseErrors: Record<
	string,
	(params?: Record<string, unknown>) => string
> = {
	"serverError.forkFolderBases.invalid": () =>
		i18n._(msg({ message: "Folder base branches require a new worktree" })),
	"serverError.forkFolderBases.fetch": (params) => {
		const branch = String(params?.branch ?? "");
		const folder = String(params?.folder ?? "");
		return i18n._(msg({ message: `Cannot fetch ${branch} for ${folder}` }));
	},
	"serverError.forkFolderBases.conflict": () =>
		i18n._(
			msg({
				message:
					"A worktree folder or branch already exists. Choose a new workspace branch.",
			}),
		),
	"serverError.forkFolderBases.create": () =>
		i18n._(msg({ message: "Could not create the selected folder worktrees" })),
	"serverError.forkFolderBases.kept": (params) => {
		const paths = String(params?.paths ?? "");
		return i18n._(
			msg({
				message: `Worktree creation failed; kept modified folders: ${paths}`,
			}),
		);
	},
};
