import { Trans } from "@lingui/react/macro";
import { CgLaptop } from "react-icons/cg";
import { LuGitBranch } from "react-icons/lu";

export function ForkWorkspaceKindBadge({
	type,
}: {
	type: "local" | "worktree" | "session";
}) {
	if (type === "session") return null;
	const Icon = type === "local" ? CgLaptop : LuGitBranch;
	return (
		<span className="flex items-center gap-1 text-xs text-muted-foreground">
			<Icon className="size-3.5 shrink-0" />
			{type === "local" ? (
				<Trans>Local · the project folder</Trans>
			) : (
				<Trans>Worktree · its own folder</Trans>
			)}
		</span>
	);
}
