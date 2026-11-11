import { afterEach, expect, test } from "bun:test";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { FORK_MOTION_PAUSED_ATTRIBUTE } from "@superset/ui/lib/fork-motion";
import { act, render } from "renderer/test-utils/fork-ui";
import { FORK_WINDOW_ACTIVE_CHANNEL } from "shared/fork-window-activity";
import { installForkWindowActivity } from "./fork-window-activity";

type Listener = (...args: unknown[]) => void;

function fakeIpc() {
	const listeners = new Map<string, Set<Listener>>();
	return {
		on: (channel: string, listener: Listener) => {
			const set = listeners.get(channel) ?? new Set();
			set.add(listener);
			listeners.set(channel, set);
		},
		off: (channel: string, listener: Listener) => {
			listeners.get(channel)?.delete(listener);
		},
		emit: (channel: string, ...args: unknown[]) => {
			for (const listener of listeners.get(channel) ?? []) listener(...args);
		},
	};
}

const root = document.documentElement;
let uninstall = () => {};
afterEach(() => {
	uninstall();
	root.removeAttribute(FORK_MOTION_PAUSED_ATTRIBUTE);
});

test("motion pauses while the window is inactive and resumes when it is active", () => {
	const ipc = fakeIpc();
	uninstall = installForkWindowActivity(ipc, root);

	ipc.emit(FORK_WINDOW_ACTIVE_CHANNEL, false);
	expect(root.hasAttribute(FORK_MOTION_PAUSED_ATTRIBUTE)).toBe(true);

	ipc.emit(FORK_WINDOW_ACTIVE_CHANNEL, true);
	expect(root.hasAttribute(FORK_MOTION_PAUSED_ATTRIBUTE)).toBe(false);

	ipc.emit(FORK_WINDOW_ACTIVE_CHANNEL, false);
	uninstall();
	uninstall = () => {};
	expect(root.hasAttribute(FORK_MOTION_PAUSED_ATTRIBUTE)).toBe(false);
});

test("the wave spinner stops rendering frames while motion is paused", async () => {
	const opacities = (container: HTMLElement) =>
		[...container.querySelectorAll<HTMLElement>("span span")]
			.map((cell) => cell.style.opacity)
			.join(",");
	const wait = (ms: number) =>
		act(() => new Promise((resolve) => setTimeout(resolve, ms)));

	root.setAttribute(FORK_MOTION_PAUSED_ATTRIBUTE, "");
	const view = render(<WaveSpinner />);
	const initial = opacities(view.container);
	await wait(160);
	expect(opacities(view.container)).toBe(initial);

	root.removeAttribute(FORK_MOTION_PAUSED_ATTRIBUTE);
	await wait(160);
	expect(opacities(view.container)).not.toBe(initial);
	view.unmount();
});
