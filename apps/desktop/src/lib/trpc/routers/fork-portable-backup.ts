import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { getHostId, getMachineId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { app, type BrowserWindow, dialog } from "electron";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { inspectArchive } from "main/lib/fork-portable-backup/fork-archive";
import {
	inventory,
	suggestedTargets,
} from "main/lib/fork-portable-backup/fork-inventory";
import { launchJob } from "main/lib/fork-portable-backup/fork-job";
import {
	canonical,
	contains,
	validateTargets,
} from "main/lib/fork-portable-backup/fork-paths";
import { guardPortableOperation } from "main/lib/fork-portable-backup/fork-restore";
import { registerBackupStorage } from "main/lib/fork-portable-backup/fork-storage";
import type {
	BackupManifest,
	RootMapping,
} from "main/lib/fork-portable-backup/fork-types";
import { getAllWindows } from "main/lib/window-registry/window-registry";
import { z } from "zod";
import { publicProcedure, router } from "..";

const password = z.string().min(12).max(4096);
let plan: {
	id: string;
	action: "backup" | "restore";
	archive: string;
	manifest: BackupManifest;
	expires: number;
} | null = null;
let busy = false;

async function environment() {
	return {
		agentHomes: [
			"CLAUDE_CONFIG_DIR",
			"CODEX_HOME",
			"CURSOR_CONFIG_DIR",
			"GEMINI_CLI_HOME",
			"GROK_CONFIG_DIR",
		].flatMap((key) =>
			process.env[key]?.trim() ? [process.env[key]?.trim() as string] : [],
		),
		home: homedir(),
		appHome: await canonical(SUPERSET_HOME_DIR),
		userData: await canonical(app.getPath("userData")),
		appVersion: app.getVersion(),
		machineId: getMachineId(),
		hostId: getHostId(),
	};
}

const expected = publicProcedure.use(async ({ next }) => {
	const result = await next();
	if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: result.error.message,
		});
	}
	return result;
});

function publicPlan(
	value: NonNullable<typeof plan>,
	mappings: RootMapping[] = [],
) {
	return {
		id: value.id,
		action: value.action,
		archive: value.archive,
		createdAt: value.manifest.createdAt,
		roots: value.manifest.roots.map((root) => ({
			id: root.id,
			path: root.path,
			kind: root.kind,
			bytes: root.bytes,
			files: root.files,
			target: mappings.find((mapping) => mapping.id === root.id)?.target ?? "",
		})),
		missing: value.manifest.missing,
	};
}

export function createForkPortableBackupRouter(
	getWindow: () => BrowserWindow | null,
) {
	registerBackupStorage(SUPERSET_HOME_DIR);
	const showOpen = async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "Paradev++", extensions: ["paradev-backup"] }],
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	};
	return router({
		chooseArchive: expected.mutation(showOpen),
		preview: expected.mutation(async () => {
			if (busy) throw new TRPCError({ code: "CONFLICT" });
			busy = true;
			try {
				const manifest = await inventory(await environment());
				plan = {
					id: randomUUID(),
					action: "backup",
					archive: "",
					manifest,
					expires: Date.now() + 30 * 60_000,
				};
				return publicPlan(plan);
			} finally {
				busy = false;
			}
		}),
		inspect: expected
			.input(z.object({ archive: z.string(), password }))
			.mutation(async ({ input }) => {
				if (busy) throw new TRPCError({ code: "CONFLICT" });
				const { manifest } = await inspectArchive(
					input.archive,
					input.password,
				);
				if (manifest.platform !== process.platform)
					throw new Error("backup_platform_mismatch");
				const env = await environment();
				const current = env.appVersion.split(".").map(Number);
				const source = manifest.appVersion.split(".").map(Number);
				if (
					source.some(
						(version, index) =>
							version > (current[index] ?? 0) &&
							source
								.slice(0, index)
								.every((part, before) => part === current[before]),
					)
				)
					throw new Error("backup_requires_newer_app");
				plan = {
					id: randomUUID(),
					action: "restore",
					archive: input.archive,
					manifest,
					expires: Date.now() + 30 * 60_000,
				};
				return publicPlan(
					plan,
					suggestedTargets(manifest, env, join(env.home, "ParadevRestored")),
				);
			}),
		start: expected
			.input(
				z.object({
					id: z.string(),
					password,
					mappings: z
						.array(z.object({ id: z.string(), target: z.string() }))
						.max(4096),
				}),
			)
			.mutation(async ({ input }) => {
				if (busy || !plan || plan.id !== input.id || plan.expires < Date.now())
					throw new TRPCError({
						code: "CONFLICT",
						message: "backup_preview_expired",
					});
				busy = true;
				try {
					const selected = plan;
					const env = await environment();
					const journalPath = join(
						app.getPath("appData"),
						"Paradev++-portable-restore.json",
					);
					if (selected.action === "backup") {
						const result = await dialog.showSaveDialog({
							defaultPath: join(
								homedir(),
								`Paradev-${new Date().toISOString().slice(0, 10)}.paradev-backup`,
							),
							filters: [{ name: "Paradev++", extensions: ["paradev-backup"] }],
						});
						if (result.canceled || !result.filePath) return { started: false };
						selected.archive = await canonical(result.filePath);
						try {
							await lstat(selected.archive);
							throw new Error("backup_destination_exists");
						} catch (error) {
							if ((error as NodeJS.ErrnoException).code !== "ENOENT")
								throw error;
						}
						if (
							selected.manifest.roots.some((root) =>
								contains(root.path, selected.archive),
							)
						)
							throw new Error("backup_archive_inside_source");
						const windows = getAllWindows();
						await Promise.all(
							windows.map((window) =>
								window.webContents.session.flushStorageData(),
							),
						);
						const window = getWindow();
						if (!window) throw new Error("backup_window_missing");
						selected.manifest.storage =
							(await window.webContents.executeJavaScript(
								"JSON.parse(JSON.stringify(localStorage))",
							)) as Record<string, string>;
					} else {
						await validateTargets(input.mappings, env.home, [
							selected.archive,
							journalPath,
						]);
						for (const root of selected.manifest.roots) {
							const mapping = input.mappings.find(
								(entry) => entry.id === root.id,
							);
							if (
								!mapping ||
								(root.kind === "app" && mapping.target !== env.appHome) ||
								(root.kind === "desktop" && mapping.target !== env.userData)
							)
								throw new Error("backup_target_invalid");
						}
					}
					await guardPortableOperation(journalPath);
					await launchJob({
						action: selected.action,
						archive: selected.archive,
						password: input.password,
						manifest: selected.manifest,
						env,
						mappings: input.mappings,
						journalPath,
						parentPid: process.pid,
						relaunchArgs: app.isPackaged ? [] : [app.getAppPath()],
						labels: {
							title: i18n._(msg({ message: "Portable backup" })),
							waiting: i18n._(
								msg({ message: "Waiting for Paradev++ to close…" }),
							),
							scan: i18n._(msg({ message: "Scanning…" })),
							write: i18n._(msg({ message: "Creating encrypted backup…" })),
							read: i18n._(
								msg({ message: "Verifying and extracting backup…" }),
							),
							restore: i18n._(msg({ message: "Restoring…" })),
							done: i18n._(
								msg({
									message: "Backup operation completed. Paradev++ will reopen.",
								}),
							),
							failed: i18n._(
								msg({
									message:
										"Backup operation failed. Reopen Paradev++ to recover.",
								}),
							),
							cancel: i18n._(msg({ message: "Cancel" })),
							close: i18n._(msg({ message: "OK" })),
						},
					});
					plan = null;
					setTimeout(() => {
						void import("main/index").then(({ quitAppCompletely }) =>
							quitAppCompletely(),
						);
					}, 250);
					return { started: true };
				} finally {
					busy = false;
				}
			}),
	});
}
