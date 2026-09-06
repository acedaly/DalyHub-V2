/**
 * V2.10 LIFE-02 — the Life Admin route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), so it is safe for
 * React Router's bare `routes.ts` config loader AND for `module.ts`'s runtime
 * registry (ADR-016 §5.10). Adding a route means editing this file and adding
 * the route file; never `app/routes.ts`.
 *
 * ── Where it sits, and what it is called ────────────────────────────────────
 * `/obligations` in the MORE group at `navOrder: 215` — immediately before
 * Assets (220), so the two read together (D9). The label an owner sees is
 * **Life Admin**, not "Obligations": the word describes the drawer of paperwork
 * this answers for, and nobody thinks "I must deal with my obligations". The
 * ROUTE keeps the domain's own noun, because a URL is a durable name and the
 * records it lists are obligations.
 *
 * No `mobilePrimaryOrder`: the three earned phone slots are unchanged for the
 * whole of V2, and Life Admin reaches the phone through Today's attention row
 * and the More sheet. No `navIcon` either — this module declares an entity
 * type, so the rail draws its identity glyph, and two sources for one glyph is
 * how drift starts.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "obligations.index",
    path: "obligations",
    file: "routes/index.tsx",
    meta: { navLabel: "Life Admin", navGroup: "more", navOrder: 215 },
  },
  {
    id: "obligations.new",
    path: "obligations/new",
    file: "routes/new.tsx",
  },
  {
    /*
     * The create ENDPOINT, deliberately separate from the `/obligations/new`
     * page: a route that also exports a UI component is a document route, so a
     * `fetch` POST to it re-renders HTML rather than returning the action's JSON
     * (the DS-06 forms need JSON). Same split as `/assets/create`.
     */
    id: "obligations.create",
    path: "obligations/create",
    file: "routes/create.tsx",
  },
  {
    /*
     * The candidate-subject search, a loader-only resource route. Static, so it
     * is matched before `obligations/:obligationId` and an obligation can never
     * be shadowed by it.
     */
    id: "obligations.subjects",
    path: "obligations/subjects",
    file: "routes/subjects.tsx",
  },
  {
    id: "obligations.detail",
    path: "obligations/:obligationId",
    file: "routes/detail.tsx",
  },
  {
    id: "obligations.mutate",
    path: "obligations/:obligationId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    id: "obligations.activity",
    path: "obligations/:obligationId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
