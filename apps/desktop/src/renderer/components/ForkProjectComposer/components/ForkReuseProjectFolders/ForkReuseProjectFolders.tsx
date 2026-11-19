import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuFolders } from "react-icons/lu";
import { useForkProjectComposer } from "renderer/stores/fork-project-composer";

export function ForkReuseProjectFolders(props: {
	projectId: string;
	hostUrl: string;
}) {
	const open = useForkProjectComposer((state) => state.open);
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={() => open({ kind: "add", ...props })}
		>
			<LuFolders className="size-3.5" />
			<Trans>Reuse existing folders</Trans>
		</Button>
	);
}
