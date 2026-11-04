import { expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { queryFixture, render } from "renderer/test-utils/fork-ui";
import { ForkTaskDetail } from "./ForkTaskDetail";

const task: ForkTask = {
	id: "1",
	key: "J-1",
	connectionId: "jira",
	title: "Settings page",
	description: "",
	url: "https://jira.test/J-1",
	status: { id: "3", name: "In progress", category: "indeterminate" },
	priority: null,
	assignee: null,
	labels: [],
};

function renderDetail(embedded: boolean) {
	const fixture = queryFixture();
	const router = createRouter({
		routeTree: createRootRoute({
			component: () => (
				<ForkTaskDetail task={task} onBack={() => {}} embedded={embedded} />
			),
		}),
		history: createMemoryHistory(),
	});
	return render(
		<LocalHostServiceContext.Provider
			value={{
				machineId: "m",
				activeHostUrl: "http://127.0.0.1:9",
				activeOrganizationId: "org",
				activeOrganizationName: "Test",
				hostServiceStatus: "running",
				waitForHostReady: async () => "http://127.0.0.1:9",
			}}
		>
			<RouterProvider router={router} />
		</LocalHostServiceContext.Provider>,
		{ wrapper: fixture.wrapper },
	);
}

test("in a pane the task has no close button or key link; the Tasks page keeps them", async () => {
	const pane = renderDetail(true);
	await pane.findByText("Settings page");
	expect(pane.queryByLabelText("Close")).toBeNull();
	expect(pane.queryByRole("link", { name: /J-1/ })).toBeNull();
	expect(pane.getByRole("button", { name: /Edit/ })).toBeTruthy();
	expect(pane.getByLabelText("More actions")).toBeTruthy();
	pane.unmount();

	const page = renderDetail(false);
	await page.findByText("Settings page");
	expect(page.getByLabelText("Close")).toBeTruthy();
	expect(page.getByRole("link", { name: /J-1/ })).toBeTruthy();
});
