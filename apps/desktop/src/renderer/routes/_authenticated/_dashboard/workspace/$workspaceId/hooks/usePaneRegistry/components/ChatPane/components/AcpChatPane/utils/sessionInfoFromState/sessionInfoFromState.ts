import { type ChatSelections, sessionSelections } from "@superset/chat/core";
import type { SessionState } from "@superset/chat/protocol";
import {
	CURSOR_CONTEXT_ID,
	cursorModelWithContext,
} from "@superset/shared/fork-cursor-context";

export type SessionInfo = ChatSelections & {
	harnessSessionId?: string;
	title?: string;
};

export function sessionInfoFromState(
	state: SessionState | null,
	agentSessionId: string | undefined,
	agentId?: string,
): SessionInfo {
	// A resume that found no transcript lands on a different agent session.
	// Keep the pane pointed at the live one, or the trip back to the CLI
	// resumes an id that no longer exists.
	const bound = state?.harnessSessionId;
	const selections = sessionSelections(state);
	const context =
		agentId === "cursor-agent"
			? state?.configOptions?.find((option) => option.id === CURSOR_CONTEXT_ID)
					?.currentValue
			: undefined;
	return {
		...(bound && bound !== agentSessionId ? { harnessSessionId: bound } : {}),
		...(state?.title ? { title: state.title } : {}),
		...selections,
		...(context && selections.modelId
			? { modelId: cursorModelWithContext(selections.modelId, context) }
			: {}),
	};
}
