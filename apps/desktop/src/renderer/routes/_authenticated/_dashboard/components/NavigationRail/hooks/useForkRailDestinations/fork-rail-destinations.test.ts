import { expect, test } from "bun:test";
import { forkRailDestinations } from "./fork-rail-destinations";

const destinations = [
	"workspaces",
	"chat",
	"pages",
	"plugins",
	"automations",
	"tasks",
	"pullRequests",
].map((id) => ({ id, isPinned: true }));

test("the redesigned rail keeps Jira and local navigation while paid features are hidden", () => {
	const hidden = forkRailDestinations(destinations, false, false);
	expect(hidden.map(({ id }) => id)).toEqual([
		"workspaces",
		"plugins",
		"pullRequests",
	]);
	const withJira = forkRailDestinations(destinations, false, true);
	expect(withJira.map(({ id }) => id)).toEqual([
		"workspaces",
		"plugins",
		"tasks",
		"pullRequests",
	]);
	expect(withJira.find(({ id }) => id === "tasks")).toBe(
		destinations.find(({ id }) => id === "tasks"),
	);
	expect(forkRailDestinations(destinations, true, false)).toEqual(destinations);
});
