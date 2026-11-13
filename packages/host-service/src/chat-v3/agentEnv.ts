import { delimiter, dirname, join } from "node:path";
import { getBinDir } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import { getProjectIncludingDeleted } from "../projects/local-project-store";
import { waitForSandboxManagedEnv } from "../runtime/sandbox-managed-env";
import {
	buildHostLaunchEnv,
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import { selectedAccountEnv } from "../trpc/router/agents/account-selection";
import { chatLaunchPresetId } from "../trpc/router/agents/agents";
import { resolveDefaultAccountTerminalEnv } from "../trpc/router/usage/default-account";
import { assertIsolatedAccount } from "../trpc/router/usage/fork-isolated-accounts";
import { ensureIsolatedDefault } from "../trpc/router/usage/fork-isolated-default";

function workspacePaths(
	db: HostDb,
	workspaceId: string,
): { workspacePath: string; rootPath: string } {
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	const project = workspace?.projectId
		? getProjectIncludingDeleted(db, workspace.projectId)
		: undefined;
	return {
		workspacePath: workspace?.worktreePath ?? "",
		rootPath: project?.repoPath ?? "",
	};
}

function withSupersetBinFirst(
	env: Record<string, string>,
): Record<string, string> {
	const binDir = getBinDir();
	const key =
		Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
	const entries = (env[key] ?? "")
		.split(delimiter)
		.filter((entry) => entry && entry !== binDir);
	return { ...env, [key]: [binDir, ...entries].join(delimiter) };
}

function withoutAmbientKeys(
	env: Record<string, string>,
): Record<string, string> {
	// In a sandbox these are the creator's sign-in, filled in by the firewall.
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") return env;
	const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
	return rest;
}

/**
 * A chat agent is launched with the env a terminal would launch it with, so
 * the same CLI resolves the same tools and auth either way. `~/.paradev/bin`
 * leads PATH because a terminal picks that up from the shell bootstrap, which
 * a directly spawned agent never runs, and it is what puts the superset CLI
 * and the agent wrappers in reach. A chat opened with an agent config gets
 * that config's env on top, as its terminal would, so a "Claude (work)" chat
 * runs on the work account; a key set there is the user's own and stays.
 */
export async function buildChatAgentEnv(options: {
	db: HostDb;
	cwd: string;
	workspaceId: string;
	agentConfigId?: string;
	accountSelection?: string | null;
	terminalId?: string;
	preserveLegacyAccount?: boolean;
	/** The CLI the chat runs (`claude`, `codex`, …); a config applies only to its own. */
	presetId?: string;
}): Promise<Record<string, string>> {
	await Promise.all([waitForTerminalBaseEnv(), waitForSandboxManagedEnv()]);
	const paths = workspacePaths(options.db, options.workspaceId);
	const resolved = options.agentConfigId
		? resolveHostAgentConfig(options.db, options.agentConfigId)
		: null;
	if (options.agentConfigId && !resolved)
		throw new Error("agent_config_unavailable");
	const config =
		resolved &&
		(!options.presetId || chatLaunchPresetId(resolved) === options.presetId)
			? resolved
			: null;
	if (
		!options.preserveLegacyAccount &&
		options.accountSelection === undefined &&
		process.env.SUPERSET_HOST_RUN_MODE !== "sandbox" &&
		(config?.presetId === "claude" || config?.presetId === "codex")
	)
		await ensureIsolatedDefault(options.db, config.presetId);
	let configEnv = config ? agentLaunchEnv(options.db, config) : {};
	if (
		options.accountSelection === undefined &&
		(config?.presetId === "claude" || config?.presetId === "codex")
	) {
		const profile =
			configEnv[
				config.presetId === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"
			];
		if (profile) await assertIsolatedAccount(config.presetId, profile);
		else if (
			!options.preserveLegacyAccount &&
			process.env.SUPERSET_HOST_RUN_MODE !== "sandbox" &&
			![
				"ANTHROPIC_API_KEY",
				"ANTHROPIC_AUTH_TOKEN",
				"CLAUDE_CODE_OAUTH_TOKEN",
				"OPENAI_API_KEY",
				"CODEX_API_KEY",
			].some((key) => configEnv[key] || getTerminalBaseEnv()[key])
		)
			throw new Error("account_selection_unavailable");
	}
	if (options.accountSelection !== undefined) {
		if (!config) throw new Error("agent_config_unavailable");
		configEnv = await selectedAccountEnv(
			config,
			configEnv,
			options.accountSelection,
		);
	}
	if (config?.presetId === "gemini" && !configEnv.GEMINI_CLI_HOME)
		configEnv.GEMINI_CLI_HOME = join(
			dirname(getBinDir()),
			"accounts",
			"gemini",
			"chat",
		);
	if (config?.presetId === "agy" && !configEnv.GEMINI_HOME)
		configEnv.GEMINI_HOME = join(
			dirname(getBinDir()),
			"accounts",
			"antigravity",
			"chat",
			".gemini",
		);
	if (config?.presetId === "cursor-agent") configEnv.CURSOR_AGENT = "1";
	const result = withoutAmbientKeys(
		withSupersetBinFirst({
			...buildHostLaunchEnv({
				cwd: options.cwd,
				workspaceId: options.workspaceId,
				terminalId: options.terminalId,
				workspacePath: paths.workspacePath || options.cwd,
				rootPath: paths.rootPath,
			}),
			...resolveDefaultAccountTerminalEnv(options.db),
			...configEnv,
		}),
	);
	const configKeys = Boolean(
		configEnv.ANTHROPIC_API_KEY || configEnv.ANTHROPIC_AUTH_TOKEN,
	);
	for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) {
		const value =
			configEnv[key] ??
			(options.accountSelection === undefined && !configKeys
				? getTerminalBaseEnv()[key]
				: undefined);
		if (value) result[key] = value;
		else if (configKeys) delete result[key];
	}
	if (config?.presetId === "claude" && options.accountSelection === null)
		delete result.CLAUDE_CONFIG_DIR;
	return result;
}
