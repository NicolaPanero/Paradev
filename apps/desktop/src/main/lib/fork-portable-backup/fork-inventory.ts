import type { Stats } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import type { BackupFiles } from "./fork-backup-files";
import { canonical, contains } from "./fork-paths";
import {
	defaultProfileSources,
	profileEnvironment,
} from "./fork-profile-sources";
import { quote } from "./fork-selection-db";
import { BackupDatabase as Database } from "./fork-sqlite";
import type {
	BackupEnvironment,
	BackupManifest,
	BackupRoot,
	Progress,
} from "./fork-types";

export function transient(path: string, kind: BackupRoot["kind"]) {
	if (kind === "repository" || kind === "linked") return false;
	return (
		/(^|\/)(Singleton[^/]*|DevToolsActivePort|[^/]*\.sock|[^/]*\.pid)$/.test(
			path,
		) ||
		(kind === "app" &&
			/(^|\/)host\/[^/]+\/(manifest|pty-daemon-manifest)\.json$/.test(path))
	);
}

export async function* walk(
	root: string,
	kind: BackupRoot["kind"],
	rel = "",
	files?: BackupFiles,
): AsyncGenerator<{
	path: string;
	source: string;
	rel: string;
	stat: Stats;
}> {
	const path = join(root, rel);
	if (files && !files.includes(path, true)) return;
	const source = files?.replacements.get(path) ?? path;
	const stat = await lstat(source);
	if (transient(rel, kind) || stat.isSocket() || stat.isFIFO()) return;
	if (!(stat.isFile() || stat.isDirectory() || stat.isSymbolicLink()))
		throw new Error(`backup_special_file: ${path}`);
	if (stat.isSymbolicLink() && files && !(await files.includesLink(path)))
		return;
	yield { path, source, rel, stat };
	if (stat.isDirectory()) {
		for (const name of (await readdir(path)).sort())
			yield* walk(root, kind, join(rel, name), files);
	}
}

export function databasePaths(path: string) {
	const db = new Database(path, { readonly: true, fileMustExist: true });
	const found = new Map<string, BackupRoot["kind"]>();
	let role: BackupRoot["kind"] = "repository";
	let environmentColumn = false;
	const visit = (value: unknown) => {
		if (typeof value === "string") {
			if (isAbsolute(value)) found.set(value, role);
			else if (value.startsWith("{") || value.startsWith("[")) {
				try {
					visit(JSON.parse(value));
				} catch {}
			}
		} else if (Array.isArray(value)) value.forEach(visit);
		else if (value && typeof value === "object")
			Object.entries(value)
				.filter(
					([key]) => !environmentColumn || profileEnvironment.includes(key),
				)
				.forEach(([, entry]) => {
					visit(entry);
				});
	};
	try {
		const tables = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
			)
			.all() as { name: string }[];
		for (const { name } of tables) {
			const columns = (
				db.prepare(`PRAGMA table_info(${quote(name)})`).all() as {
					name: string;
				}[]
			).filter(
				(col) =>
					/path|directory|config_dir|codex_home|cwd|env_json|folders/i.test(
						col.name,
					) ||
					(name === "agent_account_aliases" && col.name === "selection"),
			);
			for (const col of columns) {
				if (/worktree_base_dir/i.test(col.name)) continue;
				environmentColumn = col.name === "env_json";
				role =
					/config_dir|codex_home|env_json/i.test(col.name) ||
					name === "agent_account_aliases"
						? "agent"
						: /^(repo_path|main_repo_path|worktree_path)$/.test(col.name) ||
								(col.name === "path" && /project|folder|worktree/.test(name))
							? "repository"
							: "linked";
				for (const row of db
					.prepare(`SELECT ${quote(col.name)} AS value FROM ${quote(name)}`)
					.iterate() as Iterable<{ value: unknown }>)
					visit(row.value);
			}
		}
	} finally {
		db.close();
	}
	return [...found].map(([path, kind]) => ({ path, kind }));
}

export async function inventory(
	env: BackupEnvironment,
	progress: Progress = () => {},
	signal?: AbortSignal,
	selection?: BackupFiles,
): Promise<BackupManifest> {
	const roots: BackupRoot[] = [];
	const missing = new Set<string>();
	const cwds = new Set<string>();
	const aliases: Record<string, string> = {};
	const repositories = new Set<string>();
	const queue: { path: string; kind: BackupRoot["kind"]; required: boolean }[] =
		[];
	const enqueue = (path: string, kind: BackupRoot["kind"], required = true) =>
		queue.push({ path: resolve(path), kind, required });
	enqueue(env.appHome, "app");
	enqueue(env.userData, "desktop");
	for (const path of env.agentHomes ?? []) enqueue(path, "agent");
	const defaults = await defaultProfileSources(env);
	for (const path of [
		...defaults.shared,
		...defaults.builtins.flatMap((profile) => profile.paths),
		...defaults.homes,
	])
		enqueue(path, "agent", false);
	let bytes = 0;
	let files = 0;
	const seen = new Set<string>();
	while (queue.length) {
		signal?.throwIfAborted();
		const next = queue.shift();
		if (
			!next ||
			seen.has(next.path) ||
			(selection && !selection.includes(next.path))
		)
			continue;
		seen.add(next.path);
		let path: string;
		try {
			path = await realpath(next.path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			if (next.required) missing.add(next.path);
			continue;
		}
		if (selection && !selection.includes(path)) continue;
		aliases[next.path] = path;
		if (next.kind === "repository") repositories.add(path);
		if (path === env.home || path === homedir() || path === "/")
			throw new Error(`backup_root_too_broad: ${path}`);
		const parent = roots.find((root) => contains(root.path, path));
		if (parent) {
			if (path === parent.path && !parent.aliases.includes(next.path))
				parent.aliases.push(next.path);
			continue;
		}
		if (roots.length >= 4096) throw new Error("backup_too_many_roots");
		const root: BackupRoot = {
			id: `r${seen.size}`,
			path,
			aliases: [next.path],
			kind: next.kind,
			files: 0,
			bytes: 0,
		};
		roots.push(root);
		for await (const entry of walk(path, root.kind, "", selection)) {
			signal?.throwIfAborted();
			if (entry.stat.isSymbolicLink()) {
				if (["projects", "chats", "worktrees"].includes(basename(entry.path))) {
					try {
						aliases[entry.path] = await realpath(entry.path);
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
					}
				}
				const linked = resolve(dirname(entry.path), await readlink(entry.path));
				if (
					!contains(path, linked) &&
					!/^\/(System|usr|bin|sbin|dev|proc)\//.test(linked)
				)
					enqueue(linked, root.kind === "agent" ? "agent" : "linked");
			} else if (entry.stat.isFile()) {
				root.bytes += entry.stat.size;
				root.files++;
				bytes += entry.stat.size;
				files++;
				if (files % 1000 === 0) progress({ phase: "scan", bytes, files });
				if (root.kind === "app" && /(^|\/)(host|local)\.db$/.test(entry.rel)) {
					for (const found of databasePaths(entry.source)) {
						if (found.kind === "repository") cwds.add(found.path);
						enqueue(found.path, found.kind);
					}
				}
				if (
					root.kind === "app" &&
					/(^|\/)fork\/accounts\/[^/]+\.json$/.test(entry.rel)
				) {
					const account = JSON.parse(await readFile(entry.path, "utf8")) as {
						selection?: string;
					};
					if (account.selection && isAbsolute(account.selection))
						enqueue(account.selection, "agent");
				}
				if (basename(entry.path) === ".git") {
					const git = (await readFile(entry.path, "utf8")).match(
						/^gitdir: (.+)\s*$/,
					);
					if (git?.[1]) {
						const gitdir = resolve(dirname(entry.path), git[1]);
						let common = gitdir;
						try {
							common = resolve(
								gitdir,
								(await readFile(join(gitdir, "commondir"), "utf8")).trim(),
							);
						} catch (error) {
							if ((error as NodeJS.ErrnoException).code !== "ENOENT")
								throw error;
						}
						const repository =
							basename(common) === ".git" ? dirname(common) : common;
						if (selection && !selection.includes(await canonical(common)))
							throw new Error(
								`backup_worktree_requires_repository: ${repository}`,
							);
						enqueue(repository, "repository");
					}
				}
			}
		}
	}
	const compact = roots.filter(
		(root) =>
			root.kind === "app" ||
			root.kind === "desktop" ||
			!roots.some((other) => root !== other && contains(other.path, root.path)),
	);
	progress({ phase: "scan", files, bytes });
	return {
		version: 1,
		appVersion: env.appVersion,
		platform: process.platform,
		createdAt: new Date().toISOString(),
		home: env.home,
		appHome: env.appHome,
		userData: env.userData,
		roots: compact,
		missing: [...missing].sort(),
		cwds: [...cwds],
		aliases,
		repositories: [...repositories],
		machineId: env.machineId,
		hostId: env.hostId,
		storage: {},
		keychain: [],
	};
}

export function suggestedTargets(
	manifest: BackupManifest,
	env: BackupEnvironment,
	projects: string,
) {
	return manifest.roots.map((root, index) => ({
		id: root.id,
		target:
			root.kind === "app"
				? env.appHome
				: root.kind === "desktop"
					? env.userData
					: root.kind === "agent" && contains(manifest.home, root.path)
						? join(env.home, relative(manifest.home, root.path))
						: join(projects, `${index + 1}-${basename(root.path)}`),
	}));
}
