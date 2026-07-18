/**
 * FND-07 — the Areas product module manifest.
 *
 * A real, side-effect-free production manifest (not a test fixture). It registers
 * the metadata FND-07 owns — the `area` entity type — plus the single navigable
 * placeholder route FND-09 adds so the shell can prove the
 * manifest → registry → route → navigation flow. Areas are permanent domains of
 * life — they never complete, so there is no completion Activity type, and they
 * have no structural parent, so they own no hierarchy link type. The route file is
 * a declarative, module-relative reference (ADR-016 §5.10); the page it points at
 * is a routing placeholder only — the Areas product experience arrives in its own
 * roadmap phase, not FND-09.
 *
 * Hierarchy correctness itself lives in the shared spine kernel and the
 * SpineRepository (ADR-014 §4.1), never in this manifest — the manifest only
 * declares discoverable capability metadata.
 */

import { defineModule } from "~/kernel/modules";
import { AREA } from "~/kernel/spine";

import routes from "./routes.manifest";

export default defineModule({
  id: "areas",
  name: "Areas",
  description: "Permanent domains of life — the top of the spine.",
  order: 10,
  routes,
  entityTypes: [{ type: AREA, singular: "Area", plural: "Areas" }],
});
