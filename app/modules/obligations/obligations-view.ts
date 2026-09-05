/**
 * V2.10 LIFE-02 — the Life Admin collection's client-safe shape.
 *
 * The loader's RESULT type and the status lens the control renders, separated
 * from the loader itself. A `.server` module may not be imported by a component
 * — React Router refuses the build, and rightly: it would drag the composition
 * boundary, D1 and the Workers runtime into the client bundle.
 */

import type { ObligationBandCounts } from "~/kernel/obligations";
import type { SerializedObligation } from "~/shared/obligations";

/** The status lens, which is the owner's, not the domain's. */
export const OBLIGATION_STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On hold" },
  { value: "dismissed", label: "Dismissed" },
  { value: "completed", label: "Completed" },
  { value: "any", label: "Any status" },
] as const;

export type ObligationStatusFilter =
  (typeof OBLIGATION_STATUS_FILTERS)[number]["value"];

export interface ObligationsCollectionData {
  readonly obligations: readonly SerializedObligation[];
  readonly nextCursor: string | null;
  readonly counts: ObligationBandCounts;
  readonly query: string;
  readonly category: string;
  readonly status: ObligationStatusFilter;
  readonly todayIso: string;
  readonly failed: boolean;
}
