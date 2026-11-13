import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { getWorkspaceName } from "shared/env.shared";
import { copyForkDataOnFirstLaunch } from "./fork-data-migration";

const homeDirName =
	getWorkspaceName() === "fork" ? ".superset-fork" : undefined;
const storageName = homeDirName ? "Superset Fork" : app.getName();

if (homeDirName) {
	copyForkDataOnFirstLaunch(homeDirName, app.getPath("appData"), storageName);
	// Upstream would move the fork to ~/.paradev-fork and leave its data behind.
	process.env.SUPERSET_HOME_DIR ||= join(homedir(), homeDirName);
}

if (homeDirName && process.env.NODE_ENV !== "development") {
	const profile = join(app.getPath("appData"), storageName);
	mkdirSync(profile, { recursive: true });
	app.setPath("userData", profile);
	app.setPath("sessionData", profile);
}
