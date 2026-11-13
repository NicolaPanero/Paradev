import type { BrowserWindow } from "electron";
import { FORK_WINDOW_ACTIVE_CHANNEL } from "shared/fork-window-activity";

export function isForkWindowActive(
	window: Pick<BrowserWindow, "isFocused" | "isVisible" | "isMinimized">,
): boolean {
	return window.isFocused() && window.isVisible() && !window.isMinimized();
}

// The page visibility API cannot report this: background throttling is off on
// macOS, so a minimized window stays "visible" and keeps rendering frames.
export function attachForkWindowActivity(window: BrowserWindow): void {
	const send = () => {
		if (window.isDestroyed()) return;
		window.webContents.send(
			FORK_WINDOW_ACTIVE_CHANNEL,
			isForkWindowActive(window),
		);
	};
	window.on("focus", send);
	window.on("blur", send);
	window.on("minimize", send);
	window.on("restore", send);
	window.on("show", send);
	window.on("hide", send);
	window.webContents.on("did-finish-load", send);
}
