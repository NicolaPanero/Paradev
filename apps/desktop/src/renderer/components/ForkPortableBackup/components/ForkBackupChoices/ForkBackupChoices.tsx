import { Trans, useLingui } from "@lingui/react/macro";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";

type Choices =
	ElectronRouterOutputs["forkPortableBackup"]["choices"]["choices"];

interface ForkBackupChoicesProps {
	choices: Choices;
	omitted: Set<string>;
	onChange: (ids: string[], include: boolean) => void;
	disabled: boolean;
}

export function ForkBackupChoices({
	choices,
	omitted,
	onChange,
	disabled,
}: ForkBackupChoicesProps) {
	const { t } = useLingui();
	return (
		<div className="space-y-4 overflow-y-auto pr-2">
			{[
				{ kind: "project", label: t({ message: "Projects" }) },
				{ kind: "profile", label: t({ message: "Agent profiles" }) },
			].map(({ kind, label }) => {
				const group = choices.filter((item) => item.kind === kind);
				if (!group.length) return null;
				const allIncluded = group.every(({ id }) => !omitted.has(id));
				return (
					<fieldset
						key={kind}
						className="rounded border p-3"
						disabled={disabled}
					>
						<legend className="px-1 text-sm font-medium">{label}</legend>
						<label className="mb-2 flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={allIncluded}
								ref={(element) => {
									if (element)
										element.indeterminate =
											!allIncluded && group.some(({ id }) => !omitted.has(id));
								}}
								onChange={(event) =>
									onChange(
										group.map(({ id }) => id),
										event.target.checked,
									)
								}
							/>
							<Trans>Select all</Trans>
						</label>
						<div className="space-y-2">
							{group.map(({ id, name, path }) => (
								<label key={id} className="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										className="mt-1"
										checked={!omitted.has(id)}
										onChange={(event) => onChange([id], event.target.checked)}
									/>
									<span className="min-w-0">
										<span className="block">{name}</span>
										<span className="block break-all font-mono text-xs text-muted-foreground">
											{path}
										</span>
									</span>
								</label>
							))}
						</div>
					</fieldset>
				);
			})}
		</div>
	);
}
