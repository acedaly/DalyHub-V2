#!/usr/bin/env node
/**
 * DEPLOY-01 — the migration compatibility ledger, derived from the migrations.
 *
 * ── The question this answers ───────────────────────────────────────────────
 *
 * `DEPLOYMENT.md` tells an operator to migrate BEFORE deploying, on the grounds
 * that the previous Worker keeps working against a migrated database — which is
 * what makes step 6 independently reversible by rolling the *application* back.
 * That is a claim about every migration in the sequence, and it was written when
 * the sequence ended in the twenties.
 *
 * A claim like that cannot be maintained by hand. This script derives it: it
 * applies every migration in order to a throwaway SQLite database, captures the
 * schema after each one, and reports what changed — every table added or
 * dropped, every column added, dropped or retyped, and every column whose
 * nullability or default moved.
 *
 * ── What makes a migration ROLLBACK-UNSAFE ──────────────────────────────────
 *
 * Not "it changed something". Specifically: after this migration is applied, is
 * there a statement the PREVIOUS application version issues that the database
 * would now reject?
 *
 *   - a dropped TABLE      → the old code's SELECT/INSERT errors
 *   - a dropped COLUMN     → the old code's INSERT naming it errors
 *   - a narrowed CHECK     → the old code's previously-valid value is rejected
 *   - a new NOT NULL with
 *     no DEFAULT           → the old code's INSERT omitting it errors
 *
 * Everything else — a new table, a new nullable column, a new NOT NULL column
 * WITH a default, a new or dropped index — is invisible to code that does not
 * know about it.
 *
 * SQLite's `foreign_keys` is left OFF while applying, matching how Wrangler's D1
 * migration runner behaves and how a restored dump is loaded
 * (`BACKUP_AND_RESTORE.md` §5.0a); integrity is checked at the end instead,
 * which is the state worth asserting.
 *
 * ── The SQLite engine ───────────────────────────────────────────────────────
 *
 * `node:sqlite`, which is still marked experimental — so the npm scripts pass
 * `--disable-warning=ExperimentalWarning` rather than printing a warning on
 * every CI run. It is used HERE and nowhere the product runs: this is a
 * build-time analysis of committed SQL text, and if the API ever moves, the
 * failure is a red Static job asking for a one-line change, not a production
 * incident. The alternative — a `sqlite3` binary — would add a system
 * dependency to every checkout and every CI image for the same answer.
 *
 *   node scripts/migration-compatibility.mjs           # the human report
 *   node scripts/migration-compatibility.mjs --json    # the same as data
 *   node scripts/migration-compatibility.mjs --check   # non-zero if the
 *                                                      # committed ledger drifts
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "migrations");
const LEDGER = path.join(ROOT, "docs", "development", "migration-ledger.json");

/** Wrangler applies migrations in filename order, so this reads them that way. */
function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** Every table's column shape, keyed by table then column. */
function snapshot(db) {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);

  const out = {};
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    out[table] = {
      columns: Object.fromEntries(
        columns.map((c) => [
          c.name,
          { type: c.type, notNull: c.notnull === 1, default: c.dflt_value },
        ]),
      ),
      sql: db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`,
        )
        .get(table).sql,
    };
  }
  return out;
}

/**
 * Every CHECK constraint a table's DDL declares, normalised to one line each.
 *
 * Compared as a SET: a CHECK that disappears has widened what the table accepts
 * (safe for old code) and a CHECK that appears has narrowed it (not safe).
 */
function checks(sql) {
  if (!sql) return [];
  return [...sql.matchAll(/CHECK\s*\(/gi)]
    .map((match) => {
      let depth = 1;
      let i = match.index + match[0].length;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "(") depth += 1;
        else if (sql[i] === ")") depth -= 1;
        i += 1;
      }
      return sql.slice(match.index, i).replace(/\s+/g, " ").trim();
    })
    .sort();
}

function diff(before, after) {
  const result = {
    tablesAdded: [],
    tablesDropped: [],
    columnsAdded: [],
    columnsDropped: [],
    columnsRetyped: [],
    columnsNowRequired: [],
    checksAdded: [],
    checksRemoved: [],
  };

  for (const table of Object.keys(after)) {
    if (!before[table]) {
      result.tablesAdded.push(table);
      continue;
    }
    const b = before[table];
    const a = after[table];
    for (const column of Object.keys(a.columns)) {
      if (!b.columns[column]) {
        result.columnsAdded.push({
          table,
          column,
          notNull: a.columns[column].notNull,
          default: a.columns[column].default,
        });
        continue;
      }
      const bc = b.columns[column];
      const ac = a.columns[column];
      if (bc.type !== ac.type) {
        result.columnsRetyped.push({
          table,
          column,
          from: bc.type,
          to: ac.type,
        });
      }
      if (!bc.notNull && ac.notNull && ac.default === null) {
        result.columnsNowRequired.push({ table, column });
      }
    }
    for (const column of Object.keys(b.columns)) {
      if (!a.columns[column]) result.columnsDropped.push({ table, column });
    }

    const bChecks = new Set(checks(b.sql));
    const aChecks = new Set(checks(a.sql));
    for (const check of aChecks) {
      if (!bChecks.has(check)) result.checksAdded.push({ table, check });
    }
    for (const check of bChecks) {
      if (!aChecks.has(check)) result.checksRemoved.push({ table, check });
    }
  }
  for (const table of Object.keys(before)) {
    if (!after[table]) result.tablesDropped.push(table);
  }
  return result;
}

/**
 * Whether rolling the APPLICATION back across this migration is safe, and why
 * not when it is not.
 *
 * A narrowed CHECK is reported as a WARNING rather than a breakage: it only
 * rejects an old write if the old code can still produce a value the new CHECK
 * excludes, which the DDL alone cannot decide. The report names it so a human
 * can, rather than silently calling it safe or silently calling it fatal.
 */
function classify(delta) {
  const breaking = [];
  const warnings = [];
  for (const table of delta.tablesDropped) {
    breaking.push(`table \`${table}\` no longer exists`);
  }
  for (const { table, column } of delta.columnsDropped) {
    breaking.push(`\`${table}.${column}\` no longer exists`);
  }
  for (const { table, column, from, to } of delta.columnsRetyped) {
    breaking.push(`\`${table}.${column}\` changed type ${from} → ${to}`);
  }
  for (const { table, column } of delta.columnsNowRequired) {
    breaking.push(
      `\`${table}.${column}\` became NOT NULL with no default — an insert omitting it now fails`,
    );
  }
  for (const { table, check } of delta.checksAdded) {
    warnings.push(`\`${table}\` gained ${check}`);
  }
  return { breaking, warnings };
}

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF;");
  const steps = [];
  let before = snapshot(db);

  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    try {
      db.exec(sql);
    } catch (error) {
      throw new Error(`${file} failed to apply: ${error.message}`, {
        cause: error,
      });
    }
    const after = snapshot(db);
    const delta = diff(before, after);
    const { breaking, warnings } = classify(delta);
    steps.push({ migration: file, delta, breaking, warnings });
    before = after;
  }

  const integrity = db.prepare("PRAGMA foreign_key_check").all();
  const finalSchema = before;
  db.close();

  return {
    migrationCount: steps.length,
    head: steps.at(-1)?.migration ?? null,
    tableCount: Object.keys(finalSchema).length,
    foreignKeyViolations: integrity.length,
    applicationRollbackUnsafe: steps
      .filter((s) => s.breaking.length > 0)
      .map((s) => ({ migration: s.migration, reasons: s.breaking })),
    narrowedConstraints: steps
      .filter((s) => s.warnings.length > 0)
      .map((s) => ({ migration: s.migration, warnings: s.warnings })),
    steps,
  };
}

function report(result) {
  console.log(
    `${result.migrationCount} migrations applied in filename order; head is ${result.head}.`,
  );
  console.log(
    `Final schema: ${result.tableCount} tables, ${result.foreignKeyViolations} foreign-key violations.`,
  );
  console.log("");

  if (result.applicationRollbackUnsafe.length === 0) {
    console.log(
      "APPLICATION ROLLBACK: safe across every migration — none removes or narrows anything older code reads.",
    );
  } else {
    console.log(
      "APPLICATION ROLLBACK: NOT safe across the following. Rolling the Worker back to a version",
    );
    console.log(
      "PREDATING one of these, against a database that has it applied, is a broken deployment:",
    );
    for (const entry of result.applicationRollbackUnsafe) {
      console.log(`  ${entry.migration}`);
      for (const reason of entry.reasons) console.log(`      · ${reason}`);
    }
  }

  if (result.narrowedConstraints.length > 0) {
    console.log("");
    console.log(
      "NARROWED CONSTRAINTS — a CHECK that appeared. Only breaks an older Worker if that",
    );
    console.log("Worker can still write a value the new CHECK excludes:");
    for (const entry of result.narrowedConstraints) {
      console.log(`  ${entry.migration}`);
      for (const warning of entry.warnings) console.log(`      · ${warning}`);
    }
  }
}

function main() {
  const result = build();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const ledger = {
    about:
      "DEPLOY-01 — generated by scripts/migration-compatibility.mjs. The application-rollback boundary, derived by applying every migration to a throwaway SQLite database and diffing the schema after each. Regenerate with `pnpm run db:compat:generate`; `pnpm run db:compat:check` fails if it drifts.",
    migrationCount: result.migrationCount,
    head: result.head,
    tableCount: result.tableCount,
    foreignKeyViolations: result.foreignKeyViolations,
    applicationRollbackUnsafe: result.applicationRollbackUnsafe,
    narrowedConstraints: result.narrowedConstraints,
  };
  const serialised = `${JSON.stringify(ledger, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    let committed;
    try {
      committed = readFileSync(LEDGER, "utf8");
    } catch {
      console.error(
        `db:compat:check — ${path.relative(ROOT, LEDGER)} is missing. Run \`pnpm run db:compat:generate\`.`,
      );
      process.exitCode = 1;
      return;
    }
    if (committed !== serialised) {
      console.error(
        "db:compat:check — the committed migration ledger no longer matches the migrations.\n" +
          "A migration was added or changed. Read what moved, decide whether the deployment\n" +
          "order in docs/development/DEPLOYMENT.md still holds, then run\n" +
          "`pnpm run db:compat:generate` and commit the result.\n",
      );
      console.error("Generated:");
      console.error(serialised);
      process.exitCode = 1;
      return;
    }
    console.log(
      `db:compat:check — the ledger matches ${result.migrationCount} migrations, head ${result.head}.`,
    );
    return;
  }

  if (process.argv.includes("--generate")) {
    writeFileSync(LEDGER, serialised);
    console.log(
      `db:compat:generate — wrote ${path.relative(ROOT, LEDGER)} for ${result.migrationCount} migrations.`,
    );
    return;
  }

  report(result);
}

main();
