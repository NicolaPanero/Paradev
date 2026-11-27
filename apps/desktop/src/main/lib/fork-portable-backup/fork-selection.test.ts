import { expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeArchive } from "./fork-archive";
import { inventory, suggestedTargets } from "./fork-inventory";
import { claudeKeychainServices } from "./fork-keychain";
import { restoreArchive } from "./fork-restore";
import { backupChoices, withBackupSelection } from "./fork-selection";
import { BackupDatabase as Database } from "./fork-sqlite";
import type { BackupEnvironment } from "./fork-types";

test("a selective archive restores the chosen project and profile with remapped paths and shared history", async () => {
	const base = await realpath(
		await mkdtemp(join(tmpdir(), "paradev-backup-selection-")),
	);
	try {
		const environment = (directory: string): BackupEnvironment => ({
			home: join(base, directory),
			appHome: join(base, directory, ".paradev"),
			userData: join(base, directory, "electron"),
			appVersion: "2.0.12",
			machineId: "machine",
			hostId: "host",
		});
		const source = environment("source");
		const destination = environment("destination");
		const keptRepo = join(source.home, "repo");
		const skippedRepo = join(source.home, "old-repo");
		const managed = join(source.home, "managed");
		const skippedWorktree = join(managed, "old");
		const skippedExtra = join(source.home, "old-extra");
		const hostDb = join(source.appHome, "host", "org", "host.db");
		const chatDb = join(dirname(hostDb), "chat.db");
		const keptProfile = join(source.home, ".claude-work");
		const skippedProfile = join(source.home, ".claude");
		const shared = join(skippedProfile, "projects");
		const registry = join(
			source.appHome,
			"fork",
			"accounts",
			`${"a".repeat(64)}.json`,
		);
		const seed = async (path: string, text: string) => {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, text);
		};
		await mkdir(dirname(hostDb), { recursive: true });
		await mkdir(source.userData, { recursive: true });
		await seed(join(keptRepo, "saved.txt"), "kept checkout");
		await seed(join(skippedRepo, "excluded.txt"), "excluded checkout");
		await seed(join(skippedWorktree, "excluded.txt"), "excluded worktree");
		await seed(join(skippedExtra, "excluded.txt"), "excluded extra folder");
		await seed(
			join(source.appHome, "terminal-history", "skipped-ws", "scrollback.bin"),
			"excluded terminal history",
		);
		await seed(join(keptProfile, ".credentials.json"), "selected credentials");
		await seed(
			join(skippedProfile, ".credentials.json"),
			"excluded credentials",
		);
		await seed(join(source.home, ".claude.json"), "excluded login");
		await seed(
			join(shared, "transcript.jsonl"),
			'{"content":"shared transcript"}\n',
		);
		await seed(registry, JSON.stringify({ selection: skippedProfile }));
		await symlink(skippedRepo, join(keptRepo, "excluded-link"));
		await symlink(managed, join(source.appHome, "worktrees"));
		await symlink(shared, join(keptProfile, "projects"));

		const host = new Database(hostDb);
		host.exec(`
			PRAGMA journal_mode = WAL;
			CREATE TABLE projects (id TEXT PRIMARY KEY, repo_path TEXT, name TEXT);
			CREATE TABLE workspaces (id TEXT PRIMARY KEY, project_id TEXT, worktree_path TEXT);
			CREATE TABLE project_folders (id TEXT PRIMARY KEY, project_id TEXT, path TEXT);
			CREATE TABLE host_settings (default_claude_config_dir TEXT);
		`);
		const project = host.prepare("INSERT INTO projects VALUES (?, ?, ?)");
		project.run("kept", keptRepo, "Kept project");
		project.run("skipped", skippedRepo, "Skipped project");
		host
			.prepare("INSERT INTO project_folders VALUES (?, ?, ?)")
			.run("extra", "skipped", skippedExtra);
		const workspace = host.prepare("INSERT INTO workspaces VALUES (?, ?, ?)");
		workspace.run("kept-ws", "kept", keptRepo);
		workspace.run("skipped-ws", "skipped", skippedWorktree);
		host.prepare("INSERT INTO host_settings VALUES (?)").run(skippedProfile);
		const chats = new Database(chatDb);
		chats.exec(
			"CREATE TABLE chat_sessions_local (session_id TEXT, scope_id TEXT); CREATE TABLE chat_journal (session_id TEXT, event_json TEXT);",
		);
		chats.exec(`
			INSERT INTO chat_sessions_local VALUES ('a', 'kept-ws'), ('b', 'skipped-ws');
			INSERT INTO chat_journal VALUES ('a', 'selected chat'), ('b', 'excluded chat');
		`);
		chats.close();

		const { catalogId, choices } = await backupChoices(source);
		const omitted = choices
			.filter(({ path }) => [skippedRepo, skippedProfile].includes(path))
			.map(({ id }) => id);
		expect(omitted).toHaveLength(2);
		const archive = join(base, "backup.paradev-backup");
		const password = "test backup password";
		const manifest = await withBackupSelection(
			source,
			{ catalogId, omitted },
			async (files, services) => {
				expect(services?.has("Claude Code-credentials")).toBe(true);
				for (const service of claudeKeychainServices(
					[skippedProfile],
					source.home,
				))
					expect(services?.has(service)).toBe(true);
				const manifest = await inventory(source, undefined, undefined, files);
				expect(manifest.missing).toEqual([]);
				expect(manifest.roots.map(({ path }) => path)).not.toContain(
					skippedRepo,
				);
				expect(manifest.roots.map(({ path }) => path)).not.toContain(
					skippedExtra,
				);
				await writeArchive(
					archive,
					password,
					manifest,
					undefined,
					undefined,
					undefined,
					files,
				);
				return manifest;
			},
		);
		expect(host.prepare("SELECT id FROM projects ORDER BY id").all()).toEqual([
			{ id: "kept" },
			{ id: "skipped" },
		]);
		host.close();
		expect(
			await readFile(join(skippedProfile, ".credentials.json"), "utf8"),
		).toBe("excluded credentials");

		const newRepo = join(destination.home, "code", "renamed");
		const mappings = suggestedTargets(
			manifest,
			destination,
			join(destination.home, "restored"),
		).map((mapping, index) =>
			manifest.roots[index].path === keptRepo
				? { ...mapping, target: newRepo }
				: mapping,
		);
		await restoreArchive({
			archive,
			password,
			mappings,
			env: destination,
			journalPath: join(base, "restore.json"),
			keychain: false,
		});
		expect(await readFile(join(newRepo, "saved.txt"), "utf8")).toBe(
			"kept checkout",
		);
		await expect(
			readFile(join(newRepo, "excluded-link", "excluded.txt")),
		).rejects.toThrow("ENOENT");
		const newHost = new Database(
			join(destination.appHome, "host", "org", "host.db"),
		);
		expect(newHost.prepare("SELECT id, repo_path FROM projects").all()).toEqual(
			[{ id: "kept", repo_path: newRepo }],
		);
		expect(newHost.prepare("SELECT id FROM workspaces").all()).toEqual([
			{ id: "kept-ws" },
		]);
		expect(
			newHost
				.prepare("SELECT default_claude_config_dir FROM host_settings")
				.get(),
		).toEqual({ default_claude_config_dir: null });
		expect(newHost.prepare("SELECT id FROM project_folders").all()).toEqual([]);
		newHost.close();
		const newChat = new Database(
			join(destination.appHome, "host", "org", "chat.db"),
		);
		expect(
			newChat.prepare("SELECT event_json FROM chat_journal").all(),
		).toEqual([{ event_json: "selected chat" }]);
		newChat.close();
		await expect(
			readFile(
				join(destination.appHome, "fork", "accounts", `${"a".repeat(64)}.json`),
			),
		).rejects.toThrow("ENOENT");
		await expect(
			readFile(join(destination.appHome, "worktrees", "old", "excluded.txt")),
		).rejects.toThrow("ENOENT");
		await expect(
			readFile(join(destination.home, ".claude", ".credentials.json")),
		).rejects.toThrow("ENOENT");
		await expect(
			readFile(
				join(
					destination.appHome,
					"terminal-history",
					"skipped-ws",
					"scrollback.bin",
				),
			),
		).rejects.toThrow("ENOENT");
		await expect(
			readFile(join(destination.home, ".claude.json")),
		).rejects.toThrow("ENOENT");
		expect(
			await readFile(
				join(destination.home, ".claude-work", ".credentials.json"),
				"utf8",
			),
		).toBe("selected credentials");
		expect(
			await readFile(
				join(destination.home, ".claude-work", "projects", "transcript.jsonl"),
				"utf8",
			),
		).toContain("shared transcript");
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});
