/**
 * V2.9 INS-01 — the ONE windowed read over the Activity stream (DEBT-238).
 *
 * Until V2.9 the kernel's Activity contract had no time-window read at all, so
 * every surface that needed one wrote its own `occurred_at` predicate. This
 * module is the convergence: one function, one predicate, two callers — the
 * kernel's `ActivityRepository.countByTypeInBuckets` and the Review's
 * `ReviewInsightRepository.countPeriodCompletions`, which had been asking
 * exactly this question in its own SQL since REVIEW-03.
 *
 * ── Why the boundaries travel as JSON ───────────────────────────────────────
 * The two obvious shapes both break at V2.9's window lengths. A `SUM(CASE …)`
 * column per bucket and a `CASE WHEN … THEN index` arm per bucket each bind TWO
 * parameters per bucket, and D1 refuses a statement with more than 100 bound
 * variables — so both stop at about 48 buckets, while a grain maximum here is
 * 52 weeks or 366 days. Passing the boundaries as ONE bound JSON parameter and
 * expanding them with `json_each` (SQLite's JSON1 extension, which D1 provides
 * and this repository already relies on for `json_extract`) makes the
 * statement's shape independent of the window: four bound parameters for one
 * bucket or for 366.
 *
 * ── What it counts, and why that is the honest answer ───────────────────────
 * DISTINCT PRIMARY-SUBJECT ENTITIES per (bucket, event type). Two decisions are
 * load-bearing:
 *
 *   - **Distinct entities, not event rows** — one Project completed, reopened
 *     and completed again inside one bucket is one Project completed. That is
 *     ADR-079 decision 2's semantics, which `countPeriodCompletions` has had
 *     since REVIEW-03 and this read preserves rather than re-deciding.
 *   - **The primary subject only** — the role a mutation writes its own entity
 *     under. An event that named both a Project and its Area would otherwise
 *     count two. `countPeriodCompletions` defended that with a table of
 *     event-type-to-entity-type pairs (`COMPLETION_TYPE_MATCH`); the role
 *     filter says the same thing generically, without the kernel's Activity
 *     contract having to know which entity kind each event type belongs to.
 *
 * ── What it deliberately does NOT filter ────────────────────────────────────
 * Liveness. A completed Task that is later deleted stays counted, because
 * deleting a record must not silently move a CLOSED period's figures — the
 * finding HARDEN-06C recorded as F-07 and the reason a Review's trend is
 * immutable. `listPeriodContributions` keeps its liveness predicate for the
 * opposite reason: it groups completions by living ancestry, which a deleted
 * record does not have. The two answer different questions, and this comment is
 * the one place that says so.
 */

/** The role a mutation writes its own entity under — "what this event is about". */
export const PRIMARY_SUBJECT_ROLE = "subject";

/** The most buckets one windowed read will count over — the largest `GRAIN_MAXIMUMS`. */
export const MAX_HISTORY_BUCKETS = 366;

/** One bucket to count inside: the caller's key and a half-open instant range. */
export interface HistoryWindowBucket {
  readonly key: string;
  /** Inclusive lower bound, as a storage timestamp. */
  readonly startAt: string;
  /** Exclusive upper bound, as a storage timestamp. */
  readonly endAt: string;
}

/** `counts[bucketIndex][eventType]`, every requested pair present. */
export type BucketTypeCounts = readonly Readonly<Record<string, number>>[];

/**
 * Count distinct primary-subject entities per (bucket, type) in ONE statement.
 *
 * Returns one record per bucket, in the order the buckets were given, each
 * carrying every requested type — with zero where nothing happened, because an
 * absent bucket is indistinguishable from a quiet one.
 *
 * The caller is responsible for mapping D1 failures to its own storage error:
 * this module is shared by two repositories whose error types differ, and
 * swallowing that distinction here would make a Review failure indistinguishable
 * from an Activity one.
 */
export async function countPrimarySubjectsByTypeInBuckets(
  db: D1Database,
  workspaceId: string,
  types: readonly string[],
  buckets: readonly HistoryWindowBucket[],
): Promise<BucketTypeCounts> {
  const zeroed = () => Object.fromEntries(types.map((type) => [type, 0]));
  if (buckets.length === 0 || types.length === 0) {
    return buckets.map(() => zeroed());
  }

  // Only the bucket INDEX is generated into the JSON, and it is an integer this
  // function produced; every instant and every type is bound.
  const boundaries = JSON.stringify(
    buckets.map((bucket, index) => [index, bucket.startAt, bucket.endAt]),
  );
  // The outer range, so the scan is one index range over
  // `(workspace_id, type, occurred_at, id)` rather than the workspace's whole
  // history. Derived rather than assumed, because the buckets a caller asks
  // about need not be contiguous.
  const overallStart = buckets
    .map((bucket) => bucket.startAt)
    .reduce((earliest, value) => (value < earliest ? value : earliest));
  const overallEnd = buckets
    .map((bucket) => bucket.endAt)
    .reduce((latest, value) => (value > latest ? value : latest));
  const typeMarks = types.map(() => "?").join(", ");

  const { results } = await db
    .prepare(
      `WITH b AS (
         SELECT CAST(json_extract(value, '$[0]') AS INTEGER) AS idx,
                json_extract(value, '$[1]') AS start_at,
                json_extract(value, '$[2]') AS end_at
         FROM json_each(?)
       ),
       windowed AS (
         SELECT DISTINCT b.idx AS idx, a.type AS type, s.entity_id AS entity_id
         FROM activities a
         JOIN activity_subjects s
           ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
              AND s.role = '${PRIMARY_SUBJECT_ROLE}'
         JOIN b
           ON a.occurred_at >= b.start_at AND a.occurred_at < b.end_at
         WHERE a.workspace_id = ?
           AND a.type IN (${typeMarks})
           AND a.occurred_at >= ? AND a.occurred_at < ?
       )
       SELECT idx, type, COUNT(*) AS n
       FROM windowed
       GROUP BY idx, type`,
    )
    .bind(boundaries, workspaceId, ...types, overallStart, overallEnd)
    .all<{ idx: number; type: string; n: number }>();

  const byBucket = new Map<number, Record<string, number>>();
  for (const row of results) {
    const counts = byBucket.get(Number(row.idx)) ?? {};
    counts[row.type] = Number(row.n);
    byBucket.set(Number(row.idx), counts);
  }
  return buckets.map((_bucket, index) => {
    const counted = byBucket.get(index) ?? {};
    return Object.fromEntries(
      types.map((type) => [type, counted[type] ?? 0]),
    ) as Readonly<Record<string, number>>;
  });
}
