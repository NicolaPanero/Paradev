import { beforeEach, describe, expect, it } from "bun:test";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

describe("useNewWorkspaceDraftStore checkout", () => {
	beforeEach(() => {
		useNewWorkspaceDraftStore.getState().resetDraft();
	});

	it("starts every new workspace on a worktree", () => {
		expect(useNewWorkspaceDraftStore.getState().checkout).toBe("worktree");

		useNewWorkspaceDraftStore.getState().updateDraft({ checkout: "local" });
		useNewWorkspaceDraftStore.getState().resetDraft();

		expect(useNewWorkspaceDraftStore.getState().checkout).toBe("worktree");
	});
});
