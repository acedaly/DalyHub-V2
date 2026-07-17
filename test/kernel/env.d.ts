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
    }
  }
}

export {};
