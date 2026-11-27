import {
	type ForkAccountResetProps,
	useForkAccountResetControls,
} from "./hooks/useForkAccountResetControls";

export function ForkAccountResets(props: ForkAccountResetProps) {
	const { renderControls, confirmationDialog } =
		useForkAccountResetControls(props);
	return (
		<>
			{renderControls()}
			{confirmationDialog}
		</>
	);
}
