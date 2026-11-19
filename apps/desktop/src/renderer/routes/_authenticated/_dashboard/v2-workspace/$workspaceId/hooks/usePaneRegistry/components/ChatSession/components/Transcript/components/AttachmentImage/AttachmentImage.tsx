import { AttachmentFileCard } from "@superset/chat-ui/AttachmentFileCard";
import type { ComponentProps } from "react";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { ForkInlineAttachmentImage } from "./components/ForkInlineAttachmentImage";
import { HostAttachmentImage } from "./components/HostAttachmentImage";

export function AttachmentImage(
	props: ComponentProps<typeof HostAttachmentImage> & { src?: string },
) {
	const { workspaceId } = useChatPaneActions();
	if (props.src)
		return (
			<ForkInlineAttachmentImage
				src={props.src}
				type={props.type}
				filename={props.name || props.path.split("/").pop() || props.path}
				alt={props.alt}
			/>
		);
	if (!workspaceId)
		return (
			<AttachmentFileCard
				name={props.name || (props.path.split("/").pop() ?? props.path)}
				mediaType={props.type}
			/>
		);
	return <HostAttachmentImage {...props} />;
}
