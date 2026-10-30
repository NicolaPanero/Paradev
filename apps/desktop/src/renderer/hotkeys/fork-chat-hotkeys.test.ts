import { expect, test } from "bun:test";
import { HOTKEYS_REGISTRY } from "./registry";
import { useHotkeyOverridesStore } from "./stores/hotkeyOverridesStore";

test("the upstream chat action keeps the fork shortcut on every platform", () => {
	expect(HOTKEYS_REGISTRY.NEW_CHAT.key).toEqual({
		mac: { version: 2, mode: "logical", chord: "meta+shift+a" },
		windows: { version: 2, mode: "logical", chord: "ctrl+shift+alt+a" },
		linux: { version: 2, mode: "logical", chord: "ctrl+shift+alt+a" },
	});
	expect(HOTKEYS_REGISTRY).not.toHaveProperty("NEW_AGENT");
});

test.each([
	"meta+alt+k",
	null,
	{ version: 2, mode: "logical", chord: "meta+shift+q" },
])("a saved agent-dialog shortcut moves to the single chat action (%j)", async (binding) => {
	const migrate = useHotkeyOverridesStore.persist.getOptions().migrate;
	if (!migrate) throw new Error("Missing hotkey migration");
	expect(
		await migrate({ overrides: { NEW_AGENT: binding, NEW_GROUP: null } }, 1),
	).toEqual({ overrides: { NEW_CHAT: binding, NEW_GROUP: null } });
});

test("an explicitly configured canonical shortcut wins over the retired alias", async () => {
	const migrate = useHotkeyOverridesStore.persist.getOptions().migrate;
	if (!migrate) throw new Error("Missing hotkey migration");
	expect(
		await migrate(
			{ overrides: { NEW_AGENT: "meta+shift+q", NEW_CHAT: null } },
			1,
		),
	).toEqual({ overrides: { NEW_CHAT: null } });
});

test("chat migration composes with older upstream shortcut migrations", async () => {
	const migrate = useHotkeyOverridesStore.persist.getOptions().migrate;
	if (!migrate) throw new Error("Missing hotkey migration");
	expect(
		await migrate(
			{
				overrides: {
					UNDO_ARCHIVE_WORKSPACE: "meta+u",
					NEW_AGENT: "meta+alt+a",
				},
			},
			0,
		),
	).toEqual({ overrides: { UNDO: "meta+u", NEW_CHAT: "meta+alt+a" } });
});
