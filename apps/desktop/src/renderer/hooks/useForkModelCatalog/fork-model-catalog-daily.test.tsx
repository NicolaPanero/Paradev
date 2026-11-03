import { expect, spyOn, test } from "bun:test";
import type { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	act,
	flush,
	queryFixture,
	renderHook,
} from "renderer/test-utils/fork-ui";
import { useForkModelCatalog } from "./useForkModelCatalog";

const DAY = 24 * 60 * 60_000;
const catalog = (model: string, fetchedAt: number) => ({
	configOptions: [
		{
			id: "model",
			label: "Model",
			category: "model" as const,
			currentValue: model,
			options: [{ id: model, label: model }],
		},
	],
	fetchedAt,
});

test("account and workspace changes reuse the agent catalog for 24 hours; another agent has its own catalog", async () => {
	let now = Date.now();
	const clock = spyOn(Date, "now").mockImplementation(() => now);
	const calls: string[] = [];
	const client = (() => ({
		agents: {
			modelCatalog: {
				query: async (input: { agent: string }) => {
					calls.push(input.agent);
					return catalog(input.agent, now);
				},
			},
		},
	})) as unknown as typeof getHostServiceClientByUrl;
	const fixture = queryFixture();
	const props = {
		agent: "claude",
		accountSelection: "/a",
		workspaceId: "one",
		enabled: true,
	};
	try {
		const view = renderHook(
			(selection) =>
				useForkModelCatalog(
					{ hostUrl: "http://daily-host", ...selection },
					client,
				),
			{
				wrapper: fixture.wrapper,
				initialProps: props,
			},
		);
		await flush();
		expect(calls).toEqual(["claude"]);
		view.rerender({ ...props, accountSelection: "/b", workspaceId: "two" });
		expect(view.result.current.models[0]?.id).toBe("claude");
		await flush();
		expect(calls).toHaveLength(1);
		view.rerender({ ...props, agent: "codex" });
		await flush();
		expect(calls).toEqual(["claude", "codex"]);
		view.rerender(props);
		await flush();
		expect(view.result.current.models[0]?.id).toBe("claude");
		expect(calls).toHaveLength(2);
		now += DAY - 1;
		view.rerender({ ...props, enabled: false });
		view.rerender(props);
		await flush();
		expect(calls).toHaveLength(2);
		now += 2;
		view.rerender({ ...props, enabled: false });
		view.rerender(props);
		expect(view.result.current.models[0]?.id).toBe("claude");
		await flush();
		expect(calls).toEqual(["claude", "codex", "claude"]);
	} finally {
		clock.mockRestore();
	}
});

test("an expired catalog saved by the host stays visible while its daily refresh completes", async () => {
	let finish!: (value: ReturnType<typeof catalog>) => void;
	const refresh = new Promise<ReturnType<typeof catalog>>((resolve) => {
		finish = resolve;
	});
	const client = (() => ({
		agents: {
			modelCatalog: {
				query: (input: { refresh?: boolean }) =>
					input.refresh
						? refresh
						: Promise.resolve(catalog("saved", Date.now() - DAY - 1)),
			},
		},
	})) as unknown as typeof getHostServiceClientByUrl;
	const fixture = queryFixture();
	const view = renderHook(
		() =>
			useForkModelCatalog(
				{ hostUrl: "http://saved-host", agent: "claude" },
				client,
			),
		{ wrapper: fixture.wrapper },
	);
	await flush();
	expect(view.result.current.models[0]?.id).toBe("saved");
	expect(view.result.current.isFetching).toBe(true);
	await act(async () => {
		finish(catalog("updated", Date.now()));
	});
	await flush();
	expect(view.result.current.models[0]?.id).toBe("updated");
	expect(view.result.current.isFetching).toBe(false);
});
