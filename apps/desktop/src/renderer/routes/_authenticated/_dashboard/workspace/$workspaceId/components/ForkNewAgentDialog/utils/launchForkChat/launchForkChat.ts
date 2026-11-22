import type {
	CreateNewAgentSession,
	CreateNewAgentSessionInput,
} from "../../../../hooks/useAgentSessionLauncher/useAgentSessionLauncher";
import { setPendingEffort } from "../../../../hooks/usePaneRegistry/components/ForkChatExtras/utils/pendingEffort";

export async function launchForkChat(
	create: CreateNewAgentSession,
	input: CreateNewAgentSessionInput,
	effort: string | null,
) {
	const result = await create(input);
	if (result && effort) setPendingEffort(result.terminalId, effort);
	return result;
}
