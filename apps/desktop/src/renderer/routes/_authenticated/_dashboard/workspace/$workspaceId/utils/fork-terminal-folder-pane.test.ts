import { expect, mock, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../types";
import {
	forkTerminalPaneData,
	forkTerminalTabReplacement,
} from "./fork-terminal-folder-pane";
import { getPaneKey } from "./getPaneKey";

test("a single folder keeps optimistic terminal creation", async () => {
	const launcher = {
		mint: mock(() => "new"),
		create: mock(async () => "created"),
	};
	expect(await forkTerminalPaneData(launcher)).toEqual({
		terminalId: "new",
		createOnAttach: true,
	});
	expect(launcher.create).not.toHaveBeenCalled();
});

test("a chosen worktree directory is passed to the host before replacing the focused placeholder", async () => {
	const store = createWorkspaceStore<PaneViewerData>({ getPaneKey });
	store.getState().addTab({
		id: "target",
		panes: [{ id: "placeholder", kind: "new-tab", data: { kind: "new-tab" } }],
	});
	const path = "/worktrees/feature/backend";
	const creation = Promise.withResolvers<string>();
	const launcher = {
		mint: mock(() => "new"),
		create: mock((_options?: { cwd?: string }) => creation.promise),
	};
	const replace = forkTerminalTabReplacement(store, launcher);
	const launched = replace?.(path);
	expect(launcher.create).toHaveBeenCalledWith({ cwd: path });
	expect(store.getState().getPane("placeholder")?.pane.kind).toBe("new-tab");
	creation.resolve("created");
	expect(await launched).toBe(true);
	expect(store.getState().getActivePane()?.pane.data).toEqual({
		terminalId: "created",
	});
	expect(store.getState().tabs).toHaveLength(1);
});
