/**
 * Test fixture manifest — NOT a product module.
 */
import { defineModule } from "~/kernel/modules";

export default defineModule({
  id: "beta",
  name: "Beta",
  order: 1,
  routes: [
    {
      id: "beta.home",
      index: true,
      file: "routes/index.tsx",
      meta: { navLabel: "Beta" },
    },
  ],
});
