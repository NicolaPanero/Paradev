import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup";
import { writeFileIfChanged } from "@superset/agent-setup/write-file-if-changed";
import { type ParseError, parse as parseJsonc } from "jsonc-parser";

const units = {
	claude: "percent",
	codex: "tokens",
	grok: "percent",
	opencode: "reserved",
} as const;
type Unit = (typeof units)[keyof typeof units];
type Agent = { id: string; presetId: string };

export function autoCompactUnit(presetId: string): Unit | null {
	return Object.hasOwn(units, presetId)
		? units[presetId as keyof typeof units]
		: null;
}

export function validAutoCompactValue(
	unit: Unit,
	value: unknown,
): value is number {
	return (
		typeof value === "number" &&
		Number.isSafeInteger(value) &&
		value >= (unit === "reserved" ? 0 : 1) &&
		(unit !== "percent" || value <= 100)
	);
}

export function forkAutoCompactStore(
	directory = join(resolveAppHomeDir(), "fork", "auto-compact"),
) {
	const file = (id: string) =>
		join(directory, `${createHash("sha256").update(id).digest("hex")}.json`);
	return {
		read(agent: Agent): number | null {
			const unit = autoCompactUnit(agent.presetId);
			if (!unit) return null;
			try {
				const saved = JSON.parse(readFileSync(file(agent.id), "utf8"));
				return saved?.presetId === agent.presetId &&
					validAutoCompactValue(unit, saved.value)
					? saved.value
					: null;
			} catch {
				return null;
			}
		},
		write(agent: Agent, value: number | null): void {
			const unit = autoCompactUnit(agent.presetId);
			if (!unit || (value !== null && !validAutoCompactValue(unit, value)))
				throw new Error("invalid_auto_compact_value");
			const path = file(agent.id);
			if (value === null) {
				rmSync(path, { force: true });
				return;
			}
			mkdirSync(directory, { recursive: true, mode: 0o700 });
			writeFileIfChanged(
				path,
				JSON.stringify({ presetId: agent.presetId, value }),
				0o600,
			);
		},
	};
}

export function forkAutoCompactLaunch<T extends NodeJS.ProcessEnv>(
	agent: Agent | null,
	env: T,
	surface: "acp" | "terminal",
	store = forkAutoCompactStore(),
): { env: T; args: string[] } {
	const value = agent && store.read(agent);
	if (value === null) return { env, args: [] };
	switch (agent?.presetId) {
		case "claude":
			return {
				env: { ...env, CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(value) },
				args: [],
			};
		case "grok":
			return {
				env: { ...env, GROK_AUTO_COMPACT_THRESHOLD_PERCENT: String(value) },
				args: [],
			};
		case "codex": {
			const key = "model_auto_compact_token_limit";
			if (surface === "terminal")
				return { env, args: ["-c", `${key}=${value}`] };
			const config = env.CODEX_CONFIG ? JSON.parse(env.CODEX_CONFIG) : {};
			return {
				env: {
					...env,
					CODEX_CONFIG: JSON.stringify({ ...config, [key]: value }),
				},
				args: [],
			};
		}
		case "opencode": {
			const errors: ParseError[] = [];
			const config = env.OPENCODE_CONFIG_CONTENT
				? parseJsonc(env.OPENCODE_CONFIG_CONTENT, errors, {
						allowTrailingComma: true,
					})
				: {};
			if (
				errors.length ||
				!config ||
				typeof config !== "object" ||
				Array.isArray(config)
			)
				throw new Error("invalid_opencode_config");
			const compaction = {
				...config.compaction,
				reserved: value,
				buffer: value,
			};
			return {
				env: {
					...env,
					OPENCODE_CONFIG_CONTENT: JSON.stringify({ ...config, compaction }),
				},
				args: [],
			};
		}
		default:
			return { env, args: [] };
	}
}
