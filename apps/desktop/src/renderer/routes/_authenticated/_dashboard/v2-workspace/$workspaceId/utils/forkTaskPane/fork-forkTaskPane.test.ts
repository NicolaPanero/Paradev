import { expect, mock, test } from "bun:test";
import { getPaneKey } from "../getPaneKey";
import {
	FORK_TASK_PANE_KIND,
	type ForkTaskPaneData,
	forkTaskPaneKey,
	openForkTaskPaneInStore,
} from "./forkTaskPane";

const data: ForkTaskPaneData = {
	hostUrl: "http://host",
	connectionId: "jira-1",
	key: "B4BN-5230",
};

function fakeStore() {
	const state = { addTab: mock(() => {}), openPane: mock(() => {}) };
	return { state, store: { getState: () => state } as never };
}

test("a task opens beside the active pane by default, like a pull request, and as a tab when asked", () => {
	const split = fakeStore();
	openForkTaskPaneInStore(split.store, data);
	expect(split.state.openPane).toHaveBeenCalledWith({
		pane: { kind: FORK_TASK_PANE_KIND, data },
	});
	expect(split.state.addTab).not.toHaveBeenCalled();
	const tab = fakeStore();
	openForkTaskPaneInStore(tab.store, data, "tab");
	expect(tab.state.addTab).toHaveBeenCalledWith({
		panes: [{ kind: FORK_TASK_PANE_KIND, data }],
	});
	expect(tab.state.openPane).not.toHaveBeenCalled();
});

test("the same task is one pane and another task is another, so a second click focuses instead of duplicating", () => {
	const key = (value: ForkTaskPaneData) =>
		getPaneKey({ kind: FORK_TASK_PANE_KIND, data: value } as never);
	expect(key(data)).toBe(forkTaskPaneKey(data));
	expect(key({ ...data })).toBe(key(data));
	expect(key({ ...data, key: "B4BN-5231" })).not.toBe(key(data));
});
