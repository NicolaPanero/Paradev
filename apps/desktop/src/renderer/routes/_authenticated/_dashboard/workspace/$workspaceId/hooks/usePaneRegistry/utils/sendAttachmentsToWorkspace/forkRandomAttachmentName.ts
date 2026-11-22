import { attachmentNameWithSuffix } from "@superset/shared/workspace-attachments";

export const FORK_RANDOM_NAME_ATTEMPTS = 5;

export function forkRandomAttachmentName(base: string): string {
	const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return `${base}-${suffix}`;
	return `${base.slice(0, dot)}-${suffix}${base.slice(dot)}`;
}

/** Numbered names first, then random ones once every numbered name is taken. */
export function forkAttachmentName(
	base: string,
	attempt: number,
	numberedAttempts: number,
): string {
	return attempt < numberedAttempts
		? attachmentNameWithSuffix(base, attempt)
		: forkRandomAttachmentName(base);
}
