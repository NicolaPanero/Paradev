import { create } from "zustand";
import { useAddRepositoryModalStore } from "./add-repository-modal";

export type ForkProjectComposerMode =
	| { kind: "create" }
	| { kind: "add"; projectId: string; hostUrl: string };

export const useForkProjectComposer = create<{
	active: ForkProjectComposerMode | null;
	open: (mode: ForkProjectComposerMode) => void;
	close: () => void;
}>((set) => ({
	active: null,
	open: (active) => {
		useAddRepositoryModalStore.getState().close();
		set({ active });
	},
	close: () => set({ active: null }),
}));
