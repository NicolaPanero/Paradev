import { expect, test } from "bun:test";
import type { UserMessage } from "@superset/chat/protocol";
import { render } from "renderer/test-utils/fork-ui";
import { QueuedPromptRow } from "./QueuedPromptRow";

test("a prompt still on its way to the host cannot be steered, removed or edited", () => {
	const prompt: UserMessage = {
		id: "pending:queued",
		kind: "user_message",
		startedAtMs: 1,
		content: [{ type: "text", text: "Review" }],
	};
	const view = render(
		<QueuedPromptRow
			actionable
			editing={false}
			pending
			rowKey="queued:queued"
			tabbable
			prompt={prompt}
			onEdit={() => {}}
			onEditEnd={() => {}}
			onRemove={() => {}}
			onSteer={() => {}}
		/>,
	);
	for (const name of ["Steer", "Remove queued message", "More actions"])
		expect(view.getByRole("button", { name }).hasAttribute("disabled")).toBe(
			true,
		);
});
