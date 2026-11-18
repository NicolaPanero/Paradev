export function forkDesktopDevEnvironment(
	input: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
	const env = { ...input };
	delete env.ELECTRON_RUN_AS_NODE;
	return env;
}
