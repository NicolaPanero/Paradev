import { expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { forkPatchCachedTask } from "./forkPatchCachedTask";

const task = (id: string, status = "todo"): ForkTask => ({
	id,
	key: `J-${id}`,
	connectionId: "jira",
	title: id,
	description: "",
	url: "",
	status: { id: status, name: status, category: "new" },
	priority: null,
	assignee: null,
	labels: [],
});
const done = { id: "done", name: "Done", category: "done" };

test("a moved task changes in paged and plain lists; other data stays the same object", () => {
	const paged = {
		pages: [{ items: [task("1"), task("2")] }],
		pageParams: [null],
	};
	const moved = forkPatchCachedTask(paged, {
		id: "2",
		connectionId: "jira",
		status: done,
	});
	expect(moved.pages[0]?.items[1]?.status).toEqual(done);
	expect(moved.pages[0]?.items[0]).toBe(paged.pages[0]?.items[0] as ForkTask);

	const plain = { items: [task("2")], nextCursor: null };
	expect(
		forkPatchCachedTask(plain, { id: "2", connectionId: "jira", status: done })
			.items[0]?.status,
	).toEqual(done);

	expect(
		forkPatchCachedTask(paged, { id: "9", connectionId: "jira", status: done }),
	).toBe(paged);
	expect(
		forkPatchCachedTask(paged, {
			id: "2",
			connectionId: "other",
			status: done,
		}),
	).toBe(paged);
	const other = { worklogs: [] };
	expect(forkPatchCachedTask(other, { id: "2", connectionId: "jira" })).toBe(
		other,
	);
});
