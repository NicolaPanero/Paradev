import { expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkFolderBasePicker } from "./ForkFolderBasePicker";

type Bases = ComponentProps<typeof ForkFolderBasePicker>["bases"];
function fixture(failed = false) {
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
	const view = render(<ForkFolderBasePicker bases={bases} />);
	fireEvent.click(view.getByRole("button", { name: "Origin branches" }));
	return { view, setSelection, refresh };
}

test("offers common remote branches and lets each repository use a different origin branch", () => {
	const { view, setSelection } = fixture();
	const common = view.getByRole("combobox", {
		name: "Use the same origin branch for all folders",
	});
	expect(common.textContent).toContain("origin/develop");
	expect(common.textContent).not.toContain("origin/release");
	fireEvent.change(common, { target: { value: "develop" } });
	expect(setSelection).toHaveBeenLastCalledWith({
		primary: "origin/develop",
		extra: "origin/develop",
	});
	fireEvent.change(view.getByRole("combobox", { name: "Services" }), {
		target: { value: "origin/release" },
	});
	expect(setSelection).toHaveBeenLastCalledWith({ extra: "origin/release" });
});

test("an unavailable host shows an error and offers refresh instead of a selectable branch", () => {
	const { view, refresh } = fixture(true);
	expect(view.getByRole("alert").textContent).toContain("host version");
	expect(view.queryByRole("combobox")).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Refresh" }));
	expect(refresh).toHaveBeenCalledTimes(1);
});
