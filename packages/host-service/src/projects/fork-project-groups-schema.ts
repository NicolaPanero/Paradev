import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "../db/schema";

export const forkProjectGroups = sqliteTable("fork_project_groups", {
	projectId: text("project_id")
		.primaryKey()
		.references(() => projects.id, { onDelete: "cascade" }),
	createdAt: integer("created_at").notNull(),
});
