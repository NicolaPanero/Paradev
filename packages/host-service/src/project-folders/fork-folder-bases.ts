import { existsSync, lstatSync, mkdirSync, rmdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaceFolderWorktrees } from "../db/fork-schema";
import { projects } from "../db/schema";
import {
	addBranchWorktree,
	type BranchSourcePlan,
} from "../trpc/router/workspace-creation/shared/add-branch-worktree";
import type { HostServiceContext } from "../types";
import { provisionFolderWorktrees } from "./folder-worktrees";
import { forkFolderBaseError } from "./fork-folder-base-error";
import { fetchForkOriginBranch } from "./fork-origin-git";
import { listProjectFolders } from "./project-folders";

type Context = Pick<HostServiceContext, "db" | "git" | "credentials">;
export const forkFolderBaseInputs = {
	folderBaseBranches: z.record(z.string(), z.string().min(1)).optional(),
};
type Input = {
	projectId: string;
	folderBaseBranches?: Record<string, string>;
	checkout?: string;
	pr?: number;
	worktreePath?: string;
};
type PreparedFolder = {
	id: string;
	path: string;
	base: string;
	commit: string;
	createdPath?: string;
};
export type ForkPreparedFolderBases = PreparedFolder[];

export async function prepareForkFolderBases(
	ctx: Context,
	input: Input,
): Promise<ForkPreparedFolderBases> {
	const choices = Object.entries(input.folderBaseBranches ?? {});
	if (!choices.length) return [];
	if (input.checkout === "local" || input.pr || input.worktreePath)
		throw forkFolderBaseError("BAD_REQUEST", "invalid");
	const project = ctx.db
		.select()
		.from(projects)
		.where(eq(projects.id, input.projectId))
		.get();
	const folders = listProjectFolders(ctx.db, input.projectId);
	if (project)
		folders.unshift({
			id: "primary",
			path: project.repoPath,
			name: project.name ?? basename(project.repoPath),
			projectId: project.id,
			position: -1,
			exists: true,
			isGitRepo: true,
			isolateInWorktrees: true,
		});
	const prepared: PreparedFolder[] = [];
	for (const [id, base] of choices) {
		const folder = folders.find((f) => f.id === id);
		if (!folder?.isGitRepo || !folder.isolateInWorktrees)
			throw forkFolderBaseError("BAD_REQUEST", "invalid");
		if (!base.startsWith("origin/"))
			throw forkFolderBaseError("BAD_REQUEST", "invalid");
		try {
			const commit = await fetchForkOriginBranch(
				await ctx.git(folder.path),
				base.slice(7),
			);
			prepared.push({ id, path: folder.path, base, commit });
		} catch (cause) {
			throw forkFolderBaseError(
				"PRECONDITION_FAILED",
				"fetch",
				{ branch: base, folder: folder.name },
				cause,
			);
		}
	}
	return prepared;
}

export function applyForkFolderBranchPlan(
	plan: BranchSourcePlan,
	folders: ForkPreparedFolderBases,
) {
	if (folders.length && plan.usedExistingBranch)
		throw forkFolderBaseError("CONFLICT", "conflict");
	const primary = folders.find((f) => f.id === "primary");
	if (primary)
		return {
			...plan,
			startPoint: {
				kind: "remote-tracking" as const,
				fullRef: `refs/remotes/origin/${primary.base.slice(7)}` as const,
				shortName: primary.base.slice(7),
				remote: "origin",
				remoteShortName: primary.base,
			},
		};
	return plan;
}

function requiredWorktreePath(folder: PreparedFolder) {
	if (!folder.createdPath)
		throw new Error("Folder worktree path is not prepared");
	return folder.createdPath;
}

export async function addForkBranchWorktree(
	args: Parameters<typeof addBranchWorktree>[0],
	ctx: Context,
	folders: ForkPreparedFolderBases,
) {
	const extras = folders.filter((f) => f.id !== "primary");
	if (!folders.length) return addBranchWorktree(args);
	applyForkFolderBranchPlan(args.plan, folders);
	for (const folder of extras) {
		const git = await ctx.git(folder.path);
		if ((await git.raw(["branch", "--list", args.plan.branch])).trim())
			throw forkFolderBaseError("CONFLICT", "conflict");
		folder.createdPath = join(
			dirname(args.worktreePath),
			`${basename(args.worktreePath)}--${basename(folder.path)}-${folder.id.slice(0, 6)}`,
		);
		if (existsSync(folder.createdPath))
			throw forkFolderBaseError("CONFLICT", "conflict");
	}
	const reservations: {
		path: string;
		inode: number;
		git: typeof args.git;
		created: boolean;
		commit?: string;
	}[] = [];
	try {
		for (const target of [
			{ path: args.worktreePath, git: args.git },
			...(await Promise.all(
				extras.map(async (folder) => ({
					path: requiredWorktreePath(folder),
					git: await ctx.git(folder.path),
				})),
			)),
		]) {
			mkdirSync(target.path);
			reservations.push({
				...target,
				inode: lstatSync(target.path).ino,
				created: false,
			});
		}
		const main = reservations.find((r) => r.path === args.worktreePath);
		if (!main) throw new Error("Primary worktree was not reserved");
		const primary = folders.find((f) => f.id === "primary");
		const start = args.plan.startPoint;
		main.commit =
			primary?.commit ??
			(
				await args.git.raw([
					"rev-parse",
					"--verify",
					start.kind === "head" ? "HEAD" : start.fullRef,
				])
			).trim();
		await addBranchWorktree(args, primary?.commit);
		main.created = true;
		for (const folder of extras) {
			const git = await ctx.git(folder.path);
			await git.raw([
				"worktree",
				"add",
				"--no-track",
				"-b",
				args.plan.branch,
				requiredWorktreePath(folder),
				folder.commit,
			]);
			const reservation = reservations.find(
				(r) => r.path === folder.createdPath,
			);
			if (reservation) {
				reservation.created = true;
				reservation.commit = folder.commit;
			}
			await git.raw(["config", `branch.${args.plan.branch}.base`, folder.base]);
		}
	} catch (cause) {
		const kept: string[] = [];
		for (const target of reservations.reverse()) {
			if (!existsSync(target.path)) continue;
			if (lstatSync(target.path).ino !== target.inode) {
				kept.push(target.path);
				continue;
			}
			try {
				if (existsSync(join(target.path, ".git")))
					await target.git.raw(["worktree", "remove", target.path]);
				else rmdirSync(target.path);
				if (target.created && target.commit) {
					try {
						await target.git.raw([
							"update-ref",
							"-d",
							`refs/heads/${args.plan.branch}`,
							target.commit,
						]);
						await target.git
							.raw(["config", "--remove-section", `branch.${args.plan.branch}`])
							.catch(() => undefined);
					} catch {}
				}
			} catch {
				kept.push(target.path);
			}
		}
		throw forkFolderBaseError(
			"PRECONDITION_FAILED",
			kept.length ? "kept" : "create",
			{ paths: kept.join(", ") },
			cause,
		);
	}
}

export async function provisionForkFolderBases(
	ctx: Context,
	workspaceId: string,
	folders: ForkPreparedFolderBases,
	branch: string,
) {
	for (const folder of folders) {
		if (folder.createdPath)
			ctx.db
				.insert(workspaceFolderWorktrees)
				.values({
					workspaceId,
					folderId: folder.id,
					worktreePath: folder.createdPath,
					branch,
				})
				.run();
	}
	return provisionFolderWorktrees(ctx, workspaceId);
}
