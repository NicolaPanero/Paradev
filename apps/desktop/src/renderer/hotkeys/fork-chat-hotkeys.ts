import type { PlatformKey, ShortcutBinding } from "./types";
export const FORK_NEW_CHAT_KEY: PlatformKey = {
	mac: { version: 2, mode: "logical", chord: "meta+shift+a" },
	windows: { version: 2, mode: "logical", chord: "ctrl+shift+alt+a" },
	linux: { version: 2, mode: "logical", chord: "ctrl+shift+alt+a" },
};
export function forkMigrateChatHotkeyOverrides<
	T extends { overrides: Record<string, ShortcutBinding | null> },
>(state: T): T {
	if (!state?.overrides || !("NEW_AGENT" in state.overrides)) return state;
	const { NEW_AGENT, ...overrides } = state.overrides;
	if (!("NEW_CHAT" in overrides)) overrides.NEW_CHAT = NEW_AGENT ?? null;
	return { ...state, overrides };
}
