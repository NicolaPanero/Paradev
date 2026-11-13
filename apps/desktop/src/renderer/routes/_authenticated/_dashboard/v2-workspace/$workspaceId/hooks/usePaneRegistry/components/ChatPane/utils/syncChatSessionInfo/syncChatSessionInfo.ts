import type { RendererContext } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { SessionInfo } from "../../components/AcpChatPane/utils/sessionInfoFromState";
import { sessionInfoPaneData } from "../sessionInfoPaneData";

export function syncChatSessionInfo(
	ctx: RendererContext<PaneViewerData>,
	info: SessionInfo,
	agentLabel?: string,
): ChatPaneData | null {
	const state = ctx.store.getState();
	const current = state.getPane(ctx.pane.id);
	if (!current || current.pane.kind !== "chat-v3") return null;
	const data = current.pane.data as ChatPaneData;
	const next = sessionInfoPaneData(data, {
		...info,
		title: info.title?.trim() || undefined,
	});
	if (next) state.setPaneData({ paneId: current.pane.id, data: next });
	const title = (next ?? data).chatTitle;
	if (
		title &&
		current.pane.titleOverride &&
		(current.pane.titleOverride === data.agentLabel ||
			current.pane.titleOverride === agentLabel)
	) {
		state.setPaneTitleOverride({
			tabId: current.tabId,
			paneId: current.pane.id,
			titleOverride: undefined,
		});
	}
	return next;
}
