import { formatNumber } from "@superset/i18n/format";

export function formatCleanupSize(bytes: number): string {
	const [scale, unit] =
		bytes >= 1_000_000_000
			? ([1_000_000_000, "gigabyte"] as const)
			: bytes >= 1_000_000
				? ([1_000_000, "megabyte"] as const)
				: bytes >= 1000
					? ([1000, "kilobyte"] as const)
					: ([1, "byte"] as const);
	return formatNumber(bytes / scale, {
		style: "unit",
		unit,
		unitDisplay: "short",
		maximumFractionDigits: 2,
	});
}
