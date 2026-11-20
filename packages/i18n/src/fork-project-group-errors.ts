import { msg } from "@lingui/core/macro";
import { i18n } from "./index";

export const forkProjectGroupErrors: Record<string, () => string> = {
	"serverError.forkProjectGroups.folder": () =>
		i18n._(
			msg({ message: "Choose an existing folder with an absolute path." }),
		),
	"serverError.forkProjectGroups.primary": () =>
		i18n._(msg({ message: "Choose a Git repository as the main folder." })),
	"serverError.forkProjectGroups.commit": () =>
		i18n._(
			msg({
				message:
					"Each Git repository must have a commit before creating grouped worktrees.",
			}),
		),
	"serverError.forkProjectGroups.duplicate": () =>
		i18n._(
			msg({
				message:
					"Choose only one checkout of each Git repository in a project.",
			}),
		),
	"serverError.forkProjectGroups.branch": () =>
		i18n._(
			msg({
				message:
					"Choose a new workspace branch for a project that reuses repositories.",
			}),
		),
};
