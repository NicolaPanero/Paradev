import { useLingui } from "@lingui/react/macro";
import type { AgentModelOption } from "@superset/shared/agent-models";
import {
	CURSOR_CONTEXT_ID,
	cursorModelWithContext,
	splitCursorContext,
} from "@superset/shared/fork-cursor-context";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import {
	ForkAutoCompactMenu,
	type ForkAutoCompactTarget,
} from "renderer/components/ForkAutoCompactMenu";
import { ForkModelCatalogStatus } from "renderer/components/ForkModelCatalogStatus";
import type { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
import {
	agentChoices,
	agentLaunchPreset,
	creationConfigOptions,
	cursorContextOption,
	EFFORT_CONFIG_ID,
	fromOptionValue,
	MODEL_CONFIG_ID,
} from "renderer/lib/fork-model-options";
import {
	type AgentSwitcher,
	ModelPicker,
} from "renderer/routes/_authenticated/components/AgentComposer/components/ModelPicker";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
} from "renderer/routes/_authenticated/components/AgentComposer/constants";

const NO_AGENT = "none";

export function ForkCreationModelPicker({
	agents,
	catalog,
	selectedAgent,
	onSelectAgent,
	selectedModel,
	onModelChange,
	efforts,
	selectedEffort,
	onEffortChange,
	renderAccountItem,
	fullWidth,
	autoCompact,
}: {
	agents: AgentSelectAgent[];
	catalog: ReturnType<typeof useForkModelCatalog>;
	selectedAgent: string;
	onSelectAgent: (agentId: string) => void;
	selectedModel: string | null;
	onModelChange: (model: string | null) => void;
	efforts: AgentModelOption[];
	selectedEffort: string | null;
	onEffortChange: (effort: string | null) => void;
	renderAccountItem?: (
		rowClassName: string,
		panelClassName: string,
	) => ReactNode;
	fullWidth?: boolean;
	autoCompact?: Omit<ForkAutoCompactTarget, "agent">;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const [open, setOpen] = useState(false);
	const choices = useMemo(
		() =>
			agentChoices(
				agents.filter((agent) => !agent.disabled || agent.id === selectedAgent),
				isDark,
				{ [selectedAgent]: catalog.models },
			),
		[agents, isDark, selectedAgent, catalog.models],
	);
	const current = agents.find((agent) => agent.id === selectedAgent);
	const cursor = current && agentLaunchPreset(current) === "cursor-agent";
	const context =
		cursor && catalog.supportsCursorContext
			? cursorContextOption(
					catalog.configOptions,
					selectedModel,
					t({ message: "Context window" }),
				)
			: undefined;
	const configOptions = useMemo(
		() =>
			creationConfigOptions({
				models: catalog.models,
				alwaysShowModel: selectedAgent !== NO_AGENT,
				selectedModel:
					cursor && selectedModel
						? splitCursorContext(selectedModel).model
						: selectedModel,
				efforts,
				selectedEffort,
				labels: {
					model: t({ message: "Model" }),
					effort: t({ message: "Effort" }),
					defaultModel: t({ message: "Default model" }),
					defaultEffort: t({ message: "Default effort" }),
				},
			}),
		[
			catalog.models,
			cursor,
			selectedModel,
			efforts,
			selectedEffort,
			t,
			selectedAgent,
		],
	);

	// The model preference is stored per agent, so a model picked from another
	// agent's tab applies once that agent is selected.
	const pendingModel = useRef<{ agentId: string; model: string } | null>(null);
	useEffect(() => {
		const pending = pendingModel.current;
		if (!pending || pending.agentId !== selectedAgent) return;
		pendingModel.current = null;
		onModelChange(pending.model);
	}, [selectedAgent, onModelChange]);

	const agentSwitcher: AgentSwitcher = {
		currentPresetId: current?.id ?? NO_AGENT,
		agents: choices,
		onSwitch: (agentId, model) => {
			pendingModel.current = model ? { agentId, model: model.id } : null;
			onSelectAgent(agentId);
		},
		onBrowse: (agentId) => {
			if (!agents.some((agent) => agent.id === agentId)) return;
			pendingModel.current = null;
			onSelectAgent(agentId);
		},
	};

	return (
		<ModelPicker
			fullWidth={fullWidth}
			agentSwitcher={agentSwitcher}
			configOptions={context ? [...configOptions, context] : configOptions}
			keepOpenOnPick={cursor === true}
			emptyLabel={t({ message: "No agent" })}
			open={open}
			onOpenChange={setOpen}
			settingsExtra={
				open && autoCompact?.hostUrl && selectedAgent !== NO_AGENT ? (
					<ForkAutoCompactMenu
						key={selectedAgent}
						target={{ ...autoCompact, agent: selectedAgent }}
					/>
				) : undefined
			}
			onSelect={(configId, value) => {
				if (context && selectedModel && configId === CURSOR_CONTEXT_ID)
					onModelChange(cursorModelWithContext(selectedModel, value));
				if (configId === MODEL_CONFIG_ID) onModelChange(fromOptionValue(value));
				if (configId === EFFORT_CONFIG_ID)
					onEffortChange(fromOptionValue(value));
			}}
			footer={
				<div className="flex flex-col gap-px border-t p-1 empty:hidden">
					{selectedAgent !== NO_AGENT && (
						<ForkModelCatalogStatus
							loading={catalog.isFetching}
							error={catalog.isError}
							refresh={() => {
								void catalog.refetch();
							}}
						/>
					)}
					{renderAccountItem?.(MENU_ROW_CLASS, MENU_PANEL_CLASS)}
				</div>
			}
		/>
	);
}
