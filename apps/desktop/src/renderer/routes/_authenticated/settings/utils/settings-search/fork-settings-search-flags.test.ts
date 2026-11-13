import { expect, test } from "bun:test";
import { getVisibleMatchCountBySection } from "./settings-search";

test.each([
	{ acp: false, hidePro: false },
	{ acp: false, hidePro: true },
	{ acp: true, hidePro: false },
	{ acp: true, hidePro: true },
])("the chat setting shows whatever the flags, and hidden Pro settings stay independent: %j", ({
	acp,
	hidePro,
}) => {
	const counts = (query: string) =>
		getVisibleMatchCountBySection(query, true, true, true, false, acp, hidePro);
	expect(counts("acp").behavior).toBe(1);
	if (hidePro) expect(counts("billing").billing).toBeUndefined();
	else expect(counts("billing").billing).toBeGreaterThan(0);
});
