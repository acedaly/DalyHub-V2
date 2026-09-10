// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/select/select-shared.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { FC, ReactNode } from "react";
import { createContext } from "react";

export type SelectItemType = {
    /** Unique identifier for the item. */
    id: string | number;
    /** The primary display text. */
    label?: string;
    /** Avatar image URL. */
    avatarUrl?: string;
    /** Whether the item is disabled. */
    isDisabled?: boolean;
    /** Secondary text displayed alongside the label. */
    supportingText?: string;
    /** Leading icon component or element. */
    icon?: FC | ReactNode;
};

export interface CommonProps {
    /** Helper text displayed below the input. */
    hint?: string;
    /** Field label displayed above the input. */
    label?: string;
    /** Tooltip text for the help icon next to the label. */
    tooltip?: string;
    /**
     * The size of the component.
     * @default "md"
     */
    size?: "sm" | "md" | "lg";
    /** Placeholder text when no value is selected. */
    placeholder?: string;
    /** Whether to hide the required indicator from the label. */
    hideRequiredIndicator?: boolean;
}

export const sizes = {
    sm: {
        root: "py-2 pl-3 pr-2.5 gap-2 *:data-icon:size-4 *:data-icon:stroke-[2.25px]",
        withIcon: "",
        text: "text-sm",
        textContainer: "gap-x-1.5",
        shortcut: "pr-2.5",
    },
    md: { root: "py-2 px-3 gap-2 *:data-icon:size-5", withIcon: "", text: "text-md", textContainer: "gap-x-1.5", shortcut: "pr-2.5" },
    lg: { root: "py-2.5 px-3.5 gap-2 *:data-icon:size-5", withIcon: "", text: "text-md", textContainer: "gap-x-1.5", shortcut: "pr-3" },
};

export const SelectContext = createContext<{ size: "sm" | "md" | "lg" }>({ size: "md" });
