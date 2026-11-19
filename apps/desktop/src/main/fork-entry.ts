import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, dialog } from "electron";
import { startForkApp } from "./lib/fork-portable-backup/fork-startup";

function temporaryProfile() {
	const profile = mkdtempSync(join(tmpdir(), "paradev-backup-helper-"));
	app.setPath("userData", profile);
	app.setPath("sessionData", profile);
	return profile;
}

const journal = join(app.getPath("appData"), "Paradev++-portable-restore.json");
void startForkApp({
	helper: process.argv.includes("--fork-portable-backup-helper"),
	recovery: existsSync(journal) || existsSync(`${journal}.lock`),
	runHelper: async () => {
		const profile = temporaryProfile();
		const { runHelper } = await import("./lib/fork-portable-backup/fork-job");
		await runHelper(profile);
	},
	recover: async () => {
		const profile = temporaryProfile();
		const { recoverRestore, guardPortableOperation } = await import(
			"./lib/fork-portable-backup/fork-restore"
		);
		await guardPortableOperation(journal);
		await recoverRestore(journal);
		await rm(profile, { recursive: true, force: true });
	},
	relaunch: () => {
		app.relaunch({ args: process.argv.slice(1) });
		app.exit(0);
	},
	loadMain: () => import("./index"),
}).catch(async (error) => {
	await app.whenReady();
	dialog.showErrorBox(
		"Paradev++",
		error instanceof Error ? error.message : String(error),
	);
	app.exit(1);
});
