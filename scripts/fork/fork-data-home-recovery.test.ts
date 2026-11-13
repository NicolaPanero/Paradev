import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("data-home recovery preserves the old sessions, displaced data and active checkout", () => {
	const root = mkdtempSync(join(tmpdir(), "fork-home-recovery-"));
	try {
		const canonical = join(root, ".superset-fork");
		const displaced = join(root, ".paradev-fork");
		mkdirSync(canonical);
		mkdirSync(join(displaced, "worktrees", "repo", "fix"), { recursive: true });
		writeFileSync(
			join(displaced, "worktrees", "repo", "fix", "changes"),
			"fix",
		);
		for (const [home, value] of [
			[canonical, "old session"],
			[displaced, "new session"],
		]) {
			const db = new Database(join(home, "local.db"));
			db.exec("CREATE TABLE sessions (title TEXT)");
			db.query("INSERT INTO sessions VALUES (?)").run(value);
			db.close();
		}
		const script = join(import.meta.dir, "recover-data-home.sh");
		const preview = Bun.spawnSync(["bash", script, "--home", root]);
		expect(preview.exitCode).toBe(0);
		expect(realpathSync(displaced)).not.toBe(realpathSync(canonical));
		const apply = Bun.spawnSync(["bash", script, "--home", root, "--apply"]);
		expect(apply.stderr.toString()).toBe("");
		expect(apply.exitCode).toBe(0);
		expect(realpathSync(displaced)).toBe(realpathSync(canonical));
		expect(
			readFileSync(
				join(displaced, "worktrees", "repo", "fix", "changes"),
				"utf8",
			),
		).toBe("fix");
		const backupName = readdirSync(root).find((name) =>
			name.startsWith(".fork-data-home-recovery."),
		);
		if (!backupName) throw new Error("Recovery backup missing");
		const backup = join(root, backupName);
		for (const [path, expected] of [
			[join(displaced, "local.db"), "old session"],
			[join(backup, "original-snapshots", "local.db"), "old session"],
			[join(backup, "displaced-home", "local.db"), "new session"],
		]) {
			const db = new Database(path, { readonly: true });
			expect(db.query("SELECT title FROM sessions").get()).toEqual({
				title: expected,
			});
			db.close();
		}
		const again = Bun.spawnSync(["bash", script, "--home", root, "--apply"]);
		expect(again.exitCode).toBe(0);
		expect(existsSync(join(backup, "displaced-home"))).toBe(true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
