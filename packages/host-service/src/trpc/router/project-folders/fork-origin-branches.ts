import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../db/schema";
import {
	isGitRepoPath,
	listProjectFolders,
	readGitBranch,
} from "../../../project-folders/project-folders";
import { protectedProcedure } from "../../index";

export const forkOriginBranchesProcedures = {
	originBranches: protectedProcedure
		.meta({ timeoutMs: 120_000 })
		.input(z.object({ projectId: z.string(), refresh: z.boolean().optional() }))
		.query(async ({ ctx, input }) => {
			const project = ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!project)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			const folders = [
				{
					id: "primary",
					name:
						project.name ??
						project.repoPath.split("/").pop() ??
						project.repoPath,
					path: project.repoPath,
					isGitRepo: isGitRepoPath(project.repoPath),
					isolateInWorktrees: true,
				},
				...listProjectFolders(ctx.db, project.id),
			].filter((f) => f.isGitRepo && f.isolateInWorktrees);
			return Promise.all(
				folders.map(async (folder) => {
					const git = await ctx.git(folder.path);
					if (input.refresh)
						await git.fetch(["origin", "--prune", "--no-tags"]);
					const raw = await git.raw([
						"for-each-ref",
						"--format=%(refname)",
						"refs/remotes/origin/",
					]);
					return {
						id: folder.id,
						name: folder.name,
						path: folder.path,
						currentBranch: readGitBranch(folder.path),
						branches: raw
							.split("\n")
							.filter(
								(r) =>
									r.startsWith("refs/remotes/origin/") &&
									r !== "refs/remotes/origin/HEAD",
							)
							.map((r) => r.slice("refs/remotes/origin/".length))
							.sort(),
					};
				}),
			);
		}),
};
