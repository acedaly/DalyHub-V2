// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/application/command-menus/base-components/command-menu-navigation-icon.tsx`, retrieved 2026-09-10.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { FC } from "react";

interface CommandMenuNavigationIconProps {
    type: "icon";
    icon: FC<{ className?: string; strokeWidth?: string | number }>;
}

interface CommandMenuNavigationTextProps {
    type: "text";
    label: string;
}

type Props = CommandMenuNavigationIconProps | CommandMenuNavigationTextProps;

export const CommandMenuNavigationIcon = (props: Props) => {
    return (
        <div className="flex h-7 min-w-7 items-center justify-between rounded-lg bg-primary p-1.5 ring-1 ring-secondary ring-inset">
            {props.type === "icon" && <props.icon strokeWidth={2.4} className="size-4 text-fg-quaternary" />}
            {props.type === "text" && <span className="text-sm font-semibold text-fg-quaternary">{props.label}</span>}
        </div>
    );
};
