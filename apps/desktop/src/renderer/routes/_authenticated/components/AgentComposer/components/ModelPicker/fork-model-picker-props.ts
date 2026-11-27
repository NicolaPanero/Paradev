import type { ReactNode } from "react";

export type ForkModelPickerProps = {
	emptyLabel?: string;
	footer?: ReactNode;
	settingsExtra?: ReactNode;
	keepOpenOnPick?: boolean;
	onCloseAutoFocus?: (event: Event) => void;
	fullWidth?: boolean;
};
