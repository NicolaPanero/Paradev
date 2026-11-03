import type { ReactNode } from "react";

export type ForkModelPickerProps = {
	emptyLabel?: string;
	footer?: ReactNode;
	keepOpenOnPick?: boolean;
	onCloseAutoFocus?: (event: Event) => void;
	fullWidth?: boolean;
};
