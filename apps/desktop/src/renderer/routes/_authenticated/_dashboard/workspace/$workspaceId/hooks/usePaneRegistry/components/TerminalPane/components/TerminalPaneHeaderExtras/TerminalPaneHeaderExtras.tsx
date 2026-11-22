import type { SubagentPaneData } from "../../../../../../types";
import { AccountUsage } from "../../../AccountUsage/AccountUsage";
import { ForkChatOrigin } from "../../../ForkChatOrigin";
import {
	ForkHandoffMenus,
	type ForkHandoffMenusProps,
} from "./components/ForkHandoffMenus";
import { TerminalConnectionIndicator } from "./components/TerminalConnectionIndicator";
import { TerminalPageWatchChip } from "./components/TerminalPageWatchChip";
import { TerminalSubagentsMenu } from "./components/TerminalSubagentsMenu";

interface TerminalPaneHeaderExtrasProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	fork?: ForkHandoffMenusProps;
	onNewShell: () => Promise<void>;
	/** Open (or focus) the live transcript pane for one of this agent's subagents. */
	onOpenSubagent: (data: SubagentPaneData) => void;
}

export function TerminalPaneHeaderExtras({
	workspaceId,
	terminalId,
	terminalInstanceId,
	fork,
	onOpenSubagent,
	onNewShell,
}: TerminalPaneHeaderExtrasProps) {
	return (
		<div className="flex items-center gap-1">
			{fork && <ForkChatOrigin ctx={fork.ctx} workspaceId={workspaceId} />}
			{fork?.paneData.agentSurface !== "acp" && (
				<AccountUsage
					key={`${workspaceId}:${terminalId}`}
					workspaceId={workspaceId}
					terminalId={terminalId}
				/>
			)}
			<TerminalSubagentsMenu
				workspaceId={workspaceId}
				terminalId={terminalId}
				onOpenSubagent={onOpenSubagent}
			/>
			<TerminalConnectionIndicator
				terminalId={terminalId}
				terminalInstanceId={terminalInstanceId}
				onNewShell={onNewShell}
			/>
			<TerminalPageWatchChip
				workspaceId={workspaceId}
				terminalId={terminalId}
			/>
			{fork && (
				<ForkHandoffMenus
					workspaceId={workspaceId}
					terminalId={terminalId}
					fork={fork}
				/>
			)}
		</div>
	);
}
