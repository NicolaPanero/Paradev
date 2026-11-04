import { createContext, type ReactNode, useContext, useMemo } from "react";
import { mentionedFolders } from "../../utils/mentionedFolders";

const NONE: string[] = [];
const MessageFoldersContext = createContext<string[]>(NONE);

/** The folders a message names, for its bare file names to be found in. */
export function ForkMessageFoldersProvider({
	text,
	children,
}: {
	text: string;
	children: ReactNode;
}) {
	const folders = useMemo(() => mentionedFolders(text), [text]);
	return (
		<MessageFoldersContext.Provider value={folders.length ? folders : NONE}>
			{children}
		</MessageFoldersContext.Provider>
	);
}

export function useMessageFolders(): string[] {
	return useContext(MessageFoldersContext);
}
