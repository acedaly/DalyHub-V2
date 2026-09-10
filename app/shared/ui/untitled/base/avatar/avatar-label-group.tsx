// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/avatar/avatar-label-group.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import { type ReactNode } from "react";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { Avatar, type AvatarProps } from "./avatar";

const styles = {
    sm: { title: "text-sm ", subtitle: "text-xs" },
    md: { title: "text-sm ", subtitle: "text-sm" },
    lg: { title: "text-md ", subtitle: "text-md" },
};

interface AvatarLabelGroupProps extends AvatarProps {
    size: "sm" | "md" | "lg";
    rounded?: boolean;
    title: string | ReactNode;
    subtitle: string | ReactNode;
    avatarClassName?: string;
}

export const AvatarLabelGroup = ({ title, subtitle, className, rounded, avatarClassName, ...props }: AvatarLabelGroupProps) => {
    return (
        <figure className={cx("group flex min-w-0 flex-1 items-center gap-2", className)}>
            <Avatar border rounded={rounded} className={avatarClassName} {...props} />
            <figcaption className="min-w-0 flex-1">
                <p className={cx("font-semibold text-primary", styles[props.size].title)}>{title}</p>
                <p className={cx("truncate text-tertiary", styles[props.size].subtitle)}>{subtitle}</p>
            </figcaption>
        </figure>
    );
};
