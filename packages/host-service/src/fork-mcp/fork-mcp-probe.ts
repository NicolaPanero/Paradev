import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ForkMcpServer } from "./fork-mcp-servers";

export type ForkMcpProbeReason =
	| "auth"
	| "unreachable"
	| "command"
	| "timeout"
	| "failed";

export type ForkMcpProbe =
	| {
			state: "online";
			tools: { name: string; description?: string }[];
			checkedAt: number;
	  }
	| {
			state: "offline";
			reason: ForkMcpProbeReason;
			httpStatus?: number;
			message: string;
			checkedAt: number;
	  };

const MAX_TOOL_PAGES = 20;
const STDERR_LIMIT = 2_000;

function reasonOf(
	error: unknown,
	code: unknown,
	timedOut: boolean,
): ForkMcpProbeReason {
	if (timedOut) return "timeout";
	if (code === 401 || code === 403) return "auth";
	if (code === "ENOENT" || code === "EACCES") return "command";
	if (
		code === "ECONNREFUSED" ||
		code === "ConnectionRefused" ||
		code === "ENOTFOUND" ||
		code === "EAI_AGAIN"
	)
		return "unreachable";
	const text = `${(error as Error)?.message ?? error} ${String((error as { cause?: unknown })?.cause ?? "")}`;
	if (/\b40[13]\b|unauthori[sz]ed|forbidden/i.test(text)) return "auth";
	if (
		/ECONNREFUSED|ConnectionRefused|ENOTFOUND|EAI_AGAIN|fetch failed|Unable to connect|typo in the url/i.test(
			text,
		)
	)
		return "unreachable";
	if (/ENOENT|spawn/i.test(text)) return "command";
	return "failed";
}

/**
 * Connects to one server the way an agent would, lists its tools and
 * disconnects. A stdio server runs only for this check.
 */
export async function probeForkMcpServer(
	server: ForkMcpServer,
	{
		env = process.env as Record<string, string>,
		timeoutMs = 10_000,
		now = Date.now,
	}: {
		env?: Record<string, string>;
		timeoutMs?: number;
		now?: () => number;
	} = {},
): Promise<ForkMcpProbe> {
	let stderr = "";
	let transport: Transport;
	if (server.transport === "stdio") {
		const stdio = new StdioClientTransport({
			command: server.command,
			args: server.args,
			env: { ...env, ...server.env },
			stderr: "pipe",
		});
		stdio.stderr?.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT);
		});
		transport = stdio;
	} else {
		const init = { requestInit: { headers: server.headers } };
		transport =
			server.transport === "http"
				? new StreamableHTTPClientTransport(new URL(server.url), init)
				: new SSEClientTransport(new URL(server.url), init);
	}
	const client = new Client({ name: "paradev-fork-mcp-check", version: "1" });
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			timedOut = true;
			reject(new Error(`No answer within ${Math.round(timeoutMs / 1000)}s`));
		}, timeoutMs);
	});
	try {
		const tools = await Promise.race([
			(async () => {
				await client.connect(transport);
				const listed: { name: string; description?: string }[] = [];
				let cursor: string | undefined;
				for (let page = 0; page < MAX_TOOL_PAGES; page++) {
					const result = await client.listTools(cursor ? { cursor } : {});
					for (const tool of result.tools)
						listed.push({
							name: tool.name,
							...(tool.description ? { description: tool.description } : {}),
						});
					cursor = result.nextCursor;
					if (!cursor) break;
				}
				return listed;
			})(),
			deadline,
		]);
		return { state: "online", tools, checkedAt: now() };
	} catch (error) {
		const problem = error as { code?: unknown; cause?: { code?: unknown } };
		const code = problem?.code ?? problem?.cause?.code;
		const detail = stderr.trim().split("\n").at(-1)?.trim();
		const message = (error as Error)?.message ?? String(error);
		return {
			state: "offline",
			reason: reasonOf(error, code, timedOut),
			...(server.transport !== "stdio" && (code === 401 || code === 403)
				? { httpStatus: code }
				: {}),
			message: (detail && !timedOut ? `${message} — ${detail}` : message).slice(
				0,
				300,
			),
			checkedAt: now(),
		};
	} finally {
		clearTimeout(timer);
		await client.close().catch(() => {});
		await transport.close().catch(() => {});
	}
}
