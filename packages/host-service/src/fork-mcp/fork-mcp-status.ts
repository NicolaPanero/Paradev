import { createHash } from "node:crypto";
import { type ForkMcpProbe, probeForkMcpServer } from "./fork-mcp-probe";
import type { ForkMcpServer } from "./fork-mcp-servers";

const FRESH_MS = 60_000;
const MAX_RUNNING = 3;

type Probe = (server: ForkMcpServer) => Promise<ForkMcpProbe>;

/**
 * One check per server and configuration at a time, reused for a minute.
 * A stdio check starts the server, so only a few run at once.
 */
export function createForkMcpStatus(
	probe: Probe = (server) => probeForkMcpServer(server),
	now = Date.now,
) {
	const results = new Map<
		string,
		{ fingerprint: string; at: number; value: Promise<ForkMcpProbe> }
	>();
	let running = 0;
	const waiting: Array<() => void> = [];
	const slot = async <T>(work: () => Promise<T>): Promise<T> => {
		if (running >= MAX_RUNNING)
			await new Promise<void>((resolve) => waiting.push(resolve));
		else running++;
		try {
			return await work();
		} finally {
			const next = waiting.shift();
			if (next) next();
			else running--;
		}
	};
	return (server: ForkMcpServer, refresh = false): Promise<ForkMcpProbe> => {
		const fingerprint = createHash("sha256")
			.update(JSON.stringify(server))
			.digest("hex");
		const cached = results.get(server.name);
		if (
			!refresh &&
			cached?.fingerprint === fingerprint &&
			now() - cached.at < FRESH_MS
		)
			return cached.value;
		const value = slot(() => probe(server));
		results.set(server.name, { fingerprint, at: now(), value });
		return value;
	};
}
