import { expect, mock, test } from "bun:test";
import type { UsageLimit } from "@superset/chat/protocol";
import { workspaceTrpc } from "@superset/workspace-client";
import { observable } from "@trpc/server/observable";
import {
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { UsageLimitNotice } from "../../../ChatSession/components/SessionView/components/UsageLimitNotice";
import { ForkUsageLimitContinue } from "./ForkUsageLimitContinue";

function fixture(
	options: {
		supported?: boolean;
		terminalId?: string;
		resumeAtReset?: boolean;
		notice?: UsageLimit;
		deferAvailability?: boolean;
	} = {},
) {
	const state = {
		supported: options.supported ?? true,
		switchAccounts: false,
		resumeAtReset: options.resumeAtReset ?? false,
		phase: "idle",
		capabilities: undefined,
	};
	const writes: unknown[] = [];
	const queries = queryFixture();
	let publishAvailability: (() => void) | undefined;
	const connection = workspaceTrpc.createClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						if (op.path === "agents.setQuotaRecovery") {
							writes.push(op.input);
							Object.assign(state, op.input);
						}
						const reply = () => {
							observer.next({
								result: {
									data: op.type === "mutation" ? { saved: true } : { ...state },
								},
							});
							observer.complete();
						};
						if (
							op.type === "query" &&
							options.deferAvailability &&
							!publishAvailability
						)
							publishAvailability = reply;
						else reply();
					}),
		],
	});
	const onRespond = mock((_action: string) => {});
	const location = {
		terminalId: "terminalId" in options ? options.terminalId : "current-chat",
		workspaceId: "00000000-0000-0000-0000-000000000001",
	};
	const view = render(
		<workspaceTrpc.Provider client={connection} queryClient={queries.client}>
			{options.notice ? (
				<UsageLimitNotice
					agent="claude"
					fork={location}
					limit={options.notice}
					onRespond={onRespond}
				/>
			) : (
				<ForkUsageLimitContinue
					agent="claude"
					onRespond={onRespond}
					{...location}
				/>
			)}
		</workspaceTrpc.Provider>,
		{ wrapper: queries.wrapper },
	);
	return {
		state,
		writes,
		view,
		onRespond,
		showAvailability: () => publishAvailability?.(),
	};
}

test("when the host can continue by itself, the pill opens the same choices as Automatic continuation and saves the pick", async () => {
	const f = fixture();
	await flush();
	const pill = f.view.getByRole("button", { name: /Resume at reset/ });
	fireEvent.keyDown(pill, { key: "Enter" });
	await flush();
	fireEvent.click(await f.view.findByText("Wait for the reset"));
	await flush();
	expect(f.writes).toEqual([
		{
			workspaceId: "00000000-0000-0000-0000-000000000001",
			terminalId: "current-chat",
			agent: "claude",
			switchAccounts: false,
			resumeAtReset: true,
		},
	]);
	expect(f.onRespond).not.toHaveBeenCalled();
});

test("a chosen wait shows as armed on the pill, so the choice is visible without opening the menu", async () => {
	const f = fixture({ resumeAtReset: true });
	await flush();
	expect(
		(await f.view.findByRole("button", { name: /Resuming at reset/ }))
			.className,
	).toContain("amber");
});

test("without a chat id or a host that continues by itself it stays the plain button for the runtime's timer", async () => {
	const f = fixture({ terminalId: undefined });
	await flush();
	fireEvent.click(f.view.getByRole("button", { name: /Resume at reset/ }));
	expect(f.onRespond).toHaveBeenCalledWith("resume_at_reset");
});

test("the notice offers automatic continuation when the provider omits a reset time", async () => {
	const f = fixture({ notice: { hitAtMs: Date.now() } });
	await flush();
	expect(f.view.getByRole("button", { name: "Resume" })).toBeDefined();
	const pill = f.view.getByRole("button", { name: "Automatic continuation" });
	fireEvent.keyDown(pill, { key: "Enter" });
	await flush();
	fireEvent.click(await f.view.findByText("Wait for the reset"));
	await flush();
	expect(f.writes).toHaveLength(1);
	expect(f.onRespond).not.toHaveBeenCalled();
});

test("the built-in timer stays disabled while checking host continuation support", async () => {
	const f = fixture({ deferAvailability: true });
	await flush();
	const resolving = f.view.getByRole("button", { name: /Resume at reset/ });
	expect(resolving.hasAttribute("disabled")).toBe(true);
	fireEvent.click(resolving);
	expect(f.onRespond).not.toHaveBeenCalled();
	f.showAvailability();
	await flush();
	expect(
		f.view
			.getByRole("button", { name: /Resume at reset/ })
			.hasAttribute("disabled"),
	).toBe(false);
});
