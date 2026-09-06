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
        main: "./infra/backup/src/index.ts",
        miniflare: {
          // Kept in step with wrangler.jsonc so tests match production runtime.
          compatibilityDate: "2026-07-17",
          compatibilityFlags: ["nodejs_compat"],
          // Isolated, local-only D1 keyed by the binding name — never a remote
          // or production database. `DB` is migrated by the setup file;
          // `MIGRATION_TEST_DB` is left EMPTY so the FND-03 migration test can
          // apply migrations 0001 → 0002 sequentially over seeded data.
          d1Databases: ["DB", "MIGRATION_TEST_DB"],
          // BACKUP-01: a local, isolated R2 bucket so the production backup
          // Workflow can be driven against a REAL R2 implementation rather than
          // a hand-written stub. That matters — the Workflow relies on R2
          // verifying the SHA-256 it is given and on `head()` returning the
          // custom metadata that was written, and a stub would happily agree
          // with whatever the code did. Never a remote bucket.
          r2Buckets: ["BACKUPS"],
          durableObjects: {
            BACKUP_ADMISSION: "BackupAdmissionGate",
          },
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
    /*
     * Vitest's default is 5 s, and for THIS suite that number was never sized
     * for the work. Every test here does real D1 through the Workers pool, and
     * several deliberately seed a hundred-odd rows to assert a statement-count
     * budget over a page that is genuinely large.
     *
     * MEASURED. Locally the whole suite spends ~265 s in test bodies and its
     * slowest test takes 1 289 ms. The same suite on CI spends 997 s — about
     * 3.8x — which puts that slowest test at ~4.9 s, ON the default, before any
     * contention. Five tests have duly timed out at 5 000 ms on CI across three
     * files while passing locally every time: `recall-03-commitments-due`
     * (four, seeding 150 Tasks), `review-insights` (a second, larger
     * workspace), and `task-checklist` at 783 ms locally.
     *
     * Ceilinging them one at a time was treating the symptom: the band at risk
     * is everything above ~1.3 s locally, and it grows as the suite does. The
     * house pattern already grants 30 s, 90 s and 600 s to individual seeded
     * suites (`recall-03`, `areas-route`, `asset-history-scale`), which is the
     * same admission made three times over.
     *
     * NOTHING is weakened. A ceiling is not a budget — a passing test never
     * spends it — and no assertion in this suite is about elapsed time. The
     * performance claims here are STATEMENT COUNTS (`counter.statements()`,
     * `INSIGHT_ACTIVITY_PAGE_BUDGET`, `REVIEW_INSIGHTS_QUERY_BUDGET`), so an
     * accidental N+1 still fails on the assertion that names it rather than on
     * the clock. A genuine hang still fails, 25 s later.
     */
    testTimeout: 30_000,
  },
});
