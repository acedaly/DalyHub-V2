/**
 * DEPLOY-01 — the pure half of the migration compatibility derivation.
 *
 * Two schema snapshots in, a list of what moved between them out, and a verdict
 * on whether an older Worker can still write to the later one. Nothing here
 * opens a database, reads a file or looks at `process.argv`: the caller supplies
 * the snapshots and this decides what they mean.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * It was inside `scripts/migration-compatibility.mjs`, which imports
 * `node:sqlite` to build those snapshots by applying every migration in order. That is
 * the right engine for the script and the wrong dependency for a unit test:
 * Vitest's client environment cannot bundle a Node built-in, so importing the
 * script to reach the predicate failed to load the whole suite. Splitting on the
 * line between "produce the snapshots" and "decide what they mean" fixes that
 * and is the better seam anyway — the decision is the part with the subtle
 * cases, and it is now testable against hand-built snapshots rather than only
 * through whichever shapes the real migrations happen to contain.
 *
 * ── The snapshot shape ──────────────────────────────────────────────────────
 *
 * Keyed by table, and per table:
 *
 *   { columns: { [name]: { type, notNull, default } }, sql }
 *
 * `default` is SQLite's `dflt_value` — `null` when the column declares none —
 * and `sql` is the table's `CREATE TABLE` text, which is where the CHECK
 * constraints live.
 */

/**
 * Every CHECK constraint a table's DDL declares, normalised to one line each.
 *
 * Compared as a SET: a CHECK that disappears has widened what the table accepts
 * (safe for old code) and a CHECK that appears has narrowed it (not safe).
 */
export function checks(sql) {
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

/**
 * Could an INSERT that never names this column succeed?
 *
 * Three ways yes: the column does not exist, `NULL` is a legal value for it, or
 * the database supplies a DEFAULT. Anything else and the value must come from
 * the caller — so a column that accepted omission and stops is a column an older
 * Worker can no longer write around.
 *
 * `INTEGER PRIMARY KEY` rowid aliases are deliberately NOT special-cased. DalyHub
 * allocates its own TEXT ids in application code and every primary key in the
 * schema is supplied by the caller, so treating a primary key as self-filling
 * would only create a way for a real breakage to read as safe.
 */
export function acceptsOmission(column) {
  if (!column) return true;
  if (!column.notNull) return true;
  return column.default !== null;
}

/**
 * What moved between two schema snapshots.
 *
 * The nullability question is asked on BOTH sides via {@link acceptsOmission},
 * and for every column including a newly added one. The first version asked
 * whether a NULLABLE column became `NOT NULL` with no default, and Codex review
 * on #308 found the two shapes that misses — both of which let an older Worker's
 * INSERT fail while the ledger reports the migration additive:
 *
 *   1. a table REBUILD that declares a NEW required column with no default —
 *      that arrives as a column ADDITION, not as a nullability change, and
 *      SQLite only refuses the no-default form on a bare `ALTER TABLE ADD
 *      COLUMN`, never inside a rebuild;
 *   2. an already-`NOT NULL` column LOSING its default — nullability did not
 *      move, and the database stopped supplying the value.
 */
export function diff(before, after) {
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
      const bc = b.columns[column];
      const ac = a.columns[column];

      if (!bc) {
        result.columnsAdded.push({
          table,
          column,
          notNull: ac.notNull,
          default: ac.default,
        });
      } else if (bc.type !== ac.type) {
        result.columnsRetyped.push({
          table,
          column,
          from: bc.type,
          to: ac.type,
        });
      }

      if (acceptsOmission(bc) && !acceptsOmission(ac)) {
        result.columnsNowRequired.push({
          table,
          column,
          shape: !bc
            ? "added as required with no default"
            : bc.notNull
              ? "lost its default while still NOT NULL"
              : "became NOT NULL with no default",
        });
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
export function classify(delta) {
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
  for (const { table, column, shape } of delta.columnsNowRequired) {
    breaking.push(
      `\`${table}.${column}\` ${shape} — an insert omitting it now fails`,
    );
  }
  for (const { table, check } of delta.checksAdded) {
    warnings.push(`\`${table}\` gained ${check}`);
  }
  return { breaking, warnings };
}
