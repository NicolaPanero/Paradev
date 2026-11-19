import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, dialog } from "electron";

if (process.argv.includes("--fork-portable-backup-helper")) {
	const profile = mkdtempSync(join(tmpdir(), "paradev-backup-helper-"));
	app.setPath("userData", profile);
	app.setPath("sessionData", profile);
	void import("./lib/fork-portable-backup/fork-job")
		.then(({ runHelper }) => runHelper(profile))
		.catch(() => app.exit(1));
} else {
	void import("./lib/fork-portable-backup/fork-restore")
		.then(async ({ recoverRestore, guardPortableOperation }) => {
			await guardPortableOperation(
				join(app.getPath("appData"), "Paradev++-portable-restore.json"),
			);
			await recoverRestore(
				join(app.getPath("appData"), "Paradev++-portable-restore.json"),
			);
			await import("./index");
		})
		.catch(async (error) => {
			await app.whenReady();
			dialog.showErrorBox(
				"Paradev++",
				error instanceof Error ? error.message : String(error),
			);
			app.exit(1);
		});
}
