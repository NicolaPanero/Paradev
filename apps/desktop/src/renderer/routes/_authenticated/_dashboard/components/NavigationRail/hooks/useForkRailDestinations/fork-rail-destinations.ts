export function forkRailDestinations<T extends { id: string }>(
	destinations: readonly T[],
	showProFeatures: boolean,
	jiraConfigured: boolean,
): T[] {
	return destinations.filter(({ id }) => {
		if (showProFeatures) return true;
		if (id === "tasks") return jiraConfigured;
		return id !== "pages" && id !== "automations" && id !== "chat";
	});
}
