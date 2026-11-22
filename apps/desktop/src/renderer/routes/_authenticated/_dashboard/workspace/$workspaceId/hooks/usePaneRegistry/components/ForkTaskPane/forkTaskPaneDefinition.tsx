import type { PaneDefinition, RendererContext } from "@superset/panes";
import { SiJira } from "react-icons/si";
import type { PaneViewerData } from "../../../../types";
import type { ForkTaskPaneData } from "../../../../utils/forkTaskPane";
import { ForkTaskPane } from "./ForkTaskPane";

export const forkTaskPaneDefinition: PaneDefinition<PaneViewerData> = {
	getIcon: () => <SiJira className="size-3.5 text-[#2684FF]" />,
	getTitle: (pane) => (pane.data as ForkTaskPaneData).key,
	renderPane: (ctx: RendererContext<PaneViewerData>) => (
		<ForkTaskPane
			data={ctx.pane.data as ForkTaskPaneData}
			onClose={() => ctx.actions.close()}
		/>
	),
};
