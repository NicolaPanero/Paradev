import { z } from "zod";
import { forkWorktreeMaintenance } from "../../../fork-worktree-maintenance/fork-worktree-maintenance";
import { protectedProcedure, router } from "../../index";

export const forkWorktreeCleanupRouter = router({
	initialPreview: protectedProcedure.mutation(({ ctx }) =>
		forkWorktreeMaintenance(ctx).initialPreview(),
	),
	dismissInitial: protectedProcedure.mutation(({ ctx }) => {
		forkWorktreeMaintenance(ctx).dismissInitial();
		return { success: true };
	}),
	preview: protectedProcedure.mutation(({ ctx }) =>
		forkWorktreeMaintenance(ctx).preview(),
	),
	execute: protectedProcedure
		.input(
			z.object({
				planId: z.string(),
				entryIds: z.array(z.string()).max(10_000),
			}),
		)
		.mutation(({ ctx, input }) =>
			forkWorktreeMaintenance(ctx).apply(input.planId, input.entryIds),
		),
});
