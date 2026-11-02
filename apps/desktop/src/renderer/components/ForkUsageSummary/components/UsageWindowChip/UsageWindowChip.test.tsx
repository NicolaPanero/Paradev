import { expect, test } from "bun:test";
import { render } from "renderer/test-utils/fork-ui";
import { UsageWindowChip } from "./UsageWindowChip";

const now = new Date("2026-10-17T10:00:00Z");
const resetsAt = new Date("2026-10-17T12:14:00Z");

test("only a window near its limit shows the time to its reset", () => {
	const view = render(
		<UsageWindowChip
			now={now}
			window={{ id: "seven_day", label: "Weekly", usedPercent: 89, resetsAt }}
		/>,
	);
	expect(view.container.textContent).toContain("2h 14m");
	view.rerender(
		<UsageWindowChip
			now={now}
			window={{ id: "seven_day", label: "Weekly", usedPercent: 40, resetsAt }}
		/>,
	);
	expect(view.container.textContent).not.toContain("2h 14m");
});

test("the used label can be left to the surrounding text", () => {
	const window = {
		id: "five_hour",
		label: "5 hours",
		usedPercent: 74,
		resetsAt,
	};
	const view = render(<UsageWindowChip now={now} window={window} />);
	expect(view.container.textContent).toContain("74% used");
	view.rerender(<UsageWindowChip now={now} window={window} hideUsedLabel />);
	expect(view.container.textContent).toContain("74%");
	expect(view.container.textContent).not.toContain("used");
});
