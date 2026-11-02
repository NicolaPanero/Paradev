import { expect, test } from "bun:test";
import { forkGrokAuthMethod } from "./forkGrokAuth";

test("a Grok API key saved in the agent's env authenticates with it, so reopened chats load", () => {
	expect(forkGrokAuthMethod({ XAI_API_KEY: "xai-key" }, undefined)).toBe(
		"xai.api_key",
	);
});

test("without an env key Grok keeps its own login or config.toml key", () => {
	expect(forkGrokAuthMethod({}, undefined)).toBeUndefined();
	expect(forkGrokAuthMethod({ XAI_API_KEY: "" }, undefined)).toBeUndefined();
});
