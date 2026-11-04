import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createForkMcpStatus,
	ForkMcpListInvalidError,
	type ForkMcpServer,
	forkMcpPaths,
	probeForkMcpServer,
	readForkMcpServers,
	readForkMcpServersForUpdate,
	writeForkMcpServers,
} from "../../../fork-mcp";
import { MCP_SERVER_NAME } from "../../../fork-mcp/fork-mcp-servers";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
import { protectedProcedure, router } from "../../index";

/** Stdio servers start with the shell environment that agents get. */
async function agentShellEnv(): Promise<Record<string, string>> {
	await waitForTerminalBaseEnv();
	try {
		return getTerminalBaseEnv();
	} catch {
		return process.env as Record<string, string>;
	}
}

const serverStatus = createForkMcpStatus(async (server) =>
	probeForkMcpServer(server, { env: await agentShellEnv() }),
);

function editableServers(): ForkMcpServer[] {
	try {
		return readForkMcpServersForUpdate();
	} catch (error) {
		if (error instanceof ForkMcpListInvalidError)
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error.message,
			});
		throw error;
	}
}

const secretInput = z.array(
	z.object({ name: z.string().min(1), value: z.string().optional() }),
);

const serverInput = z.discriminatedUnion("transport", [
	z.object({
		transport: z.literal("stdio"),
		name: z.string().regex(MCP_SERVER_NAME),
		enabled: z.boolean(),
		command: z.string().min(1),
		args: z.array(z.string()),
		env: secretInput,
	}),
	z.object({
		transport: z.enum(["http", "sse"]),
		name: z.string().regex(MCP_SERVER_NAME),
		enabled: z.boolean(),
		url: z.string().url(),
		headers: secretInput,
	}),
]);

/** Names only: header and env values are secrets and never leave the host. */
function publicServer(server: ForkMcpServer) {
	return server.transport === "stdio"
		? {
				transport: server.transport,
				name: server.name,
				enabled: server.enabled,
				command: server.command,
				args: server.args,
				secretNames: Object.keys(server.env),
			}
		: {
				transport: server.transport,
				name: server.name,
				enabled: server.enabled,
				url: server.url,
				secretNames: Object.keys(server.headers),
			};
}

/** An empty value keeps the one already stored under that name. */
export function mergeSecrets(
	entries: z.infer<typeof secretInput>,
	previous: Record<string, string>,
): Record<string, string> {
	const merged: Record<string, string> = {};
	for (const entry of entries) {
		const value = entry.value || previous[entry.name];
		if (value === undefined)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Enter a value for ${entry.name}`,
			});
		merged[entry.name] = value;
	}
	return merged;
}

function previousSecrets(server: ForkMcpServer | undefined) {
	if (!server) return {};
	return server.transport === "stdio" ? server.env : server.headers;
}

export const forkMcpRouter = router({
	list: protectedProcedure.query(() => ({
		path: forkMcpPaths().servers,
		servers: readForkMcpServers().map(publicServer),
	})),

	/** Connects to an enabled server and lists its tools; null when disabled. */
	status: protectedProcedure
		.input(z.object({ name: z.string(), refresh: z.boolean().optional() }))
		.query(({ input }) => {
			const server = readForkMcpServers().find(
				(candidate) => candidate.name === input.name,
			);
			if (!server)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "server_unavailable",
				});
			return server.enabled ? serverStatus(server, input.refresh) : null;
		}),

	save: protectedProcedure
		.input(
			z.object({
				originalName: z.string().optional(),
				server: serverInput,
			}),
		)
		.mutation(({ input }) => {
			const servers = editableServers();
			const previous = servers.find(
				(server) => server.name === (input.originalName ?? input.server.name),
			);
			if (
				input.server.name !== input.originalName &&
				servers.some((server) => server.name === input.server.name)
			)
				throw new TRPCError({
					code: "CONFLICT",
					message: `A server named ${input.server.name} already exists`,
				});
			const secrets = previousSecrets(previous);
			const next: ForkMcpServer =
				input.server.transport === "stdio"
					? {
							...input.server,
							env: mergeSecrets(input.server.env, secrets),
						}
					: {
							...input.server,
							headers: mergeSecrets(input.server.headers, secrets),
						};
			writeForkMcpServers(
				previous
					? servers.map((server) => (server === previous ? next : server))
					: [...servers, next],
			);
			return { success: true as const };
		}),

	setEnabled: protectedProcedure
		.input(z.object({ name: z.string(), enabled: z.boolean() }))
		.mutation(({ input }) => {
			writeForkMcpServers(
				editableServers().map((server) =>
					server.name === input.name
						? { ...server, enabled: input.enabled }
						: server,
				),
			);
			return { success: true as const };
		}),

	remove: protectedProcedure
		.input(z.object({ name: z.string() }))
		.mutation(({ input }) => {
			writeForkMcpServers(
				editableServers().filter((server) => server.name !== input.name),
			);
			return { success: true as const };
		}),
});
