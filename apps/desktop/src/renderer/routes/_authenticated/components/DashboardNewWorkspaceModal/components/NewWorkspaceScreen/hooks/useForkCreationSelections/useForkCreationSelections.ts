import {
	getAgentEfforts,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useForkCreationAccount } from "renderer/components/ForkAccountPicker";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
import {
	agentLaunchPreset,
	catalogModelSelection,
} from "renderer/lib/fork-model-options";
import {
	EFFORT_STORAGE_KEY,
	MODEL_STORAGE_KEY,
} from "../../../DashboardNewWorkspaceForm/PromptGroup/types";
import { useLaunchModels } from "../useLaunchModels";

function usesForkCatalog(presetId: string | null) {
	return (
		presetId === "claude" || presetId === "codex" || presetId === "cursor-agent"
	);
}

export function useForkCreationSelections(input: {
	hostUrl: string | null;
	agent: string;
	agents: AgentSelectAgent[];
	presetId: string | null;
	projectId: string | null;
	resetKey: number;
	enabled: boolean;
}) {
	const forkModel = !!input.hostUrl && usesForkCatalog(input.presetId);
	const preference = useLaunchModels({
		agents: input.hostUrl
			? input.agents.filter(
					(agent) => !usesForkCatalog(agentLaunchPreset(agent)),
				)
			: input.agents,
		selectedAgent: input.agent,
		selectedPresetId: input.presetId,
		hostUrl: input.enabled ? input.hostUrl : null,
		projectId: input.hostUrl ? (input.projectId ?? undefined) : undefined,
		storageKey: MODEL_STORAGE_KEY,
	});
	const effort = useAgentEffortPreference(
		EFFORT_STORAGE_KEY,
		input.presetId,
		true,
	);
	const forkAccount = useForkCreationAccount(
		input.hostUrl,
		input.agent,
		input.presetId,
		preference.selectedModel,
		input.resetKey,
	);
	const forkCatalog = useForkModelCatalog({
		hostUrl: input.hostUrl,
		agent: input.agent,
		accountSelection: forkAccount.selection,
		projectId: input.projectId ?? undefined,
		model: preference.selectedModel,
		enabled:
			forkModel &&
			input.enabled &&
			((input.presetId !== "claude" && input.presetId !== "codex") ||
				forkAccount.available),
	});
	const runtime = preference.catalogs[input.agent];
	const models = forkModel
		? forkCatalog.models
		: (preference.modelSupport?.models ?? []);
	const selectedModel = forkModel
		? catalogModelSelection(forkCatalog, preference.selectedModel)
		: preference.modelForLaunch;
	const preset = input.presetId;
	const knownEffortModel =
		!selectedModel ||
		getAgentModelSupport(preset ?? "")?.models.some(
			(entry) => entry.id === selectedModel,
		);
	const efforts = forkModel
		? forkCatalog.efforts
		: preset && knownEffortModel
			? getAgentEfforts(preset, selectedModel ?? undefined)
			: [];
	const effortForLaunch = efforts.some((o) => o.id === effort.selectedEffort)
		? effort.selectedEffort
		: null;
	return {
		...preference,
		selectedModel,
		defaultEffortLabel: selectedModel
			? undefined
			: preference.defaultEffortLabel,
		...effort,
		effortForLaunch,
		forkAccount,
		catalog: {
			models,
			configOptions: forkCatalog.configOptions,
			supportsCursorContext: forkCatalog.supportsCursorContext,
			isFetching: forkModel ? forkCatalog.isFetching : !!runtime?.loading,
			isError: forkModel && forkCatalog.isError,
			refetch: forkModel ? forkCatalog.refetch : runtime?.load,
		},
		effortOptions: efforts,
	};
}
