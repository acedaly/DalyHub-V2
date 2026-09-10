// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/shared-assets/background-patterns/index.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { SVGProps } from "react";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { Circle } from "./circle";
import { Grid } from "./grid";
import { GridCheck } from "./grid-check";
import { Square } from "./square";

const patterns = {
    circle: Circle,
    square: Square,
    grid: Grid,
    "grid-check": GridCheck,
};

export interface BackgroundPatternProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
    size?: "sm" | "md" | "lg";
    pattern: keyof typeof patterns;
}

export const BackgroundPattern = (props: BackgroundPatternProps) => {
    const { pattern } = props;
    const Pattern = patterns[pattern];

    return <Pattern {...props} size={props.size as "sm" | "md"} className={cx("pointer-events-none", props.className)} />;
};
