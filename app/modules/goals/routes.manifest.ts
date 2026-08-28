/**
 * FND-09 — the Goals module route descriptors (declarative, dependency-free).
 *
 * The single source of truth for the Goals module's routes: plain data with only
 * a type import (erased at build time), safe for React Router's bare `routes.ts`
 * config loader and imported by `module.ts` for the runtime registry
 * (ADR-016 §5.10).
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "goals.index",
    path: "goals",
    file: "routes/index.tsx",
    meta: { navLabel: "Goals", navGroup: "organise", navOrder: 120 },
  },
  {
    id: "goals.new",
    path: "goals/new",
    file: "routes/new.tsx",
  },
  {
    /*
     * STEER-02 — the Goal MOVE destination search. A STATIC segment, declared
     * before `goals/:goalId` so it is matched as a route rather than as a Goal
     * id — the same ordering `projects/parent-options` relies on. A selection
     * convenience only; the move itself re-verifies the Area (see the route).
     */
    id: "goals.area_options",
    path: "goals/area-options",
    file: "routes/area-options.tsx",
  },
  {
    id: "goals.detail",
    path: "goals/:goalId",
    file: "routes/detail.tsx",
  },
  {
    /*
     * REDESIGN-04 — the `+ Link project` picker's bounded option search. A
     * selection convenience only; the link itself is created through the
     * Project's own trusted `move` intent (see the route's doc comment).
     */
    id: "goals.link_projects",
    path: "goals/:goalId/link-projects",
    file: "routes/link-projects.tsx",
  },
  {
    id: "goals.projects",
    path: "goals/:goalId/projects",
    file: "routes/projects.tsx",
  },
  {
    id: "goals.mutate",
    path: "goals/:goalId/mutate",
    file: "routes/mutate.tsx",
  },
  {
    // GOAL-02 — measurement readings and milestone stages. Separate from
    // `mutate` because it changes the READINGS taken against a Goal rather than
    // the Goal record itself (see the route's own doc comment).
    id: "goals.measurements",
    path: "goals/:goalId/measurements",
    file: "routes/measurements.tsx",
  },
  {
    id: "goals.activity",
    path: "goals/:goalId/activity",
    file: "routes/activity.tsx",
  },
];

export default routes;
