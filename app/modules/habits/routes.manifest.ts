/**
 * HABITS-01 — the Habits module route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), so it is safe for
 * React Router's bare `routes.ts` config loader AND for `module.ts`'s runtime
 * registry (ADR-016 §5.10). Adding a route means editing this file and adding the
 * route file; never `app/routes.ts`.
 *
 * `/habits` sits in the ORGANISE group between Goals and Areas, at `navOrder:
 * 125`. That is where it belongs in the information architecture rather than in
 * the daily one: a Habit is part of the INTENTIONAL side of DalyHub — the
 * behaviours that serve a Goal inside an Area — and the daily group is reserved
 * for the surfaces an owner opens many times a day. Today carries the day's
 * routines; this is where they are set up and reviewed.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "habits.index",
    path: "habits",
    file: "routes/index.tsx",
    meta: { navLabel: "Habits", navGroup: "organise", navOrder: 125 },
  },
  {
    id: "habits.archived",
    path: "habits/archived",
    file: "routes/archived.tsx",
  },
  {
    id: "habits.new",
    path: "habits/new",
    file: "routes/new.tsx",
  },
  {
    /*
     * The create ENDPOINT, deliberately separate from the `/habits/new` page: a
     * route that also exports a UI component is a document route, so a `fetch`
     * POST to it re-renders HTML rather than returning the action's JSON (the
     * DS-06 forms need JSON). Same split as `/assets/create`.
     */
    id: "habits.create",
    path: "habits/create",
    file: "routes/create.tsx",
  },
  {
    id: "habits.detail",
    path: "habits/:habitId",
    file: "routes/detail.tsx",
  },
  {
    id: "habits.mutate",
    path: "habits/:habitId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    /*
     * The ONE check-in authority. Today, the collection and the record all post
     * here, which is what makes them agree by construction rather than by
     * convention. It is its own route rather than an intent on `mutate` because
     * it changes the HISTORY rather than the record, exactly as
     * `/goals/:id/measurements` is separate from `/goals/:id/mutate`.
     */
    id: "habits.check_in",
    path: "habits/:habitId/check-in",
    file: "routes/check-in.tsx",
  },
  {
    id: "habits.activity",
    path: "habits/:habitId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
