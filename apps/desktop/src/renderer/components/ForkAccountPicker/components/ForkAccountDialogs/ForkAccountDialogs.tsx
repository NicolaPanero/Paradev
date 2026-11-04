import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { AddAccountDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import type { useForkCreationAccount } from "../../useForkCreationAccount";

export function ForkAccountDialogs({
	account,
	provider,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
}) {
	return (
		<>
			{(account.reconnect || account.adding) &&
				(provider === "claude" || provider === "codex") && (
					<AddAccountDialog
						open
						hostUrl={account.hostUrl}
						agent={account.reconnect?.agent ?? provider}
						switchTarget={account.reconnect}
						onOpenChange={(open) => {
							if (!open) {
								account.setReconnect(null);
								account.setAdding(false);
							}
						}}
						onAccountAdded={() => {
							const reconnected = account.reconnect;
							if (reconnected && reconnected.selection !== account.selection)
								account.choose(reconnected.selection);
							void account.quota
								.refresh()
								.catch((error) => toast.error(errorMessage(error)));
							void account.options.refetch();
							void account.refreshDefault();
						}}
						onDefaultSwitched={() => {
							void account.refreshDefault();
							void account.quota
								.refresh()
								.catch((error) => toast.error(errorMessage(error)));
						}}
					/>
				)}
		</>
	);
}
