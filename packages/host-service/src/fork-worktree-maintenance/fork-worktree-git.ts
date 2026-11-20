import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import {
	copyFile,
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	symlink,
	writeFile,
} from "node:fs/promises";
import { devNull } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { forkCanonicalPath } from "../trpc/router/workspace-cleanup/fork-managed-worktree-paths";
import { removeDirectoryTree } from "../trpc/router/workspace-cleanup/remove-directory-tree";

export function maintenanceCommand(
	command: string,
	args: string[],
	timeout = 120_000,
): Promise<string> {
	const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
	for (const key of [
		"GIT_DIR",
		"GIT_COMMON_DIR",
		"GIT_WORK_TREE",
		"GIT_INDEX_FILE",
	])
		delete env[key];
	return new Promise((done, reject) =>
		execFile(
			command,
			args,
			{ env, timeout, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" },
			(error, stdout) => (error ? reject(error) : done(stdout)),
		),
	);
}

export const maintenanceGit = (path: string, ...args: string[]) =>
	maintenanceCommand("git", [
		"-c",
		`core.hooksPath=${devNull}`,
		"-c",
		"core.fsmonitor=false",
		"-C",
		path,
		...args,
	]);

export interface MaintenanceGitState {
	common: string;
	head: string;
	branch: string;
	fingerprint: string;
}

export async function readMaintenanceGitState(
	path: string,
): Promise<MaintenanceGitState | null> {
	try {
		const common = resolve(
			path,
			(await maintenanceGit(path, "rev-parse", "--git-common-dir")).trim(),
		);
		const head = await maintenanceGit(
			path,
			"rev-parse",
			"--verify",
			"HEAD",
		).catch(() => "");
		const branch = (
			await maintenanceGit(path, "symbolic-ref", "--short", "-q", "HEAD").catch(
				() => "",
			)
		).trim();
		const status = await maintenanceGit(
			path,
			"status",
			"--porcelain=v1",
			"-z",
			"--untracked-files=all",
		);
		const diff = await maintenanceGit(
			path,
			"diff",
			"--binary",
			...(head.trim() ? ["HEAD"] : []),
		);
		const untracked = (
			await maintenanceGit(
				path,
				"ls-files",
				"--others",
				"--exclude-standard",
				"-z",
			)
		)
			.split("\0")
			.filter(Boolean);
		let timestamps = "";
		for (const name of untracked) {
			const stat = await lstat(join(path, name));
			timestamps += `${name}\0${stat.size}\0${stat.mtimeMs}\0`;
		}
		return {
			common,
			head: head.trim(),
			branch,
			fingerprint: createHash("sha256")
				.update(common + head + branch + status + diff + timestamps)
				.digest("hex"),
		};
	} catch (error) {
		const dotGit = join(path, ".git");
		if (!existsSync(dotGit)) return null;
		const stat = await lstat(dotGit);
		if (!stat.isFile()) throw error;
		const pointer = (await readFile(dotGit, "utf8")).match(
			/^gitdir: (.+)$/m,
		)?.[1];
		if (pointer && !existsSync(resolve(path, pointer))) return null;
		throw error;
	}
}

const GENERATED = new Set([
	"node_modules",
	".next",
	".turbo",
	".cache",
	"dist",
	"build",
	"coverage",
	"target",
]);

async function copyEntry(
	source: string,
	target: string,
	excludeGenerated = false,
): Promise<void> {
	const stat = await lstat(source);
	if (stat.isDirectory()) {
		await mkdir(target, { recursive: true, mode: 0o700 });
		for (const name of await readdir(source)) {
			if (!excludeGenerated || !GENERATED.has(name))
				await copyEntry(
					join(source, name),
					join(target, name),
					excludeGenerated,
				);
		}
	} else {
		await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
		if (stat.isSymbolicLink()) await symlink(await readlink(source), target);
		else if (stat.isFile()) await copyFile(source, target);
	}
}

export async function backUpMaintenanceFolder(
	path: string,
	backup: string,
	state: MaintenanceGitState | null,
	standalone: boolean,
): Promise<void> {
	await mkdir(backup, { recursive: true, mode: 0o700 });
	await writeFile(
		join(backup, "source.json"),
		JSON.stringify({ path, ...state }),
		{ mode: 0o600 },
	);
	if (!state) {
		await copyEntry(path, join(backup, "files"), true);
		return;
	}
	for (const [name, args] of state.head
		? ([["tracked.patch", ["HEAD"]]] as const)
		: ([
				["staged.patch", ["--cached"]],
				["unstaged.patch", []],
			] as const)) {
		const patch = await maintenanceGit(path, "diff", "--binary", ...args);
		if (patch) await writeFile(join(backup, name), patch, { mode: 0o600 });
	}
	const names = (
		await maintenanceGit(
			path,
			"ls-files",
			"--others",
			"--exclude-standard",
			"-z",
		)
	)
		.split("\0")
		.filter(Boolean);
	for (const name of names) {
		if (isAbsolute(name) || name.split(/[\\/]/).includes(".."))
			throw new Error("Unsafe backup path");
		await copyEntry(join(path, name), join(backup, "untracked", name));
	}
	for (const name of await readdir(path)) {
		if (name.startsWith(".env") && (await lstat(join(path, name))).isFile())
			await copyFile(join(path, name), join(backup, name));
	}
	if (standalone && state.head)
		await maintenanceGit(
			path,
			"bundle",
			"create",
			join(backup, "history.bundle"),
			"--all",
		);
}

export async function unregisterMaintenanceWorktree(
	path: string,
	state: MaintenanceGitState | null,
	standalone: boolean,
	repoPath: string | null,
	branch: string,
	backup: string,
): Promise<void> {
	if (standalone) return;
	let common = state?.common;
	if (!common && repoPath) {
		try {
			await lstat(repoPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		common = resolve(
			repoPath,
			(await maintenanceGit(repoPath, "rev-parse", "--git-common-dir")).trim(),
		);
	}
	if (!common) throw new Error("Cannot verify the worktree registry");
	const location = relative(path, common);
	if (!isAbsolute(location) && location.split(sep)[0] !== "..")
		throw new Error("Repository metadata is inside the folder");
	const args = ["--git-dir", common, "worktree"];
	const listing = await maintenanceCommand("git", [
		...args,
		"list",
		"--porcelain",
		"-z",
	]);
	const namesPath = (item: string) =>
		item
			.split("\0")
			.some(
				(field) =>
					field.startsWith("worktree ") &&
					forkCanonicalPath(field.slice(9)) === path,
			);
	const record = listing.split("\0\0").find(namesPath);
	if (record && !record.split("\0").includes(`branch refs/heads/${branch}`))
		throw new Error("Worktree branch changed during cleanup");
	const registered = async () =>
		(await maintenanceCommand("git", [...args, "list", "--porcelain", "-z"]))
			.split("\0")
			.some(
				(field) =>
					field.startsWith("worktree ") &&
					forkCanonicalPath(field.slice(9)) === path,
			);
	if (!(await registered())) return;
	await maintenanceCommand("git", [
		...args,
		"remove",
		"--force",
		"--force",
		path,
	]).catch(() => undefined);
	if ((await registered()) && !state) {
		const admins = join(common, "worktrees");
		if (!realpathSync(admins).startsWith(realpathSync(common) + sep))
			throw new Error("Worktree metadata is outside its repository");
		for (const name of await readdir(admins)) {
			const admin = join(admins, name);
			if (!(await lstat(admin)).isDirectory()) continue;
			const pointer = (await readFile(join(admin, "gitdir"), "utf8")).trim();
			if (forkCanonicalPath(resolve(admin, pointer)) !== join(path, ".git"))
				continue;
			const head = (
				await maintenanceCommand("git", [
					"--git-dir",
					admin,
					"--work-tree",
					path,
					"symbolic-ref",
					"--quiet",
					"HEAD",
				])
			).trim();
			if (head !== `refs/heads/${branch}`)
				throw new Error("Worktree branch changed during cleanup");
			await copyEntry(admin, join(backup, "git-admin"));
			const patch = await maintenanceCommand("git", [
				"--git-dir",
				admin,
				"--work-tree",
				path,
				"diff",
				"--cached",
				"--binary",
			]);
			if (patch)
				await writeFile(join(backup, "staged.patch"), patch, { mode: 0o600 });
			await removeDirectoryTree(admin);
			break;
		}
	}
	if (await registered()) throw new Error("Git still registers this worktree");
}

export async function maintenanceBusyPaths(): Promise<string[]> {
	if (process.platform === "linux") {
		const paths = await Promise.all(
			(await readdir("/proc"))
				.filter((name) => /^\d+$/.test(name))
				.map((name) => readlink(`/proc/${name}/cwd`).catch(() => "")),
		);
		return paths.filter(Boolean);
	}
	if (process.platform === "win32") return [process.cwd()];
	return (
		await maintenanceCommand(
			"lsof",
			["-a", "-u", String(process.getuid?.()), "-d", "cwd", "-Fn"],
			15_000,
		)
	)
		.split("\n")
		.filter((line) => line.startsWith("n/"))
		.map((line) => line.slice(1));
}
