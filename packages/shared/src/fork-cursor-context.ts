export const CURSOR_CONTEXT_ID = "context";

export function splitCursorContext(model: string) {
	const match = /^([^[\]]+)\[context=([^=,\s[\]]+)\]$/.exec(model);
	return { model: match?.[1] ?? model, context: match?.[2] };
}

export function cursorModelWithContext(model: string, context: string) {
	return `${splitCursorContext(model).model}[${CURSOR_CONTEXT_ID}=${context}]`;
}
