/**
 * PX-03 — the Reviews module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "understand"`
 * places Reviews in the rail's UNDERSTAND group — "what is changing over time?"
 * — after Insight and Reports and before AI. A Review is deliberate reflection
 * rather than organisation, which is why V2.16 CONSOL-00 moved it out of the
 * leftovers `more` group rather than back into `organise`. (The `insight`
 * group this comment used to name was retired by PX-03.)
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "reviews.index",
    path: "reviews",
    file: "routes/index.tsx",
    meta: { navLabel: "Reviews", navGroup: "understand", navOrder: 530 },
  },
  {
    id: "reviews.new",
    path: "reviews/new",
    file: "routes/new.tsx",
  },
  {
    id: "reviews.detail",
    path: "reviews/:reviewId",
    file: "routes/detail.tsx",
  },
  {
    // REVIEW-02 — the guided weekly flow: a second PRESENTATION of the same
    // Review record at a stable sub-path, with the step in `?step=`.
    id: "reviews.guide",
    path: "reviews/:reviewId/guide",
    file: "routes/guide.tsx",
  },
  {
    id: "reviews.mutate",
    path: "reviews/:reviewId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "reviews.activity",
    path: "reviews/:reviewId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
