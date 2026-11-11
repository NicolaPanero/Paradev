import { FORK_MOTION_PAUSED_ATTRIBUTE } from "@superset/ui/lib/fork-motion";
import { FORK_WINDOW_ACTIVE_CHANNEL } from "shared/fork-window-activity";

type WindowActivityIpc = Pick<Window["ipcRenderer"], "on" | "off">;

// Each frame costs the long-lived renderer's compositor more over time, so
// endless animations must not keep producing frames nobody looks at.
export function installForkWindowActivity(
	ipc: WindowActivityIpc | undefined = window.ipcRenderer,
	root: HTMLElement = document.documentElement,
): () => void {
	if (!ipc) return () => {};
	const onChange = (active: unknown) => {
		root.toggleAttribute(FORK_MOTION_PAUSED_ATTRIBUTE, active === false);
	};
	ipc.on(FORK_WINDOW_ACTIVE_CHANNEL, onChange);
	return () => {
		ipc.off(FORK_WINDOW_ACTIVE_CHANNEL, onChange);
		root.removeAttribute(FORK_MOTION_PAUSED_ATTRIBUTE);
	};
}
