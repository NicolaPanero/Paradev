import { expect, mock, test } from "bun:test";
import { workspaceTrpc } from "@superset/workspace-client";
import { observable } from "@trpc/server/observable";
import {
	fireEvent,
	flush,
	queryFixture,
	render,
} from "renderer/test-utils/fork-ui";
import { ForkUsageLimitContinue } from "./ForkUsageLimitContinue";

function fixture(
	options: {
		supported?: boolean;
		terminalId?: string;
		resumeAtReset?: boolean;
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
	const connection = workspaceTrpc.createClient({
		links: [
			() =>
				({ op }) =>
					observable((observer) => {
						if (op.path === "agents.setQuotaRecovery") {
							writes.push(op.input);
							Object.assign(state, op.input);
						}
						observer.next({
							result: {
								data: op.type === "mutation" ? { saved: true } : { ...state },
							},
						});
						observer.complete();
					}),
		],
	});
	const onRespond = mock((_action: string) => {});
	const view = render(
		<workspaceTrpc.Provider client={connection} queryClient={queries.client}>
			<ForkUsageLimitContinue
				agent="claude"
				onRespond={onRespond}
				terminalId={
					"terminalId" in options ? options.terminalId : "current-chat"
				}
				workspaceId="00000000-0000-0000-0000-000000000001"
			/>
		</workspaceTrpc.Provider>,
		{ wrapper: queries.wrapper },
	);
	return { state, writes, view, onRespond };
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
