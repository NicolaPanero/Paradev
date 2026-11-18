import { expect, test } from "bun:test";
import { localMigrationUrl } from "./migrate-local";

test("local migrations accept only the workspace database port on loopback", () => {
	const url = "postgres://postgres:postgres@localhost:41029/main";
	expect(localMigrationUrl(url, "41029")).toBe(url);
	expect(() =>
		localMigrationUrl(
			"postgres://postgres:secret@production.example:41029/main",
			"41029",
		),
	).toThrow("isolated Postgres");
	expect(() => localMigrationUrl(url, "5432")).toThrow("isolated Postgres");
	expect(() =>
		localMigrationUrl(
			"postgres://postgres:postgres@localhost:41029/shared",
			"41029",
		),
	).toThrow("isolated Postgres");
	expect(() => localMigrationUrl(undefined, undefined)).toThrow("missing");
});
