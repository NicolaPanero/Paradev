import { expect, mock, test } from "bun:test";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { ForkTerminalFolderChooser } from "./ForkTerminalFolderChooser";

const options = [
	{
		cwd: "/worktrees/topic",
		name: "project",
		sourcePath: "/frontend/project",
		isGitRepo: true,
	},
	{
		cwd: "/worktrees/repo-42/topic",
		name: "project",
		sourcePath: "/backend/project",
		isGitRepo: true,
	},
];

test("filters by the original folder path and selects the mapped directory with Enter", async () => {
	const onSelect = mock();
	const view = render(
		<ForkTerminalFolderChooser
			options={options}
			onCancel={mock()}
			onSelect={onSelect}
		/>,
	);
	await flush();
	expect(onSelect).not.toHaveBeenCalled();
	expect(view.getAllByRole("option")).toHaveLength(2);
	const search = view.getByRole("combobox");
	expect(document.activeElement).toBe(search);
	fireEvent.change(search, { target: { value: "backend" } });
	await flush();
	expect(view.getAllByRole("option")).toHaveLength(1);
	fireEvent.keyDown(search, { key: "Enter" });
	expect(onSelect).toHaveBeenCalledWith("/worktrees/repo-42/topic");
});

test("Escape cancels without selecting a folder", async () => {
	const onCancel = mock();
	const onSelect = mock();
	const view = render(
		<ForkTerminalFolderChooser
			options={options}
			onCancel={onCancel}
			onSelect={onSelect}
		/>,
	);
	await flush();
	fireEvent.keyDown(view.getByRole("combobox"), { key: "Escape" });
	expect(onCancel).toHaveBeenCalledTimes(1);
	expect(onSelect).not.toHaveBeenCalled();
});
