import { expect, test } from "bun:test";
import { act, renderHook } from "renderer/test-utils/fork-ui";
import { useForkWorkspaceChatActions } from "./useForkWorkspaceChatActions";

test("the import dialog survives toolbar renders and closes when the workspace changes", () => {
	const view = renderHook(
		({ workspaceId }: { workspaceId: string }) =>
			useForkWorkspaceChatActions(workspaceId),
		{ initialProps: { workspaceId: "first" } },
	);
	act(() => view.result.current.setImportOpen(true));
	view.rerender({ workspaceId: "first" });
	expect(view.result.current.importOpen).toBe(true);
	view.rerender({ workspaceId: "second" });
	expect(view.result.current.importOpen).toBe(false);
	view.rerender({ workspaceId: "first" });
	expect(view.result.current.importOpen).toBe(false);
});
