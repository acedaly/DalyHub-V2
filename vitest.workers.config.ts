import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// FND-02 data kernel integration tests run inside the REAL Workers runtime with
// an isolated, local D1 binding, using Cloudflare's official Workers Vitest
// integration (`@cloudflare/vitest-pool-workers`). D1 is NOT mocked: the real
// committed migration is applied to a fresh per-file database (see
// test/kernel/apply-migrations.ts), and each test gets isolated storage.
//
// This is deliberately separate from vitest.config.ts (happy-dom component and
// health tests) because it uses a different runtime pool. Both run under
// `pnpm test` and in CI. No Cloudflare credentials or remote database are used:
// Miniflare provides a local SQLite keyed by the binding name.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        path.join(import.meta.dirname, "migrations"),
      );

      return {
        miniflare: {
          // Kept in step with wrangler.jsonc so tests match production runtime.
          compatibilityDate: "2026-07-17",
          compatibilityFlags: ["nodejs_compat"],
          // Isolated, local-only D1 keyed by the binding name — never a remote
          // or production database. `DB` is migrated by the setup file;
          // `MIGRATION_TEST_DB` is left EMPTY so the FND-03 migration test can
          // apply migrations 0001 → 0002 sequentially over seeded data.
          d1Databases: ["DB", "MIGRATION_TEST_DB"],
          bindings: {
            // The parsed migrations, injected so the setup file can apply them.
            TEST_MIGRATIONS: migrations,
            // A clearly non-production configured workspace scope for tests that
            // exercise the composition boundary (FND-03 / ADR-010).
            DEFAULT_WORKSPACE_ID: "test-default-workspace",
          },
        },
      };
    }),
  ],
  resolve: {
    // Mirror the `~/* -> ./app/*` path mapping from tsconfig so kernel imports
    // resolve inside the Workers pool.
    alias: { "~": path.join(import.meta.dirname, "app") },
  },
  test: {
    include: ["test/kernel/**/*.test.ts"],
    setupFiles: ["./test/kernel/apply-migrations.ts"],
  },
});
