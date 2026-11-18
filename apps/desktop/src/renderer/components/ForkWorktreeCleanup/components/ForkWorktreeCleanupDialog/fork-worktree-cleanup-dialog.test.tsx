import { expect, test } from "bun:test";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkWorktreeCleanupDialog } from "./ForkWorktreeCleanupDialog";

const plan = {
	readOnly: false,
	activeWorkspaces: 1,
	archivedWorkspaces: 2,
	id: "preview",
	createdAt: 1,
	skipped: 0,
	entries: [
		{
			id: "a",
			workspaceId: "deleted-a",
			name: "Deleted task A",
			project: "Project",
			path: "/managed/project/deleted-a",
			branch: "a",
			archivedAt: 1,
			bytes: 2_000_000_000,
			contents: ["node_modules", "src"],
		},
		{
			id: "b",
			workspaceId: "deleted-b",
			name: "Deleted task B",
			project: "Project",
			path: "/managed/project/deleted-b",
			branch: "b",
			archivedAt: 1,
			bytes: 1_000_000_000,
			contents: ["dist", "src"],
		},
	],
};

test("preview requires an explicit click, shows folders and sizes, and sends only the selected entries", () => {
	const applied: string[][] = [];
	let closed = false;
	const view = render(
		<ForkWorktreeCleanupDialog
			plan={plan}
			result={null}
			pending={false}
			failed={false}
			onApply={(ids) => applied.push(ids)}
			onClose={() => {
				closed = true;
			}}
		/>,
	);
	expect(applied).toEqual([]);
	expect(view.getByText("/managed/project/deleted-a")).toBeTruthy();
	expect(view.getByText("Estimated space: 3 GB")).toBeTruthy();
	const boxes = view.getAllByRole("checkbox");
	const second = boxes[2];
	if (!second) throw new Error("Selection missing");
	fireEvent.click(second);
	expect(view.getByText("Estimated space: 2 GB")).toBeTruthy();
	fireEvent.click(
		view.getByRole("button", { name: "Delete selected folders" }),
	);
	expect(applied).toEqual([["a"]]);
	fireEvent.click(view.getByText("Close", { selector: "button" }));
	expect(closed).toBe(true);
});

test("deletion prevents a second submission and the report shows retained paths and backup location", () => {
	let calls = 0;
	const view = render(
		<ForkWorktreeCleanupDialog
			plan={plan}
			result={null}
			pending
			failed={false}
			onApply={() => calls++}
			onClose={() => calls++}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Deleting…" }));
	expect(calls).toBe(0);
	view.rerender(
		<ForkWorktreeCleanupDialog
			plan={null}
			result={{
				removed: 1,
				skipped: 1,
				failed: 0,
				backup: "/backups/run",
				issues: [{ path: "/managed/project/restored", status: "skipped" }],
			}}
			pending={false}
			failed={false}
			onApply={() => calls++}
			onClose={() => calls++}
		/>,
	);
	expect(view.getByText("Backups: /backups/run")).toBeTruthy();
	expect(view.getByText("/managed/project/restored")).toBeTruthy();
	expect(
		view.queryByRole("button", { name: "Delete selected folders" }),
	).toBeNull();
});

test("the installed-data preview shows real workspace counts and exposes no delete action", () => {
	const view = render(
		<ForkWorktreeCleanupDialog
			plan={{
				...plan,
				readOnly: true,
				activeWorkspaces: 28,
				archivedWorkspaces: 61,
			}}
			result={null}
			pending={false}
			failed={false}
			onApply={() => {
				throw new Error("Deletion must not be offered");
			}}
			onClose={() => {}}
		/>,
	);
	expect(
		view.getByText("Installed app preview. Deletion is disabled."),
	).toBeTruthy();
	expect(view.getByText("Active workspaces protected: 28")).toBeTruthy();
	expect(view.getByText("Deleted workspaces checked: 61")).toBeTruthy();
	expect(
		view.queryByRole("button", { name: "Delete selected folders" }),
	).toBeNull();
});
