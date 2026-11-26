import { expect, test } from "bun:test";
import type { getForkModelCatalog } from "../../../chat-v3/forkModelCatalog";
import { hostAgentConfigs } from "../../../db/schema";
import { createTestDb } from "../pull-requests/shared/test-db";
import {
	buildTerminalAgentLaunch,
	chatLaunchTarget,
	validateAgentLaunchOptions,
} from "./agents";
import { prepareForkCatalogLaunch } from "./fork-catalog-launch";

test("discovered models and efforts survive workspace validation and launch instead of falling back to defaults", async () => {
	const db = createTestDb();
	try {
		db.insert(hostAgentConfigs)
			.values({
				id: "cursor",
				presetId: "cursor-agent",
				label: "Cursor",
				command: "cursor-agent",
				promptTransport: "argv",
				displayOrder: 0,
			})
			.run();
		const load: typeof getForkModelCatalog = async () => ({
			fetchedAt: 1,
			configOptions: [
				{
					id: "model",
					label: "Model",
					category: "model",
					currentValue: "gemini-next",
					options: [{ id: "gemini-next", label: "Gemini Next" }],
				},
				{
					id: "native-effort",
					label: "Effort",
					category: "thought_level",
					options: [{ id: "high", label: "High" }],
				},
			],
		});
		const input = await prepareForkCatalogLaunch(
			db,
			{
				agent: "cursor",
				model: "gemini-next",
				effort: "high",
				modelCatalog: "agent" as const,
				surface: "chat" as const,
				prompt: "hello",
				workspaceId: "workspace",
			},
			{},
			load,
		);
		expect(() => validateAgentLaunchOptions(db, input)).not.toThrow();
		expect(buildTerminalAgentLaunch(db, input).fullCommand).toContain(
			"gemini-next[effort=high]",
		);
		expect(chatLaunchTarget(db, input)?.harness).toBe("cursor-acp");
		await expect(
			prepareForkCatalogLaunch(
				db,
				{ ...input, model: "removed-model" },
				{},
				load,
			),
		).rejects.toThrow("no longer available");
	} finally {
		db.$client.close();
	}
});

test("workspace preflight discovers models in the project before the new workspace exists", async () => {
	const db = createTestDb();
	try {
		db.insert(hostAgentConfigs)
			.values({
				id: "cursor",
				presetId: "cursor-agent",
				label: "Cursor",
				command: "cursor-agent",
				promptTransport: "argv",
				displayOrder: 0,
			})
			.run();
		let received: Parameters<typeof getForkModelCatalog>[1] | undefined;
		const load: typeof getForkModelCatalog = async (_db, input) => {
			received = input;
			return {
				fetchedAt: 1,
				configOptions: [
					{
						id: "model",
						label: "Model",
						category: "model",
						options: [{ id: "argon", label: "Argon" }],
					},
				],
			};
		};
		await prepareForkCatalogLaunch(
			db,
			{
				agent: "cursor",
				model: "argon",
				modelCatalog: "agent",
				workspaceId: "new-workspace-not-created",
			},
			{ projectId: "project" },
			load,
		);
		expect(received?.projectId).toBe("project");
		expect(received?.workspaceId).toBeUndefined();
	} finally {
		db.$client.close();
	}
});

test("validates Cursor's requested context against the selected model and keeps it on launch", async () => {
	const db = createTestDb();
	try {
		db.insert(hostAgentConfigs)
			.values({
				id: "cursor",
				presetId: "cursor-agent",
				label: "Cursor",
				command: "cursor-agent",
				promptTransport: "argv",
				displayOrder: 0,
			})
			.run();
		const load: typeof getForkModelCatalog = async (_db, request) => {
			expect(request.model).toBe("model-x");
			return {
				fetchedAt: 1,
				configOptions: [
					{
						id: "model",
						category: "model",
						label: "Model",
						options: [{ id: "model-x", label: "Model X" }],
					},
					{
						id: "context",
						category: "model_config",
						label: "Context window",
						options: [
							{ id: "300k", label: "300K" },
							{ id: "1m", label: "1M" },
						],
					},
					{
						id: "effort",
						category: "thought_level",
						label: "Effort",
						options: [{ id: "high", label: "High" }],
					},
				],
			};
		};
		const request = {
			agent: "cursor",
			workspaceId: "workspace",
			modelCatalog: "agent" as const,
			surface: "chat" as const,
			prompt: "",
			effort: "high",
			model: "model-x[context=1m]",
		};
		const input = await prepareForkCatalogLaunch(db, request, {}, load);
		expect(chatLaunchTarget(db, input)?.harness).toBe("cursor-acp");
		expect(buildTerminalAgentLaunch(db, input).fullCommand).toContain(
			"model-x[context=1m,effort=high]",
		);
		await expect(
			prepareForkCatalogLaunch(
				db,
				{ ...request, model: "model-x[context=2m]" },
				{},
				load,
			),
		).rejects.toThrow("context window is not available");
	} finally {
		db.$client.close();
	}
});
