import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { BackupManifest, RootMapping } from "./fork-types";

export function contains(parent: string, child: string) {
	const rel = relative(parent, child);
	return (
		rel === "" ||
		(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
	);
}

export async function canonical(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		const parent = resolve(path, "..");
		if (parent === path) return path;
		return resolve(await canonical(parent), basename(path));
	}
}

export function pathMapper(
	manifest: BackupManifest,
	mappings: RootMapping[],
	home: string,
	hostId: string,
) {
	const pairs = manifest.roots.flatMap((root) => {
		const target = mappings.find((mapping) => mapping.id === root.id)?.target;
		if (!target) throw new Error("backup_mapping_missing");
		return [root.path, ...root.aliases].map((path) => [path, target] as const);
	});
	for (const [alias, physical] of Object.entries(manifest.aliases)) {
		const owner = manifest.roots.find((root) => contains(root.path, physical));
		const target = mappings.find((mapping) => mapping.id === owner?.id)?.target;
		if (owner && target)
			pairs.push([alias, resolve(target, relative(owner.path, physical))]);
	}
	pairs.push([manifest.home, home]);
	pairs.sort((a, b) => b[0].length - a[0].length);
	const embedded = new RegExp(
		`(^|[\\s"'=:(])(${pairs.map(([source]) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[/\\s"',;)])`,
		"g",
	);
	return (input: string): string => {
		if (manifest.hostId && input.includes(manifest.hostId))
			input = input.replaceAll(manifest.hostId, hostId);
		const pair = pairs.find(
			([source]) => input === source || input.startsWith(`${source}/`),
		);
		if (pair) return pair[1] + input.slice(pair[0].length);
		if (input.startsWith("file://")) {
			try {
				const url = new URL(input);
				const match = pairs.find(([source]) =>
					contains(source, decodeURIComponent(url.pathname)),
				);
				if (match) {
					url.pathname =
						match[1] + decodeURIComponent(url.pathname).slice(match[0].length);
					return url.href;
				}
			} catch {}
		}
		return input.replace(
			embedded,
			(_match, prefix: string, source: string) =>
				prefix + (pairs.find(([from]) => from === source)?.[1] ?? source),
		);
	};
}

export function mapJson(
	value: unknown,
	map: (value: string) => string,
): unknown {
	if (typeof value === "string") {
		try {
			if (value.startsWith("{") || value.startsWith("["))
				return JSON.stringify(mapJson(JSON.parse(value), map));
		} catch {}
		return map(value);
	}
	if (Array.isArray(value)) return value.map((entry) => mapJson(entry, map));
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				map(key),
				mapJson(entry, map),
			]),
		);
	return value;
}

export async function validateTargets(
	mappings: RootMapping[],
	home: string,
	forbidden: string[],
) {
	const targets: string[] = [];
	for (const mapping of mappings) {
		if (!isAbsolute(mapping.target) || mapping.target.includes("\0"))
			throw new Error("backup_target_invalid");
		const path = await canonical(mapping.target);
		if (
			(!contains(home, path) &&
				/^\/(System|usr|bin|sbin|Applications|etc|private|var|dev)(\/|$)/.test(
					path,
				)) ||
			path.split("/").filter(Boolean).length < 3
		)
			throw new Error("backup_target_invalid");
		if (
			path !== resolve(mapping.target) ||
			contains(path, home) ||
			forbidden.some((file) => contains(path, file))
		)
			throw new Error("backup_target_invalid");
		if (targets.some((other) => contains(other, path) || contains(path, other)))
			throw new Error("backup_target_overlap");
		try {
			if ((await lstat(path)).isSymbolicLink())
				throw new Error("backup_target_invalid");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		targets.push(path);
	}
}
