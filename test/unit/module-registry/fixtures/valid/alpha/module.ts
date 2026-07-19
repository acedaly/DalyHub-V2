/**
 * Test fixture manifest — NOT a product module. Proves automatic discovery: a
 * correctly-shaped `module.ts` under a discovery glob is picked up without
 * editing the registry implementation or any central list.
 */
import { defineModule } from "~/kernel/modules";

export default defineModule({
  id: "alpha",
  name: "Alpha",
  // Declared order 2 — deliberately not the path-sorted position, to prove the
  // registry re-sorts by declared order rather than discovery order.
  order: 2,
  entityTypes: [
    { type: "alpha_thing", singular: "Alpha thing", plural: "Alpha things" },
  ],
  commands: [
    {
      id: "alpha.create",
      title: "Create alpha",
      kind: "execute",
      run: () => ({ ok: true }),
    },
  ],
});
