import type { HarnessFactory, ResolveAttachment } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { captureSessionAccount } from "../trpc/router/usage/session-account/session-account";
import { ACP_HARNESSES } from "./acpCatalogue";
import { type AcpLaunch, resolveAcpLaunch } from "./acpLaunch";
import { storeAgentImage } from "./agentImages";
import type { ChatAgentBridge } from "./chatAgentBridge";
import { chatAccountUsesApiCredentials } from "./forkChatAccount";
import { startInFullAccess } from "./forkFullAccessStart";
import { forkGeminiAuthMethod } from "./forkGeminiAuth";
import { forkGrokAuthMethod } from "./forkGrokAuth";
import { forkQuotaRecoveryHarness } from "./forkQuotaRecoveryHarness";

export function acpHarnessFactory(
	harness: string,
	db: HostDb,
	resolveAttachment: ResolveAttachment,
	agents?: ChatAgentBridge,
	discovery?: { launch: AcpLaunch; startupTimeoutMs: number },
	createAdapter: typeof createAcpAdapter = createAcpAdapter,
): HarnessFactory | null {
	const entry = ACP_HARNESSES[harness];
	if (!entry) return null;

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
					...(discovery
						? { startupTimeoutMs: discovery.startupTimeoutMs }
						: {}),
					forkAtMessage: entry.forkAtMessage === true,
					forkCursorModelSelection: harness === "cursor-acp",
					forkGrokContextUsage: harness === "grok-acp",
					get authMethodId() {
						return authMethodId;
					},
					...(entry.protocolVersion
						? { protocolVersion: entry.protocolVersion }
						: {}),
					wholeUserMessageReplay: entry.wholeUserMessageReplay,
					cwd: options.cwd,
					resolveAttachment,
					storeImage: storeAgentImage,
					...(entry.fullAccessModeId
						? { defaultModeId: entry.fullAccessModeId }
						: {}),
					...(entry.clientApprovalModes ? { clientApprovalModes: true } : {}),
					onSpawn: (pid) => {
						if (!discovery) agents?.spawned(options.sessionId, pid);
					},
					launch: async () => {
						if (usable && !discovery) accountSelection = await usable();
						const launch =
							discovery?.launch ??
							(await resolveAcpLaunch(db, { ...options, accountSelection }));
						const env = launch.env;
						if (harness === "gemini-acp")
							authMethodId = forkGeminiAuthMethod(env, entry.authMethodId);
						if (harness === "grok-acp")
							authMethodId = forkGrokAuthMethod(env, entry.authMethodId);
						if (!discovery) {
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
						}
						return launch;
					},
				});
				return discovery
					? adapter
					: startInFullAccess(adapter, entry.fullAccessModeId);
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
