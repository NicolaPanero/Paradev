import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import type { HostDb } from "../db";
import * as schema from "../db/schema";

export function installedWorktreePreview(
	appHome = resolveAppHomeDir(),
): { db: HostDb; organizationId: string } | null {
	const folder = join(appHome, "fork", "installed-worktree-preview");
	const config = join(folder, "source.json");
	if (!existsSync(config)) return null;
	const source = z
		.object({ organizationId: z.string().uuid(), readOnly: z.literal(true) })
		.parse(JSON.parse(readFileSync(config, "utf8")));
	const databasePath = join(folder, "workspaces.sqlite");
	if (!realpathSync(databasePath).startsWith(realpathSync(appHome) + sep))
		throw new Error(
			"Installed-data preview must use a snapshot inside the development profile",
		);
	const sqlite = new Database(databasePath, {
		readonly: true,
		fileMustExist: true,
	});
	sqlite.pragma("query_only = ON");
	return {
		db: drizzle(sqlite, { schema }),
		organizationId: source.organizationId,
	};
}
