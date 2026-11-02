import { msg } from "@lingui/core/macro";
import {
	AGENT_DEFAULT_MODE,
	FULL_ACCESS_CHAT_MODE,
} from "@superset/chat/protocol";
import { FastForward, NotebookPen, Pause } from "lucide-react";
import { KNOWN_MODES, type ModeCopy } from "../../../../utils/modeCopy";

const ASK_FOR_APPROVAL = KNOWN_MODES.default as ModeCopy;
const FULL_ACCESS = KNOWN_MODES.bypassPermissions as ModeCopy;

export const FORK_KNOWN_MODES: Readonly<Record<string, ModeCopy>> = {
	...KNOWN_MODES,
	[FULL_ACCESS_CHAT_MODE]: {
		title: msg({ message: "Full access" }),
		description: msg({
			message: "Approves tool actions automatically in this chat.",
		}),
		icon: FastForward,
	},
	[AGENT_DEFAULT_MODE]: ASK_FOR_APPROVAL,
	yolo: FULL_ACCESS,
	ask: {
		title: msg({ message: "Ask" }),
		description: msg({
			message: "Explore code and answer questions without making changes.",
		}),
		icon: Pause,
	},
	plan: {
		title: msg({ message: "Plan" }),
		description: msg({
			message:
				"Plan with full access; tool actions are approved automatically.",
		}),
		icon: NotebookPen,
	},
};
