// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/input/hint-text.tsx`, retrieved 2026-09-10.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { ReactNode, Ref } from "react";
import type { TextProps as AriaTextProps } from "react-aria-components";
import { Text as AriaText } from "react-aria-components";
import { cx } from "~/shared/ui/untitled/utils/cx";

interface HintTextProps extends AriaTextProps {
    /** Indicates that the hint text is an error message. */
    isInvalid?: boolean;
    ref?: Ref<HTMLElement>;
    size?: "sm" | "md";
    children: ReactNode;
}

export const HintText = ({ isInvalid, className, size = "md", ...props }: HintTextProps) => {
    return (
        <AriaText
            {...props}
            slot={isInvalid ? "errorMessage" : "description"}
            className={cx(
                "text-sm text-tertiary",

                // Size
                size === "sm" && "text-xs",
                "in-data-[input-size=sm]:text-xs",

                // Invalid state
                isInvalid && "text-error-primary",
                "group-invalid:text-error-primary",

                className,
            )}
        />
    );
};

HintText.displayName = "HintText";
