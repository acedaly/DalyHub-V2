/**
 * DS-08 E2E setup — migrate the local D1 and seed the configured dev workspace.
 *
 * The authenticated `/search` route resolves the active workspace through the real
 * FND-03/FND-09 composition boundary (`resolveAuthenticatedWorkspaceScope`), which
 * VERIFIES the workspace exists in D1. So the browser journey needs the local D1
 * migrated and the configured `DEFAULT_WORKSPACE_ID` row present — otherwise the
 * route (correctly) fails closed to the Search error state.
 *
 * This runs before `react-router dev`; the Cloudflare Vite plugin and `wrangler
 * --local` share the same `.wrangler/state` D1, so seeding here is visible to the
 * dev server. Idempotent: migrations skip already-applied files and the workspace
 * insert is `INSERT OR IGNORE`. It touches only the LOCAL Miniflare database — no
 * remote D1, no production data.
 */
import { execFileSync } from "node:child_process";

// Must match `.dev.vars` (setup-dev-auth.mjs) and wrangler.jsonc.
const WORKSPACE_ID = "local-dev-workspace";
const TS = "2026-07-19T00:00:00.000Z";

function wrangler(args) {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

wrangler(["d1", "migrations", "apply", "DB", "--local"]);
wrangler([
  "d1",
  "execute",
  "DB",
  "--local",
  "--command",
  `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at) VALUES ('${WORKSPACE_ID}', '${TS}', '${TS}');`,
]);

console.log(`Local D1 migrated and workspace '${WORKSPACE_ID}' seeded.`);
