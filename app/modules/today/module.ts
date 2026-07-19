/**
 * TODAY-01 — the Today product module manifest.
 *
 * A real, side-effect-free production manifest (not a test fixture). Today is a
 * VIEW over the shared model — the calm surface the owner lands on each morning —
 * not an entity type of its own, so it declares no `entityTypes`, `entityLinkTypes`
 * or `activityTypes`: the Tasks/Notes/Meetings modules own those (FND-07), and a
 * module may not claim an entity type another module owns (FND-06 registry
 * validation). Because it declares no entity type, the registry-driven sidebar
 * renders Today's row with the generic navigation glyph — the shell's documented
 * fallback (PrimaryNavigation) — composed exactly as intended, with no shell change.
 *
 * It contributes only the single navigable route (`routes.manifest.ts`). Command
 * and search-provider registration (PRODUCT_EXPERIENCE Part IV §6) is deferred until
 * the runtime seams they need exist: a Today command such as Quick Capture has no
 * honest `run` handler while there is no persistence or navigation seam in
 * `ModuleRuntimeContext` (TODAY-01 is deliberately fixture-only — no repositories,
 * D1, APIs, AI or persistence). It is registered with the surface that first gives
 * it a real action (TODAY-05 keyboard workflow / DS-08/DS-09), not stubbed here.
 */

import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";

export default defineModule({
  id: "today",
  name: "Today",
  description: "The calm daily home — what deserves attention right now.",
  order: 5,
  routes,
});
