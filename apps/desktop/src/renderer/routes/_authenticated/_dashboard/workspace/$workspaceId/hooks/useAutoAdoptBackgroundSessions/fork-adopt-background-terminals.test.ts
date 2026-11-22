import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { adoptTerminalPanes } from "../../utils/adoptTerminalPanes";
import { findTerminalPaneLocation } from "../../utils/focusTerminalPane";
import { forkAdoptBackgroundTerminals } from "./fork-adopt-background-terminals";

test("adopting a setup terminal preserves the selected tab and its setup title", () => {
	const store = createWorkspaceStore<PaneViewerData>({
		initialState: { version: 1, tabs: [], activeTabId: null },
	});
	adoptTerminalPanes(store, ["existing"]);
	const selected = store.getState().activeTabId;
	forkAdoptBackgroundTerminals(store, [
		{ terminalId: "agent" },
		{ terminalId: "setup", customTitle: "Workspace Setup" },
	]);
	const state = store.getState();
	const setup = findTerminalPaneLocation(state, "setup");
	expect(state.activeTabId).toBe(selected);
	expect(state.tabs.find((tab) => tab.id === setup?.tabId)?.titleOverride).toBe(
		"Workspace Setup",
	);
});
