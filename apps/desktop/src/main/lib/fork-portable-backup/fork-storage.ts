import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ipcMain } from "electron";
import { getAllWindows } from "../window-registry/window-registry";

let registered = false;
export function registerBackupStorage(appHome: string) {
	if (registered) return;
	registered = true;
	const seed = join(appHome, "fork-backup-storage-seed.json");
	ipcMain.on("fork-backup-storage", (event, applied: unknown) => {
		if (
			!getAllWindows().some((window) => window.webContents === event.sender) ||
			event.senderFrame !== event.sender.mainFrame
		) {
			event.returnValue = null;
			return;
		}
		if (applied === true) {
			if (existsSync(seed)) unlinkSync(seed);
			event.returnValue = null;
		} else
			event.returnValue = existsSync(seed)
				? JSON.parse(readFileSync(seed, "utf8"))
				: null;
	});
}
