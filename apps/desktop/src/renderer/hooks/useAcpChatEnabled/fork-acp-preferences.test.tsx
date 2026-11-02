import { afterEach, expect, test } from "bun:test";
import { useForkCliOptionsStore } from "renderer/stores/fork-cli-options";
import { act, renderHook } from "renderer/test-utils/fork-ui";
import {
	forkResolveAcpChatChoice,
	useForkAcpChatChoice,
} from "./fork-acp-chat-choice";

const initial = useForkCliOptionsStore.getState().showCliOptions;

afterEach(() => {
	useForkCliOptionsStore.getState().setShowCliOptions(initial);
});

test("basic mode always opens chats, whatever the account Chat setting says", () => {
	useForkCliOptionsStore.getState().setShowCliOptions(false);
	const hook = renderHook(() => useForkAcpChatChoice(false));
	expect(hook.result.current).toBe(true);
	expect(forkResolveAcpChatChoice(false)).toBe(true);
});

test("advanced mode follows the account Chat setting", () => {
	useForkCliOptionsStore.getState().setShowCliOptions(true);
	const off = renderHook(() => useForkAcpChatChoice(false));
	const on = renderHook(() => useForkAcpChatChoice(true));
	expect(off.result.current).toBe(false);
	expect(on.result.current).toBe(true);
	expect(forkResolveAcpChatChoice(false)).toBe(false);
	expect(forkResolveAcpChatChoice(true)).toBe(true);
	act(() => useForkCliOptionsStore.getState().setShowCliOptions(false));
	expect(off.result.current).toBe(true);
});
