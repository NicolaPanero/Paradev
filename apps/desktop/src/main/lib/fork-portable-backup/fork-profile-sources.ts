import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { BackupEnvironment } from "./fork-types";

const builtins = [
	{
		name: "Claude Code",
		paths: [".claude", ".claude.json", ".config/claude"],
		service: "Claude Code-credentials",
	},
	{ name: "Codex", paths: [".codex"] },
	{
		name: "Cursor",
		paths: [".cursor", ".config/cursor"],
		service: "cursor-access-token",
	},
	{ name: "Grok", paths: [".grok", ".config/grok"] },
	{ name: "Gemini", paths: [".gemini"], service: "gemini" },
	{
		name: "OpenCode",
		paths: [
			".config/opencode",
			".local/share/opencode",
			".opencode",
			".local/state/opencode",
		],
	},
	{ name: "Copilot", paths: [".copilot"] },
	{ name: "Amp", paths: [".amp"] },
	{ name: "Pi", paths: [".pi"] },
	{ name: "Factory", paths: [".factory"] },
	{ name: "Aider", paths: [".aider.conf.yml"] },
	{ name: "Continue", paths: [".continue"] },
] as const;

const shared = [
	".agents",
	".config/gh",
	".config/git",
	".gitconfig",
	".git-credentials",
	".ssh",
	".zshrc",
	".zprofile",
	".bashrc",
	".bash_profile",
	".profile",
	".npmrc",
	".bunfig.toml",
	".config/fish",
	".config/starship.toml",
];
const profileName = /^\.(claude|codex)([-_]|$)/;

export const profileEnvironment = [
	"CLAUDE_CONFIG_DIR",
	"CODEX_HOME",
	"CURSOR_CONFIG_DIR",
	"GEMINI_CLI_HOME",
	"GROK_CONFIG_DIR",
];

export function profileEnvironmentPaths(json: string) {
	try {
		const env = JSON.parse(json) as Record<string, unknown> | null;
		return profileEnvironment.flatMap((key) =>
			typeof env?.[key] === "string" ? [env[key]] : [],
		);
	} catch {
		return [];
	}
}

export interface ProfileSource {
	name: string;
	paths: string[];
	service?: string;
}

export async function optionalDirectory(path: string) {
	try {
		return (await readdir(path)).sort();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return [];
	}
}

export async function defaultProfileSources(env: BackupEnvironment) {
	const homes = (await optionalDirectory(env.home))
		.filter(
			(name) =>
				name !== ".claude" && name !== ".codex" && profileName.test(name),
		)
		.map((name) => join(env.home, name));

	return {
		shared: shared.map((name) => join(env.home, name)),
		builtins: builtins.map(
			(source): ProfileSource => ({
				name: source.name,
				paths: source.paths.map((path) => join(env.home, path)),
				service: "service" in source ? source.service : undefined,
			}),
		),
		homes,
	};
}

export async function exists(path: string) {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return false;
	}
}

export function namedProfile(
	path: string,
	name?: string | null,
): ProfileSource {
	return { name: name || basename(path), paths: [resolve(path)] };
}
