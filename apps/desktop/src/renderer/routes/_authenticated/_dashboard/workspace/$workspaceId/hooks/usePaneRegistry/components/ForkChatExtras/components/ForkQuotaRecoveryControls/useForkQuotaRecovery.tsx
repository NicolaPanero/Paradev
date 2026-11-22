import { Trans, useLingui } from "@lingui/react/macro";
import { chatRecoveryCapabilities } from "@superset/shared/fork-chat-recovery";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import type { ReactNode } from "react";

export type ForkRecoveryMode = "stop" | "wait" | "switch" | "both";

export interface ForkRecoveryChoice {
	value: ForkRecoveryMode;
	available: boolean;
	title: ReactNode;
	detail: ReactNode;
}

/** What the chat does when quota runs out, as the host stores it, with the choices this agent and host support. */
export function useForkQuotaRecovery({
	workspaceId,
	terminalId,
	enabled,
	agent,
}: {
	workspaceId: string;
	terminalId: string;
	enabled: boolean;
	agent?: string;
}) {
	const { t } = useLingui();
	const provider = agent ?? "claude";
	const local = chatRecoveryCapabilities(provider);
	const input = { workspaceId, terminalId, ...(agent ? { agent } : {}) };
	const query = workspaceTrpc.agents.quotaRecovery.useQuery(input, {
		enabled: enabled && (local.switchAccounts || local.resumeAtReset),
		retry: false,
		refetchInterval: (query) =>
			query.state.error ? false : enabled ? 5000 : false,
	});
	const save = workspaceTrpc.agents.setQuotaRecovery.useMutation({
		onSuccess: () => {
			void query.refetch();
		},
		onError: () =>
			toast.error(t({ message: "Couldn't save continuation options" })),
	});
	const state = query.data;
	const capabilities = state?.capabilities ?? {
		switchAccounts: provider === "claude" && state?.supported === true,
		resumeAtReset: provider === "claude" && state?.supported === true,
	};
	const canSwitch = local.switchAccounts && capabilities.switchAccounts;
	const canWait = local.resumeAtReset && capabilities.resumeAtReset;
	const mode: ForkRecoveryMode =
		state?.switchAccounts && canSwitch
			? state?.resumeAtReset && canWait
				? "both"
				: "switch"
			: state?.resumeAtReset && canWait
				? "wait"
				: "stop";
	const choose = (next: ForkRecoveryMode) =>
		save.mutate({
			...input,
			switchAccounts: next === "switch" || next === "both",
			resumeAtReset: next === "wait" || next === "both",
		});
	const choices: ForkRecoveryChoice[] = [
		{
			value: "stop",
			available: true,
			title: <Trans>Pause</Trans>,
			detail: <Trans>The chat pauses until you continue it.</Trans>,
		},
		{
			value: "wait",
			available: canWait,
			title: <Trans>Wait for the reset</Trans>,
			detail: <Trans>Continues on this account when quota returns.</Trans>,
		},
		{
			value: "switch",
			available: canSwitch,
			title: <Trans>Switch account</Trans>,
			detail: <Trans>Continues now on the account with the most quota.</Trans>,
		},
		{
			value: "both",
			available: canSwitch && canWait,
			title: <Trans>Switch, or wait</Trans>,
			detail: (
				<Trans>Waits for the reset when no other account has quota.</Trans>
			),
		},
	];
	return {
		local,
		query,
		save,
		state,
		canSwitch,
		canWait,
		offered: canSwitch || canWait,
		mode,
		choose,
		choices,
	};
}
