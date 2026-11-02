import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ensureForkTables } from "./fork-tables";

const columns = (sqlite: Database) =>
	sqlite
		.query<{ name: string }, []>(
			"PRAGMA table_info(fork_jira_automation_launches)",
		)
		.all()
		.map((row) => row.name);

test("an automation launch saved before effort existed gains the column once", () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(`CREATE TABLE fork_jira_automation_launches (
		rule_id text PRIMARY KEY NOT NULL, surface text NOT NULL, model text, account_selection text
	)`);
	sqlite.exec(
		"INSERT INTO fork_jira_automation_launches VALUES ('rule', 'chat', 'opus', null)",
	);
	ensureForkTables(sqlite);
	ensureForkTables(sqlite);
	expect(columns(sqlite)).toContain("effort");
	expect(
		sqlite
			.query("SELECT model, effort FROM fork_jira_automation_launches")
			.get(),
	).toEqual({ model: "opus", effort: null });
});
