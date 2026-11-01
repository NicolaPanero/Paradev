import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	forkResolveAcpChatChoice,
	useForkAcpChatChoice,
} from "./fork-acp-chat-choice";

export function useAcpChatEnabled(): boolean {
	const { data } = cloudTrpc.userSettings.get.useQuery();
	return useForkAcpChatChoice(data?.experimentalChat === true);
}

/** For choosing chat or terminal at launch: waits for the setting instead of reading "off" while it loads. */
export function useResolveAcpChatEnabled(): () => Promise<boolean> {
	const utils = cloudTrpc.useUtils();
	return useCallback(
		() =>
			utils.userSettings.get
				.ensureData()
				.then((settings) => settings.experimentalChat)
				.catch(() => false)
				.then(forkResolveAcpChatChoice),
		[utils],
	);
}
