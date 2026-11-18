import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useEffect, useState } from "react";
import type {
	ForkCleanupPreview,
	ForkCleanupResult,
} from "../../hooks/useForkWorktreeCleanup/useForkWorktreeCleanup";
import { formatCleanupSize } from "./fork-cleanup-size";

export function ForkWorktreeCleanupDialog({
	plan,
	result,
	pending,
	failed,
	onApply,
	onClose,
}: {
	plan: ForkCleanupPreview | null;
	result: ForkCleanupResult | null;
	pending: boolean;
	failed: boolean;
	onApply: (ids: string[]) => void;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const [selected, setSelected] = useState<string[]>([]);
	useEffect(
		() => setSelected(plan?.entries.map((entry) => entry.id) ?? []),
		[plan],
	);
	const rows = plan?.entries ?? [];
	const bytes = rows
		.filter((entry) => selected.includes(entry.id))
		.reduce((sum, entry) => sum + entry.bytes, 0);
	const size = formatCleanupSize(bytes);
	const activeCount = formatNumber(plan?.activeWorkspaces ?? 0);
	const archivedCount = formatNumber(plan?.archivedWorkspaces ?? 0);
	return (
		<Dialog
			open={!!plan || !!result}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				className="max-w-3xl"
				onEscapeKeyDown={(event) => {
					if (pending) event.preventDefault();
				}}
				onPointerDownOutside={(event) => {
					if (pending) event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Clean up deleted workspaces</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Only folders of deleted workspaces are listed. Active workspaces
							and Git branches are kept. Local changes are backed up before
							deletion.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{plan && (
					<>
						{plan.readOnly && (
							<div className="space-y-1 rounded-md border p-3 text-sm">
								<p className="font-medium">
									<Trans>Installed app preview. Deletion is disabled.</Trans>
								</p>
								<p>
									{t({
										message: `Active workspaces protected: ${activeCount}`,
									})}
								</p>
								<p>
									{t({
										message: `Deleted workspaces checked: ${archivedCount}`,
									})}
								</p>
							</div>
						)}
						<p className="text-sm font-medium">
							{t({ message: `Estimated space: ${size}` })}
						</p>
						{rows.length > 0 ? (
							<div className="max-h-80 overflow-y-auto rounded-md border divide-y">
								<label className="flex items-center gap-3 p-3 text-sm">
									<input
										type="checkbox"
										checked={selected.length === rows.length}
										disabled={pending}
										onChange={(event) =>
											setSelected(
												event.target.checked
													? rows.map((entry) => entry.id)
													: [],
											)
										}
									/>
									<Trans>Select all</Trans>
								</label>
								{rows.map((entry) => (
									<label
										key={entry.id}
										className="flex items-start gap-3 p-3 cursor-pointer"
									>
										<input
											type="checkbox"
											className="mt-1"
											checked={selected.includes(entry.id)}
											disabled={pending}
											onChange={(event) =>
												setSelected((ids) =>
													event.target.checked
														? [...ids, entry.id]
														: ids.filter((id) => id !== entry.id),
												)
											}
										/>
										<span className="min-w-0 flex-1 space-y-1">
											<span className="block text-sm font-medium">
												{entry.name}
											</span>
											<span className="block break-all font-mono text-xs text-muted-foreground">
												{entry.path}
											</span>
											<span className="block text-xs text-muted-foreground">
												{entry.contents.join(", ")}
											</span>
										</span>
										<span className="text-xs tabular-nums whitespace-nowrap">
											{formatCleanupSize(entry.bytes)}
										</span>
									</label>
								))}
							</div>
						) : (
							<p className="py-4 text-sm text-muted-foreground">
								<Trans>Nothing to clean up.</Trans>
							</p>
						)}
						{plan.skipped > 0 && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									Some folders were kept because their ownership could not be
									verified.
								</Trans>
							</p>
						)}
					</>
				)}
				{result && (
					<div className="space-y-3 text-sm" aria-live="polite">
						<dl className="grid grid-cols-3 gap-3">
							<div>
								<dt className="text-muted-foreground">
									<Trans>Deleted</Trans>
								</dt>
								<dd className="text-lg tabular-nums">
									{formatNumber(result.removed)}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									<Trans>Skipped</Trans>
								</dt>
								<dd className="text-lg tabular-nums">
									{formatNumber(result.skipped)}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">
									<Trans>Failed</Trans>
								</dt>
								<dd className="text-lg tabular-nums">
									{formatNumber(result.failed)}
								</dd>
							</div>
						</dl>
						{result.backup && (
							<p className="break-all text-xs text-muted-foreground">
								{t({ message: `Backups: ${result.backup}` })}
							</p>
						)}
						{result.issues.length > 0 && (
							<ul className="max-h-32 overflow-y-auto text-xs space-y-2">
								{result.issues.map((issue) => (
									<li key={issue.path} className="flex gap-3">
										<span className="break-all font-mono flex-1">
											{issue.path}
										</span>
										<span>
											{issue.status === "failed" ? (
												<Trans>Failed</Trans>
											) : (
												<Trans>Skipped</Trans>
											)}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
				{(failed || !!result?.failed) && (
					<p role="alert" className="text-sm text-destructive">
						<Trans>
							Cleanup failed. Scan again to review the remaining folders.
						</Trans>
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" disabled={pending} onClick={onClose}>
						<Trans>Close</Trans>
					</Button>
					{plan && !plan.readOnly && rows.length > 0 && (
						<Button
							variant="destructive"
							disabled={pending || selected.length === 0}
							onClick={() => onApply(selected)}
						>
							{pending ? (
								<Trans>Deleting…</Trans>
							) : (
								<Trans>Delete selected folders</Trans>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
