import { useLingui } from "@lingui/react/macro";
import type { ComposerMentionProvider } from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { ForkProviderIcon } from "../../components/ForkProviderIcon";
import {
	forkJiraChip,
	forkJiraLinkedIssue,
} from "../../utils/forkJiraWorkspace";
import { required } from "../../utils/required";
import { useForkConnections } from "../useForkConnections";
import { useForkJiraSearch } from "../useForkJiraSearch";

/** Jira issues in the composer's Link menu and @ search; null without a Jira account. */
export function useForkJiraMentionProvider(): ComposerMentionProvider[] {
	const { t } = useLingui();
	const search = useForkJiraSearch();
	const { client } = useForkConnections();
	return useMemo(() => {
		if (!search) return [];
		return [
			{
				id: "fork-jira-issues",
				title: t({ message: "Jira issues" }),
				priority: 3,
				icon: <ForkProviderIcon provider="jira" className="size-4" />,
				browse: {
					label: t({ message: "Jira issues" }),
					placeholder: t({ message: "Search Jira…" }),
				},
				source: {
					kind: "search",
					emptyState: t({ message: "No issues found." }),
					search: async (query) =>
						(await search(query)).map((summary) => ({
							id: `${summary.connectionId}:${summary.key}`,
							label: summary.key,
							description: summary.title,
							icon: summary.type?.iconUrl ? (
								<img alt="" className="size-4" src={summary.type.iconUrl} />
							) : (
								<ForkProviderIcon provider="jira" className="size-4" />
							),
							keywords: [summary.title, summary.status.name],
							select: async (ctx) => {
								const task = await required(client)
									.forkTasks.get.query({
										connectionId: summary.connectionId,
										key: summary.key,
									})
									.catch(() => summary);
								ctx.insertChip(forkJiraChip(forkJiraLinkedIssue(task)));
							},
						})),
				},
			},
		];
	}, [search, client, t]);
}
