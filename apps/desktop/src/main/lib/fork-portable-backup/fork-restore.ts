import { randomUUID } from "node:crypto";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readFile,
	rename,
	rm,
	stat,
	statfs,
	writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { decrypt, encrypt } from "@superset/shared/auth-token-crypto";
import { extractArchive, inspectArchive } from "./fork-archive";
import { walk } from "./fork-inventory";
import { readKeychain, remapKeychain, writeKeychain } from "./fork-keychain";
import { pathMapper, validateTargets } from "./fork-paths";
import { remapStaged } from "./fork-remap";
import type { BackupEnvironment, Progress, RootMapping } from "./fork-types";

interface Journal {
	version: 1;
	pid: number;
	committed: boolean;
	keychainBefore: string | null;
	keychainChanged: boolean;
	roots: {
		target: string;
		stage: string;
		previous: string;
		hadPrevious: boolean;
	}[];
}

async function exists(path: string) {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function save(path: string, journal: Journal) {
	const temporary = `${path}.tmp`;
	await writeFile(temporary, JSON.stringify(journal), { mode: 0o600 });
	const file = await open(temporary, "r+");
	try {
		await file.sync();
	} finally {
		await file.close();
	}
	await rename(temporary, path);
}

export async function guardPortableOperation(journalPath: string) {
	const path = `${journalPath}.lock`;
	if (!(await exists(path))) return;
	const { pid, partial } = JSON.parse(await readFile(path, "utf8")) as {
		pid: number;
		partial?: { path: string; ino: number; dev: number };
	};
	if (!Number.isSafeInteger(pid) || pid <= 1)
		throw new Error("backup_lock_invalid");
	let running = false;
	try {
		process.kill(pid, 0);
		running = true;
	} catch {}
	if (running) throw new Error("backup_operation_in_progress");
	if (partial && (await exists(partial.path))) {
		const file = await lstat(partial.path);
		if (
			file.isFile() &&
			file.ino === partial.ino &&
			file.dev === partial.dev &&
			/\.[a-f0-9]{16}\.partial$/.test(partial.path)
		)
			await rm(partial.path);
	}
	await rm(path);
}

export async function recoverRestore(journalPath: string, allowOwnPid = false) {
	if (!(await exists(journalPath))) return;
	const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
	if (journal.version !== 1 || !Array.isArray(journal.roots))
		throw new Error("backup_recovery_invalid");
	if (!(allowOwnPid && journal.pid === process.pid)) {
		let running = false;
		try {
			process.kill(journal.pid, 0);
			running = true;
		} catch {}
		if (running) throw new Error("backup_restore_running");
	}
	if (!journal.committed) {
		if (journal.keychainChanged && journal.keychainBefore)
			await writeKeychain(
				JSON.parse(decrypt(Buffer.from(journal.keychainBefore, "base64"))),
			);
		for (const root of [...journal.roots].reverse()) {
			if (await exists(root.previous)) {
				if (await exists(root.target)) {
					if (await exists(root.stage))
						throw new Error("backup_recovery_conflict");
					await rename(root.target, root.stage);
				}
				await rename(root.previous, root.target);
			} else if (
				!root.hadPrevious &&
				!(await exists(root.stage)) &&
				(await exists(root.target))
			)
				await rename(root.target, root.stage);
		}
	}
	for (const root of journal.roots) {
		if (await exists(root.stage))
			for await (const entry of walk(root.stage, "linked"))
				if (entry.stat.isDirectory())
					await chmod(entry.path, entry.stat.mode | 0o700);
		await rm(root.stage, { recursive: true, force: true });
	}
	await rm(journalPath);
}

export async function restoreArchive(options: {
	archive: string;
	password: string;
	mappings: RootMapping[];
	env: BackupEnvironment;
	journalPath: string;
	progress?: Progress;
	signal?: AbortSignal;
	keychain?: boolean;
	expectedManifest?: unknown;
}) {
	const { archive, password, mappings, env, journalPath, signal } = options;
	const info = await inspectArchive(archive, password);
	if (
		options.expectedManifest &&
		!isDeepStrictEqual(info.manifest, options.expectedManifest)
	)
		throw new Error("backup_archive_changed");
	if (info.manifest.platform !== process.platform)
		throw new Error("backup_platform_mismatch");
	if (
		info.manifest.roots.length !== mappings.length ||
		new Set(mappings.map((mapping) => mapping.id)).size !== mappings.length ||
		info.manifest.roots.some(
			(root) => !mappings.find((mapping) => mapping.id === root.id),
		)
	)
		throw new Error("backup_mapping_missing");
	await validateTargets(mappings, env.home, [
		archive,
		journalPath,
		`${journalPath}.tmp`,
		`${journalPath}.lock`,
	]);
	await recoverRestore(journalPath);
	const id = randomUUID();
	const credentialsSafety = `${journalPath}.keychain-before-${id}.enc`;
	const journal: Journal = {
		version: 1,
		pid: process.pid,
		committed: false,
		keychainBefore: null,
		keychainChanged: false,
		roots: [],
	};
	const volumes = new Map<number, { available: number; required: number }>();
	for (const root of info.manifest.roots) {
		const target = mappings.find((mapping) => mapping.id === root.id)?.target;
		if (!target) throw new Error("backup_mapping_missing");
		await mkdir(dirname(target), { recursive: true, mode: 0o700 });
		const disk = await statfs(dirname(target));
		const device = (await stat(dirname(target))).dev;
		const budget = volumes.get(device) ?? {
			available: disk.bavail * disk.bsize,
			required: 0,
		};
		budget.required += root.bytes * 1.05 + 64 * 1024 * 1024;
		volumes.set(device, budget);
		if (budget.available < budget.required)
			throw new Error("backup_disk_space");
		journal.roots.push({
			target,
			stage: `${target}.paradev-stage-${id}`,
			previous: `${target}.before-paradev-restore-${id}`,
			hadPrevious: await exists(target),
		});
	}
	await save(journalPath, journal);
	try {
		const stages = Object.fromEntries(
			info.manifest.roots.map((root, index) => [
				root.id,
				journal.roots[index]?.stage ?? "",
			]),
		);
		const extracted = await extractArchive(
			archive,
			password,
			stages,
			options.progress,
			signal,
		);
		const { manifest } = extracted;
		if (JSON.stringify(manifest) !== JSON.stringify(info.manifest))
			throw new Error("backup_archive_changed");
		await remapStaged(manifest, stages, mappings, env);
		await extracted.finalize();
		signal?.throwIfAborted();
		if (options.keychain !== false) {
			const items = remapKeychain(
				manifest,
				pathMapper(manifest, mappings, env.home, env.hostId),
				env.home,
			);
			const current = await readKeychain([
				...new Set(items.map((item) => item.service)),
			]);
			const undo = items.map((item) => ({
				...item,
				data:
					current.find(
						(row) =>
							row.service === item.service && row.account === item.account,
					)?.data ?? null,
			}));
			journal.keychainBefore = encrypt(JSON.stringify(undo)).toString("base64");
			journal.keychainChanged = true;
			await save(journalPath, journal);
			await writeFile(
				credentialsSafety,
				Buffer.from(journal.keychainBefore, "base64"),
				{ flag: "wx", mode: 0o600 },
			);
			await writeKeychain(items);
		}
		for (const root of journal.roots) {
			if (root.hadPrevious) await rename(root.target, root.previous);
			await rename(root.stage, root.target);
		}
		journal.committed = true;
		await save(journalPath, journal);
		await recoverRestore(journalPath, true);
		return [
			...journal.roots
				.filter((root) => root.hadPrevious)
				.map((root) => root.previous),
			...(options.keychain !== false ? [credentialsSafety] : []),
		];
	} catch (error) {
		await recoverRestore(journalPath, true);
		throw error;
	}
}
