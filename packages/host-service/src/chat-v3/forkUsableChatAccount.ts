export type UsableChatAccount = {
	selection: string | null | undefined;
	replaced?: { from: string; to: string };
};

const RECONNECT = "Reconnect account";

/**
 * The login a chat starts on. A chat keeps the login it was opened with; when
 * that login can no longer be used (signed out, token or plan expired) and the
 * host default can, the chat moves to the default instead of failing to open.
 */
export async function forkUsableChatAccount(
	selection: string | null | undefined,
	deps: {
		validate(selection: string): Promise<void>;
		fallback(): string | null;
		move(target: string): Promise<void>;
	},
): Promise<UsableChatAccount> {
	if (typeof selection !== "string") return { selection };
	try {
		await deps.validate(selection);
		return { selection };
	} catch (error) {
		if ((error as Error)?.message !== RECONNECT) throw error;
		const target = deps.fallback();
		if (!target || target === selection) throw error;
		try {
			await deps.validate(target);
		} catch {
			throw error;
		}
		await deps.move(target);
		return { selection: target, replaced: { from: selection, to: target } };
	}
}
