import { expect, test } from "bun:test";
import { attachmentNameWithSuffix } from "@superset/shared/workspace-attachments";
import { forkAttachmentName } from "./forkRandomAttachmentName";

test("falls back to a random name once every numbered name is taken", () => {
	expect(forkAttachmentName("image.png", 3, 50)).toBe(
		attachmentNameWithSuffix("image.png", 3),
	);
	expect(forkAttachmentName("image.png", 50, 50)).toMatch(
		/^image-[0-9a-f]{12}\.png$/,
	);
	expect(forkAttachmentName("notes", 50, 50)).toMatch(/^notes-[0-9a-f]{12}$/);
});
