import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { BackupFiles } from "./fork-backup-files";
import { claudeKeychainServices } from "./fork-keychain";
import { canonical } from "./fork-paths";
import {
	defaultProfileSources,
	exists,
	namedProfile,
	optionalDirectory,
	type ProfileSource,
	profileEnvironmentPaths,
} from "./fork-profile-sources";
import {
	chatDatabase,
	pruneChatDatabase,
	pruneHostDatabase,
	rows,
	snapshotDatabase,
	tables,
} from "./fork-selection-db";
import { BackupDatabase as Database } from "./fork-sqlite";
import type { BackupEnvironment } from "./fork-types";

interface ProjectSource {
	id: string;
	database: string;
	path: string;
	name: string;
	paths: string[];
	workspaceIds: string[];
}

interface BackupChoice {
	id: string;
	kind: "project" | "profile";
	name: string;
	path: string;
}

interface CatalogEntry {
	choice: BackupChoice;
	paths: string[];
	projects: ProjectSource[];
	records: string[];
	services: string[];
}

export interface BackupSelection {
	catalogId: string;
	omitted: string[];
}

async function projectDatabases(appHome: string) {
	const host = join(appHome, "host");
	const paths = [
		join(appHome, "local.db"),
		...(await optionalDirectory(host)).map((org) => join(host, org, "host.db")),
	];
	const present = await Promise.all(paths.map(exists));
	return paths.filter((_, index) => present[index]);
}

function readProjectDatabase(path: string) {
	const db = new Database(path, { readonly: true, fileMustExist: true });
	try {
		const schema = tables(db);
		const repo = schema.get("projects")?.has("repo_path")
			? "repo_path"
			: "main_repo_path";
		const projects = rows<Record<string, string>>(
			db,
			schema,
			"projects",
			"id",
			repo,
			...(schema.get("projects")?.has("name") ? ["name"] : []),
		)
			.filter((row) => isAbsolute(row[repo]))
			.map(
				(row): ProjectSource => ({
					id: row.id,
					database: path,
					path: row[repo],
					name: row.name || basename(row[repo]),
					paths: [row[repo]],
					workspaceIds: [],
				}),
			);
		const byProject = new Map(projects.map((project) => [project.id, project]));
		const byWorkspace = new Map<string, ProjectSource>();
		const byFolder = new Map<string, ProjectSource>();
		const required: string[] = [];
		for (const row of rows<{ id: string; project_id: string }>(
			db,
			schema,
			"workspaces",
			"id",
			"project_id",
		)) {
			const project = byProject.get(row.project_id);
			if (!project) continue;
			project.workspaceIds.push(row.id);
			byWorkspace.set(row.id, project);
		}
		for (const row of rows<{ id: string; path: string; project_id: string }>(
			db,
			schema,
			"project_folders",
			"id",
			"path",
			"project_id",
		)) {
			const project = byProject.get(row.project_id);
			if (!project) continue;
			byFolder.set(row.id, project);
			if (isAbsolute(row.path)) project.paths.push(row.path);
		}
		for (const [table, column, owner, owners] of [
			["workspaces", "worktree_path", "id", byWorkspace],
			["worktrees", "path", "project_id", byProject],
			["workspace_folder_worktrees", "worktree_path", "folder_id", byFolder],
		] as const) {
			for (const row of rows<Record<string, string>>(
				db,
				schema,
				table,
				owner,
				column,
			)) {
				const value = row[column];
				if (typeof value !== "string" || !isAbsolute(value)) continue;
				const project = owners.get(row[owner]);
				if (project) project.paths.push(value);
				else required.push(value);
			}
		}
		const profiles: ProfileSource[] = [];
		for (const row of rows<{ selection: string; label: string }>(
			db,
			schema,
			"agent_account_aliases",
			"selection",
			"label",
		)) {
			if (isAbsolute(row.selection))
				profiles.push(namedProfile(row.selection, row.label));
		}
		for (const column of ["default_claude_config_dir", "default_codex_home"])
			for (const row of rows<Record<string, string | null>>(
				db,
				schema,
				"host_settings",
				column,
			)) {
				const value = row[column];
				if (value && isAbsolute(value)) profiles.push(namedProfile(value));
			}
		for (const row of rows<{ env_json: string }>(
			db,
			schema,
			"host_agent_configs",
			"env_json",
		)) {
			for (const path of profileEnvironmentPaths(row.env_json))
				if (isAbsolute(path)) profiles.push(namedProfile(path));
		}
		return { projects, profiles, required };
	} finally {
		db.close();
	}
}

function choice(kind: BackupChoice["kind"], path: string, name: string) {
	return {
		id: createHash("sha256")
			.update(JSON.stringify([kind, path]))
			.digest("hex"),
		kind,
		name,
		path,
	};
}

async function catalog(env: BackupEnvironment) {
	const paths = await projectDatabases(env.appHome);
	const databases = paths.map((path) => ({
		path,
		...readProjectDatabase(path),
	}));
	const defaults = await defaultProfileSources(env);
	const projects = new Map<string, CatalogEntry>();
	for (const project of databases.flatMap((database) => database.projects)) {
		const path = await canonical(project.path);
		const existing = projects.get(path);
		if (existing) {
			existing.projects.push(project);
			existing.paths.push(...project.paths);
		} else {
			projects.set(path, {
				choice: choice("project", path, project.name),
				paths: [...project.paths],
				projects: [project],
				records: [],
				services: [],
			});
		}
	}

	const profilePaths = new Map<string, CatalogEntry>();
	const profiles: CatalogEntry[] = [];
	const addProfile = async (source: ProfileSource, record?: string) => {
		const physical = await Promise.all(source.paths.map(canonical));
		let entry = physical.map((path) => profilePaths.get(path)).find(Boolean);
		if (!entry) {
			entry = {
				choice: choice("profile", physical[0], source.name),
				paths: [],
				projects: [],
				records: [],
				services: [],
			};
			profiles.push(entry);
		}
		entry.paths.push(...source.paths);
		if (source.service) entry.services.push(source.service);
		if (record) entry.records.push(record);
		for (const path of physical) profilePaths.set(path, entry);
	};

	for (const source of defaults.builtins) {
		const present = await Promise.all(source.paths.map(exists));
		if (present.some(Boolean) || source.service) await addProfile(source);
	}
	const registry = join(env.appHome, "fork", "accounts");
	for (const name of await optionalDirectory(registry)) {
		if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
		const path = join(registry, name);
		const row = JSON.parse(await readFile(path, "utf8")) as {
			selection?: string;
			email?: string | null;
		};
		if (row.selection && isAbsolute(row.selection))
			await addProfile(namedProfile(row.selection, row.email), path);
	}
	for (const source of databases.flatMap((database) => database.profiles)) {
		await addProfile(source);
	}
	for (const path of [...defaults.homes, ...(env.agentHomes ?? [])])
		await addProfile(namedProfile(path));

	const entries = [...projects.values(), ...profiles].sort(
		(a, b) =>
			a.choice.kind.localeCompare(b.choice.kind) ||
			a.choice.name.localeCompare(b.choice.name) ||
			a.choice.path.localeCompare(b.choice.path),
	);
	for (const entry of entries) entry.paths = [...new Set(entry.paths)].sort();
	const id = createHash("sha256")
		.update(
			JSON.stringify(entries.map((entry) => [entry.choice.id, entry.paths])),
		)
		.digest("hex");
	return { id, entries, databases, shared: defaults.shared };
}

export async function backupChoices(env: BackupEnvironment) {
	const result = await catalog(env);
	return {
		catalogId: result.id,
		choices: result.entries.map((entry) => entry.choice),
	};
}

const sharedProfileHistory = [
	"projects",
	"sessions",
	"session-env",
	"file-history",
	"shell-snapshots",
	"todos",
	"paste-cache",
	"tasks",
	"plans",
	"transcripts",
	"archived_sessions",
	"shell_snapshots",
	"history.jsonl",
];

async function sharedHistory(entries: CatalogEntry[], excluded: Set<string>) {
	if (!excluded.size) return [];
	const paths: string[] = [];
	for (const entry of entries) {
		if (entry.choice.kind !== "profile") continue;
		for (const path of entry.paths) {
			for (const name of sharedProfileHistory) {
				const link = join(path, name);
				try {
					if (!(await lstat(link)).isSymbolicLink()) continue;
					const target = await canonical(link);
					if (basename(target) === name && excluded.has(dirname(target)))
						paths.push(target, resolve(dirname(link), await readlink(link)));
				} catch (error) {
					const code = (error as NodeJS.ErrnoException).code;
					if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
				}
			}
		}
	}
	return paths;
}

async function withAliases(paths: string[]) {
	return [...new Set([...paths, ...(await Promise.all(paths.map(canonical)))])];
}

export async function withBackupSelection<T>(
	env: BackupEnvironment,
	selection: BackupSelection | undefined,
	run: (files?: BackupFiles, services?: Set<string>) => Promise<T>,
) {
	if (!selection?.omitted.length) return run();
	const source = await catalog(env);
	const omitted = new Set(selection.omitted);
	const dropped = source.entries.filter((entry) =>
		omitted.has(entry.choice.id),
	);
	const kept = source.entries.filter((entry) => !omitted.has(entry.choice.id));
	if (source.id !== selection.catalogId || dropped.length !== omitted.size)
		throw new Error("backup_inventory_changed");

	const removedProjects = dropped.flatMap((entry) => entry.projects);
	const removedProfiles = dropped.filter(
		(entry) => entry.choice.kind === "profile",
	);
	const profilePaths = await withAliases(
		removedProfiles.flatMap((entry) => entry.paths),
	);
	const historyPaths = removedProjects
		.flatMap((project) => project.workspaceIds)
		.filter((id) => /^[a-zA-Z0-9_-]+$/.test(id))
		.map((id) => join(env.appHome, "terminal-history", id));
	const excluded = await withAliases([
		...dropped.flatMap((entry) => [...entry.paths, ...entry.records]),
		...historyPaths,
	]);
	const required = await withAliases([
		env.appHome,
		env.userData,
		...source.shared,
		...source.databases.flatMap((db) => db.required),
		...kept.flatMap((entry) => entry.paths),
		...(await sharedHistory(kept, new Set(profilePaths))),
	]);
	if (
		excluded.includes(env.appHome) ||
		excluded.includes(env.userData) ||
		required.some((path) => profilePaths.includes(path))
	)
		throw new Error("backup_selection_conflict");

	const services = new Set([
		...removedProfiles.flatMap((entry) => entry.services),
		...claudeKeychainServices(profilePaths, env.home),
	]);
	const temp = await mkdtemp(join(tmpdir(), "paradev-backup-databases-"));
	try {
		const replacements = new Map<string, string>();
		const replace = async (
			path: string,
			edit: Parameters<typeof snapshotDatabase>[2],
		) => {
			const target = join(temp, `${replacements.size}.db`);
			await snapshotDatabase(path, target, edit);
			replacements.set(path, target);
			replacements.set(await canonical(path), target);
		};
		for (const db of source.databases) {
			const projects = removedProjects.filter(
				(project) => project.database === db.path,
			);
			const projectIds = projects.map((project) => project.id);
			const workspaceIds = projects.flatMap((project) => project.workspaceIds);
			if (projectIds.length || profilePaths.length)
				await replace(db.path, (copy, schema) =>
					pruneHostDatabase(
						copy,
						schema,
						projectIds,
						workspaceIds,
						profilePaths,
					),
				);
			const chat = chatDatabase(db.path);
			if (workspaceIds.length && (await exists(chat)))
				await replace(chat, (copy, schema) =>
					pruneChatDatabase(copy, schema, workspaceIds),
				);
		}
		return await run(
			new BackupFiles(excluded, required, replacements),
			services,
		);
	} finally {
		await rm(temp, { force: true, recursive: true });
	}
}
