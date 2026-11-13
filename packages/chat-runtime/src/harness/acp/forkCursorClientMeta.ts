export function forkCursorClientMeta(enabled: boolean) {
	return enabled ? { parameterizedModelPicker: true, subagents: {} } : {};
}
