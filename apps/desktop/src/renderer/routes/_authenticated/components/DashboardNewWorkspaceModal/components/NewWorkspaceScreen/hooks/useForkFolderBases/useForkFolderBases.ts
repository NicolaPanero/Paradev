import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useForkFolderBases(
	hostUrl: string | null,
	projectId: string | null,
	enabled: boolean,
	resetKey: number,
) {
	const { t } = useLingui();
	const scope = `${hostUrl}:${projectId}:${resetKey}`;
	const [stored, setStored] = useState<{
		scope: string;
		branches: Record<string, string>;
	}>({ scope, branches: {} });
	const selection = stored.scope === scope && enabled ? stored.branches : {};
	const refreshRequested = useRef(false);
	const query = useQuery({
		queryKey: ["fork-folder-origin-branches", hostUrl, projectId],
		enabled: enabled && !!hostUrl && !!projectId,
		queryFn: () => {
			const refresh = refreshRequested.current;
			refreshRequested.current = false;
			return getHostServiceClientByUrl(
				hostUrl ?? "",
			).projectFolders.originBranches.query({
				projectId: projectId ?? "",
				refresh,
			});
		},
		retry: false,
		staleTime: 30_000,
	});
	const setSelection = (branches: Record<string, string>) =>
		setStored({ scope, branches });
	return {
		selection,
		setSelection,
		query,
		confirm: async () => {
			const result = await query.refetch();
			if (result.isError) {
				toast.error(
					t({
						message:
							"Could not load origin branches. Check the connection and host version.",
					}),
				);
				return false;
			}
			return true;
		},
		refresh: () => {
			refreshRequested.current = true;
			return query.refetch();
		},
	};
}
