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
 * It contributes the single navigable route (`routes.manifest.ts`), a fixture-backed
 * SEARCH PROVIDER (`search.ts`, DS-08) and — now that DS-09 supplies the palette and
 * the discriminated command contract — two honest NAVIGATION COMMANDS (`commands.ts`):
 * "Go to Today" and "Focus Quick Capture". They are declarative (they open a route),
 * so they need no `run` handler and persist nothing; the palette navigates to them
 * directly (ADR-024 §24.15). Today remains fixture-only — no repositories, D1, APIs,
 * AI or persistence — so it registers no EXECUTABLE (server-mutating) command.
 */

import { defineModule } from "~/kernel/modules";

import { todayCommands } from "./commands";
import routes from "./routes.manifest";
import { todaySearchProvider } from "./search";

export default defineModule({
  id: "today",
  name: "Today",
  description: "The calm daily home — what deserves attention right now.",
  order: 5,
  routes,
  commands: todayCommands,
  searchProviders: [todaySearchProvider],
});
