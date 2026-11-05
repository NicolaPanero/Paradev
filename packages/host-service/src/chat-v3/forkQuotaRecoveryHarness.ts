import { homedir } from "node:os";
import { join } from "node:path";
import type {
	HarnessAdapter,
	HarnessFactoryOptions,
} from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { agentAccountOptions } from "../trpc/router/agents/account-selection";
import { getDefaultAccountSelections } from "../trpc/router/usage/default-account";
import { assertIsolatedAccount } from "../trpc/router/usage/fork-isolated-accounts";
import {
	type SessionAccount,
	validateSessionAccount,
} from "../trpc/router/usage/session-account/session-account";
import { moveClaudeSession } from "./forkMoveClaudeSession";
import { moveCodexSession } from "./forkMoveCodexSession";
import { ForkQuotaRecoveryAdapter } from "./forkQuotaRecoveryAdapter";
import {
	type RecoveryStatus,
	readRecovery,
	recoveryControllers,
	recoveryKey,
	writeRecovery,
} from "./forkQuotaRecoveryStore";
import { forkRecoveryQuota } from "./forkRecoveryQuota";
import { forkUsableChatAccount } from "./forkUsableChatAccount";

export function forkQuotaRecoveryHarness(
	db: HostDb,
	harness: string,
	options: HarnessFactoryOptions,
	worker: (
		selection: string | null | undefined,
		captured: (account: SessionAccount) => void,
		usable?: () => Promise<string | null | undefined>,
	) => HarnessAdapter,
): HarnessAdapter {
	if (
		(harness !== "claude-acp" && harness !== "codex-acp") ||
		!options.terminalId
	)
		return worker(options.accountSelection, () => {});
	const agent = harness === "codex-acp" ? "codex" : "claude";
	let account: SessionAccount | undefined;
	const usable = async (selection: string | null | undefined) => {
		const nativeSessionId = options.resume?.harnessSessionId;
		const result = await forkUsableChatAccount(selection, {
			validate: (candidate) => assertIsolatedAccount(agent, candidate),
			fallback: () => {
				const defaults = getDefaultAccountSelections(db);
				return agent === "codex"
					? defaults.codexHome
					: defaults.claudeConfigDir;
			},
			move: async (target) => {
				if (!nativeSessionId || typeof selection !== "string") return;
				if (agent === "codex") {
					await moveCodexSession({
						sessionId: nativeSessionId,
						sourceDir: selection,
						targetDir: target,
					}).catch((error: Error) => {
						if (error.message !== "session_not_found") throw error;
					});
					return;
				}
				const systemDir = join(homedir(), ".claude");
				await moveClaudeSession({
					sessionId: nativeSessionId,
					configDirs: (await agentAccountOptions(agent)).map(
						(option) => option.selection ?? systemDir,
					),
					targetDir: target,
				});
			},
		});
		if (!result.replaced) return result.selection;
		writeRecovery(db, options.scopeId, terminalId, {
			hasSelection: true,
			nativeSessionId: nativeSessionId ?? null,
			accountSelection: result.replaced.to,
		});
		const labels = await agentAccountOptions(agent);
		const label = (selection: string) =>
			labels.find((option) => option.selection === selection)?.label ??
			selection;
		adapter.accountReplaced(
			result.replaced.to,
			`The account ${label(result.replaced.from)} can no longer be used, so this chat continues on ${label(result.replaced.to)}.`,
		);
		return result.selection;
	};
	const create = (selection: string | null | undefined) => {
		let checked: Promise<string | null | undefined> | undefined;
		return worker(
			selection,
			(value) => {
				account = value;
			},
			() => {
				checked ??= usable(selection);
				return checked;
			},
		);
	};
	const saved = readRecovery(db, options.scopeId, options.terminalId);
	const initial =
		saved?.hasSelection &&
		saved.nativeSessionId === options.resume?.harnessSessionId
			? saved.accountSelection
			: options.accountSelection;
	const terminalId = options.terminalId,
		key = recoveryKey(options.scopeId, terminalId);
	const controller: {
		agent: SessionAccount["agent"];
		status: RecoveryStatus;
		changed(): void;
	} = {
		agent,
		status: { phase: "idle" } as RecoveryStatus,
		changed: () => adapter.changed(),
	};
	const adapter = new ForkQuotaRecoveryAdapter(
		{
			agent,
			create,
			settings: () =>
				readRecovery(db, options.scopeId, terminalId) ?? {
					switchAccounts: false,
					resumeAtReset: false,
				},
			account: () => account,
			validate: async () =>
				!!account &&
				account.agent === agent &&
				(await validateSessionAccount(account)),
			quota: () => forkRecoveryQuota(agent, account),
			move: async (sessionId, selection) => {
				if (!account || !(await validateSessionAccount(account)))
					throw new Error("source_account_unverified");
				if (selection !== null) await assertIsolatedAccount(agent, selection);
				const dirs = await agentAccountOptions(agent);
				if (!dirs.some((d) => d.selection === selection))
					throw new Error("account_selection_unavailable");
				if (agent === "codex") {
					if (!account.directory || !selection)
						throw new Error("account_selection_unavailable");
					await moveCodexSession({
						sessionId,
						sourceDir: account.directory,
						targetDir: selection,
					});
					return;
				}
				const systemDir = join(homedir(), ".claude");
				const result = await moveClaudeSession({
					sessionId,
					configDirs: dirs.map((d) => d.selection ?? systemDir),
					targetDir: selection ?? systemDir,
				});
				if (!result.moved && result.reason === "session_not_found")
					throw new Error("session_not_found");
			},
			selected: (selection, nativeSessionId) =>
				writeRecovery(db, options.scopeId, terminalId, {
					hasSelection: true,
					nativeSessionId,
					accountSelection: selection,
				}),
			status: (status) => {
				controller.status = status;
			},
			onDispose: () => {
				if (recoveryControllers.get(key) === controller)
					recoveryControllers.delete(key);
			},
		},
		initial,
	);
	recoveryControllers.set(key, controller);
	return adapter;
}
