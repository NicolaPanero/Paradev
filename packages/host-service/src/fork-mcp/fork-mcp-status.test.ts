import { expect, test } from "bun:test";
import type { ForkMcpProbe } from "./fork-mcp-probe";
import type { ForkMcpServer } from "./fork-mcp-servers";
import { createForkMcpStatus } from "./fork-mcp-status";

const server = (
	name: string,
	url = "https://example.test/mcp",
): ForkMcpServer => ({
	transport: "http",
	name,
	enabled: true,
	url,
	headers: {},
});

test("a check is reused for a minute, redone on Refresh or a changed setting, three at a time", async () => {
	let clock = 0;
	let running = 0;
	let peak = 0;
	const calls: string[] = [];
	const status = createForkMcpStatus(
		async (target) => {
			calls.push(target.name);
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 5));
			running--;
			return { state: "online", tools: [], checkedAt: clock } as ForkMcpProbe;
		},
		() => clock,
	);

	await status(server("a"));
	await status(server("a"));
	expect(calls).toEqual(["a"]);
	await status(server("a"), true);
	await status(server("a", "https://other.test/mcp"));
	clock += 60_001;
	await status(server("a", "https://other.test/mcp"));
	expect(calls).toEqual(["a", "a", "a", "a"]);

	await Promise.all(
		["b", "c", "d", "e", "f"].map((name) => status(server(name))),
	);
	expect(peak).toBe(3);
});
