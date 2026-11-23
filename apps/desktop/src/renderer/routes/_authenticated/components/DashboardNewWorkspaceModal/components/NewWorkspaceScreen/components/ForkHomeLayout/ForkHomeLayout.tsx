import type { ReactNode } from "react";
import {
	ForkHomeBackground,
	ForkHomeBrand,
} from "renderer/components/ForkHomeBackground";
import { ForkProductMark } from "renderer/components/ForkProductMark";

export function ForkHomeLayout({
	active,
	children,
}: {
	active: boolean;
	children: ReactNode;
}) {
	return (
		<div className="relative isolate flex flex-1 flex-col items-center px-6 pt-8 pb-6">
			<ForkHomeBackground active={active} />
			<div className="flex min-h-48 flex-1 items-center justify-center py-8">
				<ForkHomeBrand compact>
					<ForkProductMark className="h-8 w-auto select-none text-foreground/80" />
				</ForkHomeBrand>
			</div>
			{children}
		</div>
	);
}
