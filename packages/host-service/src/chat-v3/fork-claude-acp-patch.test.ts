import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const packageDir = dirname(
	require.resolve("@agentclientprotocol/claude-agent-acp/package.json"),
);
const extension = await import(
	pathToFileURL(join(packageDir, "dist/superset-context-usage.js")).href
);

describe("fork Claude context usage extension", () => {
	test.each([
		"v1/acp-agent.js",
		"v2/agent.js",
	])("registers context usage for %s", (entry) => {
		const source = readFileSync(join(packageDir, "dist", entry), "utf8");
		expect(source).toContain(".onRequest(SUPERSET_CONTEXT_USAGE_METHOD,");
		expect(source).toContain("async supersetContextUsage(params)");
		expect(extension.SUPERSET_CONTEXT_USAGE_METHOD).toBe(
			"_superset/context_usage",
		);
	});
	test("validates and trims session ids", () => {
		expect(
			extension.parseSupersetContextUsageRequest({ sessionId: " session " }),
		).toEqual({ sessionId: "session" });
		expect(() =>
			extension.parseSupersetContextUsageRequest({ sessionId: " " }),
		).toThrow();
	});
	test("requests the local context summary", async () => {
		const usage = { totalTokens: 42 };
		const getContextUsage = mock(async () => usage);
		expect(
			await extension.readSupersetContextUsage({ getContextUsage }),
		).toEqual({ usage });
		expect(getContextUsage).toHaveBeenCalledWith({ detail: "summary" });
	});
	test("returns no usage for unknown sessions or SDK errors", async () => {
		expect(await extension.readSupersetContextUsage(undefined)).toEqual({
			usage: null,
		});
		expect(
			await extension.readSupersetContextUsage({
				getContextUsage: async () => {
					throw new Error("unavailable");
				},
			}),
		).toEqual({ usage: null });
	});
	test("bounds a stalled SDK request", async () => {
		expect(
			await extension.readSupersetContextUsage(
				{ getContextUsage: () => new Promise(() => {}) },
				0,
			),
		).toEqual({ usage: null });
	});
});
