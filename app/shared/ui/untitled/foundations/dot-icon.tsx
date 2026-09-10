// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/foundations/dot-icon.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { HTMLAttributes } from "react";

const sizes = {
    sm: {
        wh: 8,
        c: 4,
        r: 2.5,
    },
    md: {
        wh: 10,
        c: 5,
        r: 4,
    },
};

export const Dot = ({ size = "md", ...props }: HTMLAttributes<HTMLOrSVGElement> & { size?: "sm" | "md" }) => {
    return (
        <svg width={sizes[size].wh} height={sizes[size].wh} viewBox={`0 0 ${sizes[size].wh} ${sizes[size].wh}`} fill="none" {...props}>
            <circle cx={sizes[size].c} cy={sizes[size].c} r={sizes[size].r} fill="currentColor" stroke="currentColor" />
        </svg>
    );
};
