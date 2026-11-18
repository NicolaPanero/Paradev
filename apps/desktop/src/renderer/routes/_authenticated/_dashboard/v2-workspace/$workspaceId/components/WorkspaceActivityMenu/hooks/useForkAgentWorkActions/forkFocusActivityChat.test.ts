import { expect, mock, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { forkFocusActivityChat } from "./forkFocusActivityChat";

const target = { terminalId: "terminal", sessionId: "session" };
const chat = (sessionId = target.sessionId) => ({
	kind: "chat-v3",
	data: { terminalId: target.terminalId, sessionId } as PaneViewerData,
});

test("a finished subagent focuses its chat in the right pane without opening a duplicate", () => {
	const main = createWorkspaceStore<PaneViewerData>();
	const right = createWorkspaceStore<PaneViewerData>();
	right.getState().addTab({ panes: [chat()] });
	const tabId = right.getState().activeTabId;
	right.getState().addTab({
		panes: [
			{ kind: "terminal", data: { terminalId: "other" } as PaneViewerData },
		],
	});
	const reopen = mock(() => false);
	const reveal = mock((_store: typeof right) => {});
	expect(forkFocusActivityChat([main, right], target, reopen, reveal)).toBe(
		true,
	);
	expect(reveal).toHaveBeenCalledWith(right);
	expect(right.getState().activeTabId).toBe(tabId);
	expect(right.getState().tabs).toHaveLength(2);
	expect(reopen).not.toHaveBeenCalled();
});

test("a parked owning chat is reopened before selecting its finished subagent", () => {
	const main = createWorkspaceStore<PaneViewerData>();
	const reopen = mock(() => {
		main.getState().addTab({ panes: [chat()] });
		return true;
	});
	expect(forkFocusActivityChat([main], target, reopen)).toBe(true);
	expect(reopen).toHaveBeenCalledTimes(1);
	expect(main.getState().tabs).toHaveLength(1);
});

test("a stale finished entry cannot select a different session using the same terminal", () => {
	const main = createWorkspaceStore<PaneViewerData>();
	main.getState().addTab({ panes: [chat("replacement-session")] });
	const reopen = mock(() => true);
	expect(forkFocusActivityChat([main], target, reopen)).toBe(false);
	expect(reopen).not.toHaveBeenCalled();
});
