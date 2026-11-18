import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	FORK_WHATS_NEW_DISMISSED,
	hasSeenForkWhatsNew,
} from "renderer/components/ForkWhatsNewNotice/ForkWhatsNewNotice";
import { useForkWorktreeCleanup } from "../../hooks/useForkWorktreeCleanup/useForkWorktreeCleanup";
import { ForkWorktreeCleanupDialog } from "../ForkWorktreeCleanupDialog/ForkWorktreeCleanupDialog";

export function ForkWorktreeCleanupStartup() {
	const [ready, setReady] = useState(() => hasSeenForkWhatsNew(localStorage));
	useEffect(() => {
		const dismissed = () => setReady(true);
		window.addEventListener(FORK_WHATS_NEW_DISMISSED, dismissed);
		return () =>
			window.removeEventListener(FORK_WHATS_NEW_DISMISSED, dismissed);
	}, []);
	const cleanup = useForkWorktreeCleanup();
	const { client, hostUrl, setPlan } = cleanup;
	const initial = useQuery({
		queryKey: ["fork-worktree-cleanup-initial", hostUrl],
		queryFn: () => client?.forkWorktreeCleanup.initialPreview.mutate() ?? null,
		enabled: !!client && ready,
		retry: false,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
	useEffect(() => {
		if (initial.data) setPlan(initial.data);
	}, [initial.data, setPlan]);
	return (
		<ForkWorktreeCleanupDialog
			plan={cleanup.plan}
			result={cleanup.result}
			pending={cleanup.apply.isPending}
			failed={cleanup.apply.isError}
			onApply={(ids) => cleanup.apply.mutate(ids)}
			onClose={cleanup.dismiss}
		/>
	);
}
