import { expect, mock, test } from "bun:test";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import type { FinishedSubagent } from "../../stores/activityPanelStore";
import { ForkFinishedSubagents } from "./ForkFinishedSubagents";

const entries: FinishedSubagent[] = Array.from({ length: 12 }, (_, index) => ({
	key: `finished-${index}`,
	name: `Review ${index}`,
	terminalId: "terminal",
	taskId: `subagent-${index}`,
	sessionId: "session",
}));

test("finished history shows the latest five, expands older entries and opens the selected transcript", () => {
	const onOpen = mock((_entry: FinishedSubagent) => {});
	const view = render(
		<ForkFinishedSubagents
			entries={entries}
			sourceOf={() => undefined}
			onOpen={onOpen}
		/>,
	);
	expect(view.getAllByText("Done")).toHaveLength(5);
	expect(view.queryByText("Review 5")).toBeNull();
	const toggle = view.getByRole("button", { name: "Show older 7" });
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(toggle);
	expect(view.getAllByText("Done")).toHaveLength(12);
	fireEvent.click(view.getByRole("button", { name: "Review 11 Done" }));
	expect(onOpen.mock.calls[0]?.[0]).toBe(entries[11]);
	fireEvent.click(view.getByRole("button", { name: "Show less" }));
	expect(view.getAllByText("Done")).toHaveLength(5);
	expect(view.getAllByRole("button")[0]?.textContent).toContain("Review 0");
});

test("a short history has no expand control", () => {
	const view = render(
		<ForkFinishedSubagents
			entries={entries.slice(0, 3)}
			sourceOf={() => undefined}
			onOpen={() => {}}
		/>,
	);
	expect(view.getAllByRole("button")).toHaveLength(3);
	expect(view.queryByText("Show older")).toBeNull();
});
