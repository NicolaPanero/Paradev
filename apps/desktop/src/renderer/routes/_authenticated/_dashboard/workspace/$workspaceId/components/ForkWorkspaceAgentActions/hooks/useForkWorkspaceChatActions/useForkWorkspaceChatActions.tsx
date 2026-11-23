import { useCallback, useState } from "react";
import { ForkFindChatButton } from "../../components/ForkFindChatButton";

export function useForkWorkspaceChatActions(workspaceId: string) {
	const [state, setState] = useState({ workspaceId, importOpen: false });
	if (state.workspaceId !== workspaceId)
		setState({ workspaceId, importOpen: false });
	const setImportOpen = useCallback(
		(importOpen: boolean) => setState({ workspaceId, importOpen }),
		[workspaceId],
	);
	const renderAddTabAccessory = useCallback(
		() => (
			<ForkFindChatButton
				workspaceId={workspaceId}
				onOpen={() => setImportOpen(true)}
			/>
		),
		[workspaceId, setImportOpen],
	);
	return { importOpen: state.importOpen, setImportOpen, renderAddTabAccessory };
}
