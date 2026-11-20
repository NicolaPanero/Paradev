import { z } from "zod";
import {
	attachForkProjectFolders,
	createForkProjectGroup,
	listForkGroupSources,
} from "../../../projects/fork-project-groups";
import { machineOnlyProcedure } from "../../index";

export const forkProjectGroupProcedures = {
	groupSources: machineOnlyProcedure
		.input(z.object({ projectId: z.string().optional() }).optional())
		.query(({ ctx, input }) => listForkGroupSources(ctx.db, input?.projectId)),
	attachFolders: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string(),
				folders: z.array(z.string().min(1)).max(256),
			}),
		)
		.mutation(({ ctx, input }) =>
			attachForkProjectFolders(ctx, input.projectId, input.folders),
		),
	createGroup: machineOnlyProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(200),
				primaryPath: z.string().min(1),
				folders: z.array(z.string().min(1)).max(256),
			}),
		)
		.mutation(({ ctx, input }) => createForkProjectGroup(ctx, input)),
};
