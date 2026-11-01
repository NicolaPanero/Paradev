import {
	useForkCliOptions,
	useForkCliOptionsStore,
} from "renderer/stores/fork-cli-options";

export function forkAcpChatChoice(
	advanced: boolean,
	accountEnabled: boolean,
): boolean {
	return !advanced || accountEnabled;
}

export function useForkAcpChatChoice(accountEnabled: boolean): boolean {
	return forkAcpChatChoice(useForkCliOptions(), accountEnabled);
}

export function forkResolveAcpChatChoice(accountEnabled: boolean): boolean {
	return forkAcpChatChoice(
		useForkCliOptionsStore.getState().showCliOptions,
		accountEnabled,
	);
}
