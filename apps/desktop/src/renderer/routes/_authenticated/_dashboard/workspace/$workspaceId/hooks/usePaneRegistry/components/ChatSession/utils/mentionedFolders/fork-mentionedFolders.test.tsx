import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { locatePath } from "../../../ChatPane/hooks/useOpenChatLink/utils/locatePath";
import { MarkdownView } from "../../components/MarkdownView";
import {
	ChatPaneActionsProvider,
	type OpenLink,
} from "../../providers/ChatPaneActionsProvider";
import { folderCandidates, mentionedFolders } from "./mentionedFolders";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));

const message = [
	"File in `/Users/nicola/.superset-siap/work/output/`:",
	"- `ENI_PAS-PAD_MO_B4B_Dinamico_Flusso_Completo.docx`",
	"Le note sono in `/Users/nicola/.superset-siap/work/PASPAD-flow/`: `code-notes.md`.",
	"Edited ~/projects/app/src/build_doc.py and https://example.com/docs/a.html",
].join("\n");

test("a message's folders come from trailing-slash paths and from the folder of a full file path", () => {
	expect(mentionedFolders(message)).toEqual([
		"/Users/nicola/.superset-siap/work/output",
		"/Users/nicola/.superset-siap/work/PASPAD-flow",
		"~/projects/app/src",
	]);
});

test("a bare file name is looked up in each named folder, a full path never is", () => {
	expect(folderCandidates("code-notes.md", ["/a", "~/b"])).toEqual([
		"/a/code-notes.md",
		"~/b/code-notes.md",
	]);
	expect(folderCandidates("/abs/x.md", ["/a"])).toEqual([]);
	expect(folderCandidates("~/x.md", ["/a"])).toEqual([]);
});

test("clicking a bare file name in a message passes the folders the message named", () => {
	const openLink = mock<OpenLink>(() => true);
	const view = render(
		<ChatPaneActionsProvider openLink={openLink}>
			<MarkdownView
				final
				text={"Files in `/work/output/`:\n\n- `report.docx`"}
			/>
		</ChatPaneActionsProvider>,
	);
	fireEvent.click(view.getByRole("link"));
	expect(openLink.mock.calls[0]?.[0]).toBe("report.docx");
	expect(openLink.mock.calls[0]?.[3]).toEqual({ folders: ["/work/output"] });
});

test("the named folder that holds the file wins before any workspace search", async () => {
	const report = {
		resolvedPath: "/work/output/report.docx",
		isDirectory: false,
	};
	const existing: Record<string, typeof report> = {
		"/work/notes/report.docx": {
			resolvedPath: "/work/notes/report.docx",
			isDirectory: true,
		},
		"/work/output/report.docx": report,
	};
	const stat = mock(async (path: string) => existing[path] ?? null);
	const resolveFile = mock(async () => ({ resolvedPath: "/repo/report.docx" }));
	expect(
		await locatePath(
			"report.docx",
			{ stat, resolveFile },
			folderCandidates("report.docx", ["/work/notes", "/work/output"]),
		),
	).toEqual(report);
	expect(stat.mock.calls.map(([path]) => path)).toEqual([
		"report.docx",
		"/work/notes/report.docx",
		"/work/output/report.docx",
	]);
	expect(resolveFile).not.toHaveBeenCalled();
});
