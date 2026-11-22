/** Leaves out dead chats and chats parked in the background, which must not reopen as tabs. */
export function forkAdoptableChatSessions<
	T extends { terminalId: string | null; status?: string },
>(sessions: readonly T[], parkedTerminalIds: ReadonlySet<string>): T[] {
	return sessions.filter(
		(session) =>
			session.status !== "dead" &&
			!(session.terminalId && parkedTerminalIds.has(session.terminalId)),
	);
}
