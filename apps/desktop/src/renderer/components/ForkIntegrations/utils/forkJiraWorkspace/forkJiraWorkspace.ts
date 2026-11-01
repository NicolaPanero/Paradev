import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import {
	type ForkTask,
	forkTaskBranch,
} from "@superset/shared/fork-integrations";
import { SiJira } from "react-icons/si";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { iconDataUrl } from "renderer/routes/_authenticated/components/AgentComposer/utils/iconDataUrl";
import { linkedIssueChip } from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import { deriveBranchName } from "renderer/routes/_authenticated/utils/deriveBranchName";
import type {
	LinkedIssue,
	NewWorkspaceDraft,
} from "renderer/stores/new-workspace-draft";
import { useNewWorkspacePromptContextStore } from "renderer/stores/new-workspace-prompt-context/store";

const JIRA_SOURCE = "jira" as const;
const JIRA_BLUE = "#2684FF";

const bodyKey = (issue: LinkedIssue) =>
	`jira-issue:${issue.forkJira?.connectionId ?? ""}:${issue.slug}`;

/** Links the issue to a new-workspace draft and hands its text to the agent prompt. */
export function forkJiraLinkedIssue(task: ForkTask): LinkedIssue {
	const issue: LinkedIssue = {
		slug: task.key,
		title: task.title,
		source: JIRA_SOURCE,
		url: task.url,
		forkJira: {
			connectionId: task.connectionId,
			taskId: task.id,
			branchName: forkTaskBranch(task.key, task.title, task.type?.name),
		},
	};
	useNewWorkspacePromptContextStore.setState((state) => {
		const entries = new Map(state.entries);
		entries.set(bodyKey(issue), {
			state: "ready",
			body: { text: task.description },
		});
		const jiraKeys = [...entries.keys()].filter((key) =>
			key.startsWith("jira-issue:"),
		);
		for (const key of jiraKeys.slice(0, Math.max(0, jiraKeys.length - 100)))
			entries.delete(key);
		return { entries };
	});
	return issue;
}

export function forkJiraUnlinkPatch(
	removed: LinkedIssue | undefined,
	remaining: LinkedIssue[],
	draft: Pick<NewWorkspaceDraft, "branchName" | "workspaceName">,
): Partial<NewWorkspaceDraft> {
	if (removed?.source !== JIRA_SOURCE) return {};
	const next = remaining.find(
		(issue) =>
			issue.source === JIRA_SOURCE ||
			issue.source === "internal" ||
			issue.source === "linear",
	);
	const branch = removed.forkJira?.branchName;
	return {
		...(branch && draft.branchName === branch
			? {
					branchName: next
						? next.source === JIRA_SOURCE
							? (next.forkJira?.branchName ??
								forkTaskBranch(next.slug, next.title))
							: deriveBranchName(next)
						: "",
					branchNameEdited: !!next,
					branchNameFromProvider:
						next?.source !== JIRA_SOURCE && !!next?.branch?.trim(),
				}
			: {}),
		...(draft.workspaceName === `${removed.slug} ${removed.title}`
			? {
					workspaceName: next
						? next.source === JIRA_SOURCE
							? `${next.slug} ${next.title}`
							: next.title
						: "",
					workspaceNameEdited: !!next,
				}
			: {}),
	};
}

export function forkJiraPromptSections(
	issues: LinkedIssue[],
	readBody: (key: string) => string | null,
): string[] {
	return issues
		.filter((issue) => issue.source === JIRA_SOURCE)
		.map((issue) => {
			const header = [
				`## Linked Jira issue — ${issue.slug}: ${issue.title}`,
				...(issue.url ? [issue.url] : []),
			].join("\n");
			const body = readBody(bodyKey(issue));
			return body ? `${header}\n\n${body}` : header;
		});
}

/** After the workspace exists: link its Jira issues and start them. */
export async function forkStartJiraWork(
	client: HostServiceClient,
	workspaceId: string,
	issues: LinkedIssue[],
): Promise<void> {
	const version = await client.forkConnections.list
		.query()
		.then((result) => result.version)
		.catch(() => 0);
	await Promise.all(
		issues
			.filter((issue) => issue.source === JIRA_SOURCE && issue.url)
			.map((issue) => {
				const pending = issue.forkJira;
				if (!pending) return undefined;
				if (version < 4)
					return client.forkTasks.link
						.mutate({
							workspaceId,
							connectionId: pending.connectionId,
							key: issue.slug,
						})
						.catch((error) =>
							console.warn("[fork-jira] could not link", issue.slug, error),
						);
				return client.forkTasks.startWork
					.mutate({
						workspaceId,
						connectionId: pending.connectionId,
						taskId: pending.taskId,
						key: issue.slug,
						title: issue.title,
						url: issue.url ?? "",
					})
					.catch((error) =>
						console.warn("[fork-jira] could not start", issue.slug, error),
					);
			}),
	);
}

/** The composer chip for a Jira issue: the agent prompt and submit read it like any linked issue. */
export function forkJiraChip(issue: LinkedIssue): ComposerChip {
	return {
		...linkedIssueChip(issue, false),
		iconUrl: iconDataUrl(SiJira, JIRA_BLUE),
	};
}

/** Names follow Jira issues added to or removed from the composer, unless the user changed them. */
export function forkJiraNamingPatch(
	before: LinkedIssue[],
	after: LinkedIssue[],
	draft: Pick<
		NewWorkspaceDraft,
		"branchName" | "branchNameEdited" | "workspaceName" | "workspaceNameEdited"
	>,
): Partial<NewWorkspaceDraft> {
	const removed = before.find(
		(issue) =>
			issue.source === JIRA_SOURCE &&
			!after.some((next) => next.slug === issue.slug),
	);
	if (removed) return forkJiraUnlinkPatch(removed, after, draft);
	const added = after.find(
		(issue) =>
			issue.source === JIRA_SOURCE &&
			!before.some((prev) => prev.slug === issue.slug),
	);
	if (!added) return {};
	return {
		...(!draft.branchNameEdited && !draft.branchName.trim()
			? {
					branchName:
						added.forkJira?.branchName ??
						forkTaskBranch(added.slug, added.title),
					branchNameEdited: true,
					branchNameFromProvider: false,
				}
			: {}),
		...(!draft.workspaceNameEdited && !draft.workspaceName.trim()
			? {
					workspaceName: `${added.slug} ${added.title}`,
					workspaceNameEdited: true,
				}
			: {}),
	};
}
