import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { autoCompactUnit, validAutoCompactValue } from "./fork-auto-compact";

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function parse(
	text: string | undefined,
	decode: (text: string) => unknown = JSON.parse,
) {
	try {
		return object(text && decode(text));
	} catch {
		return {};
	}
}

function read(path: string, decode: (text: string) => unknown = JSON.parse) {
	try {
		return parse(readFileSync(path, "utf8"), decode);
	} catch {
		return {};
	}
}

function configuredValue(presetId: string, env: NodeJS.ProcessEnv) {
	switch (presetId) {
		case "claude": {
			const key = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE";
			const settings = read(
				join(
					env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
					"settings.json",
				),
			);
			return env[key] ?? object(settings.env)[key];
		}
		case "grok": {
			const key = "auto_compact_threshold_percent";
			const grokHome = env.GROK_HOME || join(homedir(), ".grok");
			const overlayFile = env.GROK_CONFIG_PATH;
			const overlay = env.GROK_CONFIG
				? parse(env.GROK_CONFIG)
				: overlayFile
					? read(
							overlayFile,
							overlayFile.endsWith(".json") ? JSON.parse : parseToml,
						)
					: {};
			return (
				env.GROK_AUTO_COMPACT_THRESHOLD_PERCENT ??
				object(overlay.session)[key] ??
				object(read(join(grokHome, "config.toml"), parseToml).session)[key] ??
				object(read(join(grokHome, "managed_config.toml"), parseToml).session)[
					key
				] ??
				85
			);
		}
		case "codex": {
			const key = "model_auto_compact_token_limit";
			const settings = read(
				join(env.CODEX_HOME || join(homedir(), ".codex"), "config.toml"),
				parseToml,
			);
			const profile =
				typeof settings.profile === "string"
					? object(object(settings.profiles)[settings.profile])
					: {};
			return parse(env.CODEX_CONFIG)[key] ?? profile[key] ?? settings[key];
		}
		case "opencode": {
			const global =
				env.OPENCODE_CONFIG_DIR ||
				join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode");
			const overrides = env.OPENCODE_CONFIG
				? read(env.OPENCODE_CONFIG, parseJsonc)
				: {};
			const compaction = {
				...object(read(join(global, "opencode.json"), parseJsonc).compaction),
				...object(read(join(global, "opencode.jsonc"), parseJsonc).compaction),
				...object(overrides.compaction),
				...object(parse(env.OPENCODE_CONFIG_CONTENT, parseJsonc).compaction),
			};
			return compaction.buffer ?? compaction.reserved;
		}
		default:
			return undefined;
	}
}

export function forkAutoCompactDefault(
	presetId: string,
	env: NodeJS.ProcessEnv,
): number | null {
	const unit = autoCompactUnit(presetId);
	const configured = configuredValue(presetId, env);
	const value =
		typeof configured === "string" ? Number(configured) : configured;
	return unit && validAutoCompactValue(unit, value) ? value : null;
}
