import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../../../types";
import { findTerminalPaneLocation } from "../../../../utils/focusTerminalPane";

export function forkFocusActivityChat(
	stores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[],
	target: { terminalId: string; sessionId: string },
	reopen: () => boolean,
	reveal?: (store: StoreApi<WorkspaceStore<PaneViewerData>>) => void,
): boolean {
	for (const store of stores) {
		const state = store.getState();
		const location = findTerminalPaneLocation(state, target.terminalId);
		if (!location) continue;
		const pane = state.getTab(location.tabId)?.panes[location.paneId];
		const sessionId =
			pane?.kind === "chat-v3"
				? (pane.data as ChatPaneData).sessionId
				: (pane?.data as TerminalPaneData | undefined)?.acpSessionId;
		if (sessionId !== target.sessionId) continue;
		reveal?.(store);
		state.focusPane(location.paneId);
		return true;
	}
	if (
		stores.some((store) =>
			findTerminalPaneLocation(store.getState(), target.terminalId),
		)
	)
		return false;
	return reopen();
}
