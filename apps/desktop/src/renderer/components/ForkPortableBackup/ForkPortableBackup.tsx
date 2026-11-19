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
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useState } from "react";
import {
	type ElectronRouterOutputs,
	electronTrpc,
} from "renderer/lib/electron-trpc";

type Plan = ElectronRouterOutputs["forkPortableBackup"]["preview"];

export function ForkPortableBackup() {
	const { t } = useLingui();
	const [plan, setPlan] = useState<Plan | null>(null);
	const [archive, setArchive] = useState<string | null>(null);
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [acknowledged, setAcknowledged] = useState(false);
	const [mappings, setMappings] = useState<Record<string, string>>({});
	const preview = electronTrpc.forkPortableBackup.preview.useMutation({
		onSuccess: (result) => {
			setPlan(result);
			setArchive(null);
			setPassword("");
			setConfirmation("");
			setAcknowledged(false);
		},
	});
	const choose = electronTrpc.forkPortableBackup.chooseArchive.useMutation({
		onSuccess: (path) => {
			if (path) {
				setArchive(path);
				setPlan(null);
				setPassword("");
				setConfirmation("");
				setAcknowledged(false);
			}
		},
	});
	const inspect = electronTrpc.forkPortableBackup.inspect.useMutation({
		onSuccess: (result) => {
			setPlan(result);
			setMappings(
				Object.fromEntries(result.roots.map((root) => [root.id, root.target])),
			);
			setAcknowledged(false);
		},
	});
	const start = electronTrpc.forkPortableBackup.start.useMutation();
	const pending =
		preview.isPending ||
		choose.isPending ||
		inspect.isPending ||
		start.isPending;
	const error = preview.error || choose.error || inspect.error || start.error;
	const close = () => {
		if (pending) return;
		setPlan(null);
		setArchive(null);
		setPassword("");
		setConfirmation("");
		setAcknowledged(false);
		preview.reset();
		choose.reset();
		inspect.reset();
		start.reset();
	};
	return (
		<div className="space-y-3 px-5 py-4">
			<div className="space-y-1">
				<h3 className="text-sm font-medium">
					<Trans>Portable backup</Trans>
				</h3>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Move settings, projects, worktrees, chat history, agent profiles and
						files to another Mac.
					</Trans>
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={pending}
					onClick={() => preview.mutate()}
				>
					{preview.isPending ? (
						<Trans>Scanning…</Trans>
					) : (
						<Trans>Back up everything</Trans>
					)}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={pending}
					onClick={() => choose.mutate()}
				>
					<Trans>Restore backup</Trans>
				</Button>
			</div>
			{error && !plan && !archive && (
				<p role="alert" className="text-xs text-destructive">
					<Trans>
						Backup operation failed. Review the details and try again.
					</Trans>{" "}
					{error.message}
				</p>
			)}
			<Dialog
				open={!!plan || !!archive}
				onOpenChange={(open) => {
					if (!open) close();
				}}
			>
				<DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>
							{archive ? (
								<Trans>Restore backup</Trans>
							) : (
								<Trans>Back up everything</Trans>
							)}
						</DialogTitle>
						<DialogDescription>
							<Trans>
								The archive is encrypted with your password. Keep it safe: it
								cannot be recovered.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 overflow-y-auto pr-2">
						{archive && <p className="text-xs break-all">{archive}</p>}
						<div className="space-y-2">
							<Label htmlFor="fork-backup-password">
								<Trans>Backup password (at least 12 characters)</Trans>
							</Label>
							<Input
								id="fork-backup-password"
								type="password"
								autoComplete={archive ? "current-password" : "new-password"}
								value={password}
								disabled={pending || (!!archive && !!plan)}
								onChange={(event) => setPassword(event.target.value)}
							/>
						</div>
						{!archive && (
							<div className="space-y-2">
								<Label htmlFor="fork-backup-confirm">
									<Trans>Confirm password</Trans>
								</Label>
								<Input
									id="fork-backup-confirm"
									type="password"
									autoComplete="new-password"
									value={confirmation}
									disabled={pending}
									onChange={(event) => setConfirmation(event.target.value)}
								/>
							</div>
						)}
						{plan && (
							<>
								<p className="text-sm">
									<Trans>
										Includes ignored and untracked files, dependencies, Git
										history and local credentials.
									</Trans>
								</p>
								<p className="text-sm font-medium">
									{formatNumber(
										plan.roots.reduce((sum, root) => sum + root.bytes, 0) /
											1073741824,
										{ maximumFractionDigits: 2 },
									)}{" "}
									GB ·{" "}
									{formatNumber(
										plan.roots.reduce((sum, root) => sum + root.files, 0),
									)}{" "}
									<Trans>files</Trans>
								</p>
								<div className="space-y-3 rounded border p-3">
									{plan.roots.map((root) => (
										<div key={root.id} className="space-y-1">
											<p className="text-xs break-all font-mono">{root.path}</p>
											<p className="text-xs text-muted-foreground">
												{formatNumber(root.bytes / 1048576, {
													maximumFractionDigits: 1,
												})}{" "}
												MB
											</p>
											{archive && (
												<Input
													aria-label={t({ message: "Destination folder" })}
													value={mappings[root.id] ?? root.target}
													disabled={
														pending ||
														root.kind === "app" ||
														root.kind === "desktop"
													}
													onChange={(event) => {
														setAcknowledged(false);
														setMappings((previous) => ({
															...previous,
															[root.id]: event.target.value,
														}));
													}}
												/>
											)}
										</div>
									))}
								</div>
								{plan.missing.length > 0 && (
									<div
										role="alert"
										className="rounded border border-amber-500 p-3 text-xs space-y-2"
									>
										<p>
											<Trans>
												These referenced paths are already missing and cannot be
												included:
											</Trans>
										</p>
										{plan.missing.map((path) => (
											<p key={path} className="break-all font-mono">
												{path}
											</p>
										))}
									</div>
								)}
								<p className="text-xs text-muted-foreground">
									<Trans>
										Running agents stop. Install required tools on the
										destination Mac. Some providers may require sign-in again.
									</Trans>
								</p>
								{archive && (
									<p className="text-sm">
										<Trans>
											Review every destination. Existing folders are moved to
											sibling safety copies before replacement.
										</Trans>
									</p>
								)}
								<label className="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										className="mt-1"
										checked={acknowledged}
										disabled={pending}
										onChange={(event) => setAcknowledged(event.target.checked)}
									/>
									<span>
										<Trans>
											I reviewed the preview. Close Paradev++ and pause other
											tools that write these files, then reopen when finished.
										</Trans>
									</span>
								</label>
							</>
						)}
						{error && (
							<p role="alert" className="text-xs text-destructive">
								<Trans>
									Backup operation failed. Review the details and try again.
								</Trans>{" "}
								{error.message}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" disabled={pending} onClick={close}>
							<Trans>Cancel</Trans>
						</Button>
						{archive && !plan ? (
							<Button
								disabled={pending || password.length < 12}
								onClick={() => inspect.mutate({ archive, password })}
							>
								<Trans>Preview</Trans>
							</Button>
						) : (
							<Button
								disabled={
									pending ||
									!plan ||
									!acknowledged ||
									password.length < 12 ||
									(!archive && password !== confirmation)
								}
								onClick={() => {
									if (plan)
										start.mutate({
											id: plan.id,
											password,
											mappings: archive
												? plan.roots.map((root) => ({
														id: root.id,
														target: mappings[root.id] ?? root.target,
													}))
												: [],
										});
								}}
							>
								{archive ? (
									<Trans>Close and restore</Trans>
								) : (
									<Trans>Close and create backup</Trans>
								)}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
