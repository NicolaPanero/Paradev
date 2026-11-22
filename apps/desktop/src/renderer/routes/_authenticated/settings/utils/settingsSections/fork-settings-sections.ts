import { msg } from "@lingui/core/macro";
import { LuGitBranch, LuUsers } from "react-icons/lu";
import type { SettingsSectionGroup } from "./settingsSections";

export type ForkSettingsRoute =
	| "/settings/fork"
	| "/settings/local-agent-accounts";

export const FORK_SETTINGS_SECTION_GROUPS: SettingsSectionGroup[] = [
	{
		label: msg({ message: "Fork Settings" }),
		items: [
			{
				id: "/settings/fork",
				section: "fork",
				label: msg({ message: "Fork Settings" }),
				icon: LuGitBranch,
				keywords: ["fork", "cli", "pro", "setup", "background"],
			},
			{
				id: "/settings/local-agent-accounts",
				section: "localAgentAccounts",
				label: msg({ message: "Local agent accounts" }),
				icon: LuUsers,
				keywords: ["quota", "profiles", "login"],
			},
		],
	},
];
