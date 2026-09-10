// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/application/command-menus/base-components/command-menu-header.tsx`, retrieved 2026-09-10.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { ReactNode } from "react";
import { Header as AriaHeader } from "react-aria-components";
import { cx } from "~/shared/ui/untitled/utils/cx";

interface CommandMenuHeaderProps {
    children: ReactNode;
    className?: string;
}

export const CommandMenuHeader = ({ children: title, className }: CommandMenuHeaderProps) => {
    return <AriaHeader className={cx("flex px-4.5 pt-2 text-xs font-semibold text-tertiary", className)}>{title}</AriaHeader>;
};
