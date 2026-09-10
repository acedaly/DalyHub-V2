// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/application/section-headers/section-label.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { ComponentPropsWithRef, ReactNode } from "react";
import { HelpCircle } from "@untitledui/icons";
import { Tooltip, TooltipTrigger } from "~/shared/ui/untitled/base/tooltip/tooltip";
import { cx } from "~/shared/ui/untitled/utils/cx";

const styles = {
    sm: {
        heading: "text-sm font-semibold gap-0.5",
        subheading: "text-sm",
    },
    md: {
        heading: "text-md font-semibold gap-1",
        subheading: "text-md",
    },
};

interface SectionLabelRootProps {
    title: ReactNode;
    size?: "sm" | "md";
    isRequired?: boolean;
    description?: ReactNode;
    tooltip?: string;
    tooltipDescription?: string;
    children?: ReactNode;
    className?: string;
}

export const SectionLabelRoot = ({ size = "sm", isRequired, title, description, tooltip, tooltipDescription, className, children }: SectionLabelRootProps) => {
    return (
        <div className={className}>
            <h3 className={cx("flex items-center text-secondary", styles[size].heading)}>
                {title}

                <span className={cx("hidden text-brand-tertiary", isRequired && "block")}>*</span>

                {(tooltip || tooltipDescription) && (
                    <Tooltip title={tooltip} description={tooltipDescription}>
                        <TooltipTrigger className="text-fg-quaternary transition duration-200 hover:text-fg-quaternary_hover focus:text-fg-quaternary_hover">
                            <HelpCircle className="size-4" />
                        </TooltipTrigger>
                    </Tooltip>
                )}
            </h3>

            {description && <p className={cx("text-tertiary", styles[size].subheading)}>{description}</p>}
            {children}
        </div>
    );
};

const SectionLabelActions = (props: ComponentPropsWithRef<"div">) => (
    <div {...props} className={cx("mt-3 flex gap-2", props.className)}>
        {props.children}
    </div>
);

export const SectionLabel = {
    Root: SectionLabelRoot,
    Actions: SectionLabelActions,
};
