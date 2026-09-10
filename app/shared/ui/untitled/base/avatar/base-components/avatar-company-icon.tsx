// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/avatar/base-components/avatar-company-icon.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import { cx } from "~/shared/ui/untitled/utils/cx";

const sizes = {
    xs: "size-2",
    sm: "size-3",
    md: "size-3.5",
    lg: "size-4",
    xl: "size-4.5",
    "2xl": "size-5 ring-[1.67px]",
};

interface AvatarCompanyIconProps {
    size: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
    src: string;
    alt?: string;
}

export const AvatarCompanyIcon = ({ size, src, alt }: AvatarCompanyIconProps) => (
    <img
        src={src}
        alt={alt}
        className={cx("absolute -right-0.5 -bottom-0.5 rounded-full bg-brand-50 object-cover ring-[1.5px] ring-bg-primary", sizes[size])}
    />
);
