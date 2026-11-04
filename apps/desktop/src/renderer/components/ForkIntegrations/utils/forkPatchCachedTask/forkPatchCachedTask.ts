import type { ForkTask } from "@superset/shared/fork-integrations";

type TaskPage = { items: ForkTask[] };

function patchItems(
	items: ForkTask[],
	task: Pick<ForkTask, "id" | "connectionId"> & Partial<ForkTask>,
) {
	let changed = false;
	const next = items.map((item) => {
		if (item.id !== task.id || item.connectionId !== task.connectionId)
			return item;
		changed = true;
		return { ...item, ...task };
	});
	return changed ? next : items;
}

/**
 * Applies a task's new values to a cached task list, paged or not. Data of
 * any other shape comes back unchanged.
 */
export function forkPatchCachedTask<T>(
	data: T,
	task: Pick<ForkTask, "id" | "connectionId"> & Partial<ForkTask>,
): T {
	if (!data || typeof data !== "object") return data;
	const value = data as { pages?: unknown; items?: unknown };
	if (Array.isArray(value.pages)) {
		let changed = false;
		const pages = (value.pages as TaskPage[]).map((page) => {
			if (!Array.isArray(page?.items)) return page;
			const items = patchItems(page.items, task);
			if (items === page.items) return page;
			changed = true;
			return { ...page, items };
		});
		return changed ? ({ ...value, pages } as T) : data;
	}
	if (Array.isArray(value.items)) {
		const items = patchItems(value.items as ForkTask[], task);
		return items === value.items ? data : ({ ...value, items } as T);
	}
	return data;
}
