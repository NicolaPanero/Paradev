import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { sanitizeSegment } from "@superset/shared/workspace-launch";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { HostDb } from "../db";
import { projectFolders } from "../db/fork-schema";
import { projects, workspaces } from "../db/schema";
import {
	isGitRepoPath,
	listProjectFolders,
} from "../project-folders/project-folders";
import { resolveLocalRepo } from "../trpc/router/project/utils/resolve-repo";
import type { HostServiceContext } from "../types";
import { forkProjectGroupError } from "./fork-project-group-error";
import { forkProjectGroups } from "./fork-project-groups-schema";
import { emitProjectChanged, getLocalProject } from "./local-project-store";

export function isForkProjectGroup(db: HostDb, id: string) {
	if (
		!db.get(
			sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fork_project_groups'`,
		)
	)
		return false;
	return !!db
		.select()
		.from(forkProjectGroups)
		.where(eq(forkProjectGroups.projectId, id))
		.get();
}

export function forkProjectPathConflict(
	db: HostDb,
	project: { id: string; repoPath: string },
) {
	if (isForkProjectGroup(db, project.id)) return false;
	return db
		.select({ id: projects.id })
		.from(projects)
		.where(
			and(
				eq(projects.repoPath, project.repoPath),
				ne(projects.id, project.id),
				isNull(projects.deletedAt),
			),
		)
		.all()
		.some((row) => !isForkProjectGroup(db, row.id));
}

export async function forkGroupFolderPath(path: string) {
	if (!isAbsolute(path)) throw forkProjectGroupError("folder");
	try {
		const resolved = await realpath(path);
		if (!(await stat(resolved)).isDirectory()) throw new Error("not-directory");
		return resolved;
	} catch {
		throw forkProjectGroupError("folder");
	}
}

export async function listForkGroupSources(
	db: HostDb,
	excludeProjectId?: string,
) {
	const result = new Map<
		string,
		{ path: string; name: string; projectNames: string[]; isGitRepo: boolean }
	>();
	const rows = db
		.select()
		.from(projects)
		.where(isNull(projects.deletedAt))
		.all();
	for (const project of rows)
		for (const source of [
			{ path: project.repoPath },
			...listProjectFolders(db, project.id),
		]) {
			let path: string;
			try {
				path = await forkGroupFolderPath(source.path);
			} catch {
				continue;
			}
			const entry = result.get(path) ?? {
				path,
				name: basename(path),
				projectNames: [],
				isGitRepo: isGitRepoPath(path),
			};
			const name = project.name || basename(project.repoPath);
			if (!entry.projectNames.includes(name)) entry.projectNames.push(name);
			result.set(path, entry);
		}
	const excluded = new Set<string>();
	const existing = excludeProjectId
		? getLocalProject(db, excludeProjectId)
		: undefined;
	if (existing)
		for (const path of [
			existing.repoPath,
			...listProjectFolders(db, existing.id).map((folder) => folder.path),
		]) {
			try {
				excluded.add(await realpath(path));
			} catch {}
		}
	return [...result.values()]
		.filter((entry) => !excluded.has(entry.path))
		.sort(
			(a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
		);
}

export async function attachForkProjectFolders(
	ctx: HostServiceContext,
	projectId: string,
	folders: string[],
) {
	const project = getLocalProject(ctx.db, projectId);
	if (!project) throw forkProjectGroupError("folder");
	const existing = listProjectFolders(ctx.db, projectId);
	const paths = [
		...new Set(await Promise.all(folders.map(forkGroupFolderPath))),
	];
	const known = new Set<string>();
	for (const path of [
		project.repoPath,
		...existing.map((folder) => folder.path),
	]) {
		try {
			known.add(await realpath(path));
		} catch {}
	}
	const added = paths.filter((path) => !known.has(path));
	const repositories = new Set<string>();
	for (const path of [...known, ...added])
		if (isGitRepoPath(path)) {
			const git = await ctx.git(path);
			const common = await realpath(
				(
					await git.raw([
						"rev-parse",
						"--path-format=absolute",
						"--git-common-dir",
					])
				).replace(/\n$/, ""),
			);
			if (repositories.has(common)) throw forkProjectGroupError("duplicate");
			repositories.add(common);
		}
	ctx.db.transaction((tx) => {
		for (const [offset, path] of added.entries())
			tx.insert(projectFolders)
				.values({
					id: randomUUID(),
					projectId,
					path,
					position:
						Math.max(-1, ...existing.map((folder) => folder.position)) +
						offset +
						1,
					isolateInWorktrees: isGitRepoPath(path),
				})
				.run();
	});
	return { added: added.length };
}

export async function createForkProjectGroup(
	ctx: HostServiceContext,
	input: { name: string; primaryPath: string; folders: string[] },
) {
	const primaryPath = await forkGroupFolderPath(input.primaryPath);
	if (!isGitRepoPath(primaryPath)) throw forkProjectGroupError("primary");
	const resolved = await resolveLocalRepo(primaryPath);
	const main = await forkGroupFolderPath(resolved.repoPath);
	const paths = [
		...new Set(await Promise.all(input.folders.map(forkGroupFolderPath))),
	].filter((path) => path !== main);
	const repositories = new Set<string>();
	for (const path of [main, ...paths])
		if (isGitRepoPath(path)) {
			const git = await ctx.git(path);
			try {
				await git.raw(["rev-parse", "--verify", "HEAD^{commit}"]);
			} catch {
				throw forkProjectGroupError("commit");
			}
			const common = (
				await git.raw([
					"rev-parse",
					"--path-format=absolute",
					"--git-common-dir",
				])
			).replace(/\n$/, "");
			const key = await realpath(common);
			if (repositories.has(key)) throw forkProjectGroupError("duplicate");
			repositories.add(key);
		}
	const projectId = randomUUID();
	ctx.db.transaction((tx) => {
		tx.insert(projects)
			.values({
				id: projectId,
				name: input.name.trim(),
				repoPath: main,
				repoProvider: resolved.parsed ? "github" : null,
				repoOwner: resolved.parsed?.owner ?? null,
				repoName: resolved.parsed?.name ?? null,
				repoUrl: resolved.parsed?.url ?? null,
				remoteName: resolved.remoteName,
				branchPrefixMode: "custom",
				branchPrefixCustom: `${sanitizeSegment(input.name, 32) || "group"}-${projectId.slice(0, 8)}`,
				updatedAt: Date.now(),
			})
			.run();
		tx.insert(forkProjectGroups)
			.values({ projectId, createdAt: Date.now() })
			.run();
		for (const [position, path] of paths.entries())
			tx.insert(projectFolders)
				.values({
					id: randomUUID(),
					projectId,
					path,
					position,
					isolateInWorktrees: isGitRepoPath(path),
				})
				.run();
	});
	const row = getLocalProject(ctx.db, projectId);
	if (row) emitProjectChanged(ctx.eventBus, "created", row);
	return { projectId, repoPath: main, created: true };
}

export async function assertForkGroupAdoption(
	ctx: Pick<HostServiceContext, "db">,
	projectId: string,
	path: string,
) {
	if (!isForkProjectGroup(ctx.db, projectId)) return;
	const target = await realpath(path);
	const own = ctx.db
		.select()
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.archivedAt)),
		)
		.all();
	for (const row of own) {
		try {
			if ((await realpath(row.worktreePath)) === target) return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	throw forkProjectGroupError("branch");
}
