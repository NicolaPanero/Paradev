import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export class BackupDatabase {
	private database: DatabaseSync;
	constructor(
		path: string,
		options: { readonly?: boolean; fileMustExist?: boolean } = {},
	) {
		this.database = new DatabaseSync(path, {
			readOnly: options.readonly,
			allowExtension: false,
		});
	}
	prepare(sql: string) {
		const statement = this.database.prepare(sql);
		statement.setReadBigInts(true);
		const normalize = (row: Record<string, unknown>) =>
			Object.fromEntries(
				Object.entries(row).map(([name, value]) => [
					name,
					typeof value === "bigint" &&
					value <= BigInt(Number.MAX_SAFE_INTEGER) &&
					value >= BigInt(Number.MIN_SAFE_INTEGER)
						? Number(value)
						: value,
				]),
			);
		return {
			all: (...values: unknown[]) =>
				statement.all(...(values as SQLInputValue[])).map(normalize),
			get: (...values: unknown[]) => {
				const row = statement.get(...(values as SQLInputValue[]));
				return row ? normalize(row) : undefined;
			},
			iterate: function* (...values: unknown[]) {
				for (const row of statement.iterate(...(values as SQLInputValue[])))
					yield normalize(row);
			},
			run: (...values: unknown[]) =>
				statement.run(...(values as SQLInputValue[])),
		};
	}
	exec(sql: string) {
		this.database.exec(sql);
	}
	pragma(sql: string, options: { simple?: boolean } = {}) {
		const rows = this.database.prepare(`PRAGMA ${sql}`).all();
		return options.simple ? Object.values(rows[0] ?? {})[0] : rows;
	}
	transaction<T>(callback: () => T) {
		return () => {
			this.database.exec("BEGIN IMMEDIATE");
			try {
				const result = callback();
				this.database.exec("COMMIT");
				return result;
			} catch (error) {
				this.database.exec("ROLLBACK");
				throw error;
			}
		};
	}
	close() {
		this.database.close();
	}
}
