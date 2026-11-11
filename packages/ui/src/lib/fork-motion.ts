/** On `<html>` while the app window is out of focus, minimized or hidden. */
export const FORK_MOTION_PAUSED_ATTRIBUTE = "data-fork-motion-paused";

export function forkMotionPaused(): boolean {
	return (
		typeof document !== "undefined" &&
		document.documentElement.hasAttribute(FORK_MOTION_PAUSED_ATTRIBUTE)
	);
}
