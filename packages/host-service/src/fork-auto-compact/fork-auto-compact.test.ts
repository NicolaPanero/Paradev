import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	forkAutoCompactLaunch,
	forkAutoCompactStore,
} from "./fork-auto-compact";
import { forkAutoCompactDefault } from "./fork-auto-compact-default";

let directory: string;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "fork-auto-compact-"));
});
afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

test("resetting a Grok override restores the configured value for that agent only", () => {
	const store = forkAutoCompactStore(directory);
	const agent = { id: "grok-work", presetId: "grok" };
	const peer = { id: "grok-personal", presetId: "grok" };
	writeFileSync(
		join(directory, "config.toml"),
		"[session]\nauto_compact_threshold_percent = 72\n",
	);
	const env: NodeJS.ProcessEnv = { GROK_HOME: directory };
	store.write(agent, 61);
	store.write(peer, 68);
	expect(
		forkAutoCompactLaunch(agent, env, "acp", store).env
			.GROK_AUTO_COMPACT_THRESHOLD_PERCENT,
	).toBe("61");
	store.write(agent, null);
	expect(forkAutoCompactLaunch(agent, env, "acp", store)).toEqual({
		env,
		args: [],
	});
	expect(forkAutoCompactDefault("grok", env)).toBe(72);
	expect(store.read(peer)).toBe(68);
});

test("Codex preserves its configuration when passing the limit to ACP or the CLI", () => {
	const store = forkAutoCompactStore(directory);
	const agent = { id: "codex", presetId: "codex" };
	const env = {
		CODEX_CONFIG: '{"model":"example","model_auto_compact_token_limit":300000}',
	};
	store.write(agent, 350000);
	expect(forkAutoCompactDefault("codex", env)).toBe(300000);
	expect(
		JSON.parse(
			forkAutoCompactLaunch(agent, env, "acp", store).env.CODEX_CONFIG,
		),
	).toEqual({
		model: "example",
		model_auto_compact_token_limit: 350000,
	});
	expect(forkAutoCompactLaunch(agent, env, "terminal", store)).toEqual({
		env,
		args: ["-c", "model_auto_compact_token_limit=350000"],
	});
});

test("OpenCode overlays its token reserve and preserves the rest of its inline settings", () => {
	const store = forkAutoCompactStore(directory);
	const agent = { id: "opencode", presetId: "opencode" };
	const env = {
		OPENCODE_CONFIG_CONTENT:
			'{"compaction":{"auto":false,"reserved":27000},"model":"example"}',
	};
	store.write(agent, 43000);
	expect(forkAutoCompactDefault("opencode", env)).toBe(27000);
	expect(
		JSON.parse(
			forkAutoCompactLaunch(agent, env, "acp", store).env
				.OPENCODE_CONFIG_CONTENT,
		),
	).toEqual({
		model: "example",
		compaction: { auto: false, buffer: 43000, reserved: 43000 },
	});
});
