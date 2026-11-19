import { expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ForkProjectComposerMode } from "renderer/stores/fork-project-composer";
import {
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { ForkProjectComposerDialog } from "./ForkProjectComposerDialog";

function fixture(
	options: {
		oldHost?: boolean;
		canBrowse?: boolean;
		mode?: ForkProjectComposerMode;
	} = {},
) {
	const calls: { path: string; input: unknown }[] = [];
	const created: unknown[] = [];
	let closed = false;
	const query = queryFixture();
	const client = createTRPCClient<AppRouter>({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						calls.push({ path: op.path, input: op.input });
						if (options.oldHost) {
							observer.error(
								TRPCClientError.from({
									error: {
										message: "Unknown procedure",
										code: -32004,
										data: { code: "NOT_FOUND", httpStatus: 404 },
									},
								}),
							);
							return;
						}
						const data =
							op.path === "project.groupSources"
								? [
										{
											path: "/code/api",
											name: "API",
											projectNames: ["Existing"],
											isGitRepo: true,
										},
										{
											path: "/code/web",
											name: "Web",
											projectNames: ["Other"],
											isGitRepo: true,
										},
										{
											path: "/code/docs",
											name: "Docs",
											projectNames: ["Other"],
											isGitRepo: false,
										},
									]
								: {
										projectId: "new-group",
										repoPath: "/code/web",
										created: true,
									};
						observer.next({ result: { data } });
						observer.complete();
					}),
		],
	});
	const electron = electronTrpc.createClient({
		links: [
			() => () =>
				observable((observer) => {
					observer.next({ result: { data: { canceled: true, paths: [] } } });
					observer.complete();
				}),
		],
	});
	const view = render(
		<electronTrpc.Provider client={electron} queryClient={query.client}>
			<ForkProjectComposerDialog
				mode={options.mode ?? { kind: "create" }}
				client={client}
				canBrowse={options.canBrowse ?? true}
				hostUrl="http://test"
				onClose={() => {
					closed = true;
				}}
				onCreated={(result) => created.push(result)}
			/>
		</electronTrpc.Provider>,
		{ wrapper: query.wrapper },
	);
	return { view, calls, created, closed: () => closed };
}

test("creates a named project from reused repositories, retaining selections while searching", async () => {
	const f = fixture();
	await flush();
	const create = f.view.getByRole("button", {
		name: "Create project",
	}) as HTMLButtonElement;
	expect(create.disabled).toBe(true);
	fireEvent.change(f.view.getByLabelText("Project name"), {
		target: { value: "Atlante BTCore" },
	});
	fireEvent.click(f.view.getByRole("checkbox", { name: "/code/api" }));
	expect(
		(f.view.getByRole("checkbox", { name: "/code/api" }) as HTMLInputElement)
			.checked,
	).toBe(true);
	fireEvent.click(f.view.getByRole("checkbox", { name: "/code/docs" }));
	fireEvent.change(f.view.getByLabelText("Search folders or projects"), {
		target: { value: "Other" },
	});
	expect(f.view.queryByRole("checkbox", { name: "/code/api" })).toBeNull();
	fireEvent.click(f.view.getByRole("checkbox", { name: "/code/web" }));
	const main = f.view.getByLabelText("Main repository");
	expect(main.querySelector('option[value="/code/api"]')).not.toBeNull();
	expect(main.querySelector('option[value="/code/docs"]')).toBeNull();
	fireEvent.change(main, { target: { value: "/code/web" } });
	expect(create.disabled).toBe(false);
	fireEvent.click(create);
	await flush();
	expect(f.calls.find((call) => call.path === "project.createGroup")).toEqual({
		path: "project.createGroup",
		input: {
			name: "Atlante BTCore",
			primaryPath: "/code/web",
			folders: ["/code/api", "/code/docs"],
		},
	});
	expect(f.created).toHaveLength(1);
	expect(f.closed()).toBe(true);
});

test("an older host offers an update instead of an unusable create action", async () => {
	const f = fixture({ oldHost: true });
	await flush();
	expect(f.view.getByRole("alert").textContent).toContain(
		"Update Paradev++ on this host",
	);
	expect(
		(
			f.view.getByRole("button", {
				name: "Create project",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	expect(f.calls).toHaveLength(1);
});

test("adds selected folders to the settings project after a canceled native picker", async () => {
	const f = fixture({
		mode: { kind: "add", projectId: "current", hostUrl: "http://test" },
	});
	await flush();
	expect(f.calls[0]).toEqual({
		path: "project.groupSources",
		input: { projectId: "current" },
	});
	fireEvent.click(f.view.getByRole("button", { name: "Browse folders" }));
	await flush();
	expect(f.calls).toHaveLength(1);
	fireEvent.click(f.view.getByRole("checkbox", { name: "/code/api" }));
	expect(
		(f.view.getByRole("button", { name: "Add folders" }) as HTMLButtonElement)
			.disabled,
	).toBe(false);
	fireEvent.click(f.view.getByRole("button", { name: "Add folders" }));
	await flush();
	expect(f.calls.find((call) => call.path === "project.attachFolders")).toEqual(
		{
			path: "project.attachFolders",
			input: { projectId: "current", folders: ["/code/api"] },
		},
	);
	expect(f.created).toHaveLength(0);
	expect(f.closed()).toBe(true);
});

test("remote project folders come from the host catalog without opening a local directory picker", async () => {
	const f = fixture({
		canBrowse: false,
		mode: { kind: "add", projectId: "remote", hostUrl: "https://remote" },
	});
	await flush();
	expect(f.view.queryByRole("button", { name: "Browse folders" })).toBeNull();
	fireEvent.click(f.view.getByRole("checkbox", { name: "/code/api" }));
	fireEvent.click(f.view.getByRole("button", { name: "Add folders" }));
	await flush();
	expect(
		f.calls.find((call) => call.path === "project.attachFolders")?.input,
	).toEqual({ projectId: "remote", folders: ["/code/api"] });
});
