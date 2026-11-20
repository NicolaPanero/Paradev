export function startForkApp(options: {
	helper: boolean;
	recovery: boolean;
	runHelper: () => Promise<unknown>;
	recover: () => Promise<void>;
	relaunch: () => void;
	loadMain: () => Promise<unknown>;
}): Promise<unknown> {
	if (options.helper) return options.runHelper();
	if (options.recovery) return options.recover().then(options.relaunch);
	return options.loadMain();
}
