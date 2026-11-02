import { Trans, useLingui } from "@lingui/react/macro";
import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { Label } from "@superset/ui/label";
import { useQuery } from "@tanstack/react-query";
import {
	ForkAccountPicker,
	ForkAccountSubmenu,
} from "renderer/components/ForkAccountPicker";
import { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useForkNewAgentAccount } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/ForkNewAgentDialog/hooks/useForkNewAgentAccount";
import { ForkCreationModelPicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/components/ForkCreationModelPicker";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export interface ForkJiraAgentChoice {
	agent: string;
	surface: "terminal" | "chat";
	model?: string;
	effort?: string;
	accountSelection?: string;
}

export function ForkJiraAutomationAgent({
	value,
	onChange,
	supported,
	projectId,
}: {
	value: ForkJiraAgentChoice;
	onChange: (value: ForkJiraAgentChoice) => void;
	supported: boolean;
	projectId?: string;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const agents = useV2AgentConfigs(hostUrl);
	const config = agents.data?.find((a) => a.id === value.agent);
	const preset = config
		? resolveAgentLaunchPresetId(config.presetId, config.command)
		: null;
	const hasAccounts = preset === "claude" || preset === "codex";
	const accounts = useQuery({
		queryKey: ["fork-account-options", hostUrl, preset],
		queryFn: () =>
			required(client).agents.accountOptions.query({
				agent: required(preset),
				isolated: true,
			}),
		enabled: supported && hasAccounts && !!client,
		retry: false,
	});
	const { agents: choices } = useV2AgentChoices(hostUrl);
	const catalog = useForkModelCatalog({
		hostUrl,
		agent: value.agent,
		model: value.model,
		accountSelection: value.accountSelection,
		projectId,
		enabled: supported,
	});
	const accountController = useForkNewAgentAccount(
		hostUrl,
		value.agent,
		preset ?? undefined,
		supported,
	);
	const account = {
		...accountController,
		selection: value.accountSelection ?? accountController.selection,
		choose: (selection: string | null) =>
			onChange({ ...value, accountSelection: selection ?? undefined }),
	};
	const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
	return (
		<div className="grid grid-cols-2 gap-3">
			<div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
				<ForkCreationModelPicker
					agents={choices}
					catalog={catalog}
					selectedAgent={value.agent}
					onSelectAgent={(agent) => onChange({ agent, surface: value.surface })}
					selectedModel={value.model ?? null}
					onModelChange={(model) =>
						onChange({ ...value, model: model ?? undefined })
					}
					efforts={catalog.efforts}
					selectedEffort={value.effort ?? null}
					renderAccountItem={(rowClassName, panelClassName) => (
						<ForkAccountSubmenu
							account={account}
							provider={preset}
							model={value.model}
							className={rowClassName}
							contentClassName={panelClassName}
						/>
					)}
					onEffortChange={(effort) =>
						onChange({ ...value, effort: effort ?? undefined })
					}
				/>
				<ForkAccountPicker
					account={account}
					provider={preset}
					model={value.model}
					compact
				/>
			</div>
			{supported && (
				<>
					<div className="space-y-1.5">
						<Label htmlFor="jira-rule-surface">
							<Trans>Open in</Trans>
						</Label>
						<select
							id="jira-rule-surface"
							className={selectClass}
							value={value.surface}
							onChange={(e) =>
								onChange({
									...value,
									surface: e.target.value as "terminal" | "chat",
								})
							}
						>
							<option value="chat">{t({ message: "ACP chat" })}</option>
							<option value="terminal">{t({ message: "Terminal" })}</option>
						</select>
					</div>
				</>
			)}
			{(agents.error || accounts.error) && (
				<p role="alert" className="col-span-2 text-xs text-destructive">
					{(agents.error ?? accounts.error)?.message}
				</p>
			)}
		</div>
	);
}
