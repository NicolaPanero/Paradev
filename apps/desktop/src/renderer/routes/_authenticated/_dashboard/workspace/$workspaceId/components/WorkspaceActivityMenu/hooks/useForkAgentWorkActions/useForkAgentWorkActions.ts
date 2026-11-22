import { useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useForkBackgroundChats } from "../../../../hooks/useForkBackgroundChats";
import { useChatSubagentStore } from "../../../../hooks/usePaneRegistry/stores/chatSubagentStore";
import { useRightPaneLinkTarget } from "../../../../providers/RightPaneLinkTargetProvider";
import type { PaneViewerData } from "../../../../types";
import { useAgentWorkActions } from "../useAgentWorkActions";
import { forkFocusActivityChat } from "./forkFocusActivityChat";

export function useForkAgentWorkActions(
	stores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[],
	workspaceId: string,
	onOpened: () => void,
) {
	const actions = useAgentWorkActions(stores);
	const { chats, reopenParked } = useForkBackgroundChats(workspaceId);
	const rightPane = useRightPaneLinkTarget();
	const { t } = useLingui();
	return useMemo(
		() => ({
			...actions,
			open: (...args: Parameters<typeof actions.open>) => {
				const [target, options] = args;
				if (!options.subagent || !target.sessionId) {
					actions.open(...args);
					return;
				}
				const sessionId = target.sessionId;
				const opened = forkFocusActivityChat(
					stores,
					{ ...target, sessionId },
					() => {
						const store = stores[0];
						const parked = chats.find(
							(chat) => chat.terminalId === target.terminalId,
						);
						return Boolean(
							store &&
								parked?.paneData.acpSessionId === sessionId &&
								reopenParked(store, target.terminalId),
						);
					},
					(store) => {
						if (rightPane?.store === store) rightPane.reveal();
					},
				);
				if (!opened) {
					toast.error(
						t({ message: "This subagent's chat is no longer available" }),
					);
					return;
				}
				useChatSubagentStore.getState().open(target.terminalId, target.taskId);
				onOpened();
			},
		}),
		[actions, stores, chats, reopenParked, rightPane, onOpened, t],
	);
}
