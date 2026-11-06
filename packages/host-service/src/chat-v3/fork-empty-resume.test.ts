import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	HarnessAdapter,
	HarnessFactoryOptions,
	HarnessStartOptions,
} from "@superset/chat-runtime";
import {
	claudeConfigDirs,
	claudeTranscriptExists,
	withForkEmptyResume,
} from "./withForkEmptyResume";

const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

function started(options: Partial<HarnessFactoryOptions>, exists: boolean) {
	const starts: HarnessStartOptions[] = [];
	const factory = withForkEmptyResume(
		() =>
			({
				start(startOptions: HarnessStartOptions) {
					starts.push(startOptions);
					return (async function* () {})();
				},
			}) as unknown as HarnessAdapter,
		() => exists,
	);
	const full = {
		sessionId: "s",
		scopeId: "w",
		harness: "claude-acp",
		cwd: "/repo",
		...options,
	} as HarnessFactoryOptions;
	factory(full).start({
		cwd: full.cwd,
		resume: full.resume,
		strictResume: full.strictResume,
	});
	return starts[0];
}

test("a Claude chat never prompted reopens as a new one; a real conversation stays strict", () => {
	const resume = { harnessSessionId: "never-written" };
	expect(started({ resume, strictResume: true }, false)?.strictResume).toBe(
		false,
	);
	expect(started({ resume, strictResume: true }, true)?.strictResume).toBe(
		true,
	);
	expect(
		started({ harness: "codex-acp", resume, strictResume: true }, false)
			?.strictResume,
	).toBe(true);
	expect(started({ strictResume: false, resume }, false)?.strictResume).toBe(
		false,
	);
});

test("a transcript is found in any Claude login folder", () => {
	const home = mkdtempSync(join(tmpdir(), "fork-claude-home-"));
	folders.push(home);
	mkdirSync(join(home, ".claude-work", "projects", "-repo"), {
		recursive: true,
	});
	writeFileSync(
		join(home, ".claude-work", "projects", "-repo", "abc.jsonl"),
		"",
	);
	mkdirSync(join(home, ".codex"), { recursive: true });
	const dirs = claudeConfigDirs(home);
	expect(dirs).toEqual([join(home, ".claude-work")]);
	expect(claudeTranscriptExists("abc", dirs)).toBe(true);
	expect(claudeTranscriptExists("missing", dirs)).toBe(false);
});
