import type { UsageAccount } from "./types";

export const ACCOUNT_LAPSE_CONFIRM_MS = 60_000;
const MAX_HELD = 128;

interface Held {
	good: UsageAccount;
	lapsedSince?: number;
}

const held = new Map<string, Held>();

const key = (account: UsageAccount) =>
	`${account.agent}:${account.selection ?? ""}:${account.credentialKind}`;

/**
 * A login that just read fine is not shown as signed out on one failed read:
 * a Claude token rotation or one slow Keychain read lapses a single 15 s
 * cycle. The last good row stands until the lapse outlasts the confirm time.
 */
export function holdLapsedAccounts(
	accounts: UsageAccount[],
	state: Map<string, Held> = held,
	now = Date.now(),
	log: (message: string) => void = console.warn,
): UsageAccount[] {
	return accounts.map((account) => {
		if (account.agent !== "claude" && account.agent !== "codex") return account;
		const id = key(account);
		const entry = state.get(id);
		if (account.status === "ok") {
			if (entry?.lapsedSince !== undefined)
				log(
					`[fork-accounts] ${account.email ?? id} read fine again after ${now - entry.lapsedSince} ms`,
				);
			state.delete(id);
			if (state.size < MAX_HELD) state.set(id, { good: account });
			return account;
		}
		if (account.status !== "signed_out" && account.status !== "token_expired")
			return account;
		if (
			!entry ||
			(account.email && entry.good.email && account.email !== entry.good.email)
		)
			return account;
		const reason = `${account.status}: ${account.statusDetail ?? "profile check failed"}`;
		if (entry.lapsedSince === undefined) {
			entry.lapsedSince = now;
			log(
				`[fork-accounts] ${entry.good.email ?? id} read as ${reason}; keeping the last good read`,
			);
		}
		if (now - entry.lapsedSince < ACCOUNT_LAPSE_CONFIRM_MS) return entry.good;
		log(
			`[fork-accounts] ${entry.good.email ?? id} still ${reason} after ${now - entry.lapsedSince} ms`,
		);
		state.delete(id);
		return account;
	});
}
