import { pathFileName } from "../pathText";

const PATH_TOKEN = /(?:^|[\s`'"([])((?:~\/|\/)[^\s`'"()<>[\]]+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const MAX_FOLDERS = 12;

/**
 * Folders an agent message names, in order: a path ending in `/`, a path
 * without a file extension, or the folder of a file path. A later bare file
 * name in the same message ("Files in `/out/`: `report.docx`") is looked up
 * in these when it does not exist as written.
 */
export function mentionedFolders(text: string): string[] {
	const folders: string[] = [];
	for (const match of text.matchAll(PATH_TOKEN)) {
		const token = (match[1] ?? "").replace(TRAILING_PUNCTUATION, "");
		const folder = token.endsWith("/")
			? token.replace(/\/+$/, "")
			: pathFileName(token)
				? token.slice(0, token.lastIndexOf("/"))
				: token;
		if (!folder || folder === "~" || folders.includes(folder)) continue;
		folders.push(folder);
		if (folders.length === MAX_FOLDERS) break;
	}
	return folders;
}

/** Where a relative file name may be, given the folders the message names. */
export function folderCandidates(path: string, folders: string[]): string[] {
	if (path.startsWith("/") || path.startsWith("~")) return [];
	return folders.map((folder) => `${folder}/${path}`);
}
