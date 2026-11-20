import { AttachmentFileCard } from "@superset/chat-ui/AttachmentFileCard";
import { useState } from "react";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { PreviewableImage } from "../PreviewableImage";

export function ForkInlineAttachmentImage({
	src,
	type,
	filename,
	alt,
}: {
	src: string;
	type: string;
	filename: string;
	alt?: string;
}) {
	const [open, setOpen] = useState(false);
	const [unrenderable, setUnrenderable] = useState(false);
	const saveImageToDownloads = useSaveImageToDownloads();
	if (unrenderable)
		return <AttachmentFileCard name={filename} mediaType={type} />;
	return (
		<>
			<PreviewableImage
				alt={alt}
				filename={filename}
				src={src}
				onClick={() => setOpen(true)}
				onError={() => setUnrenderable(true)}
			/>
			<ImagePreviewOverlay
				filename={filename}
				onClose={() => setOpen(false)}
				onDownload={() => saveImageToDownloads(src, filename)}
				open={open}
				src={src}
			/>
		</>
	);
}
