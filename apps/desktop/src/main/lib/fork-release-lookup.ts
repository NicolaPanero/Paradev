import { type ForkInstallAsset, forkInstallAsset } from "./fork-update-install";

const TAG = /^desktop-v[\w.+-]+$/;

/**
 * Release lookups for the fork updater. The latest tag comes from the
 * `releases/latest` web redirect, which is outside the REST API's 60
 * requests/hour per IP that a whole office shares. The REST API is used only
 * to verify a release that is about to be installed.
 */
export function createForkReleaseLookup({
	repository,
	request = fetch,
	now = Date.now,
	platform = process.platform,
}: {
	repository: string;
	request?: typeof fetch;
	now?: () => number;
	platform?: NodeJS.Platform;
}) {
	let cached: ForkInstallAsset | undefined;
	let retryAt = 0;

	const holdOff = (response: Response) => {
		const limited =
			response.status === 429 ||
			(response.status === 403 &&
				response.headers.get("x-ratelimit-remaining") === "0");
		if (!limited) return;
		const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
		const retry = response.headers.get("retry-after");
		const retryDate = retry
			? Number.isFinite(Number(retry))
				? now() + Number(retry) * 1000
				: Date.parse(retry)
			: 0;
		const deadlines = [reset, retryDate].filter(
			(value) => Number.isFinite(value) && value > now(),
		);
		retryAt = Math.max(
			now() + 60_000,
			deadlines.length ? Math.max(...deadlines) : now() + 15 * 60_000,
		);
	};
	const ready = () => {
		if (now() < retryAt)
			throw new Error("Fork release check: GitHub rate limit; retry later");
	};
	const api = async (path: string) => {
		ready();
		const response = await request(
			`https://api.github.com/repos/${repository}/${path}`,
			{
				headers: { Accept: "application/vnd.github+json" },
				signal: AbortSignal.timeout(15_000),
			},
		);
		holdOff(response);
		if (!response.ok)
			throw new Error(`Fork release check: HTTP ${response.status}`);
		const asset = forkInstallAsset(await response.json(), repository, platform);
		cached = asset;
		retryAt = 0;
		return asset;
	};

	async function latestTag(): Promise<string> {
		ready();
		const response = await request(
			`https://github.com/${repository}/releases/latest`,
			{ redirect: "manual", signal: AbortSignal.timeout(15_000) },
		);
		holdOff(response);
		const location = response.headers.get("location") ?? "";
		const tag = decodeURIComponent(
			location.match(/\/releases\/tag\/([^/?#]+)$/)?.[1] ?? "",
		);
		if (response.status >= 300 && response.status < 400 && TAG.test(tag)) {
			retryAt = 0;
			return tag;
		}
		if (response.status === 429)
			throw new Error(`Fork release check: HTTP ${response.status}`);
		return (await api("releases/latest")).tag;
	}

	async function asset(tag: string): Promise<ForkInstallAsset> {
		if (cached?.tag === tag) return cached;
		if (!TAG.test(tag)) throw new Error("Invalid fork release");
		const found = await api(`releases/tags/${encodeURIComponent(tag)}`);
		if (found.tag !== tag) throw new Error("Fork release changed; check again");
		return found;
	}

	return { latestTag, asset };
}
