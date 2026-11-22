import { useForkConnections } from "renderer/components/ForkIntegrations/hooks/useForkConnections";
import { useForkProFeatures } from "renderer/stores/fork-cli-options";
import type { RailDestination } from "../useRailDestinations";
import { forkRailDestinations } from "./fork-rail-destinations";

export function useForkRailDestinations(
	destinations: RailDestination[],
): RailDestination[] {
	const showProFeatures = useForkProFeatures();
	const { jiraConfigured } = useForkConnections();
	return forkRailDestinations(destinations, showProFeatures, jiraConfigured);
}
