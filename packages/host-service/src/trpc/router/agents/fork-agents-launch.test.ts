import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { setDefaultAccountSelection } from "../usage/default-account";
import {
	buildTerminalAgentLaunch,
	chatLaunchTarget,
	launchChatAgent,
} from "./agents";

const workspaceId = "11111111-1111-1111-1111-111111111111";
const existingDir = tmpdir();
const configId = "00000000-0000-0000-0000-00000000000a";
const argvConfig = {
	id: configId,
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: [],
	promptTransport: "argv" as const,
	promptArgs: [],
	resumeArgs: ["--resume"],
	forkArgs: [],
	env: {},
};
let previousHome: string | undefined;
let testHome = "";
const databases: Database[] = [];

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	testHome = mkdtempSync(join(tmpdir(), "fork-agent-launch-"));
	process.env.SUPERSET_HOME_DIR = testHome;
});
afterEach(() => {
	for (const database of databases.splice(0)) database.close();
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(testHome, { recursive: true, force: true });
});
function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema });
	migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	return db as unknown as HostDb;
}
function seedClaude(db: HostDb, env: Record<string, string> = {}) {
	db.insert(schema.hostAgentConfigs)
		.values({
			id: configId,
			presetId: "claude",
			label: "Claude",
			command: "claude",
			argsJson: "[]",
			promptTransport: "argv",
			promptArgsJson: "[]",
			resumeArgsJson: '["--resume"]',
			forkArgsJson: "[]",
			envJson: JSON.stringify(env),
			displayOrder: 0,
		})
		.run();
}

describe("fork account pinning", () => {
	it("keeps the native transfer launch on its saved profile after the default and config change", () => {
		const db = createTestDb();
		seedClaude(db, { CLAUDE_CONFIG_DIR: "/changed/config-profile" });
		setDefaultAccountSelection(db, "claude", existingDir);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "",
			resumeSessionId: "native-id",
			launchSnapshot: {
				config: { ...argvConfig, args: [] },
				env: {
					CLAUDE_CONFIG_DIR: "/saved/profile",
					SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "",
				},
			},
		});
		expect(launch.fullCommand).toBe(
			"CLAUDE_CONFIG_DIR='/saved/profile' SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR='' claude --resume native-id",
		);
	});

	it("keeps a missing selected profile pinned instead of falling back to the CLI login", () => {
		const db = createTestDb();
		seedClaude(db);
		setDefaultAccountSelection(db, "claude", "/no/such/profile-dir");
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "hi",
		});
		expect(launch.fullCommand).toBe(
			"CLAUDE_CONFIG_DIR='/no/such/profile-dir' SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR='/no/such/profile-dir' claude hi",
		);
	});

	it("pins the chosen account and config before delivering the first chat prompt", () => {
		const db = createTestDb();
		seedClaude(db);
		const createSession = mock((_input: unknown) => ({
			sessionId: "selected-session",
		}));
		const prompt = mock((_input: unknown) => {});
		const ctx = {
			db,
			runtime: {
				chat: () => ({
					live: { supports: () => true, get: () => undefined },
					commands: { createSession, prompt },
				}),
			},
		} as unknown as Parameters<typeof launchChatAgent>[0];
		launchChatAgent(
			ctx,
			{
				workspaceId,
				agent: "claude",
				surface: "chat",
				prompt: "First prompt",
				accountSelection: "/profiles/chosen",
			},
			"/temporary-repo",
		);
		expect(createSession.mock.calls[0]?.[0]).toMatchObject({
			agentConfigId: "00000000-0000-0000-0000-00000000000a",
			accountSelection: "/profiles/chosen",
			scopeId: workspaceId,
		});
		expect(prompt.mock.calls[0]?.[0]).toMatchObject({
			sessionId: "selected-session",
			content: [{ type: "text", text: "First prompt" }],
		});
	});
});

describe("fork new workspace chat routing", () => {
	it.each([
		"grok",
		"cursor-agent",
	])("%s honors the chat surface before any terminal starts", (presetId) => {
		const workspaceId = crypto.randomUUID();
		const db = createTestDb();
		const configId = crypto.randomUUID();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: configId,
				presetId,
				label: presetId,
				command: presetId,
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: "[]",
				forkArgsJson: "[]",
				envJson: "{}",
				displayOrder: 0,
			})
			.run();
		const input = {
			workspaceId,
			agent: configId,
			surface: "chat" as const,
			prompt: "first prompt",
		};
		const harness = presetId === "grok" ? "grok-acp" : "cursor-acp";
		expect(chatLaunchTarget(db, input)?.harness).toBe(harness);
		const createSession = mock((_input: unknown) => ({
			sessionId: "chat-session",
		}));
		const prompt = mock((_input: unknown) => {});
		const ctx = {
			db,
			runtime: {
				chat: () => ({
					live: { supports: () => true, get: () => undefined },
					commands: { createSession, prompt },
				}),
			},
		} as unknown as Parameters<typeof launchChatAgent>[0];
		expect(launchChatAgent(ctx, input, "/fixture")?.chatSessionId).toBe(
			"chat-session",
		);
		expect(createSession.mock.calls[0]?.[0]).toMatchObject({
			harness,
			agentConfigId: configId,
		});
		expect(prompt.mock.calls[0]?.[0]).toMatchObject({
			content: [{ type: "text", text: "first prompt" }],
		});
	});
});

it.each([
	undefined,
	"agent" as const,
])("keeps effort %s on the requested chat surface", (modelCatalog) => {
	const db = createTestDb();
	seedClaude(db);
	expect(
		chatLaunchTarget(db, {
			workspaceId,
			agent: "claude",
			surface: "chat",
			prompt: "hi",
			effort: "high",
			modelCatalog,
		}),
	).toMatchObject({ harness: "claude-acp", agentConfigId: configId });
});
