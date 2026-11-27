import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { HarnessFactory } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { ACP_HARNESSES } from "./acpCatalogue";
import { agentLoginCommand } from "./agentLogin";
import { resolveForkAcpCli } from "./forkAcpLaunch";

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

export async function resolveAcpLaunch(
	db: HostDb,
	options: Parameters<HarnessFactory>[0],
	projectId?: string,
	signal?: AbortSignal,
) {
	const entry = ACP_HARNESSES[options.harness];
	if (!entry) throw new Error("Unsupported ACP harness");
	const cli = await resolveForkAcpCli(db, entry, options, projectId, signal);
	const loginCommand = agentLoginCommand(entry.binary, cli.env);
	const identity = { command: cli.command, version: cli.version };
	if (!entry.adapter) return { ...cli, loginCommand, identity };
	return {
		identity,
		command: process.execPath,
		args: [resolveAdapterEntry(entry.adapter), ...entry.args],
		env: {
			...cli.env,
			...entry.adapterEnv,
			ELECTRON_RUN_AS_NODE: "1",
			[entry.executableEnv]: cli.command,
		},
		loginCommand,
	};
}
export type AcpLaunch = Awaited<ReturnType<typeof resolveAcpLaunch>>;
