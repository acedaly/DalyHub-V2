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
 * It contributes the single navigable route (`routes.manifest.ts`) and — now that
 * DS-08 supplies the runtime search seam — a fixture-backed SEARCH PROVIDER
 * (`search.ts`). The provider is a real, registry-discovered contribution over the
 * Today fixtures that opens results in the existing DS-03 Drawer; when Today swaps
 * to real repositories, only the executor changes, not this contract. COMMAND
 * registration remains deferred to DS-09: a Today command such as Quick Capture
 * still has no honest `run` handler while there is no persistence seam in
 * `ModuleRuntimeContext` (TODAY-01 is otherwise fixture-only — no repositories, D1,
 * APIs, AI or persistence).
 */

import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";
import { todaySearchProvider } from "./search";

export default defineModule({
  id: "today",
  name: "Today",
  description: "The calm daily home — what deserves attention right now.",
  order: 5,
  routes,
  searchProviders: [todaySearchProvider],
});
