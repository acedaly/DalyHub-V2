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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Must match `.dev.vars` (setup-dev-auth.mjs) and wrangler.jsonc.
const WORKSPACE_ID = "local-dev-workspace";
const TS = "2026-07-19T00:00:00.000Z";
const SEED_TASKS = join(
  dirname(fileURLToPath(import.meta.url)),
  "seed-tasks.sql",
);
const MOBILE_PROJECT_TITLE_PREFIX = "Mobile Projects workflow ";
const AREA_OVERVIEW_TITLE_PREFIX = "Area overview e2e ";
const GOAL_JOURNEY_TITLE_PREFIX = "Goal e2e ";
const MOBILE_TASK_TITLES = [
  "Mobile task to complete and reconcile from the shared drawer",
  "Unfinished mobile task that deliberately blocks archiving",
];
const MOBILE_ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WORKSPACE_ID}'
    AND (
      (type = 'project' AND title LIKE '${MOBILE_PROJECT_TITLE_PREFIX}%')
      OR (type = 'task' AND title IN (${MOBILE_TASK_TITLES.map((title) => `'${title}'`).join(", ")}))
    )
`;
const MOBILE_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM task_details WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM project_details WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM spine_records WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE_ID}' AND (source_entity_id IN (${MOBILE_ENTITY_QUERY}) OR target_entity_id IN (${MOBILE_ENTITY_QUERY}));`,
  `DELETE FROM entities WHERE workspace_id = '${WORKSPACE_ID}' AND id IN (${MOBILE_ENTITY_QUERY});`,
];
const AREA_OVERVIEW_ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WORKSPACE_ID}'
    AND type = 'area'
    AND title LIKE '${AREA_OVERVIEW_TITLE_PREFIX}%'
`;
const AREA_OVERVIEW_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${AREA_OVERVIEW_ENTITY_QUERY});`,
  `DELETE FROM spine_records WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${AREA_OVERVIEW_ENTITY_QUERY});`,
  `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE_ID}' AND (source_entity_id IN (${AREA_OVERVIEW_ENTITY_QUERY}) OR target_entity_id IN (${AREA_OVERVIEW_ENTITY_QUERY}));`,
  `DELETE FROM entities WHERE workspace_id = '${WORKSPACE_ID}' AND id IN (${AREA_OVERVIEW_ENTITY_QUERY});`,
];
// AREA-02 Goal journey creates a real Goal (+ optional Project) under the
// existing permanent `a-dh` fixture Area, so only these test-owned Goal/Project
// rows (and their details/links/activity subjects) need removing — never the
// fixture Area itself.
const GOAL_JOURNEY_ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WORKSPACE_ID}'
    AND type IN ('goal', 'project')
    AND title LIKE '${GOAL_JOURNEY_TITLE_PREFIX}%'
`;
// A test-created Project/Goal's `entity_link.*` activity also records the
// permanent `a-dh` fixture Area as a subject (so its own Activity feed shows
// the link). Scoping this delete to `entity_id IN (test entities)` alone
// would leave that `a-dh` subject row behind forever, silently inflating the
// fixture Area's Activity feed across repeated local runs. Deleting by
// `activity_id` instead removes every subject row of any activity the test
// touched — including the one left on `a-dh` — while the fixture Area's own
// unrelated activity rows are untouched.
const GOAL_JOURNEY_ACTIVITY_QUERY = `
  SELECT DISTINCT activity_id FROM activity_subjects
  WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${GOAL_JOURNEY_ENTITY_QUERY})
`;
const GOAL_JOURNEY_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE_ID}' AND activity_id IN (${GOAL_JOURNEY_ACTIVITY_QUERY});`,
  `DELETE FROM goal_details WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${GOAL_JOURNEY_ENTITY_QUERY});`,
  `DELETE FROM project_details WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${GOAL_JOURNEY_ENTITY_QUERY});`,
  `DELETE FROM spine_records WHERE workspace_id = '${WORKSPACE_ID}' AND entity_id IN (${GOAL_JOURNEY_ENTITY_QUERY});`,
  `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE_ID}' AND (source_entity_id IN (${GOAL_JOURNEY_ENTITY_QUERY}) OR target_entity_id IN (${GOAL_JOURNEY_ENTITY_QUERY}));`,
  `DELETE FROM entities WHERE workspace_id = '${WORKSPACE_ID}' AND id IN (${GOAL_JOURNEY_ENTITY_QUERY});`,
];

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

// PROJ-06 mobile journey creates real records through the UI. Remove only those
// test-owned rows before seeding so an interrupted local run cannot affect other
// journeys that share the same Miniflare D1 instance.
for (const statement of MOBILE_CLEANUP_SQL) {
  wrangler(["d1", "execute", "DB", "--local", "--command", statement]);
}
for (const statement of AREA_OVERVIEW_CLEANUP_SQL) {
  wrangler(["d1", "execute", "DB", "--local", "--command", statement]);
}
for (const statement of GOAL_JOURNEY_CLEANUP_SQL) {
  wrangler(["d1", "execute", "DB", "--local", "--command", statement]);
}

// TODAY-02: seed a small real spine (areas + focus tasks) so /today shows real
// task data and the task Drawer opens real records.
wrangler(["d1", "execute", "DB", "--local", "--file", SEED_TASKS]);

console.log(
  `Local D1 migrated and workspace '${WORKSPACE_ID}' seeded (with tasks).`,
);
