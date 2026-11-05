import { execFile } from "node:child_process";
import {
	accessSync,
	constants,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { getBinDir } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import { coerce, gt } from "semver";
import { forkAgentCliSettings, forkAgentCliUpdates } from "../db/fork-schema";
import { getTerminalBaseEnv } from "../terminal/env";
import type { HostServiceContext } from "../types";

const run = promisify(execFile);
type Ctx = Pick<HostServiceContext, "db">;

export const FORK_AGENT_CLI_DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const VERSION_TIMEOUT_MS = 10_000;
const UPDATE_TIMEOUT_MS = 5 * 60 * 1000;
const SETTINGS_SCOPE = "host";

export type ForkAgentCliId = "claude" | "codex" | "cursor" | "grok";

interface Spec {
	id: ForkAgentCliId;
	label: string;
	binary: string;
	/** The newest version on the channel this install updates from. */
	latest: (
		deps: ForkAgentCliDeps,
		installPath: string,
	) => Promise<string | null>;
	/** Each update channel keeps its own cached version. */
	cacheKey?: (deps: ForkAgentCliDeps) => string;
	/** The command that updates this install, or null when the app cannot tell how it was installed. */
	update: (installPath: string) => { command: string; args: string[] } | null;
}

const CURSOR_INSTALL_SCRIPT = "https://cursor.com/install";

const SPECS: Spec[] = [
	{
		id: "claude",
		label: "Claude Code",
		binary: "claude",
		// `claude update` follows `autoUpdatesChannel`; comparing with npm's
		// `latest` tag offered an update that `stable` users never receive.
		latest: (deps) =>
			deps.latest("@anthropic-ai/claude-code", claudeChannel(deps)),
		cacheKey: (deps) =>
			claudeChannel(deps) === "latest" ? "claude" : "claude@stable",
		update: (installPath) => ({ command: installPath, args: ["update"] }),
	},
	{
		id: "codex",
		label: "Codex",
		binary: "codex",
		latest: (deps) => deps.latest("@openai/codex"),
		update: (installPath) => {
			if (!resolved(installPath).includes("node_modules")) return null;
			return {
				command: join(dirname(installPath), "npm"),
				args: ["install", "-g", "@openai/codex@latest"],
			};
		},
	},
	{
		id: "cursor",
		label: "Cursor Agent",
		binary: "cursor-agent",
		latest: async (deps) => {
			const script = await deps.fetchText?.(CURSOR_INSTALL_SCRIPT);
			return (
				script?.match(/downloads\.cursor\.com\/lab\/(\d[\w.-]*)\//)?.[1] ?? null
			);
		},
		update: (installPath) => ({ command: installPath, args: ["update"] }),
	},
	{
		id: "grok",
		label: "Grok",
		binary: "grok",
		latest: async (deps, installPath) => {
			try {
				const { stdout } = await deps.run(
					installPath,
					["update", "--check", "--json"],
					VERSION_TIMEOUT_MS,
				);
				const version = (JSON.parse(stdout) as { latestVersion?: unknown })
					.latestVersion;
				return typeof version === "string" ? version : null;
			} catch {
				return null;
			}
		},
		update: (installPath) => ({ command: installPath, args: ["update"] }),
	},
];

function claudeChannel(deps: ForkAgentCliDeps): "latest" | "stable" {
	return deps.claudeChannel?.() ?? "latest";
}

export const FORK_AGENT_CLI_IDS = SPECS.map((spec) => spec.id) as [
	ForkAgentCliId,
	...ForkAgentCliId[],
];

export interface ForkAgentCliDeps {
	now: () => number;
	/** Path of the binary on the PATH, not the app's own wrapper. */
	find: (binary: string) => string | null;
	run: (
		command: string,
		args: string[],
		timeoutMs: number,
	) => Promise<{ stdout: string; stderr: string }>;
	latest: (npmPackage: string, tag?: string) => Promise<string | null>;
	fetchText?: (url: string) => Promise<string | null>;
	claudeChannel?: () => "latest" | "stable";
}

export interface ForkAgentCliStatus {
	id: ForkAgentCliId;
	label: string;
	installed: string | null;
	latest: string | null;
	newer: boolean;
	/** The command the update runs, shown before it runs. */
	command: string | null;
	snoozed: boolean;
}

/** Where a link on the PATH really points, to tell an npm install from another. */
function resolved(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function isExecutable(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function realBinary(binary: string): string | null {
	const wrapperDir = process.platform === "win32" ? null : getBinDir();
	const base = getTerminalBaseEnv();
	const path = [
		base.PATH ?? process.env.PATH ?? "",
		join(homedir(), ".local", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
	].join(delimiter);
	for (const dir of path.split(delimiter)) {
		if (!dir || dir === wrapperDir) continue;
		const candidate = join(dir, binary);
		if (isExecutable(candidate)) return candidate;
	}
	return null;
}

export function forkAgentCliDeps(): ForkAgentCliDeps {
	return {
		now: () => Date.now(),
		find: realBinary,
		run: async (command, args, timeoutMs) => {
			const result = await run(command, args, {
				env: { ...process.env, ...getTerminalBaseEnv() },
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024,
			});
			return { stdout: result.stdout, stderr: result.stderr };
		},
		latest: async (npmPackage, tag = "latest") => {
			try {
				const response = await fetch(
					`https://registry.npmjs.org/-/package/${npmPackage.replace("/", "%2F")}/dist-tags`,
					{ signal: AbortSignal.timeout(VERSION_TIMEOUT_MS) },
				);
				if (!response.ok) return null;
				const tags = (await response.json()) as Record<string, unknown>;
				return typeof tags[tag] === "string" ? tags[tag] : null;
			} catch {
				return null;
			}
		},
		fetchText: async (url) => {
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
				});
				return response.ok ? await response.text() : null;
			} catch {
				return null;
			}
		},
		claudeChannel: () => {
			const env = { ...process.env, ...getTerminalBaseEnv() };
			const dir = env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
			try {
				const settings = JSON.parse(
					readFileSync(join(dir, "settings.json"), "utf8"),
				) as { autoUpdatesChannel?: unknown };
				return settings.autoUpdatesChannel === "stable" ? "stable" : "latest";
			} catch {
				return "latest";
			}
		},
	};
}

function parseVersion(output: string): string | null {
	return output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? null;
}

async function installedVersion(
	deps: ForkAgentCliDeps,
	path: string,
): Promise<string | null> {
	try {
		const { stdout, stderr } = await deps.run(
			path,
			["--version"],
			VERSION_TIMEOUT_MS,
		);
		return parseVersion(stdout) ?? parseVersion(stderr);
	} catch {
		return null;
	}
}

export function forkAgentCliChecksEnabled(ctx: Ctx): boolean {
	return (
		ctx.db
			.select()
			.from(forkAgentCliSettings)
			.where(eq(forkAgentCliSettings.scope, SETTINGS_SCOPE))
			.get()?.enabled ?? true
	);
}

export function forkSetAgentCliChecks(ctx: Ctx, enabled: boolean): void {
	ctx.db
		.insert(forkAgentCliSettings)
		.values({ scope: SETTINGS_SCOPE, enabled })
		.onConflictDoUpdate({
			target: forkAgentCliSettings.scope,
			set: { enabled },
		})
		.run();
}

function saved(ctx: Ctx, agent: string) {
	return ctx.db
		.select()
		.from(forkAgentCliUpdates)
		.where(eq(forkAgentCliUpdates.agent, agent))
		.get();
}

function save(
	ctx: Ctx,
	agent: string,
	values: { checkedAt: number; latest: string | null },
): void {
	ctx.db
		.insert(forkAgentCliUpdates)
		.values({ agent, ...values })
		.onConflictDoUpdate({
			target: forkAgentCliUpdates.agent,
			set: values,
		})
		.run();
}

export function forkAgentCliIsNewer(
	installed: string | null,
	latest: string | null,
): boolean {
	// Date versions such as Cursor's 2026.11.05 are not valid semver as written.
	const numeric = (version: string | null) =>
		version?.replace(/(^|\.)0+(\d)/g, "$1$2") ?? null;
	const a = coerce(numeric(installed));
	const b = coerce(numeric(latest));
	return Boolean(a && b && gt(b, a));
}

async function statusOf(
	ctx: Ctx,
	deps: ForkAgentCliDeps,
	spec: Spec,
	force: boolean,
): Promise<ForkAgentCliStatus> {
	const now = deps.now();
	const path = deps.find(spec.binary);
	const key = spec.cacheKey?.(deps) ?? spec.id;
	let row = saved(ctx, key);
	if (path && (force || !row || now - row.checkedAt >= FORK_AGENT_CLI_DAY_MS)) {
		const latest = await spec.latest(deps, path);
		save(ctx, key, {
			// A failed check tries again within the hour, not on every call.
			checkedAt: latest
				? now
				: now - FORK_AGENT_CLI_DAY_MS + RETRY_AFTER_FAILURE_MS,
			latest: latest ?? row?.latest ?? null,
		});
		row = saved(ctx, key);
	}
	const installed = path ? await installedVersion(deps, path) : null;
	const latest = row?.latest ?? null;
	const update = path ? spec.update(path) : null;
	return {
		id: spec.id,
		label: spec.label,
		installed,
		latest,
		newer: forkAgentCliIsNewer(installed, latest),
		command: update ? [update.command, ...update.args].join(" ") : null,
		snoozed: (row?.snoozedUntil ?? 0) > now,
	};
}

/** One entry per supported agent. The network is read at most once a day, unless forced. */
export async function forkAgentCliStatuses(
	ctx: Ctx,
	deps: ForkAgentCliDeps,
	options: { force?: boolean } = {},
): Promise<ForkAgentCliStatus[]> {
	return Promise.all(
		SPECS.map((spec) => statusOf(ctx, deps, spec, options.force === true)),
	);
}

/** "Later" hides the notice until the next daily check. */
export function forkSnoozeAgentCliUpdates(ctx: Ctx, now: number): void {
	ctx.db
		.update(forkAgentCliUpdates)
		.set({ snoozedUntil: now + FORK_AGENT_CLI_DAY_MS })
		.run();
}

const updating = new Set<ForkAgentCliId>();

export async function forkUpdateAgentCli(
	ctx: Ctx,
	deps: ForkAgentCliDeps,
	id: ForkAgentCliId,
): Promise<ForkAgentCliStatus> {
	const spec = SPECS.find((entry) => entry.id === id);
	if (!spec) throw new Error("Unknown agent");
	if (updating.has(id)) throw new Error(`${spec.label} is already updating`);
	const path = deps.find(spec.binary);
	if (!path) throw new Error(`${spec.label} is not installed on this computer`);
	const update = spec.update(path);
	if (!update)
		throw new Error(
			`Paradev++ cannot tell how ${spec.label} was installed. Update it with the same tool you used to install it.`,
		);
	updating.add(id);
	try {
		try {
			await deps.run(update.command, update.args, UPDATE_TIMEOUT_MS);
		} catch (error) {
			const detail =
				error instanceof Error ? error.message.split("\n")[0] : String(error);
			throw new Error(`${spec.label} did not update: ${detail}`);
		}
	} finally {
		updating.delete(id);
	}
	const after = await statusOf(ctx, deps, spec, true);
	if (after.newer)
		throw new Error(
			`${spec.label} is still ${after.installed ?? "unknown"}. Run "${after.command ?? spec.binary}" in a terminal to see why.`,
		);
	return after;
}
