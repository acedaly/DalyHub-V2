/**
 * PX-03 — the Settings product module manifest (navigation shell only).
 *
 * Settings is a cross-cutting configuration surface, not an entity type — like
 * Today and AI, it declares no `entityTypes`, so its sidebar row uses the shell's
 * documented generic navigation glyph. This is deliberately independent of the
 * User Menu's own (currently unwired) Settings link: `UserMenu.settingsHref` stays
 * omitted until SET-01 threads a real href through it (`app/shared/shell/
 * UserMenu.tsx`) — this manifest only gives Settings a reachable place in primary
 * navigation. SET-01 owns the real implementation and will extend this manifest.
 */

import { defineModule } from "~/kernel/modules";

import { settingsCommands } from "./commands";
import routes from "./routes.manifest";

export default defineModule({
  id: "settings",
  name: "Settings",
  description: "App, workspace and account configuration.",
  order: 300,
  routes,
  commands: settingsCommands,
});
