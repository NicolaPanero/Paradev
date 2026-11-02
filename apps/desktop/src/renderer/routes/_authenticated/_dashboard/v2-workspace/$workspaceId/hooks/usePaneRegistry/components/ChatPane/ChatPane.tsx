import type { RendererContext } from "@superset/panes";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { useCallback, useRef } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { LinkHoverHint } from "renderer/lib/clickPolicy";
import type { OpenReviewDiff } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useReviewCommentNavigation";
import type {
	ChatPaneData,
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useLinkClickHint } from "../../hooks/useLinkClickHint";
import type { OpenDiff } from "../ChatSession/providers/ChatPaneActionsProvider";
import { AcpChatPane } from "./components/AcpChatPane";
import { AgentChatPane } from "./components/AgentChatPane";
import { useOpenChatLink } from "./hooks/useOpenChatLink";
import { useOpenChatPage } from "./hooks/useOpenChatPage";
import { openChatHistory } from "./utils/chatHistoryOpen";
import {
	pendingChatPrompts,
	prependChatPrompts,
} from "./utils/pendingChatPrompts";
import { restartedChatPaneData } from "./utils/restartedChatPaneData";
import { saveChatMode } from "./utils/savedChatMode";
import { syncChatSessionInfo } from "./utils/syncChatSessionInfo";

export function ChatPane({
	ctx,
	onOpenDiff,
	onOpenFile,
	onRevealPath,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenDiff: OpenReviewDiff;
	onOpenFile: OpenFile;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
}) {
	const data = ctx.pane.data as ChatPaneData;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs } = useV2AgentConfigs(hostUrl);
	const agentLabel =
		data.agentLabel ??
		configs?.find((config) => config.id === data.acpAgentConfigId)?.label ??
		AGENT_IDENTITY_LABELS[data.agent?.id as keyof typeof AGENT_IDENTITY_LABELS];
	const openPage = useOpenChatPage(ctx.store);
	const { hint, showHint } = useLinkClickHint();
	const openLink = useOpenChatLink({
		store: ctx.store,
		workspaceId,
		onOpenFile,
		onRevealPath,
		showHint,
	});
	const latest = useRef(data);
	latest.current = data;
	const paneId = ctx.pane.id;
	const onOpenHistory = useCallback(() => openChatHistory(paneId), [paneId]);
	const openDiff = useCallback<OpenDiff>(
		(filter, path) =>
			onOpenDiff(path ?? "", false, undefined, undefined, undefined, filter),
		[onOpenDiff],
	);
	const agentId = data.agent?.id;
	const store = ctx.store;
	const onNewChat = useCallback(
		(label: string | undefined) => {
			if (!agentId) return;
			store.getState().addTab({
				panes: [
					{
						kind: "chat-v3",
						...(label ? { titleOverride: label } : {}),
						data: {
							terminalId: crypto.randomUUID(),
							sessionId: null,
							agent: { id: agentId },
						} satisfies ChatPaneData,
					},
				],
			});
		},
		[agentId, store],
	);
	const pendingPrompts = pendingChatPrompts(data);

	const clearPendingPrompts = () => {
		const {
			pendingPrompt: _sent,
			pendingAttachments: _attached,
			queuedPrompts: _queued,
			...rest
		} = latest.current;
		latest.current = rest;
		ctx.actions.updateData(rest);
	};

	if (data.agentSession) {
		return (
			<>
				<AgentChatPane
					agentSessionId={data.agentSession.id}
					agentName={data.agentSession.agentName}
					workspaceId={workspaceId}
					isActive={ctx.isActive}
					pendingPrompts={pendingPrompts}
					onPendingPromptsSent={clearPendingPrompts}
					onOpenFile={onOpenFile}
					onOpenPage={openPage}
					onOpenLink={openLink}
					onOpenHistory={onOpenHistory}
				/>
				<LinkHoverHint
					hoverLabel={null}
					hoverPosition={null}
					clickHint={hint}
				/>
			</>
		);
	}

	return (
		<>
			<AcpChatPane
				key={`${data.draftId ?? data.terminalId}:${data.agent?.id}`}
				agent={data.agent}
				draftId={data.draftId}
				isActive={ctx.isActive}
				onPendingPromptsSent={clearPendingPrompts}
				onQueuePrompt={(content) => {
					latest.current = {
						...latest.current,
						queuedPrompts: [...(latest.current.queuedPrompts ?? []), content],
					};
					ctx.actions.updateData(latest.current);
				}}
				onRestoreQueuedPrompts={(prompts) => {
					latest.current = prependChatPrompts(latest.current, prompts);
					ctx.actions.updateData(latest.current);
				}}
				pendingPrompts={pendingPrompts}
				agentConfigId={data.acpAgentConfigId}
				accountSelection={data.acpAccountSelection}
				launchPrompt={data.launchPrompt}
				modelId={data.chatModelId}
				modelLabel={data.chatModelLabel}
				modeId={data.chatModeId}
				onSessionInfo={({ harnessSessionId, title }) => {
					syncChatSessionInfo(ctx, { harnessSessionId, title }, agentLabel);
				}}
				onSwitchAgent={({ presetId, label, model, modeId, handoffPrompt }) => {
					if (ctx.pane.titleOverride === agentLabel) {
						ctx.store.getState().setPaneTitleOverride({
							tabId: ctx.tab.id,
							paneId: ctx.pane.id,
							titleOverride: undefined,
						});
					}
					ctx.actions.updateData(
						restartedChatPaneData(data, {
							agentLabel: label,
							agent: { id: presetId },
							...(model
								? { chatModelId: model.id, chatModelLabel: model.label }
								: {}),
							...(modeId ? { chatModeId: modeId } : {}),
							...(handoffPrompt ? { pendingPrompt: handoffPrompt } : {}),
						}),
					);
				}}
				onOpenAgentChat={({
					presetId,
					label,
					model,
					modeId,
					handoffPrompt,
					agentConfigId,
					accountSelection,
				}) =>
					ctx.store.getState().addTab({
						panes: [
							{
								kind: "chat-v3",
								data: {
									agentLabel: label,
									terminalId: crypto.randomUUID(),
									sessionId: null,
									agent: { id: presetId },
									...(model
										? { chatModelId: model.id, chatModelLabel: model.label }
										: {}),
									...(modeId ? { chatModeId: modeId } : {}),
									...(agentConfigId ? { acpAgentConfigId: agentConfigId } : {}),
									...(accountSelection !== undefined
										? { acpAccountSelection: accountSelection }
										: {}),
									...(handoffPrompt ? { pendingPrompt: handoffPrompt } : {}),
								} satisfies ChatPaneData,
							},
						],
					})
				}
				onOpenForkedChat={({ sessionId, terminalId }) => {
					const { agent, chatModelId, chatModelLabel, chatModeId, chatTitle } =
						latest.current;
					ctx.store.getState().addTab({
						panes: [
							{
								kind: "chat-v3",
								data: {
									terminalId,
									sessionId,
									...(agent ? { agent: { id: agent.id } } : {}),
									...(chatModelId ? { chatModelId } : {}),
									...(chatModelLabel ? { chatModelLabel } : {}),
									...(chatModeId ? { chatModeId } : {}),
									...(chatTitle ? { chatTitle } : {}),
								} satisfies ChatPaneData,
							},
						],
					});
				}}
				onRewound={(prompt) => {
					const { agent, chatModelId, chatModelLabel, chatModeId } =
						latest.current;
					ctx.actions.updateData(
						restartedChatPaneData(latest.current, {
							...(agent ? { agent: { id: agent.id } } : {}),
							...(chatModelId ? { chatModelId } : {}),
							...(chatModelLabel ? { chatModelLabel } : {}),
							...(chatModeId ? { chatModeId } : {}),
							pendingPrompt: prompt,
						}),
					);
				}}
				onModeChange={(chatModeId) => {
					if (data.agent) saveChatMode(data.agent.id, chatModeId);
					ctx.actions.updateData({ ...data, chatModeId });
				}}
				onSessionCreated={(sessionId, pendingPrompt) =>
					ctx.actions.updateData({
						...latest.current,
						sessionId,
						...(pendingPrompt ? { pendingPrompt } : {}),
					})
				}
				onOpenDiff={openDiff}
				onOpenFile={onOpenFile}
				onOpenPage={openPage}
				onOpenLink={openLink}
				onOpenHistory={onOpenHistory}
				onNewChat={agentId ? onNewChat : undefined}
				sessionId={data.sessionId}
				terminalId={data.terminalId}
				workspaceId={workspaceId}
			/>
			<LinkHoverHint hoverLabel={null} hoverPosition={null} clickHint={hint} />
		</>
	);
}
