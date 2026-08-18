/**
 * PLAN-01 — the Planning module route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), so it is safe for
 * React Router's bare `routes.ts` config loader AND for `module.ts`'s runtime
 * registry (ADR-016 §5.10). Adding a route means editing this file and adding the
 * route file; never `app/routes.ts`.
 *
 * `/plan` sits in the DAILY group between Today and Tasks, at `navOrder: 7`. That
 * is the order of the loop it belongs to — REVIEW → **PLAN** → TODAY → EXECUTE —
 * read the other way round in the rail: you land on Today, and the week you
 * planned is the row beside it.
 *
 * It is deliberately NOT a phone bottom-navigation destination. That bar holds the
 * four things an owner reaches for many times a day (Today, Tasks, and capture);
 * weekly planning is something they do once or twice a week, and MOBILE-01's rule
 * is that the bar is not a directory. It is reached from the rail's sheet, from
 * Today, from the command palette and from a completed Review.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "plan.index",
    path: "plan",
    file: "routes/index.tsx",
    meta: {
      navLabel: "Plan",
      navGroup: "daily",
      navOrder: 7,
      // Planning owns no entity type — it is a VIEW over Tasks — so it declares
      // its own shell glyph, exactly as Today does (THEME-01).
      navIcon: "plan",
    },
  },
];

export default routes;
