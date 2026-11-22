const PRO_ROUTES = [
	"/tasks",
	"/automations",
	"/pages",
	"/cloud-workspaces",
	"/settings/billing",
	"/settings/cloud-usage",
	"/settings/mobile",
	"/settings/security",
	"/settings/teams",
	"/settings/organization",
	"/settings/environments",
	"/settings/agent-accounts",
	"/settings/connections",
] as const;

export function isForkProRoute(pathname: string): boolean {
	return PRO_ROUTES.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);
}

export function isForkSetupTerminal(terminal: {
	label?: string;
	customTitle?: string | null;
}): boolean {
	return (terminal.customTitle ?? terminal.label) === "Workspace Setup";
}

const PRO_SETTING_ITEMS = new Set([
	"integrations-linear",
	"integrations-github",
	"host-members",
	"host-invite-member",
	"host-member-role",
]);

export function isForkProSetting(item: {
	section: string;
	id: string;
}): boolean {
	const section =
		item.section === "agentAccounts"
			? "agent-accounts"
			: item.section === "cloudUsage"
				? "cloud-usage"
				: item.section;
	const path = `/settings/${section}`;
	return isForkProRoute(path) || PRO_SETTING_ITEMS.has(item.id);
}
