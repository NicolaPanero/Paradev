import { useForkWorkspacePrMutation } from "./useForkWorkspacePrMutation";

type MergeMethod = "merge" | "squash" | "rebase";

interface PullRequestActions {
	merge: (mergeMethod: MergeMethod) => void;
	markReady: () => void;
	isMerging: boolean;
	isMarkingReady: boolean;
}

export function useForkPullRequestActions(
	actions: PullRequestActions,
	workspaceId: string,
	pr: {
		repoOwner: string;
		repoName: string;
		number: number;
		url: string;
	} | null,
	onRefresh?: () => void,
): PullRequestActions {
	const merge = useForkWorkspacePrMutation(
		{
			isPending: actions.isMerging,
			mutate: (input) => actions.merge(input.mergeMethod ?? "merge"),
		},
		workspaceId,
		"merge",
		onRefresh,
		pr?.url,
	);
	const ready = useForkWorkspacePrMutation(
		{ isPending: actions.isMarkingReady, mutate: () => actions.markReady() },
		workspaceId,
		"ready",
		onRefresh,
		pr?.url,
	);
	const input = pr
		? { owner: pr.repoOwner, repo: pr.repoName, pullNumber: pr.number }
		: null;
	return {
		merge: (mergeMethod) => {
			if (input) merge.mutate({ ...input, mergeMethod });
		},
		markReady: () => {
			if (input) ready.mutate(input);
		},
		isMerging: merge.isPending,
		isMarkingReady: ready.isPending,
	};
}
