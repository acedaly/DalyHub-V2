/**
 * X-02 — the Views product module manifest.
 *
 * Views owns NO entity type, NO link type and NO Activity type: it is a way of
 * ASKING about records other modules own, not a place records live. That is the
 * whole point — a saved view describes a query and never becomes a second source of
 * truth. It therefore registers only its routes and its command.
 */

import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";
import { viewsCommands } from "./commands";

export default defineModule({
  id: "views",
  name: "Views",
  description:
    "Saved questions about your records, answered across the modules that hold them.",
  order: 45,
  routes,
  commands: viewsCommands,
});
