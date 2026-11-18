import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { ForkWorktreeCleanupDialog } from "./components/ForkWorktreeCleanupDialog/ForkWorktreeCleanupDialog";
import { useForkWorktreeCleanup } from "./hooks/useForkWorktreeCleanup/useForkWorktreeCleanup";

export function ForkWorktreeCleanup() {
	const cleanup = useForkWorktreeCleanup();
	const unsupported =
		(cleanup.preview.error as { data?: { code?: string } } | null)?.data
			?.code === "NOT_FOUND";
	return (
		<div className="space-y-3 px-5 py-4">
			<div className="flex items-start justify-between gap-6">
				<div className="space-y-1">
					<h3 className="text-sm font-medium">
						<Trans>Clean up deleted workspaces</Trans>
					</h3>
					<p className="text-xs text-muted-foreground">
						<Trans>
							Find and remove folders left by deleted workspaces. Active
							workspaces and their extra folders are protected.
						</Trans>
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					disabled={
						!cleanup.client ||
						cleanup.preview.isPending ||
						cleanup.apply.isPending
					}
					onClick={() => cleanup.preview.mutate()}
				>
					{cleanup.preview.isPending ? (
						<Trans>Scanning…</Trans>
					) : (
						<Trans>Preview</Trans>
					)}
				</Button>
			</div>
			{cleanup.preview.isError && (
				<p role="alert" className="text-xs text-destructive">
					{unsupported ? (
						<Trans>Update Paradev++ to use worktree cleanup.</Trans>
					) : (
						<Trans>
							Cleanup failed. Scan again to review the remaining folders.
						</Trans>
					)}
				</p>
			)}
			<ForkWorktreeCleanupDialog
				plan={cleanup.plan}
				result={cleanup.result}
				pending={cleanup.apply.isPending}
				failed={cleanup.apply.isError}
				onApply={(ids) => cleanup.apply.mutate(ids)}
				onClose={cleanup.dismiss}
			/>
		</div>
	);
}
