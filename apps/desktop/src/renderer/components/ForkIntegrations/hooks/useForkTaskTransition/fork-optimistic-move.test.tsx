import { afterEach, expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { waitFor } from "@testing-library/react";
import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { act, queryFixture, renderHook } from "renderer/test-utils/fork-ui";
import superjson from "superjson";
import { z } from "zod";
import { useForkTaskTransition } from "./useForkTaskTransition";

const task: ForkTask = {
	id: "1",
	key: "J-1",
	connectionId: "jira",
	title: "Move me",
	description: "",
	url: "https://jira.test/J-1",
	status: { id: "todo", name: "To do", category: "new" },
	priority: null,
	assignee: null,
	labels: [],
};
const done = { id: "done", name: "Done", category: "done" };
const transition = { id: "31", name: "Done", to: done, fields: [] };

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.stop(true);
});

function setup(refuse: boolean) {
	let answer: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		answer = resolve;
	});
	let listed = 0;
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		forkConnections: t.router({
			list: t.procedure.query(() => ({ version: 10, connections: [] })),
		}),
		forkTasks: t.router({
			list: t.procedure.input(z.any()).query(() => {
				listed++;
				return { items: [task], nextCursor: null };
			}),
			transitions: t.procedure.input(z.any()).query(() => [transition]),
			transition: t.procedure.input(z.any()).mutation(async () => {
				await gate;
				if (refuse)
					throw new TRPCError({ code: "BAD_REQUEST", message: "Not allowed" });
				return { ...task, status: done };
			}),
		}),
	});
	const server = Bun.serve({
		port: 0,
		fetch: (req) =>
			fetchRequestHandler({
				req,
				endpoint: "/trpc",
				router,
				createContext: () => ({}),
				allowMethodOverride: true,
			}),
	});
	servers.push(server);
	const host = server.url.origin;
	const query = queryFixture();
	const listKey = ["fork-integrations", host, "tasks", "jira", "project = J"];
	query.client.setQueryData(listKey, {
		pages: [{ items: [task], nextCursor: null }],
		pageParams: [undefined],
	});
	const statusInList = () =>
		(
			query.client.getQueryData(listKey) as {
				pages: { items: ForkTask[] }[];
			}
		).pages[0]?.items[0]?.status.id;
	const view = renderHook(() => useForkTaskTransition(task, true, () => {}), {
		wrapper: ({ children }) => (
			<query.wrapper>
				<LocalHostServiceContext.Provider
					value={{
						machineId: "m",
						activeHostUrl: host,
						activeOrganizationId: "org",
						activeOrganizationName: "Test",
						hostServiceStatus: "running",
						waitForHostReady: async () => host,
					}}
				>
					{children}
				</LocalHostServiceContext.Provider>
			</query.wrapper>
		),
	});
	return { view, answer, statusInList, listed: () => listed };
}

test("a moved card changes column before Jira answers and is not reloaded from the lagging search", async () => {
	const { view, answer, statusInList, listed } = setup(false);
	await waitFor(() => expect(view.result.current.supported).toBe(true));
	act(() => view.result.current.choose(transition));
	await waitFor(() => expect(statusInList()).toBe("done"));
	expect(view.result.current.mutation.isPending).toBe(true);
	answer();
	await waitFor(() =>
		expect(view.result.current.mutation.isSuccess).toBe(true),
	);
	expect(statusInList()).toBe("done");
	expect(listed()).toBe(0);
});

test("a move Jira refuses puts the card back", async () => {
	const { view, answer, statusInList } = setup(true);
	await waitFor(() => expect(view.result.current.supported).toBe(true));
	act(() => view.result.current.choose(transition));
	await waitFor(() => expect(statusInList()).toBe("done"));
	answer();
	await waitFor(() => expect(view.result.current.mutation.isError).toBe(true));
	expect(statusInList()).toBe("todo");
});
