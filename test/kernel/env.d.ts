/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from "cloudflare:test";

// The Workers Vitest pool (vitest.workers.config.ts) injects the parsed,
// committed migrations as a `TEST_MIGRATIONS` binding so the migration setup
// file can apply them to the isolated test D1. This binding exists ONLY under
// the test pool; it is not a real Worker binding. We augment the generated
// `Cloudflare.Env` (which already carries the real `DB` binding) to type it.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      // A second, deliberately UN-migrated local D1 (see
      // vitest.workers.config.ts) used only by the FND-03 migration test to
      // apply migrations 0001 → 0002 sequentially over seeded data. Not a real
      // Worker binding.
      MIGRATION_TEST_DB: D1Database;
    }
  }
}

export {};
