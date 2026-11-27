import { presetForAcpHarness } from "@superset/chat/core";
import type { HarnessFactoryOptions } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { forkAutoCompactLaunch } from "../fork-auto-compact/fork-auto-compact";
import { resolveHostAgentConfig } from "../terminal-agents/agent-config";
import type { AcpHarness } from "./acpCatalogue";
import { resolveAgentCli } from "./agentCli";
import { buildChatAgentEnv } from "./agentEnv";
import {
	antigravityDistribution,
	resolveAntigravityRuntime,
} from "./forkAntigravityRuntime";
import { forkConfiguredCli } from "./forkConfiguredCli";
import { forkLaunchChoices } from "./forkLaunchChoices";

export async function resolveForkAcpCli(
	db: HostDb,
	entry: AcpHarness,
	options: HarnessFactoryOptions,
	projectId?: string,
	signal?: AbortSignal,
) {
	const choices = forkLaunchChoices(db, options.harness, options);
	const launchConfig = resolveHostAgentConfig(
		db,
		choices.agentConfigId ?? entry.presetId ?? entry.binary,
	);
	const configured = forkConfiguredCli(
		choices.agentConfigId ? launchConfig : null,
	);
	const managedRuntime = entry.managedRuntime === "antigravity";
	const cli = await resolveAgentCli({
		command:
			configured.command ??
			(managedRuntime ? await resolveAntigravityRuntime() : undefined),
		verifyVersion: !managedRuntime,
		binary: entry.binary,
		signal,
		minVersion: entry.minVersion,
		upgrade: entry.upgrade,
		env: () =>
			buildChatAgentEnv({
				db,
				cwd: options.cwd,
				workspaceId: options.scopeId,
				projectId,
				...choices,
				terminalId: options.terminalId,
				presetId: presetForAcpHarness(options.harness) ?? entry.binary,
				preserveLegacyAccount: !!options.resume,
			}),
	});
	const { env } = forkAutoCompactLaunch(launchConfig, cli.env, "acp");
	const args = configured.model
		? ["--model", configured.model, ...entry.args]
		: managedRuntime
			? antigravityDistribution(process.platform, process.arch).args
			: entry.args;
	return { ...cli, args, env };
}
