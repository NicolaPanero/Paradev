import { expect, mock, test } from "bun:test";
import { createForkReleaseLookup } from "./fork-release-lookup";

const repository = "NicolaPanero/Paradev";
const latestUrl = `https://github.com/${repository}/releases/latest`;
function body(tag = "desktop-v1.37.0-fork.aaaaaaa") {
	return {
		tag_name: tag,
		assets: [
			{
				name: "Superset-fork-arm64.zip",
				browser_download_url: `https://github.com/${repository}/releases/download/${tag}/Superset-fork-arm64.zip`,
				digest: `sha256:${"a".repeat(64)}`,
			},
		],
	};
}
function redirect(tag: string) {
	return new Response(null, {
		status: 302,
		headers: {
			location: `https://github.com/${repository}/releases/tag/${tag}`,
		},
	});
}
function fixture(respond: (url: string) => Response, now?: () => number) {
	const request = mock(
		async (url: string | URL | Request, _options?: RequestInit) =>
			respond(String(url)),
	);
	return {
		request,
		urls: () => request.mock.calls.map(([url]) => String(url)),
		lookup: createForkReleaseLookup({
			repository,
			platform: "darwin",
			request: request as unknown as typeof fetch,
			now,
		}),
	};
}

test("routine checks read the latest tag from the web redirect without spending the REST API quota", async () => {
	const f = fixture(() => redirect("desktop-v1.37.0-fork.bbbbbbb"));
	expect(await f.lookup.latestTag()).toBe("desktop-v1.37.0-fork.bbbbbbb");
	expect(await f.lookup.latestTag()).toBe("desktop-v1.37.0-fork.bbbbbbb");
	expect(f.urls()).toEqual([latestUrl, latestUrl]);
	expect(f.request.mock.calls[0]?.[1]?.redirect).toBe("manual");
});

test("installing verifies that exact release once through the REST API", async () => {
	const tag = "desktop-v1.37.0-fork.bbbbbbb";
	const f = fixture((url) =>
		url.endsWith(`releases/tags/${tag}`)
			? Response.json(body(tag))
			: redirect(tag),
	);
	const asset = await f.lookup.asset(tag);
	expect(asset).toEqual({
		tag,
		url: `https://github.com/${repository}/releases/download/${tag}/Superset-fork-arm64.zip`,
		sha256: "a".repeat(64),
	});
	expect(await f.lookup.asset(tag)).toEqual(asset);
	expect(f.urls()).toEqual([
		`https://api.github.com/repos/${repository}/releases/tags/${tag}`,
	]);
});

test("a redirect that does not name a release falls back to the REST API", async () => {
	const f = fixture((url) =>
		url === latestUrl
			? new Response("<html/>", { status: 200 })
			: Response.json(body("desktop-v1.37.0-fork.ccccccc")),
	);
	expect(await f.lookup.latestTag()).toBe("desktop-v1.37.0-fork.ccccccc");
	expect(f.urls()[1]).toBe(
		`https://api.github.com/repos/${repository}/releases/latest`,
	);
});

test.each([
	403, 429,
])("REST API rate limit HTTP %s waits for GitHub's deadline before asking again", async (status) => {
	let clock = 1_000_000;
	const tag = "desktop-v1.37.0-fork.aaaaaaa";
	let limited = true;
	const f = fixture(
		() =>
			limited
				? new Response(null, {
						status,
						headers: {
							"retry-after": "120",
							"x-ratelimit-reset": "1300",
							"x-ratelimit-remaining": "0",
						},
					})
				: Response.json(body(tag)),
		() => clock,
	);
	await expect(f.lookup.asset(tag)).rejects.toThrow(`HTTP ${status}`);
	clock += 120_000;
	await expect(f.lookup.asset(tag)).rejects.toThrow("rate limit");
	expect(f.request).toHaveBeenCalledTimes(1);
	clock = 1_300_000;
	limited = false;
	expect((await f.lookup.asset(tag)).tag).toBe(tag);
	expect(f.request).toHaveBeenCalledTimes(2);
});

test("an archive without a checksum is never installed, and a transient failure can retry", async () => {
	const tag = body().tag_name;
	let response = () => Response.json({ tag_name: tag, assets: [] });
	const f = fixture(() => response());
	await expect(f.lookup.asset(tag)).rejects.toThrow("checksum");
	response = () => new Response(null, { status: 503 });
	await expect(f.lookup.asset(tag)).rejects.toThrow("HTTP 503");
	response = () => Response.json(body());
	expect((await f.lookup.asset(tag)).tag).toBe(tag);
});
