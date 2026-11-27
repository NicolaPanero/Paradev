import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export interface ForkAutoCompactTarget {
	hostUrl?: string | null;
	agent?: string | null;
	accountSelection?: string | null;
}

export function useForkAutoCompact(
	target: ForkAutoCompactTarget | undefined,
	open: boolean,
) {
	const { hostUrl, agent, accountSelection } = target ?? {};
	const queryClient = useQueryClient();
	const key = ["fork-auto-compact", hostUrl, agent];
	const queryKey = [
		...key,
		accountSelection === undefined ? "configured" : accountSelection,
	];
	const setting = useQuery({
		queryKey,
		enabled: open && Boolean(hostUrl && agent && agent !== "none"),
		retry: false,
		queryFn: () =>
			hostUrl && agent
				? getHostServiceClientByUrl(hostUrl).agents.autoCompact.query({
						agent,
						accountSelection,
					})
				: null,
	});
	const mutation = useMutation({
		scope: { id: JSON.stringify(key) },
		mutationFn: (value: number | null) => {
			if (!hostUrl || !agent) throw new Error("agent_config_unavailable");
			return getHostServiceClientByUrl(hostUrl).agents.setAutoCompact.mutate({
				agent,
				value,
			});
		},
		onSuccess: async (value) => {
			await queryClient.cancelQueries({ queryKey: key });
			queryClient.setQueriesData<NonNullable<typeof setting.data>>(
				{ queryKey: key },
				(current) => (current ? { ...current, value } : current),
			);
		},
	});
	return { setting: setting.data, mutation };
}
