import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	scryptSync,
} from "node:crypto";
import { once } from "node:events";
import {
	chmodSync,
	createReadStream,
	createWriteStream,
	lstatSync,
} from "node:fs";
import {
	chmod,
	lstat,
	open,
	readFile,
	readlink,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import { createInterface } from "node:readline";
import { claudeProjectDirName } from "@superset/agent-setup/claude-project-links";
import { walk } from "./fork-inventory";
import { contains, mapJson, pathMapper } from "./fork-paths";
import { BackupDatabase as Database } from "./fork-sqlite";
import type {
	BackupEnvironment,
	BackupManifest,
	RootMapping,
} from "./fork-types";

export function reseal(data: Buffer, source: string, target: string) {
	if (data.length < 45) throw new Error("backup_invalid_secret");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		scryptSync(source, data.subarray(0, 16), 32),
		data.subarray(16, 28),
	);
	decipher.setAuthTag(data.subarray(28, 44));
	const plain = Buffer.concat([
		decipher.update(data.subarray(44)),
		decipher.final(),
	]);
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const cipher = createCipheriv(
		"aes-256-gcm",
		scryptSync(target, salt, 32),
		iv,
	);
	const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
	plain.fill(0);
	return Buffer.concat([salt, iv, cipher.getAuthTag(), encrypted]);
}

function restoreModes(modes: Map<string, number>) {
	for (const [file, mode] of modes) {
		try {
			chmodSync(file, mode);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function remapDatabase(
	path: string,
	map: (value: string) => string,
	sourceMachine: string,
	targetMachine: string,
	cwds: Set<string>,
) {
	const modes = new Map<string, number>();
	for (const suffix of ["", "-wal", "-shm", "-journal"]) {
		const file = path + suffix;
		try {
			const stat = lstatSync(file);
			if (stat.isSymbolicLink()) throw new Error("backup_unsafe_database_link");
			modes.set(file, stat.mode & 0o777);
			chmodSync(file, stat.mode | 0o600);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	const db = new Database(path, { fileMustExist: true });
	try {
		if (db.pragma("integrity_check", { simple: true }) !== "ok")
			throw new Error(`backup_database_invalid: ${path}`);
		db.pragma("foreign_keys = OFF");
		const tables = db
			.prepare(
				"SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
			)
			.all() as { name: string; sql: string }[];
		const shadow = new Set(
			(db.pragma("table_list") as { name: string; type: string }[])
				.filter((row) => row.type === "shadow")
				.map((row) => row.name),
		);
		db.transaction(() => {
			for (const table of tables) {
				if (table.sql.includes("VIRTUAL TABLE") || shadow.has(table.name))
					continue;
				const columns = (
					db.prepare(`PRAGMA table_xinfo(${quote(table.name)})`).all() as {
						name: string;
						pk: number;
						hidden: number;
					}[]
				).filter((col) => !col.hidden);
				const pks = columns.filter((col) => col.pk).sort((a, b) => a.pk - b.pk);
				const withoutRowid = /WITHOUT\s+ROWID/i.test(table.sql);
				for (const row of db
					.prepare(
						`SELECT ${withoutRowid ? "" : 'rowid AS "__backup_rowid", '}* FROM ${quote(table.name)}`,
					)
					.iterate() as Iterable<Record<string, unknown>>) {
					const changed: [string, unknown][] = [];
					for (const col of columns) {
						const value = row[col.name];
						if (typeof value !== "string") continue;
						if (/path|cwd/i.test(col.name) && isAbsolute(value))
							cwds.add(value);
						const next =
							table.name === "fork_integration_connections" &&
							col.name === "secret" &&
							value
								? reseal(
										Buffer.from(value, "base64"),
										sourceMachine,
										targetMachine,
									).toString("base64")
								: mapJson(value, map);
						if (next !== value) changed.push([col.name, next]);
					}
					if (!changed.length) continue;
					const where = withoutRowid
						? pks.map((col) => `${quote(col.name)} IS ?`).join(" AND ")
						: "rowid = ?";
					if (!where) throw new Error("backup_database_key_missing");
					db.prepare(
						`UPDATE ${quote(table.name)} SET ${changed.map(([name]) => `${quote(name)} = ?`).join(", ")} WHERE ${where}`,
					).run(
						...changed.map(([, value]) => value),
						...(withoutRowid
							? pks.map((col) => row[col.name])
							: [row.__backup_rowid]),
					);
				}
			}
		})();
		if (db.pragma("integrity_check", { simple: true }) !== "ok")
			throw new Error(`backup_database_invalid: ${path}`);
		db.pragma("wal_checkpoint(TRUNCATE)");
	} finally {
		db.close();
		restoreModes(modes);
	}
}

async function writeMetadata(path: string, value: string | Buffer) {
	const mode = (await lstat(path)).mode & 0o777;
	await chmod(path, mode | 0o600);
	try {
		await writeFile(path, value);
	} finally {
		await chmod(path, mode);
	}
}

function recordCwds(value: unknown, cwds: Set<string>) {
	if (Array.isArray(value))
		value.forEach((entry) => {
			recordCwds(entry, cwds);
		});
	else if (value && typeof value === "object")
		for (const [key, entry] of Object.entries(value)) {
			if (
				/cwd|worktreePath|repoPath|projectPath/.test(key) &&
				typeof entry === "string" &&
				isAbsolute(entry)
			)
				cwds.add(entry);
			if (isAbsolute(key)) cwds.add(key);
			recordCwds(entry, cwds);
		}
}

export async function remapStaged(
	manifest: BackupManifest,
	stages: Record<string, string>,
	mappings: RootMapping[],
	env: BackupEnvironment,
) {
	const map = pathMapper(manifest, mappings, env.home, env.hostId);
	const cwds = new Set([
		...manifest.cwds,
		...Object.keys(manifest.aliases),
		...Object.values(manifest.aliases),
		...manifest.roots.flatMap((root) => [root.path, ...root.aliases]),
	]);
	const nativeDirs: { path: string; kind: "claude" | "cursor" }[] = [];
	const textMap = map;
	for (const root of manifest.roots) {
		const stage = stages[root.id];
		if (!stage) throw new Error("backup_stage_missing");
		for await (const entry of walk(stage, root.kind)) {
			const original = join(root.path, entry.rel);
			const isGit =
				/(^|\/)\.git(\/|$)/.test(original) ||
				/(^|\/)worktrees\/[^/]+\/(gitdir|commondir|config\.worktree)$/.test(
					original,
				) ||
				basename(root.path) === ".git";
			const metadata =
				(root.kind === "app" ||
					root.kind === "agent" ||
					root.kind === "desktop") &&
				!manifest.repositories.some(
					(repo) => contains(root.path, repo) && contains(repo, original),
				) &&
				!/(^|\/)(attachments|screenshots|uploads)(\/|$)/.test(entry.rel);
			if (entry.stat.isSymbolicLink()) {
				const link = await readlink(entry.path);
				const absolute = resolve(dirname(original), link);
				const target = map(absolute);
				const restored = join(
					mappings.find((item) => item.id === root.id)?.target ?? "",
					entry.rel,
				);
				const next = isAbsolute(link)
					? target
					: relative(dirname(restored), target);
				if (next !== link) {
					await unlink(entry.path);
					const { symlink } = await import("node:fs/promises");
					await symlink(next, entry.path);
				}
			} else if (entry.stat.isDirectory()) {
				if (
					metadata &&
					(basename(original) === "projects" ||
						Object.entries(manifest.aliases).some(
							([alias, physical]) =>
								basename(alias) === "projects" && physical === original,
						))
				)
					nativeDirs.push({ path: entry.path, kind: "claude" });
				if (
					metadata &&
					(basename(original) === "chats" ||
						Object.entries(manifest.aliases).some(
							([alias, physical]) =>
								basename(alias) === "chats" && physical === original,
						))
				)
					nativeDirs.push({ path: entry.path, kind: "cursor" });
			} else if (metadata && /\.(db|sqlite|sqlite3)$/.test(entry.path)) {
				const file = await open(entry.path, "r");
				const header = Buffer.alloc(16);
				try {
					await file.read(header, 0, 16, 0);
				} finally {
					await file.close();
				}
				if (header.toString() === "SQLite format 3\0")
					remapDatabase(
						entry.path,
						map,
						manifest.machineId,
						env.machineId,
						cwds,
					);
			} else if (metadata && basename(entry.path) === "auth-token.enc") {
				await writeMetadata(
					entry.path,
					reseal(await readFile(entry.path), manifest.machineId, env.machineId),
				);
			} else if (metadata && entry.path.endsWith(".jsonl")) {
				const temporary = `${entry.path}.remapping`;
				const output = createWriteStream(temporary, {
					flags: "wx",
					mode: entry.stat.mode & 0o777,
				});
				const input = createReadStream(entry.path);
				const lines = createInterface({
					input,
					crlfDelay: Number.POSITIVE_INFINITY,
				});
				const done = new Promise<void>((resolveDone, reject) => {
					output.once("finish", resolveDone);
					output.once("error", reject);
				});
				done.catch(() => {});
				try {
					for await (const line of lines) {
						let next = line;
						try {
							const value: unknown = JSON.parse(line);
							recordCwds(value, cwds);
							const mapped = JSON.stringify(mapJson(value, map));
							if (mapped !== JSON.stringify(value)) next = mapped;
						} catch {}
						if (!output.write(`${next}\n`)) await once(output, "drain");
					}
					output.end();
					await done;
					await rename(temporary, entry.path);
				} finally {
					lines.close();
					input.destroy();
					output.destroy();
				}
			} else if (metadata && /\.json$/.test(entry.path)) {
				const text = await readFile(entry.path, "utf8");
				let value: unknown;
				try {
					value = JSON.parse(text);
				} catch {
					continue;
				}
				recordCwds(value, cwds);
				const next = JSON.stringify(mapJson(value, map));
				if (next !== JSON.stringify(value))
					await writeMetadata(entry.path, next);
				if (/\/fork\/accounts\/[a-f0-9]{64}\.json$/.test(entry.path)) {
					const account = JSON.parse(next) as {
						agent: string;
						selection: string;
					};
					const hash = createHash("sha256")
						.update(JSON.stringify([account.agent, account.selection]))
						.digest("hex");
					const target = join(dirname(entry.path), `${hash}.json`);
					if (target !== entry.path) await rename(entry.path, target);
				}
			} else if (
				(isGit &&
					[".git", "gitdir", "commondir", "config", "config.worktree"].includes(
						basename(entry.path),
					)) ||
				(metadata && /\.(toml|yaml|yml|ini|conf)$/.test(entry.path)) ||
				(metadata &&
					[
						".gitconfig",
						".zshrc",
						".zprofile",
						".bashrc",
						".bash_profile",
						".profile",
						".npmrc",
						"config",
					].includes(basename(entry.path)))
			) {
				const text = await readFile(entry.path, "utf8");
				let next = textMap(text);
				if (
					isGit &&
					[".git", "gitdir", "commondir"].includes(basename(entry.path))
				) {
					const prefix = text.startsWith("gitdir: ") ? "gitdir: " : "";
					next = `${prefix}${map(resolve(dirname(original), text.slice(prefix.length).trim()))}\n`;
				}
				if (next !== text) await writeMetadata(entry.path, next);
			}
		}
	}
	const { symlink } = await import("node:fs/promises");
	for (const directory of nativeDirs) {
		for (const cwd of cwds) {
			const next = map(cwd);
			if (cwd === next) continue;
			const name = (value: string) =>
				directory.kind === "claude"
					? claudeProjectDirName(value)
					: createHash("md5").update(value).digest("hex");
			const old = name(cwd);
			const target = join(directory.path, name(next));
			if (old === name(next)) continue;
			try {
				await lstat(join(directory.path, old));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			try {
				await lstat(target);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				await symlink(old, target);
			}
		}
	}
	const appRoot = manifest.roots.find(
		(root) => root.kind === "app" && root.path === manifest.appHome,
	);
	if (!appRoot) throw new Error("backup_app_root_missing");
	const seed = join(stages[appRoot.id] ?? "", "fork-backup-storage-seed.json");
	await writeFile(seed, JSON.stringify(mapJson(manifest.storage, map)), {
		mode: 0o600,
	});
}
