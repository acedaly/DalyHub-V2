/**
 * UIX-05 — the Analytics product module manifest.
 *
 * Analytics owns NO entity type, NO link type and NO Activity type, and it is
 * deliberate rather than incidental: it is a way of READING records other
 * modules own, never a place records live, and it writes nothing at all. Opening
 * it is not an event in the owner's history — the same judgement REVIEW-03 made
 * about reading a Review's evidence.
 *
 * It therefore registers only its route and its command, exactly as Views does.
 */

import { defineModule } from "~/kernel/modules";

import { analyticsCommands } from "./commands";
import routes from "./routes.manifest";

export default defineModule({
  id: "analytics",
  name: "Analytics",
  description: "Where your effort has actually gone, over a period you choose.",
  order: 190,
  routes,
  commands: analyticsCommands,
});
