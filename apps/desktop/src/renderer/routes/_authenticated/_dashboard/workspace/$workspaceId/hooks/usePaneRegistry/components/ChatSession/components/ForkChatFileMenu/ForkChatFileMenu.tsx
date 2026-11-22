import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { ForkRevealFileItem } from "./components/ForkRevealFileItem";

export function ForkChatFileMenuItems({ reference }: { reference: string }) {
	const { workspaceId } = useChatPaneActions();
	if (!workspaceId) return null;
	return <ForkRevealFileItem text={reference} workspaceId={workspaceId} />;
}
