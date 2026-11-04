/**
 * Grok CLI reads an `api_key` in its own config.toml without being asked, but
 * a key that only arrives through the environment (Paradev++'s Grok setup
 * stores it in the agent's env) is ignored until the client authenticates
 * with `xai.api_key`: both session/new and session/load answer "no auth
 * method id provided" otherwise.
 */
export function forkGrokAuthMethod(
	env: Record<string, string | undefined>,
	fallback: string | undefined,
): string | undefined {
	return env.XAI_API_KEY ? "xai.api_key" : fallback;
}
