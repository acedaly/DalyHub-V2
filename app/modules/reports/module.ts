/**
 * V2.13 — the Reports product module manifest.
 *
 * Reports owns NO entity type, NO link type and NO Activity type, and that is
 * deliberate rather than incidental: a Report describes a QUESTION and never
 * becomes a source of truth (ADR-082 d10, ADR-121 d1). Opening one is not an
 * event in the owner's history — the same judgement Analytics and the Review's
 * evidence already made about reading.
 *
 * It therefore registers its routes, its commands and its search provider, and
 * nothing else.
 */

import { defineModule } from "~/kernel/modules";

import { reportsCommands } from "./commands";
import routes from "./routes.manifest";
import { reportsSearchProvider } from "./search";

export default defineModule({
  id: "reports",
  name: "Reports",
  description:
    "Saved questions about your life, answered from the records that hold them.",
  // Between Insight (190) and Reviews (200): the ambient reading, then the
  // saved questions, then the deliberate ritual. The RAIL order is the route
  // manifest's `navOrder`; this is the registry's own.
  order: 195,
  routes,
  commands: reportsCommands,
  searchProviders: [reportsSearchProvider],
});
