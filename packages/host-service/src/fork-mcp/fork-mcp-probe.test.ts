import { expect, test } from "bun:test";
import { join } from "node:path";
import { probeForkMcpServer } from "./fork-mcp-probe";

const stdio = (command: string, args: string[] = []) => ({
	transport: "stdio" as const,
	name: "test",
	enabled: true,
	command,
	args,
	env: {},
});
const http = (url: string) => ({
	transport: "http" as const,
	name: "test",
	enabled: true,
	url,
	headers: {},
});

test("a working server reports its tools", async () => {
	const result = await probeForkMcpServer(
		stdio(process.execPath, [
			join(import.meta.dir, "fixtures/fork-mcp-echo-server.ts"),
		]),
	);
	expect(result.state).toBe("online");
	if (result.state === "online")
		expect(result.tools.map((tool) => tool.name)).toEqual(["echo", "time"]);
});

test("each failure says why: missing command, no answer, sign-in, closed port", async () => {
	const missing = await probeForkMcpServer(stdio("fork-mcp-missing-command"));
	expect(missing).toMatchObject({ state: "offline", reason: "command" });

	const silent = await probeForkMcpServer(stdio("sleep", ["5"]), {
		timeoutMs: 200,
	});
	expect(silent).toMatchObject({ state: "offline", reason: "timeout" });

	const locked = Bun.serve({
		port: 0,
		fetch: () => new Response("Unauthorized", { status: 401 }),
	});
	const auth = await probeForkMcpServer(
		http(`http://127.0.0.1:${locked.port}/mcp`),
	);
	locked.stop(true);
	expect(auth).toMatchObject({ state: "offline", reason: "auth" });

	const closed = await probeForkMcpServer(
		http(`http://127.0.0.1:${locked.port}/mcp`),
		{
			timeoutMs: 2_000,
		},
	);
	expect(closed).toMatchObject({ state: "offline", reason: "unreachable" });
});
