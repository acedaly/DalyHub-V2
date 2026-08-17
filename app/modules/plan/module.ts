/**
 * PLAN-01 — the Weekly Planning module manifest.
 *
 * Planning is a VIEW over the shared model, not an entity type: it stores nothing,
 * and the Task's own canonical `scheduled_date` IS the plan (ADR-030). So it
 * declares no `entityTypes`, no `entityLinkTypes` and no `activityTypes` — the
 * Tasks module owns those (FND-07), and a module may not claim an entity type
 * another module owns (FND-06 registry validation). It registers no Search
 * provider for the same reason Today does not: there is no planning record to
 * find.
 *
 * It contributes one navigable route and two honest NAVIGATION commands, so the
 * palette can reach this week and next week by typing (ADR-024 §24.15).
 */

import { defineModule } from "~/kernel/modules";

import { planCommands } from "./commands";
import routes from "./routes.manifest";

export default defineModule({
  id: "plan",
  name: "Plan",
  description:
    "The week ahead — what you are committing to, and on which days.",
  order: 7,
  routes,
  commands: planCommands,
});
