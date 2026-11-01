import { Trans } from "@lingui/react/macro";
import { formatAge } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import type { AgentWork } from "../../utils/collectAgentWork";

export function ForkBackgroundWorkDetails({
	work,
	source,
	now,
	stopping,
	onClose,
	onOpenChat,
	onStop,
}: {
	work: AgentWork | null;
	source?: string;
	now: number;
	stopping: boolean;
	onClose: () => void;
	onOpenChat: (work: AgentWork) => void;
	onStop: (work: AgentWork) => void;
}) {
	const outputTaskId = work?.kind === "shell" ? work.taskId : undefined;
	const output = workspaceTrpc.agents.backgroundTaskOutput.useQuery(
		{ terminalId: work?.terminalId ?? "", taskId: outputTaskId ?? "" },
		{ enabled: !!outputTaskId, retry: false, refetchInterval: 2_000 },
	);
	const text = output.data?.output?.text;
	const outputRef = useRef<HTMLPreElement>(null);
	useEffect(() => {
		if (text === undefined || !outputRef.current) return;
		outputRef.current.scrollTop = outputRef.current.scrollHeight;
	}, [text]);
	return (
		<Dialog
			open={work !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						<Trans>Background task</Trans>
					</DialogTitle>
					<DialogDescription>
						{[source, work ? formatAge(work.startedAtMs, now) : undefined]
							.filter(Boolean)
							.join(" · ")}
					</DialogDescription>
				</DialogHeader>
				{work && (
					<div className="space-y-3">
						<pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">
							{work.name}
						</pre>
						{work.step && (
							<p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
								{work.step}
							</p>
						)}
						{outputTaskId &&
							(text !== undefined ? (
								<div className="space-y-1">
									{output.data?.output?.truncated && (
										<p className="text-[11px] text-muted-foreground">
											<Trans>Showing the latest output.</Trans>
										</p>
									)}
									<pre
										ref={outputRef}
										className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-[11px]"
									>
										{text || <Trans>No output yet.</Trans>}
									</pre>
								</div>
							) : (
								<p className="text-xs text-muted-foreground">
									{output.isLoading ? (
										<Trans>Loading output…</Trans>
									) : (
										<Trans>Output unavailable.</Trans>
									)}
								</p>
							))}
					</div>
				)}
				<DialogFooter>
					{work?.canStop && (
						<Button
							variant="outline"
							disabled={stopping}
							onClick={() => onStop(work)}
						>
							<Trans>Stop</Trans>
						</Button>
					)}
					<Button
						onClick={() => {
							if (work) onOpenChat(work);
						}}
					>
						<Trans>Chat</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
