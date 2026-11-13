import { homedir } from "node:os";
import { join } from "node:path";

export function pinForkDataHome(workspace: string | undefined) {
	if (workspace !== "fork") return;
	const configured = process.env.SUPERSET_HOME_DIR?.trim();
	const defaults = [".superset", ".paradev", ".paradev-fork"].map((name) =>
		join(homedir(), name),
	);
	if (!configured || defaults.includes(configured))
		process.env.SUPERSET_HOME_DIR = join(homedir(), ".superset-fork");
}
