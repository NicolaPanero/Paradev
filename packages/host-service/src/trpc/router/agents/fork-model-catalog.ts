import { z } from "zod";
import {
	type ForkModelCatalog,
	getForkModelCatalog,
} from "../../../chat-v3/forkModelCatalog";
import { protectedProcedure } from "../../index";

export const forkModelCatalogProcedures = {
	modelCatalog: protectedProcedure
		.input(
			z.object({
				agent: z.string().min(1),
				accountSelection: z.string().nullable().optional(),
				workspaceId: z.string().uuid().optional(),
				projectId: z.string().uuid().optional(),
				model: z.string().optional(),
				refresh: z.boolean().optional(),
			}),
		)
		.query(
			async ({ ctx, input }): Promise<ForkModelCatalog> => ({
				...(await getForkModelCatalog(ctx.db, input)),
				supportsCursorContext: true,
			}),
		),
};
