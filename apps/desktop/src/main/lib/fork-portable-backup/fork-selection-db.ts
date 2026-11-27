import { chmod, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { profileEnvironmentPaths } from "./fork-profile-sources";
import { BackupDatabase as Database } from "./fork-sqlite";

export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function tables(db: Database) {
	return new Map(
		(db.pragma("table_list") as { name: string; type: string }[])
			.filter(
				({ name, type }) => type === "table" && !name.startsWith("sqlite_"),
			)
			.map(({ name }) => [
				name,
				new Set(
					(db.pragma(`table_info(${quote(name)})`) as { name: string }[]).map(
						(col) => col.name,
					),
				),
			]),
	);
}

export function rows<T>(
	db: Database,
	schema: Map<string, Set<string>>,
	table: string,
	...columns: string[]
) {
	if (!columns.every((column) => schema.get(table)?.has(column))) return [];
	return db
		.prepare(`SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)}`)
		.all() as T[];
}

export async function snapshotDatabase(
	source: string,
	target: string,
	edit: (db: Database, schema: Map<string, Set<string>>) => void,
) {
	const input = new Database(source, { readonly: true, fileMustExist: true });
	try {
		input.prepare("VACUUM INTO ?").run(target);
	} finally {
		input.close();
	}
	const copy = new Database(target, { fileMustExist: true });
	try {
		copy.pragma("journal_mode = DELETE");
		copy.pragma("secure_delete = ON");
		copy.pragma("foreign_keys = ON");
		const schema = tables(copy);
		copy.transaction(() => edit(copy, schema))();
		copy.exec("VACUUM");
	} finally {
		copy.close();
	}
	await chmod(target, (await stat(source)).mode & 0o777);
}

function deleteMatching(
	db: Database,
	table: string,
	column: string,
	values: string[],
) {
	if (!values.length) return;
	db.prepare(
		`DELETE FROM ${quote(table)} WHERE ${quote(column)} IN (SELECT value FROM json_each(?))`,
	).run(JSON.stringify(values));
}

export function pruneHostDatabase(
	db: Database,
	schema: Map<string, Set<string>>,
	projectIds: string[],
	workspaceIds: string[],
	profiles: string[],
) {
	for (const [table, columns] of schema) {
		if (columns.has("workspace_id"))
			deleteMatching(db, table, "workspace_id", workspaceIds);
		if (columns.has("project_id") && table !== "workspaces")
			deleteMatching(db, table, "project_id", projectIds);
	}
	if (schema.get("workspaces")?.has("id"))
		deleteMatching(db, "workspaces", "id", workspaceIds);
	if (schema.get("projects")?.has("id"))
		deleteMatching(db, "projects", "id", projectIds);
	if (schema.get("tag_folder_settings")?.has("scope"))
		deleteMatching(db, "tag_folder_settings", "scope", projectIds);
	if (
		schema.get("settings")?.has("last_active_workspace_id") &&
		workspaceIds.length
	)
		db.prepare(
			"UPDATE settings SET last_active_workspace_id = NULL WHERE last_active_workspace_id IN (SELECT value FROM json_each(?))",
		).run(JSON.stringify(workspaceIds));

	if (schema.get("agent_account_aliases")?.has("selection"))
		deleteMatching(db, "agent_account_aliases", "selection", profiles);
	for (const column of ["default_claude_config_dir", "default_codex_home"]) {
		if (!profiles.length || !schema.get("host_settings")?.has(column)) continue;
		db.prepare(
			`UPDATE host_settings SET ${column} = NULL WHERE ${column} IN (SELECT value FROM json_each(?))`,
		).run(JSON.stringify(profiles));
	}
	if (profiles.length && schema.get("host_agent_configs")?.has("env_json")) {
		const excluded = new Set(profiles);
		for (const config of rows<{ id: string; env_json: string }>(
			db,
			schema,
			"host_agent_configs",
			"id",
			"env_json",
		)) {
			if (
				profileEnvironmentPaths(config.env_json).some((path) =>
					excluded.has(path),
				)
			)
				db.prepare(
					"UPDATE host_agent_configs SET env_json = '{}' WHERE id = ?",
				).run(config.id);
		}
	}
}

export function pruneChatDatabase(
	db: Database,
	schema: Map<string, Set<string>>,
	workspaceIds: string[],
) {
	const excluded = new Set(workspaceIds);
	const sessionIds = rows<{ session_id: string; scope_id: string }>(
		db,
		schema,
		"chat_sessions_local",
		"session_id",
		"scope_id",
	)
		.filter((row) => excluded.has(row.scope_id))
		.map((row) => row.session_id);
	for (const table of [
		"chat_journal",
		"chat_sync_state",
		"chat_sessions_local",
	]) {
		if (schema.get(table)?.has("session_id"))
			deleteMatching(db, table, "session_id", sessionIds);
	}
}

export function chatDatabase(hostDatabase: string) {
	return join(dirname(hostDatabase), "chat.db");
}
