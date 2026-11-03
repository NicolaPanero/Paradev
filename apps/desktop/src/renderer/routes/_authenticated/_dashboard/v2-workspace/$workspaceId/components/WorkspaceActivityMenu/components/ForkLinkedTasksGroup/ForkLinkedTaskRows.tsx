import type {
	ForkTask,
	ForkTaskLink,
} from "@superset/shared/fork-integrations";
import { cn } from "@superset/ui/utils";
import { jiraStatusTone } from "renderer/components/ForkIntegrations/components/ForkJiraTasks/fork-jira-query";
import { ForkProviderIcon } from "renderer/components/ForkIntegrations/components/ForkProviderIcon";

export function ForkLinkedTaskRows({
	links,
	tasks,
	onOpen,
}: {
	links: ForkTaskLink[];
	tasks: Map<string, ForkTask>;
	onOpen: (link: ForkTaskLink) => void;
}) {
	return (
		<div>
			{links.map((link) => {
				const task = tasks.get(`${link.connectionId}:${link.key}`);
				return (
					<button
						key={`${link.connectionId}:${link.taskId}`}
						type="button"
						onClick={() => onOpen(link)}
						className="flex min-h-7 w-full min-w-0 items-center gap-2 rounded-sm py-0.5 pr-2 pl-2 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
					>
						<ForkProviderIcon provider="jira" className="size-3.5" />
						<span className="shrink-0 text-muted-foreground tabular-nums">
							{link.key}
						</span>
						<span className="min-w-0 flex-1 truncate text-foreground">
							{task?.title ?? link.title}
						</span>
						{task && (
							<span
								className={cn(
									"shrink-0 rounded px-1.5 py-0.5 text-[10px]",
									jiraStatusTone(task.status.category),
								)}
							>
								{task.status.name}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
