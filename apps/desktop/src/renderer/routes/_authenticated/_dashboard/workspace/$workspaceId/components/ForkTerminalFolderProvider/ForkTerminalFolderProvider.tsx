import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import type { OpenTerminalTab } from "../../utils/fork-terminal-folder-pane";
import { ForkTerminalFolderChooser } from "./components/ForkTerminalFolderChooser";
import {
	type ForkTerminalFolderOption,
	forkTerminalFolderOptions,
} from "./fork-terminal-folder-options";

type LaunchTerminal = (cwd?: string) => void | Promise<void>;
type ChooseTerminalFolder = (launch: LaunchTerminal) => Promise<void>;
type Scope = { workspaceId: string; projectId: string | null; hostUrl: string };
type Request = {
	scope: Scope;
	launch: LaunchTerminal;
	launching: boolean;
	promise: Promise<void>;
	resolve: () => void;
};

const TerminalFolderContext = createContext<ChooseTerminalFolder | null>(null);
const launchDirectly: ChooseTerminalFolder = async (launch) => launch();

export function useForkTerminalFolder(): ChooseTerminalFolder {
	return useContext(TerminalFolderContext) ?? launchDirectly;
}

export function useForkTerminalTabOpener(
	launch: LaunchTerminal,
): OpenTerminalTab {
	const choose = useForkTerminalFolder();
	return useCallback(
		(replace) =>
			choose(async (cwd) => {
				if (!(await replace?.(cwd))) await launch(cwd);
			}),
		[choose, launch],
	);
}

export function ForkTerminalFolderProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { t } = useLingui();
	const { workspace, hostUrl } = useWorkspace();
	const { id: workspaceId, projectId } = workspace;
	const scope = useMemo<Scope>(
		() => ({ workspaceId, projectId, hostUrl }),
		[workspaceId, projectId, hostUrl],
	);
	const utils = workspaceTrpc.useUtils();
	const activeScope = useRef<Scope | null>(null);
	const pending = useRef<Request | null>(null);
	const [chooser, setChooser] = useState<{
		request: Request;
		options: ForkTerminalFolderOption[];
	} | null>(null);

	const finish = useCallback((request: Request) => {
		if (pending.current !== request) return;
		pending.current = null;
		request.resolve();
	}, []);
	useLayoutEffect(() => {
		activeScope.current = scope;
		return () => {
			activeScope.current = null;
			const request = pending.current;
			if (request?.scope === scope) finish(request);
		};
	}, [scope, finish]);
	const reportError = useCallback(
		(error: unknown) =>
			toast.error(t({ message: "Failed to create terminal" }), {
				description: errorMessage(error),
			}),
		[t],
	);
	const run = useCallback(
		async (request: Request, cwd?: string) => {
			if (pending.current !== request || request.launching) return;
			request.launching = true;
			setChooser(null);
			try {
				await request.launch(cwd);
			} catch (error) {
				if (pending.current === request) reportError(error);
			} finally {
				finish(request);
			}
		},
		[finish, reportError],
	);
	const choose = useCallback<ChooseTerminalFolder>(
		(launch) => {
			if (activeScope.current !== scope) return Promise.resolve();
			if (pending.current) return pending.current.promise;
			const { promise, resolve } = Promise.withResolvers<void>();
			const request = { scope, launch, launching: false, promise, resolve };
			pending.current = request;
			void (async () => {
				try {
					if (!scope.projectId) return await run(request);
					const folders = await utils.projectFolders.listForWorkspace
						.ensureData({ workspaceId: scope.workspaceId }, { retry: false })
						.catch((error: unknown) => {
							if (isMissingProcedureError(error)) return [];
							throw error;
						});
					if (pending.current !== request) return;
					if (!folders.some((folder) => folder.exists))
						return await run(request);
					const [current, project] = await Promise.all([
						utils.workspace.get.ensureData({ id: scope.workspaceId }),
						utils.project.get.ensureData({ projectId: scope.projectId }),
					]);
					if (pending.current !== request) return;
					const options = forkTerminalFolderOptions({
						worktreePath: current.worktreePath,
						repoPath: project?.repoPath,
						mainLabel: t({ message: "Main repository" }),
						folders,
					});
					if (options.length < 2) return await run(request);
					setChooser({ request, options });
				} catch (error) {
					if (pending.current !== request) return;
					reportError(error);
					finish(request);
				}
			})();
			return promise;
		},
		[scope, utils, run, t, reportError, finish],
	);

	return (
		<TerminalFolderContext.Provider value={choose}>
			{children}
			{chooser?.request.scope === scope && (
				<ForkTerminalFolderChooser
					options={chooser.options}
					onCancel={() => {
						if (chooser.request.launching) return;
						setChooser(null);
						finish(chooser.request);
					}}
					onSelect={(cwd) => void run(chooser.request, cwd)}
				/>
			)}
		</TerminalFolderContext.Provider>
	);
}
