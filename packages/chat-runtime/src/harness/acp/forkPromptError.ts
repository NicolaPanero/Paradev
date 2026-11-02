import type { Turn } from "@superset/chat/protocol";
import { AcpRpcError } from "./rpcClient";

type TurnError = NonNullable<Turn["error"]>;

export function forkPromptError(error: unknown, base?: TurnError): TurnError {
	const message =
		base?.message ?? (error instanceof Error ? error.message : String(error));
	const plain = base ?? { message };
	if (!(error instanceof AcpRpcError) || error.method !== "session/prompt")
		return plain;
	const data = error.data;
	if (!data || typeof data !== "object" || Array.isArray(data)) return plain;
	const details = data as { message?: unknown; codexErrorInfo?: unknown };
	return {
		...plain,
		message:
			typeof details.message === "string" && details.message.length <= 4096
				? `${message}: ${details.message}`
				: message,
		...(typeof details.codexErrorInfo === "string"
			? { providerCode: details.codexErrorInfo }
			: {}),
	};
}
