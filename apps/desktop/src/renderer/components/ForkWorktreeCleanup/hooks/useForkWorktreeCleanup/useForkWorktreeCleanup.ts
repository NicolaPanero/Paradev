import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useContext, useEffect, useRef, useState } from "react";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";

export type ForkCleanupPreview = Awaited<
	ReturnType<HostServiceClient["forkWorktreeCleanup"]["preview"]["mutate"]>
>;
export type ForkCleanupResult = Awaited<
	ReturnType<HostServiceClient["forkWorktreeCleanup"]["execute"]["mutate"]>
>;

export function useForkWorktreeCleanup() {
	const cache = useQueryClient();
	const hostUrl = useContext(LocalHostServiceContext)?.activeHostUrl ?? null;
	const client = hostUrl ? getHostServiceClientByUrl(hostUrl) : null;
	const [plan, setPlan] = useState<ForkCleanupPreview | null>(null);
	const [result, setResult] = useState<ForkCleanupResult | null>(null);
	const previousHost = useRef(hostUrl);
	useEffect(() => {
		if (previousHost.current === hostUrl) return;
		previousHost.current = hostUrl;
		setPlan(null);
		setResult(null);
	}, [hostUrl]);
	const preview = useMutation({
		mutationFn: async () => {
			if (!client) throw new Error("fork_host_unavailable");
			return client.forkWorktreeCleanup.preview.mutate();
		},
		onSuccess: (next) => {
			setResult(null);
			setPlan(next);
		},
	});
	const apply = useMutation({
		mutationFn: async (entryIds: string[]) => {
			if (!client || !plan) throw new Error("fork_cleanup_preview_unavailable");
			return client.forkWorktreeCleanup.execute.mutate({
				planId: plan.id,
				entryIds,
			});
		},
		onSuccess: (next) => {
			setPlan(null);
			setResult(next);
			cache.setQueryData(["fork-worktree-cleanup-initial", hostUrl], null);
		},
	});
	const dismiss = () => {
		if (apply.isPending) return;
		setPlan(null);
		setResult(null);
		apply.reset();
		cache.setQueryData(["fork-worktree-cleanup-initial", hostUrl], null);
		void client?.forkWorktreeCleanup.dismissInitial
			.mutate()
			.catch(() => undefined);
	};
	return { client, hostUrl, plan, setPlan, result, preview, apply, dismiss };
}
