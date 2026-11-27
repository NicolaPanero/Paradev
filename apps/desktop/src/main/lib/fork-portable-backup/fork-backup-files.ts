import { readlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonical } from "./fork-paths";

export class BackupFiles {
	private parents = new Set<string>();
	private required: Set<string>;
	private excluded: Set<string>;

	constructor(
		excluded: string[],
		required: string[],
		readonly replacements = new Map<string, string>(),
	) {
		this.excluded = new Set(excluded);
		this.required = new Set(required);
		for (const path of required) {
			for (
				let parent = dirname(path);
				parent !== dirname(parent);
				parent = dirname(parent)
			) {
				if (this.parents.has(parent)) break;
				this.parents.add(parent);
			}
		}
		for (const path of replacements.keys()) {
			for (const suffix of ["-wal", "-shm", "-journal"]) {
				this.excluded.add(path + suffix);
			}
		}
	}

	includes(path: string, walk = false) {
		if (walk && this.parents.has(path)) return true;
		for (let current = path; ; current = dirname(current)) {
			if (this.required.has(current)) return true;
			if (this.excluded.has(current)) return false;
			if (current === dirname(current)) return true;
		}
	}

	async includesLink(path: string) {
		const target = resolve(dirname(path), await readlink(path));
		return this.includes(target) && this.includes(await canonical(target));
	}
}
