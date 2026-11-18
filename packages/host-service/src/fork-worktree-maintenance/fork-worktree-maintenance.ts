import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { lstat, readdir, rmdir } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import {
	resolveAppHomeDir,
	resolveUserHomeDir,
} from "@superset/agent-setup/paths";
import { TRPCError } from "@trpc/server";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { projectFolders, workspaceFolderWorktrees } from "../db/fork-schema";
import { projects, workspaces } from "../db/schema";
import { getHostWorktreeBaseDir } from "../trpc/router/settings/worktree-location";
import {
	forkCanonicalPath,
	forkPathsOverlap,
	isInsideForkProjectWorktreesRoot,
	isInsideForkSessionsRoot,
} from "../trpc/router/workspace-cleanup/fork-managed-worktree-paths";
import {
	assertForkWorktreeUnshared,
	forkOtherProfilePaths,
} from "../trpc/router/workspace-cleanup/fork-worktree-ownership";
import { removeDirectoryTree } from "../trpc/router/workspace-cleanup/remove-directory-tree";
import type { HostServiceContext } from "../types";
import { installedWorktreePreview } from "./fork-installed-preview";
import {
	backUpMaintenanceFolder,
	maintenanceBusyPaths,
	maintenanceCommand,
	readMaintenanceGitState,
	unregisterMaintenanceWorktree,
} from "./fork-worktree-git";

const VERSION = "deleted-worktrees-v1";
type Context = Pick<HostServiceContext, "db" | "organizationId">;
const cutoffs = new WeakMap<Context["db"], number>();

const entrySchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	name: z.string(),
	project: z.string().nullable(),
	path: z.string(),
	branch: z.string(),
	archivedAt: z.number(),
	folderId: z.string().nullable(),
	bytes: z.number(),
	contents: z.array(z.string()),
	device: z.number(),
	inode: z.number(),
	birthtime: z.number(),
	git: z
		.object({
			common: z.string(),
			head: z.string(),
			branch: z.string(),
			fingerprint: z.string(),
		})
		.nullable(),
});
const planSchema = z.object({
	id: z.string(),
	createdAt: z.number(),
	entries: z.array(entrySchema),
	skipped: z.number(),
});
const resultSchema = z.object({
	removed: z.number(),
	skipped: z.number(),
	failed: z.number(),
	backup: z.string().nullable(),
	issues: z
		.array(
			z.object({ path: z.string(), status: z.enum(["skipped", "failed"]) }),
		)
		.default([]),
});
const stateSchema = z.object({
	version: z.literal(VERSION),
	cutoff: z.number(),
	scanned: z.boolean(),
	pending: z.boolean(),
	plan: planSchema.nullable(),
	result: resultSchema.nullable(),
});
type Entry = z.infer<typeof entrySchema>;
type Plan = z.infer<typeof planSchema>;
type State = z.infer<typeof stateSchema>;

export type ForkCleanupPreview = ReturnType<typeof publicPlan>;
export type ForkCleanupResult = z.infer<typeof resultSchema>;

function publicPlan(
	plan: Plan,
	readOnly: boolean,
	activeWorkspaces: number,
	archivedWorkspaces: number,
) {
	return {
		readOnly,
		activeWorkspaces,
		archivedWorkspaces,
		id: plan.id,
		createdAt: plan.createdAt,
		skipped: plan.skipped,
		entries: plan.entries.map(
			({
				id,
				workspaceId,
				name,
				project,
				path,
				branch,
				archivedAt,
				bytes,
				contents,
			}) => ({
				id,
				workspaceId,
				name,
				project,
				path,
				branch,
				archivedAt,
				bytes,
				contents,
			}),
		),
	};
}

async function folderBytes(path: string): Promise<number> {
	if (process.platform !== "win32")
		return (
			Number.parseInt(await maintenanceCommand("du", ["-sk", path]), 10) * 1024
		);
	let bytes = 0;
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const child = join(path, entry.name);
		bytes += entry.isDirectory()
			? await folderBytes(child)
			: (await lstat(child)).size;
	}
	return bytes;
}

export class ForkWorktreeMaintenance {
	private state: State;
	private operation: Promise<unknown> | null = null;
	private readonly file: string;
	constructor(
		private ctx: Context,
		private options: {
			home?: string;
			appHome?: string;
			busy?: () => Promise<string[]>;
			profiles?: () => string[];
			bytes?: (path: string) => Promise<number>;
			readOnly?: boolean;
		} = {},
	) {
		const org = createHash("sha256")
			.update(ctx.organizationId)
			.digest("hex")
			.slice(0, 16);
		this.file = join(
			options.appHome ?? resolveAppHomeDir(),
			"fork",
			"worktree-cleanup",
			org,
			"state.json",
		);
		this.state = existsSync(this.file)
			? stateSchema.parse(JSON.parse(readFileSync(this.file, "utf8")))
			: {
					version: VERSION,
					cutoff: Date.now(),
					scanned: false,
					pending: false,
					plan: null,
					result: null,
				};
		cutoffs.set(ctx.db, this.state.cutoff);
		this.save();
	}
	private get home() {
		return this.options.home ?? resolveUserHomeDir();
	}
	private expose(plan: Plan) {
		const active = this.ctx.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(isNull(workspaces.archivedAt))
			.all().length;
		const archived = this.ctx.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(isNotNull(workspaces.archivedAt))
			.all().length;
		return publicPlan(plan, this.options.readOnly ?? false, active, archived);
	}
	private save() {
		mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
		const temporary = `${this.file}.${process.pid}.tmp`;
		writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
		renameSync(temporary, this.file);
	}
	private exclusive<T>(work: () => Promise<T>): Promise<T> {
		if (this.operation)
			throw new TRPCError({
				code: "CONFLICT",
				message: "Worktree maintenance is already running",
			});
		const running = work();
		this.operation = running;
		return running.finally(() => {
			this.operation = null;
		});
	}
	private eligible(workspaceId: string, path: string, folderId: string | null) {
		const workspace = this.ctx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (
			!workspace ||
			workspace.archivedAt === null ||
			workspace.type === "local"
		)
			return null;
		const project = workspace.projectId
			? this.ctx.db
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get()
			: null;
		if (
			project?.deletedAt != null ||
			(workspace.type !== "session" && !project)
		)
			return null;
		let repoPath = project?.repoPath ?? null;
		if (folderId) {
			const folder = this.ctx.db
				.select()
				.from(projectFolders)
				.where(eq(projectFolders.id, folderId))
				.get();
			const link = this.ctx.db
				.select()
				.from(workspaceFolderWorktrees)
				.where(eq(workspaceFolderWorktrees.workspaceId, workspaceId))
				.all()
				.find((row) => row.folderId === folderId && row.worktreePath === path);
			if (
				!folder ||
				!link ||
				folder.projectId !== workspace.projectId ||
				join(
					dirname(workspace.worktreePath),
					`${basename(workspace.worktreePath)}--${basename(folder.path)}-${folder.id.slice(0, 6)}`,
				) !== path
			)
				return null;
			repoPath = folder.path;
		} else if (workspace.worktreePath !== path) return null;
		const managed =
			workspace.type === "session"
				? isInsideForkSessionsRoot(path, this.home)
				: project &&
					isInsideForkProjectWorktreesRoot(
						path,
						project,
						project.worktreeBaseDir ?? getHostWorktreeBaseDir(this.ctx),
						this.home,
					);
		if (!managed) return null;
		assertForkWorktreeUnshared(this.ctx, workspaceId, path, this.home);
		const profiles =
			this.options.profiles?.() ?? forkOtherProfilePaths(this.home);
		if (profiles.some((keep) => forkPathsOverlap(path, keep))) return null;
		return { workspace, project, repoPath };
	}
	private async scan(): Promise<Plan> {
		const entries: Entry[] = [];
		let skipped = 0;
		const seen = new Set<string>();
		const archived = this.ctx.db
			.select()
			.from(workspaces)
			.where(isNotNull(workspaces.archivedAt))
			.all();
		for (const row of archived) {
			if (row.archivedAt === null) continue;
			const paths = [
				{ path: row.worktreePath, folderId: null as string | null },
				...this.ctx.db
					.select()
					.from(workspaceFolderWorktrees)
					.where(eq(workspaceFolderWorktrees.workspaceId, row.id))
					.all()
					.map((folder) => ({
						path: folder.worktreePath,
						folderId: folder.folderId,
					})),
			];
			for (const { path, folderId } of paths) {
				if (!existsSync(path)) continue;
				try {
					const owner = this.eligible(row.id, path, folderId);
					const stat = await lstat(path);
					const real = forkCanonicalPath(path);
					if (
						!owner ||
						!stat.isDirectory() ||
						stat.birthtimeMs <= 0 ||
						stat.birthtimeMs > (row.archivedAt ?? 0) ||
						seen.has(real)
					) {
						skipped++;
						continue;
					}
					const git = await readMaintenanceGitState(path);
					if (git && git.branch !== row.branch) {
						skipped++;
						continue;
					}
					seen.add(real);
					entries.push({
						id: randomUUID(),
						workspaceId: row.id,
						name: row.name || basename(path),
						project: owner.project?.name ?? null,
						path,
						branch: row.branch,
						archivedAt: row.archivedAt,
						folderId,
						bytes: await (this.options.bytes ?? folderBytes)(path),
						contents: (await readdir(path))
							.filter((name) => name !== ".git")
							.slice(0, 8),
						device: stat.dev,
						inode: stat.ino,
						birthtime: stat.birthtimeMs,
						git,
					});
				} catch {
					skipped++;
				}
			}
		}
		return {
			id: randomUUID(),
			createdAt: Date.now(),
			entries: entries.sort((a, b) => b.path.length - a.path.length),
			skipped,
		};
	}
	async initialPreview(): Promise<ForkCleanupPreview | null> {
		if (!this.state.scanned) {
			if (this.operation) await this.operation;
			if (!this.state.scanned)
				await this.exclusive(async () => {
					this.state.plan = await this.scan();
					this.state.scanned = true;
					this.state.pending = this.state.plan.entries.length > 0;
					this.save();
				});
		}
		return this.state.pending && this.state.plan
			? this.expose(this.state.plan)
			: null;
	}
	async preview(): Promise<ForkCleanupPreview> {
		return this.exclusive(async () => {
			this.state.plan = await this.scan();
			this.save();
			return this.expose(this.state.plan);
		});
	}
	dismissInitial() {
		this.state.pending = false;
		this.save();
	}
	async apply(planId: string, ids: string[]): Promise<ForkCleanupResult> {
		if (this.options.readOnly)
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Deletion is disabled for installed-data previews",
			});
		return this.exclusive(async () => {
			const plan = this.state.plan;
			if (
				!plan ||
				plan.id !== planId ||
				Date.now() - plan.createdAt > 30 * 60_000
			)
				throw new TRPCError({
					code: "CONFLICT",
					message: "Cleanup preview expired; scan again",
				});
			const selected = new Set(ids);
			if (
				[...selected].some(
					(id) => !plan.entries.some((entry) => entry.id === id),
				)
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown cleanup selection",
				});
			const backup = join(dirname(this.file), "backups", randomUUID());
			const result: ForkCleanupResult = {
				removed: 0,
				skipped: 0,
				failed: 0,
				backup: null,
				issues: [],
			};
			const busy = await (this.options.busy ?? maintenanceBusyPaths)();
			for (const entry of plan.entries.filter((row) => selected.has(row.id))) {
				try {
					if (
						plan.entries.some(
							(other) =>
								other.id !== entry.id &&
								other.path.startsWith(`${entry.path}${sep}`) &&
								existsSync(other.path),
						)
					) {
						result.skipped++;
						result.issues.push({ path: entry.path, status: "skipped" });
						continue;
					}
					const owner = this.eligible(
						entry.workspaceId,
						entry.path,
						entry.folderId,
					);
					const stat = await lstat(entry.path).catch(() => null);
					if (
						!owner ||
						owner.workspace.archivedAt !== entry.archivedAt ||
						!stat?.isDirectory() ||
						stat.dev !== entry.device ||
						stat.ino !== entry.inode ||
						stat.birthtimeMs !== entry.birthtime ||
						busy.some(
							(cwd) =>
								forkPathsOverlap(entry.path, cwd) &&
								forkCanonicalPath(cwd).startsWith(
									forkCanonicalPath(entry.path),
								),
						)
					) {
						result.skipped++;
						result.issues.push({ path: entry.path, status: "skipped" });
						continue;
					}
					const git = await readMaintenanceGitState(entry.path);
					if (git?.fingerprint !== entry.git?.fingerprint) {
						result.skipped++;
						result.issues.push({ path: entry.path, status: "skipped" });
						continue;
					}
					result.backup = backup;
					await backUpMaintenanceFolder(
						entry.path,
						join(backup, entry.id),
						git,
						owner.workspace.type === "session",
					);
					const ready = await lstat(entry.path);
					if (
						!ready.isDirectory() ||
						ready.dev !== entry.device ||
						ready.ino !== entry.inode ||
						ready.birthtimeMs !== entry.birthtime ||
						!this.eligible(entry.workspaceId, entry.path, entry.folderId) ||
						(await readMaintenanceGitState(entry.path))?.fingerprint !==
							git?.fingerprint
					) {
						result.skipped++;
						result.issues.push({ path: entry.path, status: "skipped" });
						continue;
					}
					await unregisterMaintenanceWorktree(
						forkCanonicalPath(entry.path),
						git,
						owner.workspace.type === "session",
						owner.repoPath,
						entry.branch,
						join(backup, entry.id),
					);
					if (existsSync(entry.path)) {
						const latest = await lstat(entry.path);
						if (
							!this.eligible(entry.workspaceId, entry.path, entry.folderId) ||
							!latest.isDirectory() ||
							latest.dev !== entry.device ||
							latest.ino !== entry.inode
						)
							throw new Error("Folder ownership changed during cleanup");
						await removeDirectoryTree(entry.path);
					}
					if (existsSync(entry.path))
						throw new Error("Folder remains after cleanup");
					result.removed++;
					await this.pruneParents(entry.path);
				} catch (error) {
					result.failed++;
					result.issues.push({ path: entry.path, status: "failed" });
					console.warn("[fork-worktree-maintenance] folder cleanup failed", {
						path: entry.path,
						error,
					});
				}
			}
			if (result.backup) {
				mkdirSync(backup, { recursive: true, mode: 0o700 });
				writeFileSync(
					join(backup, "report.json"),
					JSON.stringify({ plan, result }),
					{ mode: 0o600 },
				);
			}
			this.state.result = result;
			this.state.pending = false;
			this.state.plan = null;
			this.save();
			return result;
		});
	}
	private async pruneParents(path: string) {
		const configured = this.ctx.db
			.select({ base: projects.worktreeBaseDir })
			.from(projects)
			.all()
			.map((row) => row.base)
			.filter((base): base is string => !!base);
		const hostBase = getHostWorktreeBaseDir(this.ctx);
		if (hostBase) configured.push(hostBase);
		let parent = dirname(path);
		for (let depth = 0; depth < 8; depth++) {
			if (
				!existsSync(parent) ||
				configured.some(
					(base) => forkCanonicalPath(base) === forkCanonicalPath(parent),
				) ||
				["worktrees", "sessions"].includes(basename(parent)) ||
				(await readdir(parent)).length
			)
				return;
			try {
				assertForkWorktreeUnshared(this.ctx, "", parent, this.home);
				await rmdir(parent);
			} catch {
				return;
			}
			parent = dirname(parent);
		}
	}
}

const services = new WeakMap<Context["db"], ForkWorktreeMaintenance>();
export function forkWorktreeMaintenance(ctx: Context) {
	let service = services.get(ctx.db);
	if (!service) {
		const source = installedWorktreePreview();
		service = new ForkWorktreeMaintenance(
			source ? { ...ctx, ...source } : ctx,
			{ readOnly: !!source },
		);
		services.set(ctx.db, service);
	}
	return service;
}
export function deferForkHistoricalDelete(
	ctx: Pick<Context, "db">,
	archivedAt: number | null,
): boolean {
	const cutoff = cutoffs.get(ctx.db);
	return cutoff !== undefined && archivedAt !== null && archivedAt <= cutoff;
}
export function startForkWorktreeMaintenance(ctx: Context): void {
	try {
		void forkWorktreeMaintenance(ctx)
			.initialPreview()
			.catch((error) =>
				console.warn(
					"[fork-worktree-maintenance] initial preview failed",
					error,
				),
			);
	} catch (error) {
		console.warn("[fork-worktree-maintenance] initial preview failed", error);
	}
}
