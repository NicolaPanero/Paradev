import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	autoCompactUnit,
	forkAutoCompactStore,
	validAutoCompactValue,
} from "../../../fork-auto-compact/fork-auto-compact";
import { forkAutoCompactDefault } from "../../../fork-auto-compact/fork-auto-compact-default";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { protectedProcedure } from "../../index";
import { selectedAccountEnv } from "./account-selection";

const agentInput = z.object({ agent: z.string().min(1) });

export const forkAutoCompactProcedures = {
	autoCompact: protectedProcedure
		.input(
			agentInput.extend({
				accountSelection: z.string().min(1).max(4096).nullable().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const agent = resolveHostAgentConfig(ctx.db, input.agent);
			const unit = agent && autoCompactUnit(agent.presetId);
			if (!agent || !unit) return null;
			const value = forkAutoCompactStore().read(agent);
			await waitForTerminalBaseEnv();
			let configured: number | null = null;
			try {
				const env = agentLaunchEnv(ctx.db, agent);
				const account =
					input.accountSelection !== undefined &&
					(agent.presetId === "claude" || agent.presetId === "codex")
						? await selectedAccountEnv(agent, env, input.accountSelection)
						: env;
				configured = forkAutoCompactDefault(agent.presetId, {
					...getTerminalBaseEnv(),
					...account,
				});
			} catch {}
			return { unit, value, configured };
		}),
	setAutoCompact: protectedProcedure
		.input(
			agentInput.extend({ value: z.number().int().nonnegative().nullable() }),
		)
		.mutation(({ ctx, input }) => {
			const agent = resolveHostAgentConfig(ctx.db, input.agent);
			const unit = agent && autoCompactUnit(agent.presetId);
			if (!agent || !unit)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "agent_config_unavailable",
				});
			if (input.value !== null && !validAutoCompactValue(unit, input.value))
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "invalid_auto_compact_value",
				});
			forkAutoCompactStore().write(agent, input.value);
			return input.value;
		}),
};
