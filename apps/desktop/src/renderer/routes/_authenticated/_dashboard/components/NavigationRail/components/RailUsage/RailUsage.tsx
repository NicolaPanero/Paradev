import { useNavigate } from "@tanstack/react-router";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { useSettings } from "renderer/stores/settings";
import { ForkRailUsage } from "./components/ForkRailUsage";

export function RailUsage() {
	const navigate = useNavigate();
	const { activeHostUrl } = useLocalHostService();
	const isShown = useSettings((s) => s.showRailUsage);
	const quota = useHostUsageQuota(isShown ? activeHostUrl : null);
	if (!isShown) return null;

	return (
		<ForkRailUsage
			accounts={quota.data ?? []}
			hostUrl={activeHostUrl}
			onOpen={({ agent, accountKey }) =>
				navigate({
					to: "/settings/local-agent-accounts",
					search: { agent, accountKey },
				})
			}
		/>
	);
}
