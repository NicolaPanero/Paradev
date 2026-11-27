import { expect, test } from "bun:test";
import type {
	HarnessAdapter,
	HarnessFactoryOptions,
} from "@superset/chat-runtime";
import type { HostDb } from "../db";

const launches: Array<Record<string, unknown>> = [];
const { acpHarnessFactory } = await import("./acpHarnesses");
test.each([
	"cursor-acp",
	"grok-acp",
	"gemini-acp",
])("%s applies its replay contract at the real factory boundary", (harness) => {
	const factory = acpHarnessFactory(
		harness,
		{} as HostDb,
		async () => null,
		undefined,
		undefined,
		(options) => {
			launches.push({ ...options });
			return {} as HarnessAdapter;
		},
	);
	expect(factory).not.toBeNull();
	factory?.({
		scopeId: "workspace",
		sessionId: "fixture",
		terminalId: "pane",
		cwd: "/work",
	} as HarnessFactoryOptions);
	const options = launches.at(-1);
	expect(options?.wholeUserMessageReplay).toBe(
		harness === "cursor-acp" ? true : undefined,
	);
	expect(options?.launch).toBeTypeOf("function");
	expect(options?.forkCursorModelSelection).toBe(harness === "cursor-acp");
});

test("every chat preset is recognized by both the renderer and the workspace launcher", async () => {
	const { acpHarnessForPreset: client } = await import("@superset/chat/core");
	const { acpHarnessForPreset: host, ACP_HARNESSES } = await import(
		"./acpCatalogue"
	);
	for (const [harness, entry] of Object.entries(ACP_HARNESSES)) {
		const preset = entry.presetId ?? entry.binary;
		expect(client(preset)).toBe(harness);
		expect(host(preset)).toBe(harness);
	}
});

test("discovery uses its prepared launch without recording a chat launch", async () => {
	const launch = {
		command: "/test/cursor-agent",
		version: "1.0.0",
		args: ["acp"],
		env: {},
		identity: { command: "/test/cursor-agent", version: "1.0.0" },
		loginCommand: undefined,
	};
	let chatLaunched = false;
	let launchAgent: (() => Promise<unknown>) | undefined;
	const factory = acpHarnessFactory(
		"cursor-acp",
		{} as HostDb,
		async () => null,
		{
			started: () => {},
			published: () => {},
			stopped: () => {},
			spawned: () => {},
			accountCaptured: () => {},
			closedMidTurn: () => {},
			launched: () => {
				chatLaunched = true;
			},
		},
		{ launch, startupTimeoutMs: 10 },
		(options) => {
			expect(options.startupTimeoutMs).toBe(10);
			launchAgent = options.launch;
			return {} as HarnessAdapter;
		},
	);
	factory?.({
		harness: "cursor-acp",
		scopeId: "workspace",
		sessionId: "fixture-discovery",
		cwd: "/work",
	});
	expect(await launchAgent?.()).toBe(launch);
	expect(chatLaunched).toBe(false);
});
