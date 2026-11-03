import { expect, mock, test } from "bun:test";
import type {
	ForkTask,
	ForkTaskLink,
} from "@superset/shared/fork-integrations";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { useForkLinkedTaskStore } from "../../stores/forkLinkedTaskStore";
import { ForkLinkedTaskRows } from "./ForkLinkedTaskRows";

const links: ForkTaskLink[] = [
	{
		connectionId: "jira-1",
		taskId: "10001",
		key: "B4BN-5230",
		title: "Scheda ente",
		url: "https://jira.example/browse/B4BN-5230",
	},
	{
		connectionId: "jira-1",
		taskId: "10002",
		key: "B4BN-5231",
		title: "Riordino",
		url: "https://jira.example/browse/B4BN-5231",
	},
];
const loaded = {
	title: "Scheda ente e riordino configurazione",
	status: { name: "In review", category: "indeterminate" },
} as unknown as ForkTask;

test("each linked task is a row with its key, the live title and status when loaded, and the stored title otherwise", () => {
	const view = render(
		<ForkLinkedTaskRows
			links={links}
			tasks={new Map([["jira-1:B4BN-5230", loaded]])}
			onOpen={() => {}}
		/>,
	);
	const [first, second] = view.getAllByRole("button");
	expect(first?.textContent).toContain("B4BN-5230");
	expect(first?.textContent).toContain("Scheda ente e riordino configurazione");
	expect(first?.textContent).toContain("In review");
	expect(second?.textContent).toContain("B4BN-5231");
	expect(second?.textContent).toContain("Riordino");
	expect(second?.textContent).not.toContain("In review");
});

test("clicking a row opens exactly that task", () => {
	const onOpen = mock((_link: ForkTaskLink) => {});
	const view = render(
		<ForkLinkedTaskRows links={links} tasks={new Map()} onOpen={onOpen} />,
	);
	fireEvent.click(view.getAllByRole("button")[1] as HTMLElement);
	expect(onOpen.mock.calls).toEqual([[links[1]]]);
});

test("the opened task lives in a store the menu does not own, so it survives the menu closing", () => {
	const target = {
		hostUrl: "http://h",
		connectionId: "jira-1",
		key: "B4BN-5230",
	};
	useForkLinkedTaskStore.getState().open(target);
	expect(useForkLinkedTaskStore.getState().target).toEqual(target);
	useForkLinkedTaskStore.getState().close();
	expect(useForkLinkedTaskStore.getState().target).toBeNull();
});
