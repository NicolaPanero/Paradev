export type LocatedPath = { resolvedPath: string; isDirectory: boolean };

/**
 * Where a path an agent wrote is on the host: the path as written, or the
 * file it most plausibly means when the agent shortened it. A host that
 * cannot answer the second question leaves the path not found.
 */
export async function locatePath(
	path: string,
	host: {
		stat: (path: string) => Promise<LocatedPath | null>;
		resolveFile: (
			reference: string,
		) => Promise<{ resolvedPath: string } | null>;
	},
	/** Where the message says its bare file names are, tried before a search. */
	candidates: string[] = [],
): Promise<LocatedPath | null> {
	const exact = await host.stat(path);
	if (exact) return exact;
	for (const candidate of candidates) {
		const found = await host.stat(candidate).catch(() => null);
		if (found && !found.isDirectory) return found;
	}
	const file = await host.resolveFile(path).catch(() => null);
	return file ? { resolvedPath: file.resolvedPath, isDirectory: false } : null;
}
