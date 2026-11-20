import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	scrypt,
} from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import {
	chmod,
	mkdir,
	open,
	readlink,
	rm,
	symlink,
	utimes,
} from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip, createGzip } from "node:zlib";
import { z } from "zod";
import { walk } from "./fork-inventory";
import { canonical, contains } from "./fork-paths";
import type { BackupManifest, Progress } from "./fork-types";

const MAGIC = Buffer.from("PDVBK001");
const MAX_JSON = 16 * 1024 * 1024;
export async function writeBytes(
	file: {
		write(
			buffer: Uint8Array,
			offset: number,
			length: number,
			position: number | null,
		): Promise<{ bytesWritten: number }>;
	},
	buffer: Buffer,
	position: number | null = null,
) {
	let offset = 0;
	while (offset < buffer.length) {
		const { bytesWritten } = await file.write(
			buffer,
			offset,
			buffer.length - offset,
			position === null ? null : position + offset,
		);
		if (bytesWritten <= 0) throw new Error("backup_write_failed");
		offset += bytesWritten;
	}
}
const rootSchema = z.object({
	id: z.string().regex(/^r\d+$/),
	path: z.string().min(1),
	aliases: z.array(z.string()),
	kind: z.enum(["app", "desktop", "repository", "agent", "linked"]),
	bytes: z.number().int().nonnegative(),
	files: z.number().int().nonnegative(),
});
const manifestSchema = z.object({
	version: z.literal(1),
	appVersion: z.string(),
	platform: z.string(),
	createdAt: z.string(),
	home: z.string(),
	appHome: z.string(),
	userData: z.string(),
	roots: z.array(rootSchema).min(1).max(4096),
	missing: z.array(z.string()),
	cwds: z.array(z.string()),
	aliases: z.record(z.string(), z.string()),
	repositories: z.array(z.string()),
	machineId: z.string(),
	hostId: z.string(),
	storage: z.record(z.string(), z.string()),
	keychain: z.array(
		z.object({ service: z.string(), account: z.string(), data: z.string() }),
	),
});
const entrySchema = z.object({
	root: z.string(),
	path: z.string().max(32768),
	type: z.enum(["directory", "file", "symlink", "end"]),
	size: z.number().int().nonnegative().safe(),
	mode: z.number().int(),
	mtime: z.number(),
	target: z.string().optional(),
});

async function key(password: string, salt: Buffer) {
	if (password.length < 12 || password.length > 4096)
		throw new Error("backup_password_length");
	return (await promisify(scrypt)(password, salt, 32)) as Buffer;
}

function frame(value: unknown) {
	const json = Buffer.from(JSON.stringify(value));
	if (json.length > MAX_JSON) throw new Error("backup_metadata_too_large");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(json.length);
	return Buffer.concat([length, json]);
}

class Reader {
	private pending: Buffer = Buffer.alloc(0);
	constructor(private source: AsyncIterator<Buffer>) {}
	async read(size: number): Promise<Buffer> {
		const chunks: Buffer[] = [];
		let remaining = size;
		while (remaining) {
			if (!this.pending.length) {
				const result = await this.source.next();
				if (result.done) throw new Error("backup_truncated");
				this.pending = result.value;
			}
			const amount = Math.min(remaining, this.pending.length);
			chunks.push(this.pending.subarray(0, amount));
			this.pending = this.pending.subarray(amount);
			remaining -= amount;
		}
		return Buffer.concat(chunks, size);
	}
	async json() {
		const length = (await this.read(4)).readUInt32BE();
		if (length > MAX_JSON || !length)
			throw new Error("backup_invalid_metadata");
		return JSON.parse((await this.read(length)).toString("utf8")) as unknown;
	}
	async end() {
		if (this.pending.length || !(await this.source.next()).done)
			throw new Error("backup_trailing_data");
	}
}

export async function inspectArchive(path: string, password: string) {
	const file = await open(path, "r");
	try {
		const header = Buffer.alloc(56);
		if (
			(await file.read(header, 0, header.length, 0)).bytesRead !== 56 ||
			!header.subarray(0, 8).equals(MAGIC)
		)
			throw new Error("backup_invalid_format");
		const size = header.readUInt32BE(52);
		if (!size || size > MAX_JSON) throw new Error("backup_invalid_metadata");
		const encrypted = Buffer.alloc(size + 16 + 12);
		if (
			(await file.read(encrypted, 0, encrypted.length, 56)).bytesRead !==
			encrypted.length
		)
			throw new Error("backup_truncated");
		const derived = await key(password, header.subarray(8, 40));
		const decipher = createDecipheriv(
			"aes-256-gcm",
			derived,
			header.subarray(40, 52),
		);
		decipher.setAAD(header);
		decipher.setAuthTag(encrypted.subarray(size, size + 16));
		const manifest = manifestSchema.parse(
			JSON.parse(
				Buffer.concat([
					decipher.update(encrypted.subarray(0, size)),
					decipher.final(),
				]).toString("utf8"),
			),
		);
		if (
			new Set(manifest.roots.map((root) => root.id)).size !==
			manifest.roots.length
		)
			throw new Error("backup_duplicate_root");
		const offset = 56 + encrypted.length;
		const stat = await file.stat();
		if (stat.size < offset + 17) throw new Error("backup_truncated");
		const tag = Buffer.alloc(16);
		await file.read(tag, 0, 16, stat.size - 16);
		return {
			manifest,
			derived,
			iv: encrypted.subarray(size + 16),
			offset,
			end: stat.size - 17,
			tag,
			headerHash: createHash("sha256")
				.update(header)
				.update(encrypted)
				.digest(),
		};
	} finally {
		await file.close();
	}
}

export async function writeArchive(
	path: string,
	password: string,
	manifest: BackupManifest,
	progress: Progress = () => {},
	signal?: AbortSignal,
	onPartial?: (file: {
		path: string;
		ino: number;
		dev: number;
	}) => Promise<void>,
) {
	path = await canonical(path);
	if (manifest.roots.some((root) => contains(root.path, path)))
		throw new Error("backup_archive_inside_source");
	const salt = randomBytes(32);
	const iv = randomBytes(12);
	const payloadIv = randomBytes(12);
	const derived = await key(password, salt);
	const metadata = Buffer.from(JSON.stringify(manifestSchema.parse(manifest)));
	if (metadata.length > MAX_JSON) throw new Error("backup_metadata_too_large");
	const header = Buffer.concat([MAGIC, salt, iv, Buffer.alloc(4)]);
	header.writeUInt32BE(metadata.length, 52);
	const cipher = createCipheriv("aes-256-gcm", derived, iv);
	cipher.setAAD(header);
	const encrypted = Buffer.concat([
		cipher.update(metadata),
		cipher.final(),
		cipher.getAuthTag(),
		payloadIv,
	]);
	const prefix = Buffer.concat([header, encrypted]);
	const payload = createCipheriv("aes-256-gcm", derived, payloadIv);
	payload.setAAD(createHash("sha256").update(prefix).digest());
	const partial = `${path}.${randomBytes(8).toString("hex")}.partial`;
	const file = await open(partial, "wx", 0o600);
	let files = 0;
	let bytes = 0;
	async function* contents() {
		const fingerprint = createHash("sha256");
		for (const root of manifest.roots) {
			for await (const entry of walk(root.path, root.kind)) {
				signal?.throwIfAborted();
				fingerprint.update(
					JSON.stringify([
						root.id,
						entry.rel,
						entry.stat.ino,
						entry.stat.size,
						entry.stat.mtimeMs,
						entry.stat.ctimeMs,
					]),
				);
				const type = entry.stat.isFile()
					? "file"
					: entry.stat.isDirectory()
						? "directory"
						: "symlink";
				yield frame({
					root: root.id,
					path: entry.rel,
					type,
					size: type === "file" ? entry.stat.size : 0,
					mode: entry.stat.mode & 0o777,
					mtime: entry.stat.mtimeMs,
					...(type === "symlink" ? { target: await readlink(entry.path) } : {}),
				});
				if (type === "file") {
					const handle = await open(
						entry.path,
						constants.O_RDONLY | constants.O_NOFOLLOW,
					);
					try {
						const before = await handle.stat();
						if (
							before.ino !== entry.stat.ino ||
							before.size !== entry.stat.size ||
							before.mtimeMs !== entry.stat.mtimeMs
						)
							throw new Error(`backup_source_changed: ${entry.path}`);
						const hash = createHash("sha256");
						let size = 0;
						for await (const chunk of handle.createReadStream({
							autoClose: false,
						})) {
							signal?.throwIfAborted();
							hash.update(chunk);
							size += chunk.length;
							bytes += chunk.length;
							yield chunk;
						}
						const after = await handle.stat();
						if (
							size !== entry.stat.size ||
							before.mtimeMs !== after.mtimeMs ||
							before.ctimeMs !== after.ctimeMs
						)
							throw new Error(`backup_source_changed: ${entry.path}`);
						yield hash.digest();
					} finally {
						await handle.close();
					}
					files++;
					if (files % 100 === 0) progress({ phase: "write", files, bytes });
				}
			}
		}
		const verification = createHash("sha256");
		for (const root of manifest.roots)
			for await (const entry of walk(root.path, root.kind)) {
				signal?.throwIfAborted();
				verification.update(
					JSON.stringify([
						root.id,
						entry.rel,
						entry.stat.ino,
						entry.stat.size,
						entry.stat.mtimeMs,
						entry.stat.ctimeMs,
					]),
				);
			}
		if (!fingerprint.digest().equals(verification.digest()))
			throw new Error("backup_source_changed");
		if (
			files !== manifest.roots.reduce((sum, root) => sum + root.files, 0) ||
			bytes !== manifest.roots.reduce((sum, root) => sum + root.bytes, 0)
		)
			throw new Error("backup_source_changed");
		yield frame({
			root: "",
			path: "",
			type: "end",
			size: 0,
			mode: 0,
			mtime: 0,
		});
	}
	try {
		const stat = await file.stat();
		await onPartial?.({ path: partial, ino: stat.ino, dev: stat.dev });
		await writeBytes(file, prefix);
		await pipeline(
			Readable.from(contents()),
			createGzip({ level: 1 }),
			payload,
			createWriteStream(partial, {
				fd: file.fd,
				autoClose: false,
				start: prefix.length,
			}),
			{ signal },
		);
		await writeBytes(file, payload.getAuthTag(), (await file.stat()).size);
		await file.sync();
		await file.close();
		const { link, unlink } = await import("node:fs/promises");
		await link(partial, path);
		await unlink(partial);
		progress({ phase: "write", files, bytes });
	} catch (error) {
		await file.close().catch(() => {});
		await rm(partial, { force: true });
		throw error;
	}
}

export async function extractArchive(
	path: string,
	password: string,
	stages: Record<string, string>,
	progress: Progress = () => {},
	signal?: AbortSignal,
) {
	const info = await inspectArchive(path, password);
	const decipher = createDecipheriv("aes-256-gcm", info.derived, info.iv);
	decipher.setAAD(info.headerHash);
	decipher.setAuthTag(info.tag);
	const gunzip = createGunzip();
	const input = createReadStream(path, { start: info.offset, end: info.end });
	const piping = pipeline(input, decipher, gunzip, { signal });
	piping.catch(() => {});
	const reader = new Reader(gunzip[Symbol.asyncIterator]());
	const links: { path: string; target: string }[] = [];
	const directories: { path: string; mode: number; mtime: number }[] = [];
	const seenRoots = new Set<string>();
	let bytes = 0;
	let files = 0;
	const expectedBytes = info.manifest.roots.reduce(
		(sum, root) => sum + root.bytes,
		0,
	);
	const expectedFiles = info.manifest.roots.reduce(
		(sum, root) => sum + root.files,
		0,
	);
	try {
		while (true) {
			signal?.throwIfAborted();
			const entry = entrySchema.parse(await reader.json());
			if (entry.type === "end") break;
			const root = stages[entry.root];
			const definition = info.manifest.roots.find(
				(item) => item.id === entry.root,
			);
			if (
				entry.path === "" &&
				(entry.type === "symlink" ||
					((definition?.kind === "app" || definition?.kind === "desktop") &&
						entry.type !== "directory"))
			)
				throw new Error("backup_unsafe_root");
			if (
				!root ||
				isAbsolute(entry.path) ||
				entry.path.includes("\\") ||
				entry.path.includes("\0") ||
				(entry.path !== "" && posix.normalize(entry.path) !== entry.path) ||
				entry.path.split("/").includes("..")
			)
				throw new Error("backup_unsafe_path");
			const target = join(root, entry.path);
			if (entry.path === "") seenRoots.add(entry.root);
			if (entry.type === "directory") {
				await mkdir(target, { mode: 0o700 });
				directories.push({
					path: target,
					mode: entry.mode,
					mtime: entry.mtime,
				});
			} else if (entry.type === "symlink") {
				if (!entry.target || entry.target.includes("\0"))
					throw new Error("backup_unsafe_link");
				links.push({ path: target, target: entry.target });
			} else {
				if (bytes + entry.size > expectedBytes || files >= expectedFiles)
					throw new Error("backup_size_mismatch");
				const handle = await open(target, "wx", 0o600);
				try {
					const hash = createHash("sha256");
					let remaining = entry.size;
					while (remaining) {
						const chunk = await reader.read(Math.min(remaining, 65536));
						hash.update(chunk);
						await writeBytes(handle, chunk);
						remaining -= chunk.length;
						bytes += chunk.length;
					}
					if (!hash.digest().equals(await reader.read(32)))
						throw new Error("backup_checksum_failed");
					await handle.chmod(entry.mode & 0o777);
					await handle.utimes(entry.mtime / 1000, entry.mtime / 1000);
				} finally {
					await handle.close();
				}
				files++;
				if (files % 100 === 0) progress({ phase: "read", files, bytes });
			}
		}
		await reader.end();
		await piping;
		if (bytes !== expectedBytes || files !== expectedFiles)
			throw new Error("backup_size_mismatch");
		for (const root of info.manifest.roots)
			if (!seenRoots.has(root.id)) throw new Error("backup_root_missing");
		for (const link of links) await symlink(link.target, link.path);
		progress({ phase: "read", files, bytes });
		return {
			manifest: info.manifest,
			finalize: async () => {
				for (const dir of directories.reverse()) {
					await chmod(dir.path, dir.mode & 0o777);
					await utimes(dir.path, dir.mtime / 1000, dir.mtime / 1000);
				}
			},
		};
	} catch (error) {
		input.destroy();
		gunzip.destroy();
		await piping.catch(() => {});
		throw error;
	}
}
