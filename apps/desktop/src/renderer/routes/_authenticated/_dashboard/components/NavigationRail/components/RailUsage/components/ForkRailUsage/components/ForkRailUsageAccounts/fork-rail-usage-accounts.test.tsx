import { expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { fireEvent, queryFixture, render } from "renderer/test-utils/fork-ui";
import { ForkRailUsageAccounts } from "./ForkRailUsageAccounts";

const primary: UsageAccount = {
	agent: "claude",
	selection: "/personal",
	credentialKind: "subscription",
	accountKey: "personal",
	sourceLabel: "Personal",
	email: null,
	plan: "max",
	status: "ok",
	statusDetail: null,
	windows: [
		{ id: "five_hour", label: "Session (5h)", usedPercent: 42, resetsAt: null },
	],
	creditsBalance: null,
	extraUsage: null,
	isDefault: true,
	fetchedAt: new Date(),
};
const secondary: UsageAccount = {
	...primary,
	selection: "/work",
	accountKey: "work",
	sourceLabel: "Work",
	windows: [{ ...primary.windows[0], usedPercent: 73 }],
	isDefault: false,
};
const disconnected: UsageAccount = {
	...primary,
	selection: "/disconnected",
	accountKey: "disconnected",
	sourceLabel: "Disconnected",
	status: "signed_out",
	windows: [],
	isDefault: false,
};

test("opens separate account usage and hands off the chosen account", () => {
	const selected: string[] = [];
	const { client, wrapper } = queryFixture();
	const hostUrl = "http://localhost:9123";
	client.setQueryData(
		["agent-account-aliases", hostUrl],
		[{ agent: secondary.agent, selection: secondary.selection, label: "Team" }],
	);
	const view = render(
		<ForkRailUsageAccounts
			entry={{ account: primary, rings: primary.windows }}
			accounts={[primary, secondary, disconnected]}
			hostUrl={hostUrl}
			onOpen={(account) => selected.push(account.accountKey)}
		/>,
		{ wrapper },
	);
	const trigger = view.getByRole("button", {
		name: "Claude Code account usage (3)",
	});
	expect(trigger.textContent).toBe("3");
	expect(trigger.getAttribute("aria-expanded")).toBe("false");

	fireEvent.click(trigger);
	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	expect(view.getAllByRole("listitem")).toHaveLength(3);
	expect(view.getByRole("button", { name: "Personal Default" })).toBeDefined();
	expect(
		view
			.getAllByRole("progressbar")
			.map((bar) => bar.getAttribute("aria-valuenow")),
	).toEqual(["42", "73"]);
	expect(view.getByText("Signed out")).toBeDefined();

	fireEvent.click(view.getByRole("button", { name: "Team Work" }));
	expect(selected).toEqual(["work"]);
	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	expect(view.queryByRole("dialog")).toBeNull();
});
