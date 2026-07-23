/**
 * FND-07 — the Areas product module manifest.
 *
 * A real, side-effect-free production manifest (not a test fixture). It registers
 * the metadata FND-07 owns — the `area` entity type — plus the AREA-01 collection,
 * create, record, mutate and Activity routes. Areas are permanent domains of life:
 * they never complete, so there is no completion Activity type, and they have no
 * structural parent, so they own no hierarchy link type. The route files are
 * declarative, module-relative references (ADR-016 §5.10), keeping the module
 * self-contained.
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
