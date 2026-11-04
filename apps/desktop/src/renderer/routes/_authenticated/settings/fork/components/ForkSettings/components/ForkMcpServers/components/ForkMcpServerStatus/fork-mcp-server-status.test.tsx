import { expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	act,
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import type { ForkMcpServerSummary } from "../../hooks/useForkMcp";
import { ForkMcpServerStatus } from "./ForkMcpServerStatus";

const server = (name: string): ForkMcpServerSummary => ({
	transport: "http",
	name,
	enabled: true,
	url: "https://example.test/mcp",
	secretNames: [],
});

test("a server shows if it is online with its tools, or why it is not, and can be checked again", async () => {
	const calls: { name: string; refresh?: boolean }[] = [];
	const client = {
		forkMcp: {
			status: {
				query: async (input: { name: string; refresh?: boolean }) => {
					calls.push(input);
					return input.name === "up"
						? {
								state: "online",
								checkedAt: 0,
								tools: [{ name: "jira_get" }, { name: "jira_search" }],
							}
						: {
								state: "offline",
								reason: "unreachable",
								message: "connect ECONNREFUSED",
								checkedAt: 0,
							};
				},
			},
		},
	} as unknown as HostServiceClient;
	const fixture = queryFixture();
	const view = render(
		<>
			<ForkMcpServerStatus client={client} hostUrl="h" server={server("up")} />
			<ForkMcpServerStatus
				client={client}
				hostUrl="h"
				server={server("down")}
			/>
		</>,
		{ wrapper: fixture.wrapper },
	);
	await flush();
	expect(view.getByText(/2 tools/)).toBeTruthy();
	expect(view.getByText(/Can't reach the server/)).toBeTruthy();
	fireEvent.click(view.getByText(/2 tools/));
	expect(view.getByText("jira_search")).toBeTruthy();

	await act(async () => {
		fireEvent.click(view.getAllByLabelText("Check again")[0] as HTMLElement);
	});
	await flush();
	expect(calls.filter((call) => call.name === "up")).toEqual([
		{ name: "up", refresh: false },
		{ name: "up", refresh: true },
	]);
});
