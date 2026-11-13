import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { presetForAcpHarness } from "@superset/chat/core";
import type { HarnessFactory, ResolveAttachment } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { resolveHostAgentConfig } from "../terminal-agents/agent-config";
import { captureSessionAccount } from "../trpc/router/usage/session-account/session-account";
import { ACP_HARNESSES } from "./acpCatalogue";
import { resolveAgentCli } from "./agentCli";
import { buildChatAgentEnv } from "./agentEnv";
import { storeAgentImage } from "./agentImages";
import { agentLoginCommand } from "./agentLogin";
import type { ChatAgentBridge } from "./chatAgentBridge";
import {
	antigravityDistribution,
	resolveAntigravityRuntime,
} from "./forkAntigravityRuntime";
import { chatAccountUsesApiCredentials } from "./forkChatAccount";
import { forkConfiguredCli } from "./forkConfiguredCli";
import { startInFullAccess } from "./forkFullAccessStart";
import { forkGeminiAuthMethod } from "./forkGeminiAuth";
import { forkGrokAuthMethod } from "./forkGrokAuth";
import { forkLaunchChoices } from "./forkLaunchChoices";
import { forkQuotaRecoveryHarness } from "./forkQuotaRecoveryHarness";

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

export function acpHarnessFactory(
	harness: string,
	db: HostDb,
	resolveAttachment: ResolveAttachment,
	agents?: ChatAgentBridge,
	createAdapter: typeof createAcpAdapter = createAcpAdapter,
): HarnessFactory | null {
	const entry = ACP_HARNESSES[harness];
	if (!entry) return null;

	let adapterEntry: string | undefined;
	if (entry.adapter) {
		try {
			adapterEntry = resolveAdapterEntry(entry.adapter);
		} catch {
			return null;
		}
	}

	return (options) =>
		forkQuotaRecoveryHarness(
			db,
			harness,
			options,
			(savedSelection, captured, usable) => {
				let accountSelection = savedSelection;
				let authMethodId = entry.authMethodId;
				const adapter = createAdapter({
					command: entry.binary,
					forkAtMessage: entry.forkAtMessage === true,
					forkCursorModelSelection: harness === "cursor-acp",
					forkGrokContextUsage: harness === "grok-acp",
					get authMethodId() {
						return authMethodId;
					},
					wholeUserMessageReplay: entry.wholeUserMessageReplay,
					cwd: options.cwd,
					resolveAttachment,
					storeImage: storeAgentImage,
					...(entry.fullAccessModeId
						? { defaultModeId: entry.fullAccessModeId }
						: {}),
					...(entry.clientApprovalModes ? { clientApprovalModes: true } : {}),
					onSpawn: (pid) => agents?.spawned(options.sessionId, pid),
					launch: async () => {
						if (usable) accountSelection = await usable();
						const choices = forkLaunchChoices(db, harness, {
							...options,
							accountSelection,
						});
						const configured = forkConfiguredCli(
							choices.agentConfigId
								? resolveHostAgentConfig(db, choices.agentConfigId)
								: null,
						);
						const cli = await resolveAgentCli({
							command:
								entry.managedRuntime === "antigravity"
									? (configured.command ?? (await resolveAntigravityRuntime()))
									: configured.command,
							verifyVersion: entry.managedRuntime !== "antigravity",
							binary: entry.binary,
							minVersion: entry.minVersion,
							upgrade: entry.upgrade,
							env: () =>
								buildChatAgentEnv({
									db,
									cwd: options.cwd,
									workspaceId: options.scopeId,
									...forkLaunchChoices(db, harness, {
										...options,
										accountSelection,
									}),
									terminalId: options.terminalId,
									presetId:
										presetForAcpHarness(options.harness) ?? entry.binary,
									preserveLegacyAccount: !!options.resume,
								}),
						});
						const env = cli.env;
						if (harness === "gemini-acp")
							authMethodId = forkGeminiAuthMethod(env, entry.authMethodId);
						if (harness === "grok-acp")
							authMethodId = forkGrokAuthMethod(env, entry.authMethodId);
						agents?.launched?.(options.sessionId, env);
						await captureSessionAccount(
							entry.binary,
							(entry.binary === "codex"
								? env.CODEX_HOME
								: env.CLAUDE_CONFIG_DIR) ?? "",
							chatAccountUsesApiCredentials(entry.binary, env),
						)
							.then((account) => {
								if (account) {
									captured(account);
									agents?.accountCaptured(options.sessionId, account);
								}
							})
							.catch(() => undefined);
						const loginCommand = agentLoginCommand(entry.binary, env);
						const login = loginCommand ? { loginCommand } : {};
						if (!adapterEntry) {
							return {
								command: cli.command,
								args: configured.model
									? ["--model", configured.model, ...entry.args]
									: entry.managedRuntime === "antigravity"
										? antigravityDistribution(process.platform, process.arch)
												.args
										: entry.args,
								env,
								...login,
							};
						}
						if (!entry.executableEnv) {
							throw new Error(
								`${harness} bundles a translator with no way to point it at ${entry.binary}`,
							);
						}
						return {
							command: process.execPath,
							args: [adapterEntry, ...(entry.args ?? [])],
							env: {
								...env,
								ELECTRON_RUN_AS_NODE: "1",
								[entry.executableEnv]: cli.command,
							},
							...login,
						};
					},
				});
				return startInFullAccess(adapter, entry.fullAccessModeId);
			},
		);
}

export function acpHarnessEntries(
	db: HostDb,
	resolveAttachment: ResolveAttachment,
	agents?: ChatAgentBridge,
): [string, HarnessFactory][] {
	const entries: [string, HarnessFactory][] = [];
	for (const harness of Object.keys(ACP_HARNESSES)) {
		const factory = acpHarnessFactory(harness, db, resolveAttachment, agents);
		if (factory) entries.push([harness, factory]);
	}
	return entries;
}
