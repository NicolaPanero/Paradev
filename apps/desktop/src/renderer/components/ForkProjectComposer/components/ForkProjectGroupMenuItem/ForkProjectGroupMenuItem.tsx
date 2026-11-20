import { Trans } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { LuFolders } from "react-icons/lu";
import { useForkProjectComposer } from "renderer/stores/fork-project-composer";

export function ForkProjectGroupMenuItem() {
	const open = useForkProjectComposer((state) => state.open);
	return (
		<DropdownMenuItem onSelect={() => open({ kind: "create" })}>
			<LuFolders className="size-4" />
			<Trans>Project from existing folders</Trans>
		</DropdownMenuItem>
	);
}
