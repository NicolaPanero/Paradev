import { expect, test } from "bun:test";
import { act, renderHook } from "renderer/test-utils/fork-ui";
import {
	notifyProjectFoldersChanged,
	useProjectFoldersChanged,
} from "./projectFoldersChanged";

test("a folder change reaches every mounted list until it unmounts", () => {
	let changes = 0;
	const view = renderHook(() =>
		useProjectFoldersChanged(() => {
			changes++;
		}),
	);
	act(() => notifyProjectFoldersChanged());
	act(() => notifyProjectFoldersChanged());
	expect(changes).toBe(2);
	view.unmount();
	notifyProjectFoldersChanged();
	expect(changes).toBe(2);
});
