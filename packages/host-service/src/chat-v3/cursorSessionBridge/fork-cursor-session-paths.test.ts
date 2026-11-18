import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bridgeCursorSession,
	type SnapshotDatabase,
} from "./cursorSessionBridge";

const sessionId = "63d4050a-44d9-4e84-badf-b0ea3de8ac9f";
const openDatabase = (path: string, readonly = true) => {
	const db = new Database(path, { readonly, readwrite: !readonly });
	return {
		prepare: (sql: string) => db.query(sql),
		backup: async (target: string) => {
			db.query("VACUUM INTO ?").run(target);
		},
		close: () => db.close(),
	} as unknown as SnapshotDatabase;
};

let root: string;
let cursorRoot: string;
let cwd: string;
let alias: string;

function cliDirectory(workspace: string) {
	return join(
		cursorRoot,
		"chats",
		createHash("md5").update(workspace).digest("hex"),
		sessionId,
	);
}

async function seedCli(workspace: string) {
	const directory = cliDirectory(workspace);
	await mkdir(directory, { recursive: true });
	const db = new Database(join(directory, "store.db"));
	db.exec(
		"CREATE TABLE blobs(id TEXT PRIMARY KEY,data BLOB); CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO blobs VALUES('message','native conversation');",
	);
	db.close();
}

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), "fork-cursor-paths-")));
	cursorRoot = join(root, "cursor");
	cwd = join(root, "physical", "workspace");
	alias = join(root, "logical", "workspace");
	await mkdir(cwd, { recursive: true });
	await symlink(join(root, "physical"), join(root, "logical"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test("imports a canonical native Cursor store through a workspace symlink", async () => {
	await seedCli(cwd);
	await bridgeCursorSession(
		{ cwd: alias, sessionId, from: "cli", cursorRoot },
		openDatabase,
	);
	const directory = join(cursorRoot, "acp-sessions", sessionId);
	const db = new Database(join(directory, "store.db"), { readonly: true });
	expect(db.query("SELECT data FROM blobs WHERE id='message'").get()).toEqual({
		data: "native conversation",
	});
	db.close();
	expect(
		JSON.parse(await readFile(join(directory, "meta.json"), "utf8")),
	).toEqual({
		schemaVersion: 1,
		cwd: alias,
	});
});

test("exports ACP through an equivalent workspace path to the canonical CLI store", async () => {
	await seedCli(cwd);
	await bridgeCursorSession(
		{ cwd, sessionId, from: "cli", cursorRoot },
		openDatabase,
	);
	const db = new Database(
		join(cursorRoot, "acp-sessions", sessionId, "store.db"),
	);
	db.query("INSERT INTO blobs VALUES(?,?)").run("latest", "ACP reply");
	db.close();
	await bridgeCursorSession(
		{ cwd: alias, sessionId, from: "acp", cursorRoot },
		openDatabase,
	);
	const copied = new Database(join(cliDirectory(cwd), "store.db"), {
		readonly: true,
	});
	expect(
		copied.query("SELECT data FROM blobs WHERE id='latest'").get(),
	).toEqual({
		data: "ACP reply",
	});
	copied.close();
	expect(await realpath(alias)).toBe(cwd);
});

test("imports an older CLI store keyed by the workspace alias", async () => {
	await seedCli(alias);
	await bridgeCursorSession(
		{ cwd: alias, sessionId, from: "cli", cursorRoot },
		openDatabase,
	);
	const db = new Database(
		join(cursorRoot, "acp-sessions", sessionId, "store.db"),
		{
			readonly: true,
		},
	);
	expect(db.query("SELECT COUNT(*) AS count FROM blobs").get()).toEqual({
		count: 1,
	});
	db.close();
});
