import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { WorkspaceStore } from "@superset/panes";
import { isForkSetupTerminal } from "renderer/lib/fork-settings-visibility";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { adoptTerminalPanes } from "../../utils/adoptTerminalPanes";
import { findTerminalPaneLocation } from "../../utils/focusTerminalPane";

export function forkAdoptBackgroundTerminals(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	sessions: readonly { terminalId: string; customTitle?: string | null }[],
) {
	adoptTerminalPanes(
		store,
		sessions.map((session) => session.terminalId),
	);
	for (const session of sessions) {
		if (!isForkSetupTerminal(session)) continue;
		const location = findTerminalPaneLocation(
			store.getState(),
			session.terminalId,
		);
		if (location)
			store.getState().setTabTitleOverride({
				tabId: location.tabId,
				titleOverride: i18n._(msg({ message: "Workspace Setup" })),
			});
	}
}
