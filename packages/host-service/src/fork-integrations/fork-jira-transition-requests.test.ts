import { expect, test } from "bun:test";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { ForkApi } from "./fork-api";
import { ForkJiraProvider } from "./fork-jira";

function jira(fail: boolean) {
	const requests: string[] = [];
	const provider = new ForkJiraProvider({
		connection: () =>
			({
				provider: "jira",
				site: "https://example.atlassian.net",
			}) as ForkConnection,
		request: async (_id: string, path: string, method = "GET") => {
			requests.push(`${method} ${path.split("?")[0]}`);
			if (path === "/rest/api/3/field") return [];
			if (path.includes("/transitions") && method === "POST") {
				if (fail)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "resolution: Field is required.",
						cause: { errors: { resolution: "Field is required." } },
					});
				return {};
			}
			if (path.includes("/transitions"))
				return {
					transitions: [
						{
							id: "done",
							name: "Done",
							fields: { resolution: { name: "Resolution", required: true } },
						},
					],
				};
			return {
				id: "1",
				key: "APP-1",
				fields: { summary: "Fix", status: { id: "done", name: "Done" } },
			};
		},
	} as unknown as ForkApi);
	return { provider, requests };
}

test("a move without fields posts at once; a rejected one still names the field", async () => {
	const ok = jira(false);
	const moved = await ok.provider.transition("jira", "APP-1", "done", {});
	expect(moved.status.id).toBe("done");
	expect(ok.requests).not.toContain("GET /rest/api/3/issue/APP-1/transitions");
	expect(ok.requests[0]).toBe("POST /rest/api/3/issue/APP-1/transitions");

	const rejected = jira(true);
	await expect(
		rejected.provider.transition("jira", "APP-1", "done", {}),
	).rejects.toThrow("Resolution: Field is required.");
});
