import { expect, test } from "bun:test";
import {
	getOfferedSections,
	getVisibleMatchCountBySection,
} from "./settings-search";

test.each([
	false,
	true,
])("the chat setting stays visible when hide Pro is %j", (hidePro) => {
	const counts = (query: string) =>
		getVisibleMatchCountBySection(query, {
			isMac: true,
			isAdmin: true,
			pluginsEnabled: false,
			cloudUsageEnabled: false,
			allowedSections: getOfferedSections(true, hidePro),
		});
	expect(counts("acp").behavior).toBe(1);
	if (hidePro) expect(counts("billing").billing).toBeUndefined();
	else expect(counts("billing").billing).toBeGreaterThan(0);
});
