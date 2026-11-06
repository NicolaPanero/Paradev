import { expect, test } from "bun:test";
import { forkUsableChatAccount } from "./forkUsableChatAccount";

const reconnect = () => {
	throw new Error("Reconnect account");
};

test("an expired login moves the chat to a working default; otherwise nothing changes", async () => {
	const moved: string[] = [];
	const deps = (bad: string[], fallback: string | null) => ({
		validate: async (selection: string) => {
			if (bad.includes(selection)) reconnect();
		},
		fallback: () => fallback,
		move: async (target: string) => {
			moved.push(target);
		},
	});

	expect(await forkUsableChatAccount("/old", deps(["/old"], "/new"))).toEqual({
		selection: "/new",
		replaced: { from: "/old", to: "/new" },
	});
	expect(moved).toEqual(["/new"]);

	expect(await forkUsableChatAccount("/ok", deps([], "/new"))).toEqual({
		selection: "/ok",
	});
	expect(await forkUsableChatAccount(undefined, deps([], "/new"))).toEqual({
		selection: undefined,
	});

	await expect(
		forkUsableChatAccount("/old", deps(["/old", "/new"], "/new")),
	).rejects.toThrow("Reconnect account");
	await expect(
		forkUsableChatAccount("/old", deps(["/old"], "/old")),
	).rejects.toThrow("Reconnect account");
	await expect(
		forkUsableChatAccount("/old", deps(["/old"], null)),
	).rejects.toThrow("Reconnect account");
	await expect(
		forkUsableChatAccount("/old", {
			...deps([], "/new"),
			validate: async () => {
				throw new Error("network down");
			},
		}),
	).rejects.toThrow("network down");
	expect(moved).toEqual(["/new"]);
});
