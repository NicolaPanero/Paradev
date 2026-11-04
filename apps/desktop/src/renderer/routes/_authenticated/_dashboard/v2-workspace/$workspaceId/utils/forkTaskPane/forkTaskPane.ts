import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export const FORK_TASK_PANE_KIND = "fork-task";

export interface ForkTaskPaneData {
	hostUrl: string;
	connectionId: string;
	key: string;
}

export const forkTaskPaneKey = (data: ForkTaskPaneData) =>
	`${FORK_TASK_PANE_KIND}:${data.connectionId}:${data.key}`;

/** Focuses the pane already showing this task, else opens it like a pull request: beside the active pane or as a tab. */
export function openForkTaskPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	data: ForkTaskPaneData,
	placement: "split" | "tab" = "split",
): void {
	const pane = { kind: FORK_TASK_PANE_KIND, data: data as PaneViewerData };
	if (placement === "tab") store.getState().addTab({ panes: [pane] });
	else store.getState().openPane({ pane });
}
