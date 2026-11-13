import { expect, test } from "bun:test";
import { forkAdoptableChatSessions } from "./forkAdoptableChatSessions";

test("dead and parked chats are not adopted as tabs", () => {
	const sessions = [
		{ sessionId: "live", terminalId: "t-live", status: "ready" },
		{ sessionId: "dead", terminalId: "t-dead", status: "dead" },
		{ sessionId: "parked", terminalId: "t-parked", status: "ready" },
		{ sessionId: "no-terminal", terminalId: null },
	];
	expect(
		forkAdoptableChatSessions(sessions, new Set(["t-parked"])).map(
			(session) => session.sessionId,
		),
	).toEqual(["live", "no-terminal"]);
});
