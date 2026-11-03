import { Trans } from "@lingui/react/macro";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@superset/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { ForkTaskDetail } from "renderer/components/ForkIntegrations/components/ForkTaskDetail/ForkTaskDetail";
import { useForkConnections } from "renderer/components/ForkIntegrations/hooks/useForkConnections";
import { required } from "renderer/components/ForkIntegrations/utils/required";
import { useForkLinkedTaskStore } from "../../stores/forkLinkedTaskStore";

/** A linked task opened from the menu: the Tasks page's detail, with status changes, in a dialog. */
export function ForkLinkedTaskDialog() {
	const target = useForkLinkedTaskStore((state) => state.target);
	const close = useForkLinkedTaskStore((state) => state.close);
	const { client } = useForkConnections(target?.hostUrl ?? null);
	const detail = useQuery({
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			target?.hostUrl,
			"task",
			target?.connectionId,
			target?.key,
		],
		queryFn: () =>
			required(client).forkTasks.get.query({
				connectionId: required(target).connectionId,
				key: required(target).key,
			}),
		enabled: !!client && !!target,
	});
	return (
		<Dialog
			open={target !== null}
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent className="max-h-[85vh] max-w-3xl gap-0 overflow-auto p-0">
				<DialogTitle className="sr-only">{target?.key}</DialogTitle>
				{detail.data ? (
					<ForkTaskDetail
						key={detail.data.connectionId + detail.data.id}
						task={detail.data}
						onBack={close}
					/>
				) : (
					<div className="space-y-4 p-6">
						<Button size="sm" variant="ghost" onClick={close}>
							<Trans>Close</Trans>
						</Button>
						{detail.isError && !isForkServiceUnavailable(detail.error) && (
							<p role="alert" className="text-sm text-muted-foreground">
								{detail.error.message}
							</p>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
