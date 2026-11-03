import { expect, test } from "bun:test";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkModelCatalog } from "./useForkModelCatalog";

test("opening the catalog reuses the host cache and only Refresh probes the agent again", async () => {
	const calls: Array<{ refresh?: boolean; accountSelection?: string | null }> =
		[];
	const client = (() => ({
		agents: {
			modelCatalog: {
				query: async (input: {
					refresh?: boolean;
					accountSelection?: string | null;
				}) => {
					calls.push(input);
					return { configOptions: [] };
				},
			},
		},
	})) as unknown as typeof import("renderer/lib/host-service-client").getHostServiceClientByUrl;
	const fixture = queryFixture();
	const view = renderHook(
		() =>
			useForkModelCatalog(
				{ hostUrl: "http://host", agent: "claude", accountSelection: "/work" },
				client,
			),
		{ wrapper: fixture.wrapper },
	);
	await flush();
	expect(calls).toHaveLength(1);
	expect(calls[0]?.refresh).toBe(false);
	expect(calls[0]?.accountSelection).toBe("/work");
	await act(async () => {
		await view.result.current.refetch();
	});
	expect(calls).toHaveLength(2);
	expect(calls[1]?.refresh).toBe(true);
	await act(async () => {
		await view.result.current.refetch();
	});
	expect(calls[2]?.refresh).toBe(true);
});

test("Refresh updates the model list even when a model with separate effort options is selected", async () => {
	let expanded = false;
	const client = (() => ({
		agents: {
			modelCatalog: {
				query: async (input: { model?: string; refresh?: boolean }) => {
					if (input.refresh) expanded = true;
					return {
						fetchedAt: Date.now(),
						configOptions: [
							{
								id: "model",
								label: "Model",
								category: "model",
								currentValue: input.model ?? "default-model",
								options: [
									"default-model",
									"chosen-model",
									...(expanded ? ["new-model"] : []),
								].map((id) => ({ id, label: id })),
							},
							{
								id: "effort",
								label: "Effort",
								category: "thought_level",
								options: [{ id: "high", label: "High" }],
							},
						],
					};
				},
			},
		},
	})) as unknown as typeof import("renderer/lib/host-service-client").getHostServiceClientByUrl;
	const fixture = queryFixture();
	const view = renderHook(
		() =>
			useForkModelCatalog(
				{
					hostUrl: "http://refresh-host",
					agent: "claude",
					model: "chosen-model",
				},
				client,
			),
		{ wrapper: fixture.wrapper },
	);
	await flush();
	expect(
		view.result.current.models.some((model) => model.id === "new-model"),
	).toBe(false);
	await act(async () => {
		await view.result.current.refetch();
	});
	expect(
		view.result.current.models.some((model) => model.id === "new-model"),
	).toBe(true);
	expect(
		view.result.current.configOptions.find(
			(option) => option.category === "model",
		)?.currentValue,
	).toBe("chosen-model");
	expect(view.result.current.efforts[0]?.id).toBe("high");
});
