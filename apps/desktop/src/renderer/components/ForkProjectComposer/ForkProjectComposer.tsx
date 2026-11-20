import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useOpenNewWorkspaceForLocalProject } from "renderer/hooks/useOpenNewWorkspace";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useForkProjectComposer } from "renderer/stores/fork-project-composer";
import { ForkProjectComposerDialog } from "./components/ForkProjectComposerDialog";

export function ForkProjectComposer() {
	const { t } = useLingui();
	const active = useForkProjectComposer((state) => state.active);
	const close = useForkProjectComposer((state) => state.close);
	const { activeHostUrl } = useLocalHostService();
	const finalize = useFinalizeProjectSetup();
	const openWorkspace = useOpenNewWorkspaceForLocalProject();
	if (!active) return null;
	const hostUrl = active.kind === "add" ? active.hostUrl : activeHostUrl;
	return (
		<ForkProjectComposerDialog
			key={active.kind === "add" ? active.projectId : "create"}
			mode={active}
			client={hostUrl ? getHostServiceClientByUrl(hostUrl) : null}
			canBrowse={!!hostUrl && hostUrl === activeHostUrl}
			hostUrl={hostUrl}
			onClose={close}
			onCreated={(result) => {
				if (hostUrl) finalize(hostUrl, result);
				toast.success(t({ message: "Project created." }));
				openWorkspace(result.projectId);
			}}
		/>
	);
}
