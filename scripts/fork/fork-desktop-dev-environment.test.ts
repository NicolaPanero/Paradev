import { expect, test } from "bun:test";
import { forkDesktopDevEnvironment } from "../../apps/desktop/scripts/fork-dev-environment";

test("the desktop launcher clears inherited Electron Node mode and preserves other environment values", () => {
	const input = {
		ELECTRON_RUN_AS_NODE: "1",
		NODE_ENV: "development",
		PATH: "/bin",
		SUPERSET_HOME_DIR: "/tmp/isolated-desktop",
	};
	expect(forkDesktopDevEnvironment(input)).toEqual({
		NODE_ENV: "development",
		PATH: "/bin",
		SUPERSET_HOME_DIR: "/tmp/isolated-desktop",
	});
	expect(input.ELECTRON_RUN_AS_NODE).toBe("1");
});
