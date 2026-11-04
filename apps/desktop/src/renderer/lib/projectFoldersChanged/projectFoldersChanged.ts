import { useEffect, useRef } from "react";

const changes = new EventTarget();

/**
 * Folder lists live in more than one query cache: Settings and the sidebar
 * use the app's, a workspace uses its host client's. A change made in one
 * tells the others to read the list again.
 */
export function notifyProjectFoldersChanged(): void {
	changes.dispatchEvent(new Event("change"));
}

export function useProjectFoldersChanged(listener: () => void): void {
	const latest = useRef(listener);
	latest.current = listener;
	useEffect(() => {
		const handle = () => latest.current();
		changes.addEventListener("change", handle);
		return () => changes.removeEventListener("change", handle);
	}, []);
}
