import { useForkProFeatures } from "renderer/stores/fork-cli-options";
import {
	useWorkspacesFilterStore,
	WHERE_FILTER_THIS_DEVICE,
} from "../../stores/workspacesFilterStore";

export function useForkWorkspacesDeviceFilter() {
	const showProFeatures = useForkProFeatures();
	const whereFilter = useWorkspacesFilterStore((state) => state.whereFilter);
	return showProFeatures ? whereFilter : WHERE_FILTER_THIS_DEVICE;
}
