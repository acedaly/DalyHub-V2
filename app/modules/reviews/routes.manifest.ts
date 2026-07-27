/**
 * PX-03 — the Reviews module route descriptors (declarative, dependency-free).
 *
 * See the Notes manifest for the pattern this mirrors. `navGroup: "insight"`
 * places Reviews in the sidebar's insight group (Reviews/AI), after the capture
 * group (Notes/Diary/Meetings/People/Assets).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "reviews.index",
    path: "reviews",
    file: "routes/index.tsx",
    meta: { navLabel: "Reviews", navGroup: "insight", navOrder: 200 },
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
