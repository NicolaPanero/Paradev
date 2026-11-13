import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";

test("split desktop bundles open the existing fork home before any database consumer", async () => {
	const root = mkdtempSync(join(tmpdir(), "fork-packaged-home-"));
	try {
		const existing = join(root, ".superset-fork");
		mkdirSync(join(existing, "host", "org"), { recursive: true });
		writeFileSync(join(existing, "local.db"), "settings");
		writeFileSync(join(existing, "host", "org", "host.db"), "projects");
		writeFileSync(join(existing, "host", "org", "chat.db"), "sessions");
		const electron = join(root, "electron.ts");
		writeFileSync(
			electron,
			`
			if (process.env.ELECTRON_RUN_AS_NODE) throw new Error("Headless consumers must not load Electron");
			export const profilePaths = {};
			export const app = {
				getPath: () => ${JSON.stringify(root)},
				setPath: (name, value) => { profilePaths[name] = value; },
			};
		`,
		);
		const os = join(root, "os.ts");
		writeFileSync(
			os,
			`
			export const homedir = () => ${JSON.stringify(root)};
			export default { homedir };
		`,
		);
		const paths = join(root, "paths.ts");
		writeFileSync(
			paths,
			`
			export const resolveUserHomeDir = () => ${JSON.stringify(root)};
			export const defaultAppHomeDir = () => ${JSON.stringify(join(root, ".paradev"))};
		`,
		);
		const sharedEnv = join(root, "env.ts");
		writeFileSync(sharedEnv, `export const getWorkspaceName = () => "fork";`);
		const environment = resolve(import.meta.dir, "../app-environment.ts");
		const run = resolve(import.meta.dir, "run.ts");
		const desktop = join(root, "desktop.ts");
		writeFileSync(
			desktop,
			`
			import ${JSON.stringify(run)};
			import { SUPERSET_HOME_DIR } from ${JSON.stringify(environment)};
			import { profilePaths } from ${JSON.stringify(electron)};
			console.log(JSON.stringify({ home: SUPERSET_HOME_DIR, profilePaths }));
		`,
		);
		const consumer = join(root, "consumer.ts");
		writeFileSync(
			consumer,
			`import { SUPERSET_HOME_DIR } from ${JSON.stringify(environment)};
console.log(JSON.stringify({home: SUPERSET_HOME_DIR}));`,
		);
		const outDir = join(root, "dist");
		await build({
			configFile: false,
			logLevel: "silent",
			resolve: {
				alias: [
					{ find: "electron", replacement: electron },
					{ find: "node:os", replacement: os },
					{ find: "shared/env.shared", replacement: sharedEnv },
					{ find: "@superset/agent-setup/paths", replacement: paths },
					{
						find: "@superset/agent-setup/legacy-home-move",
						replacement: resolve(
							import.meta.dir,
							"../../../../../../packages/agent-setup/src/legacy-home-move.ts",
						),
					},
				],
			},
			build: {
				ssr: true,
				outDir,
				minify: false,
				rollupOptions: {
					input: { desktop, consumer },
					external: (id) => id.startsWith("node:") && id !== "node:os",
					output: {
						format: "cjs",
						entryFileNames: "[name].cjs",
						chunkFileNames: "[name].cjs",
					},
				},
			},
		});
		for (const inherited of [
			"",
			"   ",
			join(root, ".paradev-fork"),
			join(root, ".paradev"),
			join(root, ".superset"),
			join(root, "custom"),
		]) {
			const child = Bun.spawnSync(
				[process.execPath, join(outDir, "desktop.cjs")],
				{
					env: {
						...process.env,
						NODE_ENV: "production",
						ELECTRON_RUN_AS_NODE: "",
						SUPERSET_HOME_DIR: inherited,
					},
				},
			);
			expect(child.exitCode).toBe(0);
			const result = JSON.parse(child.stdout.toString());
			expect(result.home).toBe(
				inherited === join(root, "custom") ? inherited : existing,
			);
			expect(result.profilePaths).toEqual({
				userData: join(root, "Superset Fork"),
				sessionData: join(root, "Superset Fork"),
			});
		}
		const headless = Bun.spawnSync(
			[process.execPath, join(outDir, "consumer.cjs")],
			{
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "1",
					NODE_ENV: "production",
					SUPERSET_HOME_DIR: "",
				},
			},
		);
		expect(headless.exitCode).toBe(0);
		expect(JSON.parse(headless.stdout.toString()).home).toBe(existing);
		expect(readFileSync(join(existing, "host", "org", "host.db"), "utf8")).toBe(
			"projects",
		);
		expect(readFileSync(join(existing, "host", "org", "chat.db"), "utf8")).toBe(
			"sessions",
		);
		rmSync(existing, { recursive: true });
		const official = join(root, ".paradev");
		mkdirSync(official);
		writeFileSync(join(official, "local.db"), "imported settings");
		const firstLaunch = Bun.spawnSync(
			[process.execPath, join(outDir, "desktop.cjs")],
			{
				env: {
					...process.env,
					NODE_ENV: "production",
					ELECTRON_RUN_AS_NODE: "",
					SUPERSET_HOME_DIR: "",
				},
			},
		);
		expect(firstLaunch.exitCode).toBe(0);
		expect(readFileSync(join(existing, "local.db"), "utf8")).toBe(
			"imported settings",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
