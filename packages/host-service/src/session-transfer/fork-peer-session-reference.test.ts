import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locatePeerSessionReference, peerSessionReference } from "./stores";

test("finds Grok sessions recorded under a linked worktree path", () => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "grok-worktree-")));
	try {
		const cwd = join(dir, "worktree");
		const workspacePath = join(dir, "linked worktree");
		const store = join(dir, "sessions");
		const sessionId = "grok-session";
		mkdirSync(cwd);
		symlinkSync(cwd, workspacePath, "junction");
		const reference = peerSessionReference(
			"grok",
			store,
			sessionId,
			workspacePath,
		);
		mkdirSync(reference, { recursive: true });

		expect(
			locatePeerSessionReference(
				"grok",
				store,
				sessionId,
				realpathSync(workspacePath),
				workspacePath,
			),
		).toBe(reference);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
