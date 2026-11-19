import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	scryptSync,
} from "node:crypto";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	readlink,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeProjectDirName } from "@superset/agent-setup/claude-project-links";
import { inspectArchive, writeArchive } from "./fork-archive";
import { inventory, suggestedTargets } from "./fork-inventory";
import { pathMapper, validateTargets } from "./fork-paths";
import {
	guardPortableOperation,
	recoverRestore,
	restoreArchive,
} from "./fork-restore";
import { BackupDatabase as Database } from "./fork-sqlite";
import type { BackupEnvironment } from "./fork-types";

const directories: string[] = [];
afterEach(async () => {
	for (const path of directories.splice(0))
		await rm(path, { recursive: true, force: true });
});
const password = "portable-test-password";
async function fixture() {
	const base = await mkdtemp(
		join(await realpath(tmpdir()), "paradev-portable-test-"),
	);
	directories.push(base);
	const env: BackupEnvironment = {
		home: join(base, "source"),
		appHome: join(base, "source", ".superset-fork"),
		userData: join(base, "source", "DesktopProfile"),
		appVersion: "2.0.9",
		machineId: "source-machine",
		hostId: "old-host-identifier",
	};
	await mkdir(env.appHome, { recursive: true });
	await mkdir(env.userData, { recursive: true });
	await writeFile(
		join(env.appHome, "settings.json"),
		JSON.stringify({ cwd: env.appHome, host: env.hostId }),
	);
	await writeFile(join(env.userData, "Preferences"), "profile");
	return { base, env };
}
function seal(value: string, machine: string) {
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const cipher = createCipheriv(
		"aes-256-gcm",
		scryptSync(machine, salt, 32),
		iv,
	);
	const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
	return Buffer.concat([salt, iv, cipher.getAuthTag(), ciphertext]);
}
const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();

test("portable restore keeps dirty Git worktrees, provider history, credentials and previous destination data", async () => {
	const { base, env } = await fixture();
	const profile = new Database(join(env.userData, "state.sqlite"));
	profile.exec(
		"CREATE TABLE profile(id INTEGER PRIMARY KEY, time INTEGER, path TEXT)",
	);
	profile
		.prepare("INSERT INTO profile VALUES (?, ?, ?)")
		.run(1, 13300000000000000n, env.appHome);
	profile.close();
	const repo = join(env.home, "repo");
	const worktree = join(env.appHome, "worktree");
	await mkdir(repo);
	git(repo, "init", "-b", "main");
	await writeFile(join(repo, "tracked.txt"), "committed");
	await writeFile(join(repo, ".gitignore"), "node_modules/\n.env\n");
	git(repo, "add", ".");
	git(
		repo,
		"-c",
		"user.name=Test",
		"-c",
		"user.email=test@example.com",
		"commit",
		"-m",
		"initial",
	);
	git(repo, "worktree", "add", "-b", "feature", worktree);
	await writeFile(join(worktree, "tracked.txt"), "uncommitted");
	await writeFile(
		join(worktree, "user-config.json"),
		JSON.stringify({ cwd: worktree }),
	);
	await mkdir(join(worktree, "node_modules"));
	await writeFile(join(worktree, "node_modules", "dependency"), "ignored");
	await writeFile(join(worktree, ".env"), "SECRET=retained\n");
	const host = join(env.appHome, "host", "org");
	await mkdir(host, { recursive: true });
	const db = new Database(join(host, "host.db"));
	db.exec(
		"CREATE TABLE projects(id TEXT PRIMARY KEY, repo_path TEXT); CREATE TABLE workspaces(id TEXT PRIMARY KEY, worktree_path TEXT); CREATE TABLE fork_integration_connections(id TEXT PRIMARY KEY, secret TEXT)",
	);
	db.prepare("INSERT INTO projects VALUES (?, ?)").run("project", repo);
	db.prepare("INSERT INTO workspaces VALUES (?, ?)").run("workspace", worktree);
	db.prepare("INSERT INTO fork_integration_connections VALUES (?, ?)").run(
		"connection",
		seal('{"token":"preserved-token"}', env.machineId).toString("base64"),
	);
	db.close();
	const claude = join(
		env.home,
		".claude",
		"projects",
		claudeProjectDirName(worktree),
	);
	await mkdir(claude, { recursive: true });
	await writeFile(
		join(claude, "session.jsonl"),
		`${JSON.stringify({ cwd: worktree, message: { content: "conversation" } })}\n`,
	);
	const cursor = join(
		env.home,
		".cursor",
		"chats",
		createHash("md5").update(worktree).digest("hex"),
	);
	await mkdir(cursor, { recursive: true });
	await writeFile(join(cursor, "history"), "cursor conversation");
	const registry = join(env.appHome, "fork", "accounts");
	await mkdir(registry, { recursive: true });
	const selection = join(env.home, ".claude");
	await writeFile(
		join(
			registry,
			`${createHash("sha256")
				.update(JSON.stringify(["claude", selection]))
				.digest("hex")}.json`,
		),
		JSON.stringify({ agent: "claude", selection }),
	);
	await symlink(worktree, join(env.appHome, "worktrees"));
	await writeFile(
		join(env.appHome, "auth-token.enc"),
		seal("login-token", env.machineId),
	);
	const manifest = await inventory(env);
	manifest.storage = {
		[`layout-${env.hostId}`]: JSON.stringify({ path: worktree }),
	};
	const archive = join(base, "complete.paradev-backup");
	await writeArchive(archive, password, manifest);
	const target = {
		...env,
		home: join(base, "target"),
		appHome: join(base, "target", ".superset-fork"),
		userData: join(base, "target", "DesktopProfile"),
		machineId: "target-machine",
		hostId: "new-host-identifier",
	};
	await mkdir(target.appHome, { recursive: true });
	await writeFile(join(target.appHome, "previous-data"), "keep me");
	const mappings = suggestedTargets(
		manifest,
		target,
		join(target.home, "projects"),
	);
	const previous = await restoreArchive({
		archive,
		password,
		mappings,
		env: target,
		journalPath: join(base, "restore-journal.json"),
		keychain: false,
	});
	expect(await readFile(join(previous[0] ?? "", "previous-data"), "utf8")).toBe(
		"keep me",
	);
	const map = pathMapper(manifest, mappings, target.home, target.hostId);
	expect(git(map(worktree), "rev-parse", "HEAD")).toBe(
		git(worktree, "rev-parse", "HEAD"),
	);
	expect(git(map(repo), "worktree", "list", "--porcelain")).toContain(
		map(worktree),
	);
	expect(await readFile(join(map(worktree), "tracked.txt"), "utf8")).toBe(
		"uncommitted",
	);
	expect(
		await readFile(join(map(worktree), "node_modules", "dependency"), "utf8"),
	).toBe("ignored");
	expect(await readFile(join(map(worktree), ".env"), "utf8")).toContain(
		"SECRET=retained",
	);
	expect(await readFile(join(map(worktree), "user-config.json"), "utf8")).toBe(
		JSON.stringify({ cwd: worktree }),
	);
	expect(await readlink(join(target.appHome, "worktrees"))).toBe(map(worktree));
	expect(
		await readFile(
			join(
				target.home,
				".claude",
				"projects",
				claudeProjectDirName(map(worktree)),
				"session.jsonl",
			),
			"utf8",
		),
	).toContain(map(worktree));
	expect(
		await readFile(
			join(
				target.home,
				".cursor",
				"chats",
				createHash("md5").update(map(worktree)).digest("hex"),
				"history",
			),
			"utf8",
		),
	).toBe("cursor conversation");
	const restored = new Database(join(target.appHome, "host", "org", "host.db"));
	expect(
		(
			restored.prepare("SELECT worktree_path FROM workspaces").get() as {
				worktree_path: string;
			}
		).worktree_path,
	).toBe(map(worktree));

	const encrypted = (
		restored
			.prepare("SELECT secret FROM fork_integration_connections")
			.get() as { secret: string }
	).secret;
	const unseal = (data: Buffer) => {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			scryptSync(target.machineId, data.subarray(0, 16), 32),
			data.subarray(16, 28),
		);
		decipher.setAuthTag(data.subarray(28, 44));
		return Buffer.concat([
			decipher.update(data.subarray(44)),
			decipher.final(),
		]).toString();
	};
	expect(unseal(Buffer.from(encrypted, "base64"))).toBe(
		'{"token":"preserved-token"}',
	);
	expect(unseal(await readFile(join(target.appHome, "auth-token.enc")))).toBe(
		"login-token",
	);
	restored.close();
	expect(
		JSON.parse(
			await readFile(
				join(target.appHome, "fork-backup-storage-seed.json"),
				"utf8",
			),
		) as unknown,
	).toEqual({
		[`layout-${target.hostId}`]: JSON.stringify({ path: map(worktree) }),
	});
	expect((await readdir(join(target.appHome, "fork", "accounts")))[0]).toBe(
		`${createHash("sha256")
			.update(JSON.stringify(["claude", join(target.home, ".claude")]))
			.digest("hex")}.json`,
	);
	expect(existsSync(join(base, "restore-journal.json"))).toBe(false);
	const restoredProfile = new Database(join(target.userData, "state.sqlite"));
	expect(restoredProfile.prepare("SELECT * FROM profile").get()).toEqual({
		id: 1,
		time: 13300000000000000n,
		path: target.appHome,
	});
	restoredProfile.close();
});

test("wrong passwords and damaged payloads cannot replace destination data", async () => {
	const { base, env } = await fixture();
	const manifest = await inventory(env);
	const archive = join(base, "archive");
	await writeArchive(archive, password, manifest);
	await expect(inspectArchive(archive, "incorrect-password")).rejects.toThrow();
	const damaged = await readFile(archive);
	damaged[damaged.length - 1] = (damaged.at(-1) ?? 0) ^ 1;
	await writeFile(archive, damaged);
	const target = {
		...env,
		home: join(base, "destination"),
		appHome: join(base, "destination", "app"),
		userData: join(base, "destination", "desktop"),
	};
	await mkdir(target.appHome, { recursive: true });
	await writeFile(join(target.appHome, "keep"), "unchanged");
	await expect(
		restoreArchive({
			archive,
			password,
			mappings: suggestedTargets(
				manifest,
				target,
				join(target.home, "projects"),
			),
			env: target,
			journalPath: join(base, "journal"),
			keychain: false,
		}),
	).rejects.toThrow();
	expect(await readFile(join(target.appHome, "keep"), "utf8")).toBe(
		"unchanged",
	);
	expect(
		(await readdir(target.home)).some((name) => name.includes("paradev-stage")),
	).toBe(false);
});

test("overlapping roots and symbolic destination parents are rejected", async () => {
	const { base, env } = await fixture();
	await symlink(env.appHome, join(base, "alias"));
	await expect(
		validateTargets(
			[{ id: "r1", target: join(base, "alias", "child") }],
			env.home,
			[],
		),
	).rejects.toThrow("backup_target_invalid");
	await expect(
		validateTargets(
			[
				{ id: "r1", target: env.appHome },
				{ id: "r2", target: join(env.appHome, "nested") },
			],
			env.home,
			[],
		),
	).rejects.toThrow("backup_target_overlap");
});

test("an interrupted restore rolls back renames before normal app startup", async () => {
	const { base, env } = await fixture();
	const previous = `${env.appHome}.previous`;
	const stage = `${env.appHome}.stage`;
	const { rename } = await import("node:fs/promises");
	await rename(env.appHome, previous);
	await mkdir(env.appHome);
	await writeFile(join(env.appHome, "new"), "incomplete");
	const journal = join(base, "journal");
	await writeFile(
		journal,
		JSON.stringify({
			version: 1,
			pid: process.pid,
			committed: false,
			keychainBefore: null,
			keychainChanged: false,
			roots: [{ target: env.appHome, previous, stage, hadPrevious: true }],
		}),
	);
	await recoverRestore(journal, true);
	expect(existsSync(join(env.appHome, "settings.json"))).toBe(true);
	expect(existsSync(join(env.appHome, "new"))).toBe(false);
	expect(existsSync(stage)).toBe(false);
});

test("a source size change after scanning fails without leaving a partial archive", async () => {
	const { base, env } = await fixture();
	const manifest = await inventory(env);
	const archive = join(base, "archive");
	await expect(
		writeArchive(
			archive,
			password,
			manifest,
			() => {},
			undefined,
			async () => {
				await writeFile(
					join(env.appHome, "settings.json"),
					"changed after scan",
				);
			},
		),
	).rejects.toThrow("backup_source_changed");
	expect(existsSync(archive)).toBe(false);
	expect((await readdir(base)).some((name) => name.endsWith(".partial"))).toBe(
		false,
	);
});

test("startup removes only the owned partial file left by a crashed backup", async () => {
	const { base } = await fixture();
	const partial = join(base, "archive.0123456789abcdef.partial");
	await writeFile(partial, "partial backup");
	const { stat } = await import("node:fs/promises");
	const file = await stat(partial);
	const journal = join(base, "journal");
	await writeFile(
		`${journal}.lock`,
		JSON.stringify({
			pid: 999999999,
			partial: { path: partial, ino: file.ino, dev: file.dev },
		}),
	);
	await guardPortableOperation(journal);
	expect(existsSync(partial)).toBe(false);
	expect(existsSync(`${journal}.lock`)).toBe(false);
});
