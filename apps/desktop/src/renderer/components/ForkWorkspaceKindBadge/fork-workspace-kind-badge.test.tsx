import { expect, test } from "bun:test";
import { render } from "renderer/test-utils/fork-ui";
import { ForkWorkspaceKindBadge } from "./ForkWorkspaceKindBadge";

test("a workspace says whether it is the project folder or a worktree", () => {
	const local = render(<ForkWorkspaceKindBadge type="local" />);
	expect(local.getByText(/^Local/)).toBeTruthy();
	local.unmount();
	const worktree = render(<ForkWorkspaceKindBadge type="worktree" />);
	expect(worktree.getByText(/^Worktree/)).toBeTruthy();
	worktree.unmount();
	const session = render(<ForkWorkspaceKindBadge type="session" />);
	expect(session.container.textContent).toBe("");
});
