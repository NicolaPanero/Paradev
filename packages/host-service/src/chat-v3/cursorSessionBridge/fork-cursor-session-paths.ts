import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";

async function workspacePath(cwd: string) {
	try {
		return await realpath(cwd);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return cwd;
	}
}

export async function forkCursorCliDirectory(
	root: string,
	sessionId: string,
	cwd: string,
	from: "cli" | "acp",
) {
	const canonical = await workspacePath(cwd);
	const directory = (path: string) =>
		join(
			root,
			"chats",
			createHash("md5").update(path).digest("hex"),
			sessionId,
		);
	const target = directory(canonical);
	if (from === "cli" && canonical !== cwd) {
		try {
			await lstat(join(target, "store.db"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			return directory(cwd);
		}
	}
	return target;
}

export async function forkCursorWorkspaceMatches(stored: unknown, cwd: string) {
	return (
		typeof stored === "string" &&
		(await workspacePath(stored)) === (await workspacePath(cwd))
	);
}
