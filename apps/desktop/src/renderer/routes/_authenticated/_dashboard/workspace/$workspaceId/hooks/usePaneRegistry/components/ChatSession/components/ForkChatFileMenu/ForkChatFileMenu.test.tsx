import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../providers/ChatPaneActionsProvider";
import { FileLinkMenu } from "../FileLinkMenu";

afterEach(cleanup);

const openLink: OpenLink = () => true;

test("the file menu of a chat without a workspace has no Reveal in Finder item", async () => {
	render(
		<ChatPaneActionsProvider openLink={openLink}>
			<FileLinkMenu reference="demo.mp4">
				<code>demo.mp4</code>
			</FileLinkMenu>
		</ChatPaneActionsProvider>,
	);
	fireEvent.contextMenu(screen.getByText("demo.mp4"));
	await screen.findByText("Copy Path");
	expect(screen.queryByText("Reveal in Finder")).toBeNull();
});
