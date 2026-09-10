// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/shared-assets/illustrations/index.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream, plus:
//
// PATCHED by the vendoring script: Each illustration module declares its own PRIVATE `IllustrationProps`, so
// the inferred type of the `types` map names interfaces that cannot be referenced
// from outside their module. DalyHub compiles with declaration emit (`tsc -b`),
// which rejects that as TS4023. Annotating the map with the exported props
// type fixes the emit without changing behaviour, and keeps the literal key
// union that `Illustration` depends on.
//
// PATCHED by the vendoring script: The annotation above needs `FC`, which upstream does not import.
import type { FC, HTMLAttributes } from "react";
import { BoxIllustration } from "./box";
import { CloudIllustration } from "./cloud";
import { CreditCardIllustration } from "./credit-card";
import { DocumentsIllustration } from "./documents";

type IllustrationType = "box" | "cloud" | "documents" | "credit-card";

const types: Record<IllustrationType, FC<IllustrationProps>> = {
    box: BoxIllustration,
    cloud: CloudIllustration,
    documents: DocumentsIllustration,
    "credit-card": CreditCardIllustration,
};

export interface IllustrationProps extends HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "md" | "lg";
    svgClassName?: string;
    childrenClassName?: string;
}

export const Illustration = (props: IllustrationProps & { type: keyof typeof types }) => {
    const { type } = props;

    const Component = types[type];

    return <Component {...props} />;
};
