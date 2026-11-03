import { Trans } from "@lingui/react/macro";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { ForkTaskDetail } from "renderer/components/ForkIntegrations/components/ForkTaskDetail/ForkTaskDetail";
import { useForkConnections } from "renderer/components/ForkIntegrations/hooks/useForkConnections";
import { required } from "renderer/components/ForkIntegrations/utils/required";
import type { ForkTaskPaneData } from "../../../../utils/forkTaskPane";

/** The Tasks page's detail, with status changes, as a pane. */
export function ForkTaskPane({
	data,
	onClose,
}: {
	data: ForkTaskPaneData;
	onClose: () => void;
}) {
	const { client } = useForkConnections(data.hostUrl);
	const detail = useQuery({
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			data.hostUrl,
			"task",
			data.connectionId,
			data.key,
		],
		queryFn: () =>
			required(client).forkTasks.get.query({
				connectionId: data.connectionId,
				key: data.key,
			}),
		enabled: !!client,
	});
	return (
		<div className="h-full min-h-0 overflow-auto">
			{detail.data ? (
				<ForkTaskDetail
					key={detail.data.connectionId + detail.data.id}
					task={detail.data}
					onBack={onClose}
				/>
			) : (
				<div className="space-y-4 p-6">
					<Button size="sm" variant="ghost" onClick={onClose}>
						<Trans>Close</Trans>
					</Button>
					{detail.isError && !isForkServiceUnavailable(detail.error) && (
						<p role="alert" className="text-sm text-muted-foreground">
							{detail.error.message}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
