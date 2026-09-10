// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/avatar/base-components/avatar-count.tsx`, retrieved 2026-09-10.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import { cx } from "~/shared/ui/untitled/utils/cx";

interface AvatarCountProps {
    count: number;
    className?: string;
}

export const AvatarCount = ({ count, className }: AvatarCountProps) => (
    <div className={cx("absolute right-0 bottom-0 p-px", className)}>
        <div className="flex size-3.5 items-center justify-center rounded-full bg-fg-error-primary text-center text-[10px] leading-[13px] font-bold text-white">
            {count}
        </div>
    </div>
);
