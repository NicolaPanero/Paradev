import { expect, test } from "bun:test";
import { observable } from "@trpc/server/observable";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { ForkPortableBackup } from "./ForkPortableBackup";

function fixture(restore = false) {
	const calls: { path: string; input: unknown }[] = [];
	const plan = {
		id: "preview-id",
		action: restore ? "restore" : "backup",
		archive: restore ? "/disk/backup.paradev-backup" : "",
		createdAt: "2026-11-20",
		missing: [],
		roots: [
			{
				id: "r1",
				path: "/old/project",
				kind: "repository",
				bytes: 1024,
				files: 1,
				target: "/new/project",
			},
		],
	};
	const query = queryFixture();
	const client = electronTrpc.createClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						calls.push({ path: op.path, input: op.input });
						const data = op.path.endsWith("chooseArchive")
							? plan.archive
							: op.path.endsWith("start")
								? { started: false }
								: plan;
						observer.next({ result: { data } });
						observer.complete();
					}),
		],
	});
	const view = render(
		<electronTrpc.Provider client={client} queryClient={query.client}>
			<ForkPortableBackup />
		</electronTrpc.Provider>,
		{ wrapper: query.wrapper },
	);
	return { calls, view };
}

test("backup requires an explicit preview, matching passwords and review before closing the app", async () => {
	const { calls, view } = fixture();
	expect(calls).toHaveLength(0);
	fireEvent.click(view.getByRole("button", { name: "Back up everything" }));
	await flush();
	expect(view.getByText("/old/project")).toBeTruthy();
	const create = view.getByRole("button", {
		name: "Close and create backup",
	}) as HTMLButtonElement;
	expect(create.disabled).toBe(true);
	fireEvent.change(
		view.getByLabelText("Backup password (at least 12 characters)"),
		{ target: { value: "long-backup-password" } },
	);
	fireEvent.change(view.getByLabelText("Confirm password"), {
		target: { value: "different-password" },
	});
	fireEvent.click(view.getByRole("checkbox"));
	expect(create.disabled).toBe(true);
	fireEvent.change(view.getByLabelText("Confirm password"), {
		target: { value: "long-backup-password" },
	});
	fireEvent.click(create);
	await flush();
	expect(calls.at(-1)).toEqual({
		path: "forkPortableBackup.start",
		input: { id: "preview-id", password: "long-backup-password", mappings: [] },
	});
});

test("restore previews the archive and sends the reviewed destination paths", async () => {
	const { calls, view } = fixture(true);
	fireEvent.click(view.getByRole("button", { name: "Restore backup" }));
	await flush();
	fireEvent.change(
		view.getByLabelText("Backup password (at least 12 characters)"),
		{ target: { value: "long-backup-password" } },
	);
	fireEvent.click(view.getByRole("button", { name: "Preview" }));
	await flush();
	fireEvent.change(view.getByLabelText("Destination folder"), {
		target: { value: "/other/project" },
	});
	fireEvent.click(view.getByRole("checkbox"));
	fireEvent.click(view.getByRole("button", { name: "Close and restore" }));
	await flush();
	expect(calls.at(-1)).toEqual({
		path: "forkPortableBackup.start",
		input: {
			id: "preview-id",
			password: "long-backup-password",
			mappings: [{ id: "r1", target: "/other/project" }],
		},
	});
});
