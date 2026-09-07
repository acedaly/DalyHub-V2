/**
 * PERF-01 — the navigation latency instrument.
 *
 * `countingDb` (in `support.ts`) answers *how many statements* a read costs, and
 * every statement budget in this suite is written against it. That number is
 * necessary and it is not sufficient: **twenty statements issued in three
 * concurrent waves and twenty issued one after another cost the same budget and
 * feel completely different**, because the second shape pays a D1 round trip
 * twenty times over. Today's loader is the case in point — it costs the same
 * statements whether its two per-page aggregates run together or in sequence.
 *
 * So this file adds the missing axis: **round-trip DEPTH**. It wraps a
 * `D1Database` and records, for every execution, the interval it occupied, then
 * assigns each execution a wave:
 *
 *     wave(x) = 1 + max({ wave(y) : y finished before x started })
 *
 * `depth` is the highest wave — the longest chain of statements that had to wait
 * for one another, which is exactly the number of serial round trips the loader
 * spends. It is derived from the ORDER of async events, not from the clock: two
 * statements issued in one `Promise.all` overlap and land in the same wave on any
 * machine, and a statement awaited before the next is issued cannot. A
 * re-introduced waterfall moves the number; a slow machine does not.
 *
 * It is deliberately test-only. Nothing here is imported by application code, so
 * a deployed Worker carries none of it and no production log is written.
 */

/** One recorded execution against the instrumented database. */
export interface RecordedStatement {
  /** The SQL text as prepared (a batch records its first statement's text). */
  readonly sql: string;
  /** How many statements the execution carried (>1 only for `batch`). */
  readonly statements: number;
  /** The round-trip wave this execution belongs to; 1 is the first. */
  readonly wave: number;
  /** Whether the execution went through `D1Database.batch()`. */
  readonly batched: boolean;
  /** The values bound to the statement, so its plan can be explained as issued. */
  readonly bindings: readonly unknown[];
}

export interface StatementProfile {
  /** The instrumented database to hand to `bindWorkspaceRepositories`. */
  readonly db: D1Database;
  /** Every `prepare()` call, matching `countingDb`'s definition of a statement. */
  prepared: () => number;
  /** Every execution (`all`/`first`/`run`/`raw`/`batch`). */
  executions: () => number;
  /** The longest chain of executions that had to wait for one another. */
  depth: () => number;
  /** The recorded executions, in issue order. */
  records: () => readonly RecordedStatement[];
  /** The SQL of every execution, in issue order — for query-plan collection. */
  sql: () => readonly string[];
  /** Forget everything recorded so far. */
  reset: () => void;
}

/** An execution in flight or finished, in the instrument's own event clock. */
interface Interval {
  readonly startedAt: number;
  finishedAt: number;
  wave: number;
}

/**
 * Wrap a `D1Database` so every statement it prepares and every execution it runs
 * is recorded. The returned `db` is a drop-in for the real binding.
 */
export function profileDb(db: D1Database): StatementProfile {
  let prepared = 0;
  let tick = 0;
  const intervals: Interval[] = [];
  const records: RecordedStatement[] = [];
  /** Map a wrapped statement back to the real one, so `batch` can unwrap. */
  const unwrap = new WeakMap<D1PreparedStatement, D1PreparedStatement>();

  const begin = (): Interval => {
    const interval: Interval = {
      startedAt: (tick += 1),
      finishedAt: -1,
      wave: 1,
    };
    // The wave is fixed at ISSUE time from what has already finished, so it never
    // depends on how long anything takes — only on what was awaited before it.
    for (const other of intervals) {
      if (other.finishedAt !== -1 && other.finishedAt < interval.startedAt) {
        interval.wave = Math.max(interval.wave, other.wave + 1);
      }
    }
    intervals.push(interval);
    return interval;
  };

  const end = (interval: Interval): void => {
    interval.finishedAt = tick += 1;
  };

  const record = (
    sql: string,
    statements: number,
    batched: boolean,
    wave: number,
    bindings: readonly unknown[],
  ) => {
    records.push({ sql, statements, wave, batched, bindings });
  };

  const wrapStatement = (
    statement: D1PreparedStatement,
    sql: string,
    bindings: readonly unknown[],
  ): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, prop, receiver) {
        if (prop === "bind") {
          return (...args: unknown[]) =>
            wrapStatement(
              (target.bind as (...a: unknown[]) => D1PreparedStatement)(
                ...args,
              ),
              sql,
              args,
            );
        }
        if (
          prop === "all" ||
          prop === "first" ||
          prop === "run" ||
          prop === "raw"
        ) {
          return async (...args: unknown[]) => {
            const interval = begin();
            try {
              return await (
                target[prop] as (...a: unknown[]) => Promise<unknown>
              )(...args);
            } finally {
              end(interval);
              record(sql, 1, false, interval.wave, bindings);
            }
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1PreparedStatement;
    unwrap.set(proxy, statement);
    return proxy;
  };

  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (query: string) => {
          prepared += 1;
          return wrapStatement(target.prepare(query), query, []);
        };
      }
      if (prop === "batch") {
        return async (statements: readonly D1PreparedStatement[]) => {
          const real = statements.map((one) => unwrap.get(one) ?? one);
          const interval = begin();
          try {
            return await target.batch(real as D1PreparedStatement[]);
          } finally {
            end(interval);
            record("<batch>", statements.length, true, interval.wave, []);
          }
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;

  return {
    db: proxy,
    prepared: () => prepared,
    executions: () => records.length,
    depth: () => records.reduce((max, one) => Math.max(max, one.wave), 0),
    records: () => records,
    sql: () => records.map((one) => one.sql),
    reset: () => {
      prepared = 0;
      tick = 0;
      intervals.length = 0;
      records.length = 0;
    },
  };
}

/**
 * The query plan D1 reports for one statement, flattened to the lines
 * `EXPLAIN QUERY PLAN` prints.
 *
 * A plan is a string per step, and what a reader needs from it is whether the
 * step SCANS a table, whether it builds a temporary B-tree to sort, and which
 * index it chose. Those three questions are answered by `planFindings` below so
 * no test has to parse SQLite's prose twice.
 */
export interface QueryPlan {
  readonly sql: string;
  readonly lines: readonly string[];
}

/** Run `EXPLAIN QUERY PLAN` for a statement, with its bindings applied. */
export async function explainQueryPlan(
  db: D1Database,
  sql: string,
  bindings: readonly unknown[] = [],
): Promise<QueryPlan> {
  const rows = await db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ readonly detail: string }>();
  return { sql, lines: (rows.results ?? []).map((row) => row.detail) };
}

/** What a reader actually asks a plan. */
export interface PlanFindings {
  /**
   * A full scan of a real BASE TABLE with no index.
   *
   * This is the finding an index can fix, and it is deliberately narrower than
   * "the plan contains the word SCAN". SQLite prints `SCAN <name>` for a
   * materialised CTE and for a co-routine subquery too — Today's hot reads are
   * full of them, because the product composes its projections out of named CTEs
   * — and adding an index for one of those is impossible, never mind useless.
   * So a scan counts only when the scanned name is a table in the schema.
   */
  readonly scansTable: boolean;
  /** The base tables the plan scans without an index. */
  readonly scannedTables: readonly string[];
  /** A `USE TEMP B-TREE` step — SQLite sorting or grouping in memory. */
  readonly tempBTree: boolean;
  /** Every index the plan names, in the order it names them. */
  readonly indexes: readonly string[];
}

const SCAN = /^SCAN ([A-Za-z0-9_]+)/;
const TEMP_BTREE = /USE TEMP B-TREE/;
const INDEX = /USING (?:COVERING )?INDEX ([A-Za-z0-9_]+)/;

/**
 * Every `FROM x y` / `JOIN x AS y` pair in a statement.
 *
 * This exists because `EXPLAIN QUERY PLAN` names the ALIAS, not the table: a
 * scan of `FROM entities e` prints as `SCAN e`, and a check that matched only
 * schema table names looks straight past it. That is not hypothetical — it is
 * exactly what the first falsification of this check found. Dropping every index
 * on `entities` and re-running produced a plan full of `SCAN e` lines, and the
 * check reported nothing.
 *
 * The regex is deliberately loose about what an alias looks like and strict
 * about what cannot be one: a following SQL keyword means the table was not
 * aliased. It is a test-only heuristic over SQL this repository wrote, not a SQL
 * parser.
 */
const FROM_OR_JOIN =
  /\b(?:FROM|JOIN)\s+([A-Za-z0-9_]+)(?:\s+(?:AS\s+)?([A-Za-z0-9_]+))?/gi;
const NOT_AN_ALIAS = new Set([
  "on",
  "where",
  "group",
  "order",
  "limit",
  "left",
  "inner",
  "outer",
  "cross",
  "join",
  "using",
  "having",
  "window",
  "union",
  "and",
  "or",
  "as",
  "select",
]);

/**
 * The names in this statement's plan that would mean a BASE TABLE — the schema
 * tables it names, plus the aliases it binds them to.
 */
function baseTableNames(
  sql: string,
  tables: ReadonlySet<string>,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of sql.matchAll(FROM_OR_JOIN)) {
    const table = match[1];
    if (table === undefined || !tables.has(table)) continue;
    names.add(table);
    const alias = match[2];
    if (alias !== undefined && !NOT_AN_ALIAS.has(alias.toLowerCase())) {
      names.add(alias);
    }
  }
  return names;
}

/**
 * Read the schema's table names, so a plan step can be classified.
 * Memoised per database: the schema does not change inside a test file.
 */
const TABLE_NAMES = new WeakMap<D1Database, Promise<ReadonlySet<string>>>();

export function schemaTableNames(db: D1Database): Promise<ReadonlySet<string>> {
  const existing = TABLE_NAMES.get(db);
  if (existing !== undefined) return existing;
  const read = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all<{ readonly name: string }>()
    .then(
      (rows) =>
        new Set(
          (rows.results ?? []).map((row) => row.name),
        ) as ReadonlySet<string>,
    );
  TABLE_NAMES.set(db, read);
  return read;
}

export function planFindings(
  plan: QueryPlan,
  tables: ReadonlySet<string> = new Set(),
): PlanFindings {
  const indexes: string[] = [];
  const scannedTables: string[] = [];
  let tempBTree = false;
  // The names that would mean a base table in THIS statement's plan — the tables
  // it names and the aliases it binds them to. See `baseTableNames`.
  const scannable = baseTableNames(plan.sql, tables);
  for (const line of plan.lines) {
    const trimmed = line.trim();
    const scan = SCAN.exec(trimmed);
    if (
      scan?.[1] !== undefined &&
      !INDEX.test(trimmed) &&
      scannable.has(scan[1])
    ) {
      scannedTables.push(scan[1]);
    }
    if (TEMP_BTREE.test(trimmed)) tempBTree = true;
    const match = INDEX.exec(trimmed);
    if (match?.[1] !== undefined) indexes.push(match[1]);
  }
  return {
    scansTable: scannedTables.length > 0,
    scannedTables,
    tempBTree,
    indexes,
  };
}
