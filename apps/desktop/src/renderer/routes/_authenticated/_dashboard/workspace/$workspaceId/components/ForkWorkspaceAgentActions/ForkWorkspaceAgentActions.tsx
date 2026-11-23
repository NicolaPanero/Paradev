import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import type { PaneViewerData } from "../../types";
import {
	ForkImportChatDialog,
	type ForkResumeRequest,
} from "../ForkImportChatDialog";
import { ForkNewAgentDialog } from "../ForkNewAgentDialog";

function parseResume(raw: string | undefined): ForkResumeRequest | undefined {
	if (!raw) return undefined;
	try {
		const value = JSON.parse(raw) as Partial<ForkResumeRequest>;
		return typeof value.key === "string" && typeof value.configId === "string"
			? { key: value.key, configId: value.configId }
			: undefined;
	} catch {
		return undefined;
	}
}

export function ForkWorkspaceAgentActions({
	store,
	workspaceId,
	workspaceName,
	launchOpen,
	onLaunchOpenChange,
	onCreateNewAgentSession,
	importOpen,
	onImportOpenChange,
	importRequested = false,
	resumeChat,
	onResumeConsumed,
	onImportRequestConsumed,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	workspaceName: string;
	launchOpen: boolean;
	importOpen: boolean;
	onImportOpenChange: (open: boolean) => void;
	importRequested?: boolean;
	resumeChat?: string;
	onResumeConsumed?: () => void;
	onImportRequestConsumed?: () => void;
	onLaunchOpenChange: (open: boolean) => void;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	useEffect(() => {
		if (!importRequested) return;
		onImportOpenChange(true);
		onImportRequestConsumed?.();
	}, [importRequested, onImportRequestConsumed, onImportOpenChange]);
	const resume = parseResume(resumeChat);
	return (
		<>
			{launchOpen && (
				<ForkNewAgentDialog
					open
					onOpenChange={onLaunchOpenChange}
					workspaceId={workspaceId}
					workspaceName={workspaceName}
					onCreateNewAgentSession={onCreateNewAgentSession}
				/>
			)}
			<ForkImportChatDialog
				open={importOpen}
				onOpenChange={onImportOpenChange}
				onImported={() => onImportOpenChange(false)}
				store={store}
				workspaceId={workspaceId}
				resume={resume}
				onResumeConsumed={onResumeConsumed}
			/>
		</>
	);
}
