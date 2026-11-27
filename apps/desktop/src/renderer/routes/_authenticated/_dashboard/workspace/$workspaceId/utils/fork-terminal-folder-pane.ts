import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { TerminalLauncher } from "../hooks/useTerminalLauncher";
import {
	NEW_TAB_PANE_KIND,
	type PaneViewerData,
	type TerminalPaneData,
} from "../types";
import { replaceNewTabPane } from "./replaceNewTabPane";

export type OpenTerminalTab = (
	replace?: (cwd?: string) => boolean | Promise<boolean>,
) => Promise<void>;

export async function forkTerminalPaneData(
	launcher: TerminalLauncher,
	cwd?: string,
): Promise<TerminalPaneData> {
	if (cwd) return { terminalId: await launcher.create({ cwd }) };
	return { terminalId: launcher.mint(), createOnAttach: true };
}

export function forkTerminalTabReplacement(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	launcher: TerminalLauncher,
) {
	const active = store.getState().getActivePane();
	if (active?.pane.kind !== NEW_TAB_PANE_KIND) return undefined;
	const { tabId, pane } = active;
	const isPlaceholder = () =>
		store.getState().getPane(pane.id)?.pane.kind === NEW_TAB_PANE_KIND;

	return async (cwd?: string) => {
		if (!isPlaceholder()) return false;
		const terminal = {
			kind: "terminal",
			data: await forkTerminalPaneData(launcher, cwd),
		};
		if (isPlaceholder())
			replaceNewTabPane(store, { tabId, paneId: pane.id }, terminal);
		else store.getState().addTab({ panes: [terminal] });
		return true;
	};
}
