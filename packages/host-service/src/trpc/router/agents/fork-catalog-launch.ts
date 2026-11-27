import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	getAgentEffortSupport,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import {
	CURSOR_CONTEXT_ID,
	splitCursorContext,
} from "@superset/shared/fork-cursor-context";
import { TRPCError } from "@trpc/server";
import { acpHarnessForPreset } from "../../../chat-v3/acpCatalogue";
import { getForkModelCatalog } from "../../../chat-v3/forkModelCatalog";
import type { HostDb } from "../../../db";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";

type Launch = {
	agent: string;
	model?: string;
	effort?: string;
	modelCatalog?: "agent";
	accountSelection?: string | null;
	workspaceId?: string;
};
export interface ForkCatalogLaunchContext {
	projectId?: string;
	pendingWorkspace?: boolean;
}
interface Choices {
	models: SessionConfigOption["options"];
	efforts: SessionConfigOption["options"];
	modelArgs: string[];
	effortArgs: string[];
}
const verified = new WeakMap<object, Choices>();
export const forkCatalogChoices = (input: object) => verified.get(input);

export async function prepareForkCatalogLaunch<T extends Launch>(
	db: HostDb,
	input: T,
	context: ForkCatalogLaunchContext = {},
	load: typeof getForkModelCatalog = getForkModelCatalog,
): Promise<T> {
	if (input.modelCatalog !== "agent" || (!input.model && !input.effort))
		return input;
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "agent_config_unavailable",
		});
	const preset = resolveAgentLaunchPresetId(config.presetId, config.command);
	if (!acpHarnessForPreset(preset)) return input;
	const selection =
		preset === "cursor-agent" && input.model
			? splitCursorContext(input.model)
			: undefined;
	const baseModel = selection?.model ?? input.model;
	const catalog = await load(db, {
		agent: config.id,
		accountSelection: input.accountSelection,
		projectId: context.projectId,
		workspaceId:
			!context.pendingWorkspace &&
			!context.projectId &&
			input.workspaceId &&
			input.workspaceId !== "pending"
				? input.workspaceId
				: undefined,
		model: baseModel,
	});
	const models =
		catalog.configOptions.find((o) => o.category === "model")?.options ?? [];
	const efforts =
		catalog.configOptions.find((o) => o.category === "thought_level")
			?.options ?? [];
	const picked = models.find((option) => option.id === baseModel);
	if (baseModel && !picked)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"The selected model is no longer available. Refresh the model list.",
		});
	if (
		selection?.context &&
		!catalog.configOptions
			.find((option) => option.id === CURSOR_CONTEXT_ID)
			?.options.some((option) => option.id === selection.context)
	)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The selected context window is not available for this model.",
		});
	if (input.effort && !efforts.some((o) => o.id === input.effort))
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The selected effort is not available for this model.",
		});
	const modelFlag = getAgentModelSupport(preset)?.modelFlag;
	const support = getAgentEffortSupport(preset);
	let model = input.model;
	if (preset === "cursor-agent" && input.effort) {
		const settings = [
			selection?.context && `${CURSOR_CONTEXT_ID}=${selection.context}`,
			`effort=${input.effort}`,
		].filter(Boolean);
		model = `${baseModel ?? catalog.configOptions.find((o) => o.category === "model")?.currentValue}[${settings.join(",")}]`;
	}
	verified.set(input, {
		models:
			selection?.context && picked && input.model
				? [...models, { ...picked, id: input.model }]
				: models,
		efforts,
		modelArgs: model && modelFlag ? [modelFlag, model] : [],
		effortArgs:
			input.effort && support?.effortFlag
				? [
						support.effortFlag,
						`${support.effortValuePrefix ?? ""}${input.effort}`,
					]
				: [],
	});
	return input;
}
