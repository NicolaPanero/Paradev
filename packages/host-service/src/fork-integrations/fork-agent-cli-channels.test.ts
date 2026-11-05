import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import {
	type ForkAgentCliDeps,
	forkAgentCliStatuses,
} from "./fork-agent-cli-updates";

function setup(channel: { value: "latest" | "stable" }) {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const paths: Record<string, string> = {
		claude: "/home/me/.local/bin/claude",
		"cursor-agent": "/home/me/.local/bin/cursor-agent",
		grok: "/home/me/.grok/bin/grok",
	};
	const versions: Record<string, string> = {
		[paths.claude as string]: "2.1.311 (Claude Code)",
		[paths["cursor-agent"] as string]: "2026.10.22-27dcf5f",
		[paths.grok as string]: "grok 1.0.70 (f50904eaee6c) [stable]",
	};
	const tags: string[] = [];
	const deps: ForkAgentCliDeps = {
		now: () => 1_000_000,
		find: (binary) => paths[binary] ?? null,
		run: async (command, args) => {
			if (args[0] === "--version")
				return { stdout: versions[command] ?? "", stderr: "" };
			if (args.join(" ") === "update --check --json")
				return {
					stdout: JSON.stringify({
						currentVersion: "1.0.70",
						latestVersion: "1.0.77",
						updateAvailable: true,
					}),
					stderr: "",
				};
			return { stdout: "", stderr: "" };
		},
		latest: async (npmPackage, tag = "latest") => {
			tags.push(`${npmPackage}@${tag}`);
			if (npmPackage !== "@anthropic-ai/claude-code") return null;
			return tag === "stable" ? "2.1.311" : "2.1.318";
		},
		fetchText: async (url) =>
			url === "https://cursor.com/install"
				? 'DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.11.05-86047df/$OS/agent-cli-package.tar.gz"'
				: null,
		claudeChannel: () => channel.value,
	};
	return {
		ctx: { db: drizzle(sqlite) as unknown as HostDb },
		deps,
		tags,
		sqlite,
	};
}

test("Claude follows its update channel: stable is not offered latest", async () => {
	const channel = { value: "stable" as "latest" | "stable" };
	const f = setup(channel);
	try {
		const byId = async () =>
			Object.fromEntries(
				(await forkAgentCliStatuses(f.ctx, f.deps)).map((s) => [s.id, s]),
			);
		expect((await byId()).claude).toMatchObject({
			installed: "2.1.311",
			latest: "2.1.311",
			newer: false,
		});
		channel.value = "latest";
		expect((await byId()).claude).toMatchObject({
			latest: "2.1.318",
			newer: true,
		});
		expect(f.tags).toEqual([
			"@anthropic-ai/claude-code@stable",
			"@anthropic-ai/claude-code@latest",
		]);
	} finally {
		f.sqlite.close();
	}
});

test("Cursor Agent and Grok report newer versions and update with their own command", async () => {
	const f = setup({ value: "latest" });
	try {
		const statuses = Object.fromEntries(
			(await forkAgentCliStatuses(f.ctx, f.deps)).map((s) => [s.id, s]),
		);
		expect(statuses.cursor).toMatchObject({
			label: "Cursor Agent",
			installed: "2026.10.22-27dcf5f",
			latest: "2026.11.05-86047df",
			newer: true,
			command: "/home/me/.local/bin/cursor-agent update",
		});
		expect(statuses.grok).toMatchObject({
			installed: "1.0.70",
			latest: "1.0.77",
			newer: true,
			command: "/home/me/.grok/bin/grok update",
		});
	} finally {
		f.sqlite.close();
	}
});
