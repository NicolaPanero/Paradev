import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useRef, useState } from "react";
import { ForkAccountEmptyState } from "renderer/components/ForkAccountEmptyState";
import {
	ForkAccountDialogs,
	ForkAccountSubmenu,
} from "renderer/components/ForkAccountPicker";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { ForkCreationModelPicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/components/ForkCreationModelPicker";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import { useForkNewAgentAccount } from "./hooks/useForkNewAgentAccount";
import { launchForkChat } from "./utils/launchForkChat";

export function ForkNewAgentDialog({
	open,
	onOpenChange,
	workspaceId,
	onCreateNewAgentSession,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	workspaceName: string;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	const showCliOptions = useForkCliOptions();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const [configId, setConfigId] = useState<string>();
	const [model, setModel] = useState<string | null>(null);
	const [effort, setEffort] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const launchLock = useRef(false);
	const configs = useV2AgentConfigs(hostUrl);
	const peers = configs.data ?? [];
	const selected = peers.find(
		(config) => config.id === (configId ?? peers[0]?.id),
	);
	const managed =
		selected?.presetId === "claude" || selected?.presetId === "codex";
	const account = useForkNewAgentAccount(
		hostUrl,
		selected?.id,
		selected?.presetId,
		open,
	);
	const catalog = useForkModelCatalog({
		hostUrl,
		agent: selected?.id,
		workspaceId,
		accountSelection: account.selection,
		model,
		enabled: open && (!managed || account.available),
	});
	const models = catalog.models;
	const accountMissing =
		managed &&
		!showCliOptions &&
		!account.forcedApi &&
		typeof account.selection !== "string";
	const selectConfig = (id: string) => {
		setConfigId(id);
		setModel(null);
		setEffort(null);
	};
	const launchSession = async () => {
		if (!selected || accountMissing || catalog.isFetching || launchLock.current)
			return;
		launchLock.current = true;
		setBusy(true);
		try {
			const result = await launchForkChat(
				onCreateNewAgentSession,
				{
					configId: selected.id,
					modelCatalog: "agent",
					placement: "new-tab",
					prompt: "",
					...(model && models.some((o) => o.id === model)
						? { modelId: model }
						: {}),
					...(managed && !account.forcedApi && account.selection !== undefined
						? { accountSelection: account.selection }
						: {}),
				},
				catalog.efforts.some((option) => option.id === effort) ? effort : null,
			);
			if (result) onOpenChange(false);
		} finally {
			launchLock.current = false;
			setBusy(false);
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!busy) onOpenChange(value);
			}}
		>
			<DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>
						<Trans>New chat</Trans>
					</DialogTitle>
				</DialogHeader>
				<fieldset disabled={busy} className="min-w-0">
					<ForkCreationModelPicker
						fullWidth
						agents={peers.map((config) => ({
							id: config.id,
							label: config.label,
							presetId: config.presetId,
							iconId: config.iconId ?? config.presetId,
						}))}
						catalog={catalog}
						selectedAgent={selected?.id ?? ""}
						onSelectAgent={selectConfig}
						selectedModel={model}
						onModelChange={(value) => {
							setModel(value);
							setEffort(null);
						}}
						efforts={catalog.efforts}
						selectedEffort={effort}
						onEffortChange={setEffort}
						renderAccountItem={(rowClassName, panelClassName) => (
							<ForkAccountSubmenu
								account={account}
								provider={selected?.presetId ?? null}
								model={model ?? undefined}
								className={rowClassName}
								contentClassName={panelClassName}
							/>
						)}
					/>
				</fieldset>
				<ForkAccountDialogs
					account={account}
					provider={selected?.presetId ?? null}
				/>
				{account.options.isSuccess && accountMissing && selected && (
					<ForkAccountEmptyState
						hostUrl={hostUrl}
						agent={selected.presetId as "claude" | "codex"}
						onAccountAdded={() => {
							void account.options.refetch();
							void account.quota.refresh().catch(() => {});
							void account.refreshDefault();
						}}
					/>
				)}
				<Button
					onClick={() => void launchSession()}
					disabled={
						busy ||
						catalog.isFetching ||
						!selected ||
						accountMissing ||
						(managed && !account.options.isSuccess)
					}
				>
					{busy ? <Trans>Starting…</Trans> : <Trans>Start</Trans>}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
