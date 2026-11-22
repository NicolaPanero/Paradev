import * as workspaceClient from "@superset/workspace-client";
import { useMemo } from "react";

const NO_PARKED_CHATS: { terminalId: string }[] = [];

/** Terminals of chats parked in the background, which must not reopen as tabs. */
export function useForkParkedTerminals(workspaceId: string, enabled: boolean) {
	// Upstream test fixtures replace this module without `workspaceTrpc`.
	const parkedChats = workspaceClient.workspaceTrpc?.agents.parkedChats;
	const query = parkedChats?.useQuery(
		{ workspaceId },
		{ enabled, retry: false },
	);
	const data = query?.data ?? NO_PARKED_CHATS;
	const parked = useMemo(
		() => new Set(data.map((chat) => chat.terminalId)),
		[data],
	);
	return { parked, pending: query?.isPending === true };
}
