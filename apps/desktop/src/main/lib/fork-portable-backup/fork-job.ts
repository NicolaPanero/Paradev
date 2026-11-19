import { spawn } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { formatNumber } from "@superset/i18n/format";
import { app, BrowserWindow, dialog } from "electron";
import { writeArchive } from "./fork-archive";
import { inventory } from "./fork-inventory";
import { keychainServices, readKeychain } from "./fork-keychain";
import { contains, validateTargets } from "./fork-paths";
import { restoreArchive } from "./fork-restore";
import type {
	BackupEnvironment,
	BackupManifest,
	RootMapping,
} from "./fork-types";

export const HELPER_FLAG = "--fork-portable-backup-helper";
export interface PortableJob {
	locale?: string;
	action: "backup" | "restore";
	archive: string;
	password: string;
	env: BackupEnvironment;
	manifest: BackupManifest;
	mappings: RootMapping[];
	journalPath: string;
	parentPid: number;
	relaunchArgs: string[];
	labels: {
		title: string;
		waiting: string;
		scan: string;
		write: string;
		read: string;
		restore: string;
		done: string;
		failed: string;
		cancel: string;
		close: string;
	};
}

export function launchJob(job: PortableJob) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[...(app.isPackaged ? [] : [app.getAppPath()]), HELPER_FLAG],
			{
				detached: true,
				stdio: ["pipe", "pipe", "ignore"],
				env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
			},
		);
		let ready = false;
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("backup_helper_timeout"));
		}, 15_000);
		const failed = () => {
			clearTimeout(timer);
			if (!ready) reject(new Error("backup_helper_failed"));
		};
		child.once("error", failed);
		child.once("exit", failed);
		child.stdin.on("error", failed);
		child.stdout.on("data", (data) => {
			if (ready || !String(data).includes("PARADEV_BACKUP_READY")) return;
			ready = true;
			clearTimeout(timer);
			child.stdout.destroy();
			child.unref();
			resolve();
		});
		child.stdin.end(JSON.stringify(job));
	});
}

function alive(pid: number) {
	if (!Number.isSafeInteger(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function servicePids(appHome: string) {
	const pids: number[] = [];
	let orgs: string[] = [];
	try {
		orgs = await readdir(join(appHome, "host"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	for (const org of orgs)
		for (const name of ["manifest.json", "pty-daemon-manifest.json"]) {
			try {
				const value = JSON.parse(
					await readFile(join(appHome, "host", org, name), "utf8"),
				) as { pid: number };
				if (alive(value.pid)) pids.push(value.pid);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
	try {
		const pid = Number(
			(await readFile(join(appHome, "terminal-host.pid"), "utf8")).trim(),
		);
		if (alive(pid)) pids.push(pid);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	return [...new Set(pids)];
}

async function waitForParent(
	job: PortableJob,
	signal: AbortSignal,
	pids: number[],
) {
	for (let attempt = 0; [job.parentPid, ...pids].some(alive); attempt++) {
		if (attempt >= 240) throw new Error("backup_app_still_running");
		await delay(250, undefined, { signal });
	}
	if ((await servicePids(job.env.appHome)).length)
		throw new Error("backup_host_still_running");
}

export async function runHelper(profile: string) {
	let input = "";
	for await (const chunk of process.stdin) {
		input += String(chunk);
		if (input.length > 32 * 1024 * 1024)
			throw new Error("backup_job_too_large");
	}
	const job = JSON.parse(input) as PortableJob;
	input = "";

	await app.whenReady();
	app.on("window-all-closed", () => {});
	const window = new BrowserWindow({
		width: 540,
		height: 230,
		resizable: false,
		minimizable: true,
		title: job.labels.title,
		webPreferences: {
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	const abort = new AbortController();
	let finished = false;
	app.on("before-quit", (event) => {
		if (!finished) {
			event.preventDefault();
			abort.abort();
		}
	});
	process.on("SIGTERM", () => abort.abort());
	window.on("close", (event) => {
		if (!finished) {
			event.preventDefault();
			abort.abort();
		}
	});
	const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head><body style="font:15px system-ui;background:#242424;color:#eee;padding:24px"><h3 id="title"></h3><p id="status"></p><progress style="width:100%" id="progress"></progress></body></html>`;
	await window.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
	);
	const show = (message: string) => {
		if (window.isDestroyed()) return;
		void window.webContents
			.executeJavaScript(
				`document.getElementById("title").textContent=${JSON.stringify(job.labels.title)};document.getElementById("status").textContent=${JSON.stringify(message)};`,
			)
			.catch(() => {});
	};
	show(job.labels.waiting);
	const pids = await servicePids(job.env.appHome);
	await writeFile(
		`${job.journalPath}.lock`,
		JSON.stringify({ pid: process.pid }),
		{ mode: 0o600, flag: "wx" },
	);
	process.stdout.write("PARADEV_BACKUP_READY\n");
	try {
		await waitForParent(job, abort.signal, pids);
		const progress = (value: {
			phase: "scan" | "write" | "read" | "restore";
			files: number;
			bytes: number;
		}) => {
			show(
				`${job.labels[value.phase]} · ${formatNumber(value.files, undefined, job.locale)} · ${formatNumber(Math.round(value.bytes / 1048576), undefined, job.locale)} MB`,
			);
			window.setProgressBar(-1);
		};
		let previous: string[] = [];
		if (job.action === "backup") {
			const fresh = await inventory(job.env, progress, abort.signal);
			if (
				JSON.stringify(fresh.roots.map((root) => root.path).sort()) !==
				JSON.stringify(job.manifest.roots.map((root) => root.path).sort())
			)
				throw new Error("backup_inventory_changed");
			if (fresh.roots.some((root) => contains(root.path, job.archive)))
				throw new Error("backup_archive_inside_source");
			fresh.storage = job.manifest.storage;
			fresh.keychain = await readKeychain(keychainServices(fresh));
			await writeArchive(
				job.archive,
				job.password,
				fresh,
				progress,
				abort.signal,
				async (partial) => {
					await writeFile(
						`${job.journalPath}.lock`,
						JSON.stringify({ pid: process.pid, partial }),
						{ mode: 0o600 },
					);
				},
			);
		} else {
			await validateTargets(job.mappings, job.env.home, [
				job.archive,
				job.journalPath,
			]);
			previous = await restoreArchive({
				archive: job.archive,
				password: job.password,
				expectedManifest: job.manifest,
				mappings: job.mappings,
				env: job.env,
				journalPath: job.journalPath,
				progress,
				signal: abort.signal,
			});
		}
		show(job.labels.done);
		await dialog.showMessageBox(window, {
			type: "info",
			message: job.labels.done,
			detail: [job.archive, ...previous].join("\n"),
			buttons: [job.labels.close],
		});
	} catch (error) {
		await dialog.showMessageBox(window, {
			type: "error",
			message: job.labels.failed,
			detail: error instanceof Error ? error.message : String(error),
			buttons: [job.labels.close],
		});
	} finally {
		job.password = "";
		await rm(`${job.journalPath}.lock`, { force: true });
		finished = true;
		window.destroy();
		await rm(profile, { recursive: true, force: true });
		if (!alive(job.parentPid)) {
			const child = spawn(process.execPath, job.relaunchArgs, {
				detached: true,
				stdio: "ignore",
			});
			child.unref();
		}
		app.exit(0);
	}
}
