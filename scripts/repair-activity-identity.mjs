/**
 * IDENT-01 — the production identity repair (dry-run by default).
 *
 * Activity already records WHO caused every authenticated event: `actor_type =
 * 'user'` with `actor_id` = the stable Cloudflare Access subject. What was
 * missing was the `workspace_members` row that subject resolves through, so
 * every historical event rendered without a name. This script repairs the
 * IDENTITY LINK — it does not rewrite history.
 *
 * What it does
 *   1. Reads the evidence: actors on the Activity stream, existing membership
 *      rows, the recorded preferences owner id, and the workspace's People.
 *   2. Plans the repair with `scripts/identity-repair-plan.mjs` (pure, tested).
 *   3. Prints counts grouped by repair method, plus every event it cannot
 *      safely attribute and why.
 *   4. Applies nothing unless `--apply` is passed.
 *
 * Safety
 *   - Additive by default: it writes only `workspace_members` rows. No Activity
 *     row is created, deleted or rewritten, so no duplicate history can appear.
 *   - Every statement is idempotent, so re-running is a no-op and an interrupted
 *     run is safely resumable. Statements are submitted as ONE batch, which D1
 *     runs in an implicit transaction.
 *   - It never assigns events to a name it cannot evidence. Anything ambiguous
 *     is reported and left to display as "Unknown user".
 *   - The one operation that touches `activities` — re-attributing events
 *     recorded BEFORE authentication existed, which carry no actor id at all —
 *     is opt-in (`--attribute-legacy-system`), refuses to run when more than one
 *     subject could be responsible, and is bounded to events older than the
 *     workspace's first authenticated event.
 *
 * Usage
 *   # Report only, against production (safe — reads nothing but counts):
 *   CLOUDFLARE_D1_DATABASE_ID=<uuid> \
 *     node scripts/repair-activity-identity.mjs --workspace <id>
 *
 *   # Apply the additive identity repair:
 *   CLOUDFLARE_D1_DATABASE_ID=<uuid> \
 *     node scripts/repair-activity-identity.mjs --workspace <id> \
 *       --owner-email aidan@daly.id.au --apply
 *
 *   # Name the owner explicitly, or link them to their Person record:
 *   ... --subject <access-sub> --display-name "Aidan Daly" --apply
 *   ... --subject <access-sub> --person <person-entity-id> --apply
 *
 *   # Against the LOCAL development database:
 *   node scripts/repair-activity-identity.mjs --local --workspace <id>
 *
 * Authenticate Wrangler with `wrangler login` or `CLOUDFLARE_API_TOKEN`. No
 * secret is read or passed by this script.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REPAIR_METHODS, planIdentityRepair } from "./identity-repair-plan.mjs";
import {
  PRODUCTION_DATABASE_NAME,
  checkProductionDatabaseId,
  productionD1Config,
} from "./production-d1.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* -------------------------------------------------------------------------- */
/* SQL literals                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Render a value as a SQL literal. `wrangler d1 execute --command` has no
 * parameter binding, so the planner's parameters are inlined HERE, in one
 * audited place, with SQLite's own escaping (a single quote is doubled). Values
 * are rejected outright if they contain a NUL or a control character, so nothing
 * exotic can reach the statement.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Refusing to inline a non-finite number.");
    }
    return String(value);
  }
  const text = String(value);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(
      "Refusing to inline a value containing control characters.",
    );
  }
  return `'${text.replaceAll("'", "''")}'`;
}

/**
 * Inline a planned statement's parameters into an executable statement.
 * @param {{ sql: string, params: unknown[] }} statement
 * @returns {string}
 */
export function renderStatement(statement) {
  let index = 0;
  const sql = statement.sql.replace(/\?/g, () =>
    sqlLiteral(statement.params[index++]),
  );
  if (index !== statement.params.length) {
    throw new Error(
      "Statement placeholder count does not match its parameters.",
    );
  }
  return sql.replace(/\s+/g, " ").trim();
}

/* -------------------------------------------------------------------------- */
/* Wrangler                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {string[]} args
 * @param {{ cwd?: string }} [opts]
 * @returns {string}
 */
function runWrangler(args, { cwd = ROOT } = {}) {
  const result = spawnSync("wrangler", args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    throw new Error(`wrangler exited ${result.status}`);
  }
  return result.stdout ?? "";
}

/**
 * Parse `wrangler d1 execute --json` output into the first result set. The rows
 * are untyped by nature (they come from a CLI); the planner documents the shape
 * it expects of each query.
 *
 * @param {string} stdout
 * @returns {any[]}
 */
export function parseD1Json(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1) {
    return [];
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  return parsed[0]?.results ?? [];
}

/**
 * Build the statement executor for the chosen target, plus its cleanup.
 *
 * @param {RepairOptions} options
 * @returns {{ execute: (sql: string) => any[], cleanup: () => void }}
 */
function makeExecutor(options) {
  if (options.local) {
    return {
      execute: (sql) =>
        parseD1Json(
          runWrangler([
            "d1",
            "execute",
            "DB",
            "--local",
            "--json",
            "--command",
            sql,
          ]),
        ),
      cleanup: () => {},
    };
  }

  const readiness = checkProductionDatabaseId();
  if (!readiness.ok) {
    for (const problem of readiness.problems) {
      console.error(`  • ${problem}`);
    }
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), "dalyhub-identity-"));
  const configPath = join(dir, "wrangler.json");
  writeFileSync(configPath, JSON.stringify(productionD1Config(readiness.id)), {
    mode: 0o600,
  });
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Best effort; the directory is already process-private.
  }
  return {
    execute: (sql) =>
      parseD1Json(
        runWrangler([
          "d1",
          "execute",
          PRODUCTION_DATABASE_NAME,
          "--remote",
          "--json",
          "--config",
          configPath,
          "--command",
          sql,
        ]),
      ),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The four read queries the plan is built from. Read-only, workspace-scoped.
 * @param {string} workspaceId
 */
export function readQueries(workspaceId) {
  const ws = sqlLiteral(workspaceId);
  return {
    actors: `SELECT actor_type, actor_id, COUNT(*) AS events,
                    MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
             FROM activities WHERE workspace_id = ${ws}
             GROUP BY actor_type, actor_id`,
    members: `SELECT subject, email, display_name, auth_display_name, person_entity_id
              FROM workspace_members WHERE workspace_id = ${ws}`,
    preferenceOwners: `SELECT DISTINCT owner_id FROM owner_app_preferences
                       WHERE workspace_id = ${ws}`,
    people: `SELECT e.id AS id, e.title AS title, pd.email AS email
             FROM entities e
             JOIN person_details pd
               ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
             WHERE e.workspace_id = ${ws} AND e.type = 'person'
               AND e.deleted_at IS NULL`,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} RepairOptions
 * @property {boolean} apply
 * @property {boolean} local
 * @property {boolean} attributeLegacySystem
 * @property {string} [workspaceId]
 * @property {string} [ownerEmail]
 * @property {string} [subject]
 * @property {string} [displayName]
 * @property {string} [personEntityId]
 */

/**
 * @param {string[]} argv
 * @returns {RepairOptions}
 */
export function parseArgs(argv) {
  /** @type {RepairOptions} */
  const options = { apply: false, local: false, attributeLegacySystem: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => argv[++i];
    switch (arg) {
      case "--apply":
        options.apply = true;
        break;
      case "--local":
        options.local = true;
        break;
      case "--attribute-legacy-system":
        options.attributeLegacySystem = true;
        break;
      case "--workspace":
        options.workspaceId = take();
        break;
      case "--owner-email":
        options.ownerEmail = take();
        break;
      case "--subject":
        options.subject = take();
        break;
      case "--display-name":
        options.displayName = take();
        break;
      case "--person":
        options.personEntityId = take();
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option ${arg}`);
        }
    }
  }
  return options;
}

/**
 * @param {ReturnType<typeof planIdentityRepair>} plan
 * @param {RepairOptions} options
 * @returns {string}
 */
export function formatReport(plan, options) {
  const lines = [];
  const { summary } = plan;
  lines.push("");
  lines.push(
    `Identity repair — ${options.apply ? "APPLY" : "DRY RUN (nothing will be written)"}`,
  );
  lines.push(`  workspace                 ${summary.workspaceId}`);
  lines.push(`  authenticated subjects    ${summary.subjects.length}`);
  lines.push(`  events with a user actor  ${summary.userEvents}`);
  lines.push(`  existing membership rows  ${summary.existingMembers}`);
  lines.push(`  active People records     ${summary.activePeople}`);
  lines.push(
    `  pre-auth system events    ${summary.legacySystemEvents}` +
      (summary.legacySystemLatest
        ? ` (latest ${summary.legacySystemLatest})`
        : ""),
  );

  lines.push("");
  lines.push("Repairs by method:");
  let total = 0;
  for (const method of REPAIR_METHODS) {
    const count = plan.counts[method] ?? 0;
    total += count;
    lines.push(`  ${method.padEnd(30)} ${count}`);
  }
  lines.push(`  ${"TOTAL".padEnd(30)} ${total}`);

  if (plan.statements.length > 0) {
    lines.push("");
    lines.push("Planned statements:");
    for (const statement of plan.statements) {
      lines.push(`  [${statement.method}] ${statement.description}`);
      lines.push(`      ${renderStatement(statement)}`);
    }
  }

  lines.push("");
  if (plan.unresolved.length === 0) {
    lines.push("Unresolved: none — every recorded actor is attributable.");
  } else {
    lines.push("Unresolved (left to display as “Unknown user” / “System”):");
    for (const item of plan.unresolved) {
      lines.push(
        `  ${item.reason}${item.subject ? ` (${item.subject})` : ""} — ${item.events} event(s)`,
      );
      lines.push(`      ${item.detail}`);
    }
  }

  if (plan.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const note of plan.notes) {
      lines.push(`  • ${note}`);
    }
  }

  lines.push("");
  lines.push(
    options.apply
      ? "Applied. Re-run without --apply to confirm the repair is now a no-op."
      : "No changes were made. Re-run with --apply to write them.",
  );
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.workspaceId) {
    console.error("--workspace <id> is required.");
    process.exit(1);
  }

  const { execute, cleanup } = makeExecutor(options);
  try {
    const queries = readQueries(options.workspaceId);
    const plan = planIdentityRepair({
      actors: execute(queries.actors),
      members: execute(queries.members),
      preferenceOwners: execute(queries.preferenceOwners),
      people: execute(queries.people),
      options: { ...options, now: new Date().toISOString() },
    });

    console.log(formatReport(plan, options));

    if (options.apply && plan.statements.length > 0) {
      // One batch: D1 runs a multi-statement command in an implicit transaction,
      // and every statement is individually idempotent regardless.
      execute(plan.statements.map(renderStatement).join(";\n") + ";");
      console.log("Repair applied.");
    }
  } finally {
    cleanup();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
