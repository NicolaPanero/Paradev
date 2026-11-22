import type { GetPaneKey } from "@superset/panes";
import {
	type PagePaneData,
	type PaneViewerData,
	SUBAGENT_PANE_KIND,
	type SubagentPaneData,
} from "../../types";
import {
	FORK_TASK_PANE_KIND,
	type ForkTaskPaneData,
	forkTaskPaneKey,
} from "../forkTaskPane";

export const PULL_REQUEST_PANE_KEY = "pull-request";

export const getPaneKey: GetPaneKey<PaneViewerData> = ({ kind, data }) => {
	switch (kind) {
		case "page":
			return `page:${(data as PagePaneData).slug}`;
		case SUBAGENT_PANE_KIND: {
			const { terminalId, subagentId } = data as SubagentPaneData;
			return `subagent:${terminalId}:${subagentId}`;
		}
		case "pull-request":
			return PULL_REQUEST_PANE_KEY;
		case FORK_TASK_PANE_KIND:
			return forkTaskPaneKey(data as ForkTaskPaneData);
		default:
			return undefined;
	}
};
