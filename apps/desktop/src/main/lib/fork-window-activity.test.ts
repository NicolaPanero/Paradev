import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { FORK_WINDOW_ACTIVE_CHANNEL } from "shared/fork-window-activity";
import { attachForkWindowActivity } from "./fork-window-activity";

test("the renderer learns when its window gains or loses focus, or is minimized", () => {
	const state = { focused: true, visible: true, minimized: false };
	const sent: unknown[] = [];
	const webContents = Object.assign(new EventEmitter(), {
		send: (channel: string, active: unknown) => {
			if (channel === FORK_WINDOW_ACTIVE_CHANNEL) sent.push(active);
		},
	});
	const window = Object.assign(new EventEmitter(), {
		webContents,
		isDestroyed: () => false,
		isFocused: () => state.focused,
		isVisible: () => state.visible,
		isMinimized: () => state.minimized,
	});
	attachForkWindowActivity(window as unknown as BrowserWindow);

	webContents.emit("did-finish-load");
	state.focused = false;
	window.emit("blur");
	state.minimized = true;
	window.emit("minimize");
	state.minimized = false;
	window.emit("restore");
	state.focused = true;
	window.emit("focus");

	expect(sent).toEqual([true, false, false, false, true]);
});
