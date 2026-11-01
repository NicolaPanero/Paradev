import { afterEach, expect, test } from "bun:test";
import { ForkExternalAccount } from "renderer/components/ForkExternalAccount";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { cleanup, fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkCliOptionsSetting } from "./ForkCliOptionsSetting";

afterEach(() => {
	cleanup();
	useForkCliOptionsStore.getState().setShowCliOptions(false);
});
test("the accessible local toggle reveals CLI login and hides it again without removing profiles", () => {
	const view = render(
		<>
			<ForkCliOptionsSetting />
			<ForkExternalAccount external>
				<p>External profile</p>
			</ForkExternalAccount>
			<ForkExternalAccount external={false}>
				<p>Managed profile</p>
			</ForkExternalAccount>
		</>,
	);
	expect(view.queryByText("External profile")).toBeNull();
	expect(view.getByText("Managed profile")).toBeTruthy();
	const toggle = view.getByRole("switch", { name: "Hide CLI options" });
	expect(toggle.getAttribute("aria-describedby")).toBe(
		"fork-cli-options-description",
	);
	fireEvent.click(toggle);
	expect(toggle.getAttribute("aria-checked")).toBe("false");
	expect(view.getByText("External profile")).toBeTruthy();
	fireEvent.click(toggle);
	expect(view.queryByText("External profile")).toBeNull();
	expect(view.getByText("Managed profile")).toBeTruthy();
});
