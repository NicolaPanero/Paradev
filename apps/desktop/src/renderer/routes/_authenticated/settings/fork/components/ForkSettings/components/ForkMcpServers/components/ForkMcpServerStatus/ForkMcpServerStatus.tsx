import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuChevronDown, LuRefreshCw } from "react-icons/lu";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import type { ForkMcpServerSummary } from "../../hooks/useForkMcp";

export function ForkMcpServerStatus({
	client,
	hostUrl,
	server,
}: {
	client: HostServiceClient;
	hostUrl: string | null;
	server: ForkMcpServerSummary;
}) {
	const { t } = useLingui();
	const [checks, setChecks] = useState(0);
	const [open, setOpen] = useState(false);
	const status = useQuery({
		queryKey: ["fork-mcp-status", hostUrl, JSON.stringify(server), checks],
		queryFn: () =>
			client.forkMcp.status.query({ name: server.name, refresh: checks > 0 }),
		enabled: server.enabled,
		retry: false,
		staleTime: 60_000,
	});
	if (!server.enabled || status.isError) return null;
	const result = status.data;
	const reasons = {
		auth: t({ message: "Sign-in required" }),
		unreachable: t({ message: "Can't reach the server" }),
		command: t({ message: "The command doesn't start" }),
		timeout: t({ message: "No answer" }),
		failed: t({ message: "Connection failed" }),
	};
	return (
		<div className="mt-1.5 text-xs">
			<div className="flex min-w-0 items-center gap-1.5">
				<span
					aria-hidden
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						!result
							? "bg-muted-foreground/40"
							: result.state === "online"
								? "bg-emerald-500"
								: "bg-destructive",
					)}
				/>
				{!result ? (
					<span className="text-muted-foreground">
						<Trans>Checking…</Trans>
					</span>
				) : result.state === "online" ? (
					<button
						type="button"
						className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
						disabled={result.tools.length === 0}
						aria-expanded={open}
						onClick={() => setOpen((value) => !value)}
					>
						<Trans>Online</Trans> ·{" "}
						<Plural value={result.tools.length} one="# tool" other="# tools" />
						{result.tools.length > 0 && (
							<LuChevronDown
								className={cn(
									"size-3 transition-transform",
									open && "rotate-180",
								)}
							/>
						)}
					</button>
				) : (
					<span
						className="min-w-0 truncate text-destructive"
						title={result.message}
					>
						{reasons[result.reason]} · {result.message}
					</span>
				)}
				<button
					type="button"
					className="ml-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
					aria-label={t({ message: "Check again" })}
					title={t({ message: "Check again" })}
					disabled={status.isFetching}
					onClick={() => setChecks((value) => value + 1)}
				>
					<LuRefreshCw
						className={cn("size-3", status.isFetching && "animate-spin")}
					/>
				</button>
			</div>
			{open && result?.state === "online" && (
				<ul className="mt-2 flex flex-wrap gap-1">
					{result.tools.map((tool) => (
						<li
							key={tool.name}
							className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
							title={tool.description}
						>
							{tool.name}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
