import { Trans } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useForkConnections } from "renderer/components/ForkIntegrations/hooks/useForkConnections";
import { required } from "renderer/components/ForkIntegrations/utils/required";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { usePullRequestLinkPolicy } from "renderer/lib/clickPolicy";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { StoreApi } from "zustand/vanilla";
import { useRightPaneLinkTarget } from "../../../../providers/RightPaneLinkTargetProvider";
import type { PaneViewerData } from "../../../../types";
import { openForkTaskPaneInStore } from "../../../../utils/forkTaskPane";
import { MenuGroup } from "../MenuGroup";
import { ForkLinkedTaskRows } from "./ForkLinkedTaskRows";

/** The Jira issues linked to this workspace, as the Tasks page shows them. */
export function ForkLinkedTasksGroup({
	workspaceId,
	store,
	enabled,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	enabled: boolean;
}) {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { client, jiraConfigured } = useForkConnections(hostUrl);
	const viewer = useRightPaneLinkTarget();
	const linkPolicy = usePullRequestLinkPolicy();
	const links = useQuery({
		networkMode: "always",
		retry: false,
		staleTime: 10_000,
		queryKey: [
			"fork-integrations",
			hostUrl,
			"workspace-task-links",
			workspaceId,
		],
		queryFn: () => required(client).forkTasks.links.query({ workspaceId }),
		enabled: enabled && !!client && jiraConfigured,
	});
	const items = links.data ?? [];
	const loaded = useQueries({
		queries: items.map((link) => ({
			networkMode: "always" as const,
			retry: false,
			staleTime: 30_000,
			queryKey: [
				"fork-integrations",
				hostUrl,
				"task",
				link.connectionId,
				link.key,
			],
			queryFn: () =>
				required(client).forkTasks.get.query({
					connectionId: link.connectionId,
					key: link.key,
				}),
			enabled: enabled && !!client,
		})),
	});
	if (items.length === 0 || !hostUrl) return null;
	const tasks = new Map(
		loaded.flatMap((query, index) => {
			const link = items[index];
			return link && query.data
				? [[`${link.connectionId}:${link.key}`, query.data] as const]
				: [];
		}),
	);
	return (
		<MenuGroup title={<Trans>Tasks</Trans>} count={items.length}>
			<ForkLinkedTaskRows
				links={items}
				tasks={tasks}
				onOpen={(link, event) => {
					const action = linkPolicy.getAction(event);
					if (action === "external") {
						void electronTrpcClient.external.openUrl.mutate(link.url);
						return;
					}
					viewer?.reveal();
					openForkTaskPaneInStore(
						viewer?.store ?? store,
						{ hostUrl, connectionId: link.connectionId, key: link.key },
						action === "newTab" ? "tab" : "split",
					);
				}}
			/>
		</MenuGroup>
	);
}
