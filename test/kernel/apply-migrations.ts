import { applyD1Migrations, env } from "cloudflare:test";

// Apply the real, committed migrations to the isolated per-file test D1 before
// any test runs. This uses the SAME migration SQL that ships to production —
// the integration suite never mocks D1 or hand-writes schema. `applyD1Migrations`
// is idempotent (it tracks applied migrations), so re-running is safe.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
