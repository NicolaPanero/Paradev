import { useLingui } from "@lingui/react/macro";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useState } from "react";
import { NoticeDialog } from "renderer/components/DesktopNotices/components/NoticeDialog";

export const FORK_WHATS_NEW_ID = "paradev-2011-upstream-2026-11";
export const FORK_WHATS_NEW_STORAGE_KEY = "superset-fork-whats-new";
export const FORK_WHATS_NEW_DISMISSED = "fork-whats-new-dismissed";
const FORK_GUIDE_URL =
	"https://github.com/NicolaPanero/Paradev/blob/fork/main/FORK.md";

interface ForkWhatsNewStorage {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
}

export function hasSeenForkWhatsNew(storage: ForkWhatsNewStorage): boolean {
	return storage.getItem(FORK_WHATS_NEW_STORAGE_KEY) === FORK_WHATS_NEW_ID;
}

export function markForkWhatsNewSeen(storage: ForkWhatsNewStorage): void {
	storage.setItem(FORK_WHATS_NEW_STORAGE_KEY, FORK_WHATS_NEW_ID);
}

/**
 * One fixed-size localStorage value. Dismissing replaces the previous release
 * note id; removing this feature must move the key to DEAD_KEYS.
 */
export function ForkWhatsNewNotice() {
	const { t } = useLingui();
	const [seen, setSeen] = useState(() => hasSeenForkWhatsNew(localStorage));
	if (seen) return null;
	const highlights = [
		t({
			message: "Chat stays responsive while background agents work.",
		}),
		t({
			message: "Queued prompts remain visible while the agent is working.",
		}),
		t({
			message: "Return to the main chat directly from a subagent conversation.",
		}),
		t({
			message:
				"Workspace tabs and controls stay accessible at higher zoom levels.",
		}),
	];
	const notice: DesktopNotice = {
		id: `fork-whats-new:${FORK_WHATS_NEW_ID}`,
		severity: "info",
		trigger: "post-update",
		body: [
			`### ${t({ message: "What's new in Paradev++" })}`,
			highlights.map((line) => `- ${line}`).join("\n"),
			t({
				message:
					"This window shows again only when there are new important features.",
			}),
		].join("\n\n"),
		cta: {
			label: t({ message: "Open the guide" }),
			action: "open-url",
			url: FORK_GUIDE_URL,
		},
		dismissible: true,
	};
	const dismiss = () => {
		markForkWhatsNewSeen(localStorage);
		setSeen(true);
		window.dispatchEvent(new Event(FORK_WHATS_NEW_DISMISSED));
	};
	return <NoticeDialog notice={notice} onDismiss={dismiss} />;
}
