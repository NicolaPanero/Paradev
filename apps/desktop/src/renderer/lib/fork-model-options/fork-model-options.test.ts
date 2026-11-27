import { expect, test } from "bun:test";
import {
	catalogModelSelection,
	creationConfigOptions,
	fromOptionValue,
} from "./fork-model-options";

const labels = {
	model: "Model",
	effort: "Effort",
	defaultModel: "Default model",
	defaultEffort: "Default effort",
};

test("an unset or unknown choice shows as the agent default", () => {
	const [model, effort] = creationConfigOptions({
		models: [{ id: "opus", label: "Opus" }],
		selectedModel: "retired",
		efforts: [{ id: "high", label: "High" }],
		selectedEffort: null,
		labels,
	});
	expect(model?.category).toBe("model");
	expect(model?.options.map((option) => option.label)).toEqual([
		"Default model",
		"Opus",
	]);
	expect(fromOptionValue(model?.currentValue ?? "")).toBeNull();
	expect(effort?.category).toBe("thought_level");
	expect(fromOptionValue(effort?.currentValue ?? "")).toBeNull();
});

test("a saved Cursor window launches only when the host and model still offer it", () => {
	const models = [{ id: "opus", label: "Opus" }];
	const catalog = {
		models,
		supportsCursorContext: true,
		configOptions: [
			{
				id: "model",
				label: "Model",
				category: "model",
				currentValue: "opus",
				options: models,
			},
			{
				id: "context",
				label: "Context window",
				currentValue: "300k",
				options: [{ id: "1m", label: "1M" }],
			},
		],
	};
	expect(catalogModelSelection(catalog, "opus[context=1m]")).toBe(
		"opus[context=1m]",
	);
	expect(catalogModelSelection(catalog, "opus[context=2m]")).toBe("opus");
	expect(
		catalogModelSelection(
			{ ...catalog, supportsCursorContext: false },
			"opus[context=1m]",
		),
	).toBe("opus");
});
