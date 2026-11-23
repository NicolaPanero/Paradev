import { expect, mock, test } from "bun:test";
import { type ComponentProps, useState } from "react";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { ForkFolderBasePicker } from "./ForkFolderBasePicker";

type Bases = ComponentProps<typeof ForkFolderBasePicker>["bases"];

function ConnectedPicker({ bases }: { bases: Bases }) {
	const [selection, setSelection] = useState(bases.selection);
	return (
		<ForkFolderBasePicker
			bases={{
				...bases,
				selection,
				setSelection: (next) => {
					bases.setSelection(next);
					setSelection(next);
				},
			}}
		/>
	);
}

async function fixture(failed = false) {
	const setSelection = mock((_branches: Record<string, string>) => {});
	const refresh = mock(async () => ({}));
	const bases = {
		selection: {},
		setSelection,
		refresh,
		query: {
			data: [
				{
					id: "primary",
					name: "Main repository",
					path: "/project/main",
					branches: ["main", "develop"],
					currentBranch: "local-feature",
				},
				{
					id: "extra",
					name: "Services",
					path: "/project/services",
					branches: ["develop", "release"],
					currentBranch: "local-services",
				},
			],
			isLoading: false,
			isError: failed,
			isFetching: false,
		},
	} as unknown as Bases;
	const view = render(<ConnectedPicker bases={bases} />);
	fireEvent.click(view.getByRole("button", { name: "Origin branches" }));
	await flush();
	return { view, setSelection, refresh };
}

test("applies a common branch, then lets one repository override or clear its choice", async () => {
	const { view, setSelection } = await fixture();
	fireEvent.click(view.getByRole("button", { name: /^All repositories/ }));
	expect(view.queryByRole("option", { name: "origin/release" })).toBeNull();
	fireEvent.click(view.getByRole("option", { name: "origin/develop" }));
	expect(setSelection).toHaveBeenLastCalledWith({
		primary: "origin/develop",
		extra: "origin/develop",
	});
	fireEvent.click(view.getByRole("button", { name: /^Services/ }));
	fireEvent.change(view.getByRole("combobox"), {
		target: { value: "release" },
	});
	await flush();
	expect(view.queryByRole("option", { name: "origin/develop" })).toBeNull();
	fireEvent.click(view.getByRole("option", { name: "origin/release" }));
	expect(setSelection).toHaveBeenLastCalledWith({
		primary: "origin/develop",
		extra: "origin/release",
	});
	const services = view.getByRole("button", { name: /^Services/ });
	expect(services.textContent).toContain("release");
	expect(document.activeElement).toBe(services);
	fireEvent.click(services);
	fireEvent.click(view.getByRole("option", { name: /^Current checkout/ }));
	expect(setSelection).toHaveBeenLastCalledWith({ primary: "origin/develop" });
	fireEvent.click(view.getByRole("button", { name: "Reset" }));
	expect(setSelection).toHaveBeenLastCalledWith({});
});

test("an unavailable host shows an error and offers refresh instead of a selectable branch", async () => {
	const { view, refresh } = await fixture(true);
	expect(view.getByRole("alert").textContent).toContain("host version");
	expect(view.queryByRole("combobox")).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Refresh" }));
	expect(refresh).toHaveBeenCalledTimes(1);
});
