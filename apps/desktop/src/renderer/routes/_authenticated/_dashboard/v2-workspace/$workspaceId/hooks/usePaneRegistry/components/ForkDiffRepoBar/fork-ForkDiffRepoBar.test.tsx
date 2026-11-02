import { expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import type { RendererContext } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { screen, waitFor } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter as ElectronRouter } from "lib/trpc/routers";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { fireEvent, queryFixture, render } from "renderer/test-utils/fork-ui";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { ForkDiffRepoBar } from "./ForkDiffRepoBar";

const GIT_FOLDER = {
	id: "folder-api",
	workspaceKey: "workspace:folder-api",
	name: "api",
	isGitRepo: true,
	branch: "feature/api-login",
	exists: true,
};
const PLAIN_FOLDER = {
	id: "folder-docs",
	workspaceKey: "workspace:folder-docs",
	name: "docs",
	isGitRepo: false,
	branch: null,
	exists: true,
};

function renderBar(folders: unknown[]) {
	const query = queryFixture();
	const responses: Record<string, unknown> = {
		"projectFolders.listForWorkspace": folders,
		"workspace.get": { id: "workspace", projectId: "project", branch: "main" },
		"project.get": { repoPath: "/repos/web" },
	};
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			observer.next({ result: { data: responses[call.op.path] ?? null } });
			observer.complete();
		});
	const client = workspaceTrpc.createClient({ links: [link] });
	const electronLink: TRPCLink<ElectronRouter> = () => () =>
		observable((observer) => observer.complete());
	let data: DiffPaneData = {
		path: "src/app.ts",
		changeKey: "unstaged:src/app.ts",
		collapsedFiles: ["unstaged:src/app.ts"],
	};
	const context = {
		pane: { id: "pane", kind: "diff", data },
		store: {
			getState: () => ({
				setPaneData: ({ data: next }: { data: PaneViewerData }) => {
					data = next as DiffPaneData;
				},
			}),
		},
	} as unknown as RendererContext<PaneViewerData>;
	render(
		<query.wrapper>
			<electronTrpc.Provider
				client={electronTrpc.createClient({ links: [electronLink] })}
				queryClient={query.client}
			>
				<workspaceTrpc.Provider client={client} queryClient={query.client}>
					<ForkDiffRepoBar context={context} workspaceId="workspace" />
				</workspaceTrpc.Provider>
			</electronTrpc.Provider>
		</query.wrapper>,
	);
	return { current: () => data };
}

test("the Changes pane lists the project's git folders with their branch and switches to the chosen one", async () => {
	const pane = renderBar([GIT_FOLDER, PLAIN_FOLDER]);
	const trigger = await screen.findByRole("combobox", { name: "Repository" });
	expect(trigger.textContent).toContain("web");
	fireEvent.keyDown(trigger, { key: "Enter" });
	const option = await screen.findByRole("option", { name: /api/ });
	expect(option.textContent).toContain("feature/api-login");
	expect(screen.queryByRole("option", { name: /docs/ })).toBeNull();
	fireEvent.click(option);
	await waitFor(() =>
		expect(pane.current().repoKey).toBe("workspace:folder-api"),
	);
	expect(pane.current()).toMatchObject({
		path: "",
		changeKey: undefined,
		collapsedFiles: [],
	});
});

test("a project without git folders keeps the Changes pane free of a folder bar", async () => {
	renderBar([PLAIN_FOLDER]);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(screen.queryByRole("combobox", { name: "Repository" })).toBeNull();
});
