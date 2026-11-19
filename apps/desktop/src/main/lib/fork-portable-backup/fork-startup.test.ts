import { expect, test } from "bun:test";
import { startForkApp } from "./fork-startup";

test("normal startup loads main immediately without waiting for recovery IO", async () => {
	const events: string[] = [];
	const result = startForkApp({
		helper: false,
		recovery: false,
		runHelper: async () => events.push("helper"),
		recover: async () => {
			events.push("recover");
		},
		relaunch: () => {
			events.push("relaunch");
		},
		loadMain: () => {
			events.push("main");
			return Promise.resolve();
		},
	});
	expect(events).toEqual(["main"]);
	await result;
});

test("recovery relaunches a fresh process and never loads main after Electron is ready", async () => {
	const events: string[] = [];
	let release = () => {};
	const recovered = new Promise<void>((resolve) => {
		release = resolve;
	});
	const result = startForkApp({
		helper: false,
		recovery: true,
		runHelper: async () => events.push("helper"),
		recover: () => {
			events.push("recover");
			return recovered;
		},
		relaunch: () => {
			events.push("relaunch");
		},
		loadMain: async () => {
			events.push("main");
		},
	});
	expect(events).toEqual(["recover"]);
	release();
	await result;
	expect(events).toEqual(["recover", "relaunch"]);
});
