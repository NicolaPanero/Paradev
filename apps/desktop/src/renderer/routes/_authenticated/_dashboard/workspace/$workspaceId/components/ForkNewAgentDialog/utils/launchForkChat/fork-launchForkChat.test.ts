import { expect, mock, test } from "bun:test";
import type { CreateNewAgentSessionInput } from "../../../../hooks/useAgentSessionLauncher/useAgentSessionLauncher";
import {
	clearPendingEffort,
	peekPendingEffort,
} from "../../../../hooks/usePaneRegistry/components/ForkChatExtras/utils/pendingEffort";
import { launchForkChat } from "./launchForkChat";

test("new chat keeps the chosen effort until the session reports its settings", async () => {
	const terminalId = crypto.randomUUID();
	const create = mock(async () => ({ terminalId }));
	const input: CreateNewAgentSessionInput = {
		configId: "claude",
		placement: "new-tab",
		prompt: "",
		modelId: "sonnet",
		accountSelection: "/test/account",
	};
	try {
		expect(await launchForkChat(create, input, "high")).toEqual({ terminalId });
		expect(create).toHaveBeenCalledWith(input);
		expect(peekPendingEffort(terminalId)).toBe("high");
	} finally {
		clearPendingEffort(terminalId);
	}
});
