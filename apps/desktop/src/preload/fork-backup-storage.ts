import { ipcRenderer } from "electron";

const seed: unknown = ipcRenderer.sendSync("fork-backup-storage");
if (seed && typeof seed === "object" && !Array.isArray(seed)) {
	localStorage.clear();
	for (const [key, value] of Object.entries(seed)) {
		if (typeof value !== "string") throw new Error("backup_storage_invalid");
		localStorage.setItem(key, value);
	}
	ipcRenderer.sendSync("fork-backup-storage", true);
}
