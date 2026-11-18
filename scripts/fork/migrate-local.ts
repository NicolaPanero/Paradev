import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { SQL } from "bun";

export function localMigrationUrl(
	value: string | undefined,
	expectedPort: string | undefined,
): string {
	if (!value || !expectedPort || !/^\d+$/.test(expectedPort))
		throw new Error("Local database settings are missing");
	const url = new URL(value);
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
		url.port !== expectedPort ||
		url.pathname !== "/main" ||
		url.username !== "postgres"
	)
		throw new Error(
			"Local migrations require this workspace's isolated Postgres database",
		);
	return value;
}

if (import.meta.main) {
	const url = localMigrationUrl(
		process.env.DATABASE_URL_UNPOOLED,
		process.env.LOCAL_PG_PORT,
	);
	const project = process.argv[2];
	if (!project?.startsWith("superset-"))
		throw new Error("The workspace Docker project is required");
	const root = join(import.meta.dir, "../..");
	const databaseRequire = createRequire(join(root, "packages/db/package.json"));
	const { drizzle } = await import(
		databaseRequire.resolve("drizzle-orm/bun-sql")
	);
	const { migrate } = await import(
		databaseRequire.resolve("drizzle-orm/bun-sql/migrator")
	);
	const container = execFileSync(
		"docker",
		[
			"compose",
			"-p",
			project,
			"-f",
			join(root, "docker-compose.yml"),
			"ps",
			"-q",
			"postgres",
		],
		{ encoding: "utf8" },
	).trim();
	if (!container)
		throw new Error("The workspace Postgres container is not running");
	const [details] = JSON.parse(
		execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
	) as {
		Config: { Labels: Record<string, string> };
		NetworkSettings: { Ports: Record<string, { HostPort: string }[]> };
	}[];
	if (
		details?.Config.Labels["com.docker.compose.project"] !== project ||
		!details.NetworkSettings.Ports["5432/tcp"]?.some(
			(binding) => binding.HostPort === process.env.LOCAL_PG_PORT,
		)
	)
		throw new Error(
			"The database port does not belong to this workspace Docker project",
		);
	const client = new SQL(url, { max: 1 });
	try {
		await migrate(drizzle({ client }), {
			migrationsFolder: join(root, "packages/db/drizzle"),
		});
		console.log("Workspace-local database migrations completed");
	} finally {
		await client.close();
	}
}
