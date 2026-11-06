import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessFactory } from "@superset/chat-runtime";

/** Every Claude login's config folder: `~/.claude` and the `~/.claude-*` profiles. */
export function claudeConfigDirs(
	home = homedir(),
	extra: (string | null | undefined)[] = [],
): string[] {
	let names: string[] = [];
	try {
		names = readdirSync(home).filter(
			(name) => name === ".claude" || name.startsWith(".claude-"),
		);
	} catch {}
	return [
		...new Set([
			...names.map((name) => join(home, name)),
			...extra.filter((dir): dir is string => typeof dir === "string"),
		]),
	];
}

export function claudeTranscriptExists(
	sessionId: string,
	configDirs: string[],
): boolean {
	for (const dir of configDirs) {
		const projects = join(dir, "projects");
		let entries: string[];
		try {
			entries = readdirSync(projects);
		} catch {
			continue;
		}
		if (
			entries.some((project) =>
				existsSync(join(projects, project, `${sessionId}.jsonl`)),
			)
		)
			return true;
	}
	return false;
}

/**
 * A Claude chat opened and closed before its first message has no transcript,
 * so a strict resume can only fail with "Resource not found". When no login
 * holds the conversation, reopen it without strict resume: the agent still
 * tries to load it, and starts a new conversation when it is missing.
 */
export function withForkEmptyResume(
	factory: HarnessFactory,
	exists: (sessionId: string, accountSelection?: string | null) => boolean = (
		sessionId,
		accountSelection,
	) =>
		claudeTranscriptExists(
			sessionId,
			claudeConfigDirs(homedir(), [accountSelection]),
		),
): HarnessFactory {
	return (options) => {
		const adapter = factory(options);
		const sessionId = options.resume?.harnessSessionId;
		if (
			options.harness !== "claude-acp" ||
			!options.strictResume ||
			!sessionId ||
			exists(sessionId, options.accountSelection)
		)
			return adapter;
		return new Proxy(adapter, {
			get(target, property) {
				if (property === "start")
					return (startOptions: Parameters<typeof target.start>[0]) =>
						target.start({ ...startOptions, strictResume: false });
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	};
}
