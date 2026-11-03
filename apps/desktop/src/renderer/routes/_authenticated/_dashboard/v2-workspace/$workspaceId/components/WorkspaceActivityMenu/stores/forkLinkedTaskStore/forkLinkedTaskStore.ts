import { create } from "zustand";

export interface ForkLinkedTaskTarget {
	hostUrl: string;
	connectionId: string;
	key: string;
}

interface ForkLinkedTaskState {
	target: ForkLinkedTaskTarget | null;
	open: (target: ForkLinkedTaskTarget) => void;
	close: () => void;
}

/** The task a menu row opened. The menu closes when it loses focus, so the dialog cannot live inside it. */
export const useForkLinkedTaskStore = create<ForkLinkedTaskState>((set) => ({
	target: null,
	open: (target) => set({ target }),
	close: () => set({ target: null }),
}));
