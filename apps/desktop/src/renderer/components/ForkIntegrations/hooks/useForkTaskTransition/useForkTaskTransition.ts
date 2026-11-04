import type { ForkTask } from "@superset/shared/fork-integrations";
import {
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { forkPatchCachedTask } from "../../utils/forkPatchCachedTask";
import { required } from "../../utils/required";
import { useForkConnections } from "../useForkConnections";

export function useForkTaskTransition(
	task: ForkTask | null,
	enabled: boolean,
	onSuccess: () => void,
) {
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const [requiredTransition, setRequiredTransition] =
		useState<ForkTaskTransition | null>(null);
	const supported = (data?.version ?? 0) >= 4;
	const listsKey = ["fork-integrations", hostUrl, "tasks"];
	const detailKey = ["fork-integrations", hostUrl, "task"];
	const transitions = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"task-transitions",
			task?.connectionId,
			task?.key,
			task?.status.id,
		],
		queryFn: () =>
			required(client).forkTasks.transitions.query({
				connectionId: required(task).connectionId,
				key: required(task).key,
			}),
		enabled: !!task && !!client && supported && enabled,
		staleTime: 0,
		retry: false,
		networkMode: "always",
	});
	const mutation = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: ({
			transition,
			fields,
		}: {
			transition: ForkTaskTransition;
			fields: Record<string, unknown>;
		}) =>
			required(client).forkTasks.transition.mutate({
				connectionId: required(task).connectionId,
				key: required(task).key,
				transitionId: transition.id,
				fields,
			}),
		// The card moves before Jira answers; a refused move puts it back.
		onMutate: async ({ transition }) => {
			if (!task || !transition.to) return { saved: [] };
			const taskKey = [...detailKey, task.connectionId, task.key];
			await cache.cancelQueries({ queryKey: listsKey });
			const saved: [QueryKey, unknown][] = [
				...cache.getQueriesData({ queryKey: listsKey }),
				[taskKey, cache.getQueryData(taskKey)],
			];
			const status = transition.to;
			cache.setQueriesData({ queryKey: listsKey }, (data) =>
				forkPatchCachedTask(data, { ...task, status }),
			);
			cache.setQueryData<ForkTask>(taskKey, (data) =>
				data ? { ...data, status } : data,
			);
			return { saved };
		},
		onError: (_error, _input, context) => {
			for (const [key, data] of context?.saved ?? [])
				cache.setQueryData(key, data);
		},
		onSuccess: (updated) => {
			cache.setQueriesData({ queryKey: listsKey }, (data) =>
				forkPatchCachedTask(data, updated),
			);
			cache.setQueryData(
				[...detailKey, updated.connectionId, updated.key],
				updated,
			);
			setRequiredTransition(null);
			onSuccess();
		},
		onSettled: (_data, error) => {
			// Jira's search lags behind a move: an immediate reload could
			// show the old column, so a successful move only marks lists stale.
			const refetchType = error ? "active" : "none";
			void cache.invalidateQueries({ queryKey: listsKey, refetchType });
			void cache.invalidateQueries({ queryKey: detailKey, refetchType });
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "task-transitions"],
			});
		},
	});
	return {
		task,
		transitions,
		mutation,
		supported,
		requiredTransition,
		setRequiredTransition,
		choose: (transition: ForkTaskTransition) => {
			if (mutation.isPending) return;
			mutation.reset();
			if (transition.fields.length > 0) setRequiredTransition(transition);
			else mutation.mutate({ transition, fields: {} });
		},
	};
}

export type ForkTaskTransition = Awaited<
	ReturnType<
		NonNullable<
			ReturnType<typeof useForkConnections>["client"]
		>["forkTasks"]["transitions"]["query"]
	>
>[number];
