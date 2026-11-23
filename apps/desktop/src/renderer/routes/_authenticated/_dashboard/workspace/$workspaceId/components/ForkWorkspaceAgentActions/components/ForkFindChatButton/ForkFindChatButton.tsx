import { Trans, useLingui } from "@lingui/react/macro";
import {
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
} from "@superset/ui/lib/header-controls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { Import } from "lucide-react";

export function ForkFindChatButton({
	workspaceId,
	onOpen,
}: {
	workspaceId: string;
	onOpen: () => void;
}) {
	const { t } = useLingui();
	const utils = workspaceTrpc.useUtils();
	const warmChats = () =>
		void utils.sessionTransfer.externalSessions
			.prefetch({ workspaceId, preview: false }, { staleTime: 30_000 })
			.catch(() => undefined);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						HEADER_ICON_BUTTON_CLASS,
						"no-drag outline-none focus-visible:ring-1 focus-visible:ring-ring",
					)}
					aria-label={t({ message: "Find a chat" })}
					onPointerEnter={warmChats}
					onFocus={warmChats}
					onClick={onOpen}
				>
					<Import className="size-4" strokeWidth={HEADER_ICON_STROKE_WIDTH} />
				</button>
			</TooltipTrigger>
			<TooltipContent>
				<Trans>Find a chat</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
