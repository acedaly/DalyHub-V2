#!/usr/bin/env node
/**
 * The workspace PURGE PLAN generator (V2.16 CONSOL-01, ADR-124).
 *
 * DalyHub has no in-product "delete workspace" button, and that is a decision
 * rather than a gap. The product resolves ONE workspace from server
 * configuration, confirms it exists and has no auto-create and no creation
 * surface (`app/platform/workspaces/configured-context-resolver.ts`), so a
 * button that deleted the configured workspace would leave every authenticated
 * request failing `WorkspaceNotFoundError` with no in-product path back — a
 * button that destroys the application that draws it. The whole reasoning is
 * ADR-124 and `docs/development/WORKSPACE_DELETION.md`.
 *
 * What replaces it is a PROVED operator procedure rather than a documented one,
 * and this is the part of it that a person runs.
 *
 * ── What this does, and what it deliberately does not ───────────────────────
 *
 * It PRINTS SQL. It opens no database, reads no credential, takes no account
 * id, and deletes nothing. The operator reads the plan, satisfies themselves it
 * is what they meant, and runs it themselves through `wrangler d1 execute`.
 *
 * The statements are PARAMETERISED (`:workspace_id`), never interpolated: a
 * generator that pastes an id into a string is one typo away from a statement
 * that means something else, and the something else here is somebody's whole
 * life.
 *
 * ── Why it is generated rather than written down ────────────────────────────
 *
 * The order is the only hard part. MOST foreign keys in DalyHub are
 * `ON DELETE RESTRICT`, so a purge in the wrong order does not cascade — it
 * FAILS, halfway, having already deleted some of it. Nine are
 * `ON DELETE CASCADE` and one is SQLite's default `NO ACTION`; the cascading
 * nine are the dangerous half, because a wrong order there deletes MORE than
 * the statement names and nothing tells the operator it happened. All ten are
 * enumerated with their rules and reasons in
 * `test/kernel/workspace-data-map.test.ts`. The order here is derived
 * from the classification in `app/platform/storage/d1/workspace-data-map.ts`,
 * which carries every table's foreign-key parents and is checked against the
 * REAL schema (`sqlite_master`, `pragma_foreign_key_list`) by
 * `test/kernel/workspace-data-map.test.ts`, which also EXECUTES this plan
 * against an isolated synthetic workspace and proves it empties the database
 * without touching a second workspace beside it.
 *
 * A hand-kept order in a document would have been correct on the day it was
 * written and silently wrong at the next migration. This one fails the build
 * instead.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   pnpm run workspace:purge:plan             the SQL, ready to review
 *   pnpm run workspace:purge:plan --classes   the classification, as a table
 *   pnpm run workspace:purge:plan --workspace=<id>
 *                                             the same SQL, RUNNABLE
 *
 * The default output is for a HUMAN: it carries `:workspace_id` unbound, so
 * nobody can paste it into a terminal by accident, and a reviewer reads a
 * statement that says what it means rather than one with an id baked into it.
 *
 * `--workspace=<id>` is for the machine. It substitutes a VALIDATED id — the
 * same `[A-Za-z0-9_-]` rule the attachment key builder applies, refused
 * loudly rather than escaped — and drops the `BEGIN TRANSACTION` / `COMMIT`
 * wrapper, because D1 does not accept an explicit transaction from
 * `wrangler d1 execute` and applies a `--file` as one batch of its own. The
 * two forms exist because V2.16's review pointed out that the documented
 * procedure could not actually be run: an unbound `:workspace_id` has no
 * binding flag in `wrangler d1 execute`, so the operator was being asked to
 * hand-substitute an id into sixty statements — precisely the typo the
 * parameterisation was there to prevent.
 *
 * The R2 half of a deletion is NOT here and cannot be: object keys live in the
 * bucket, not in D1. `WORKSPACE_DELETION.md` documents it beside this, together
 * with what the backups bucket's retention policy does and does not promise.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/*
 * The map is deliberately import-free TypeScript, so Node's type stripping can
 * load it directly — no bundler, no path alias, and no second copy of the order
 * maintained in JavaScript for the script's benefit.
 */
const { WORKSPACE_TABLES, workspacePurgeOrder, workspacePurgeStatements } =
  await import(
    join(ROOT, "app", "platform", "storage", "d1", "workspace-data-map.ts")
  );

const wantsClasses = process.argv.includes("--classes");

const workspaceFlag = process.argv.find((arg) =>
  arg.startsWith("--workspace="),
);
const workspaceId = workspaceFlag?.slice("--workspace=".length) ?? null;
if (workspaceId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) {
  /*
   * Refused, never escaped. A workspace id in this product is a generated
   * identifier from a closed alphabet (`isSafeKeySegment`, the same rule the
   * attachment object key uses); anything else is either a mistake or an
   * attempt to make the statement mean something other than it reads, and the
   * only safe response to either is to stop.
   */
  console.error(
    `Refusing to build a plan for ${JSON.stringify(workspaceId)}: a workspace id is 1-128 characters of [A-Za-z0-9_-]. Nothing was generated.`,
  );
  process.exit(2);
}
/** The id as SQL, or the unbound placeholder when none was given. */
const bound = workspaceId === null ? ":workspace_id" : `'${workspaceId}'`;

if (wantsClasses) {
  const width = Math.max(
    ...WORKSPACE_TABLES.map((entry) => entry.table.length),
  );
  const byClass = new Map();
  for (const entry of WORKSPACE_TABLES) {
    byClass.set(entry.dataClass, [
      ...(byClass.get(entry.dataClass) ?? []),
      entry,
    ]);
  }
  for (const [dataClass, entries] of byClass) {
    console.log(`\n${dataClass.toUpperCase()} — ${entries.length} tables`);
    for (const entry of entries) {
      const destination =
        entry.collection === undefined ? "" : `  → ${entry.collection}`;
      console.log(`  ${entry.table.padEnd(width)}${destination}`);
    }
  }
  console.log(`\n${WORKSPACE_TABLES.length} tables classified in total.`);
  process.exit(0);
}

const order = workspacePurgeOrder();
const statements = workspacePurgeStatements();

console.log(`-- DalyHub workspace purge plan`);
console.log(`--`);
console.log(`-- Generated by scripts/workspace-purge-plan.mjs from the`);
console.log(
  `-- classification in app/platform/storage/d1/workspace-data-map.ts.`,
);
console.log(`-- ${order.length} tables, children strictly before parents.`);
console.log(`--`);
console.log(`-- THIS DELETES A WHOLE WORKSPACE AND CANNOT BE UNDONE.`);
console.log(
  `-- Read docs/development/WORKSPACE_DELETION.md before running it:`,
);
console.log(
  `-- it covers the export you should take first, the R2 objects this`,
);
console.log(
  `-- plan does NOT reach, and what the backups retention policy does`,
);
console.log(`-- and does not promise.`);
console.log(`--`);
if (workspaceId === null) {
  console.log(`-- Bind :workspace_id yourself. It is not interpolated here on`);
  console.log(`-- purpose. For a RUNNABLE file, re-run with`);
  console.log(`--   pnpm run workspace:purge:plan --workspace=<id>`);
} else {
  console.log(`-- Built for workspace ${workspaceId}, and RUNNABLE as it is.`);
  console.log(`-- No BEGIN/COMMIT: D1 does not accept an explicit transaction`);
  console.log(`-- from \`wrangler d1 execute\`, and applies a --file as one`);
  console.log(`-- batch of its own.`);
}
console.log(``);
for (let index = 0; index < statements.length; index += 1) {
  const entry = order[index];
  console.log(`-- ${index + 1}/${statements.length}  ${entry.dataClass}`);
  console.log(statements[index].replaceAll(":workspace_id", bound));
}
console.log(``);
console.log(`-- Verification: every count below must be 0.`);
for (const entry of order) {
  const predicate =
    entry.scope === "root" ? `id = ${bound}` : `workspace_id = ${bound}`;
  console.log(
    `SELECT '${entry.table}' AS t, COUNT(*) AS n FROM ${entry.table} WHERE ${predicate};`,
  );
}
