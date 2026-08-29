/**
 * FIND-01 — the recency read, in D1.
 *
 * Read-only, and it OWNS NO STORAGE: no table behind this file, no column, no
 * index and no migration. Everything it reads already existed — the append-only
 * Activity stream (ADR-005/ADR-012) and the `entities` substrate (ADR-009) —
 * which is the whole of [ADR-112] decision 5: recency is DERIVED.
 *
 * ── ONE statement, and why it is bounded in ROWS and not only in statements ──
 * The obvious query — group every `activity_subjects` row by entity and take
 * each one's `MAX(occurred_at)` — is one statement and is NOT flat: its cost
 * grows with every event the workspace has ever recorded, so opening Search
 * would get slower the longer the owner used DalyHub. Search's whole promise is
 * the opposite (AGENTS.md §16).
 *
 * So the statement bounds the SCAN first and aggregates second:
 *
 *   1. `recent_events` walks `activities_workspace_occurred_idx` — already
 *      `(workspace_id, occurred_at, id)`, and SQLite walks an index backwards —
 *      newest first, and stops after `scanLimit` rows;
 *   2. the join to `activity_subjects` expands those events to the records they
 *      concern, using the composite primary key's `(workspace_id, activity_id)`
 *      prefix;
 *   3. the join to `entities` supplies the title and type, filters soft-deleted
 *      records and filters the excluded types;
 *   4. `GROUP BY` reduces to one row per record at its newest event, and the
 *      `ORDER BY … LIMIT` applies the rule.
 *
 * The work is therefore proportional to `scanLimit`, never to workspace size.
 *
 * ── The parameter count is FIXED ────────────────────────────────────────────
 * D1 accepts at most **100 bound parameters per query**, a ceiling TASKS-13 and
 * UX-02 both found the expensive way. This statement binds the workspace id
 * three times, the scan limit, the row limit, and one parameter per excluded
 * type — SIX today, and constant with respect to the number of records, events
 * or types the workspace holds. Nothing here binds a list of ids.
 *
 * ── `MAX`, never `COUNT` ────────────────────────────────────────────────────
 * The aggregate is deliberately a maximum. A `COUNT` here — or a `COUNT` used
 * as a tie-break, or added to the `ORDER BY` — would turn recency into
 * frequency weighting, which ADR-112 decision 5 forbids outright. There is no
 * arithmetic in the ordering at all: three columns, all descending, and the
 * second and third are consulted only to break an exact tie in the first.
 */

import { validateEntityType } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";
import {
  RECENCY_EXCLUDED_TYPES,
  RECENT_ACTIVITY_SCAN_LIMIT,
  RECENT_RECORD_LIMIT,
  type RecentRecord,
  type RecentRecordsRepository,
} from "~/kernel/recent-records";

type RecentRow = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly created_at: string;
  readonly last_worked_at: string;
};

function clampLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  if (floored <= 0) return 0;
  return Math.min(floored, fallback);
}

export class D1RecentRecordsRepository implements RecentRecordsRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async listRecentlyWorkedOn(
    options: { readonly limit?: number; readonly scanLimit?: number } = {},
  ): Promise<readonly RecentRecord[]> {
    const limit = clampLimit(options.limit, RECENT_RECORD_LIMIT);
    const scanLimit = clampLimit(options.scanLimit, RECENT_ACTIVITY_SCAN_LIMIT);
    if (limit === 0 || scanLimit === 0) {
      return [];
    }

    const excluded = [...RECENCY_EXCLUDED_TYPES];
    // Built from a CONSTANT set, never from a caller's input: the placeholders
    // are generated, the values are bound.
    const excludedPlaceholders = excluded.map(() => "?").join(", ");
    const excludeClause =
      excluded.length > 0 ? `AND e.type NOT IN (${excludedPlaceholders})` : "";

    const { results } = await this.#db
      .prepare(
        `WITH recent_events AS (
           SELECT a.id AS activity_id, a.occurred_at AS occurred_at
           FROM activities a
           WHERE a.workspace_id = ?
           ORDER BY a.occurred_at DESC, a.id DESC
           LIMIT ?
         )
         SELECT e.id AS id,
                e.type AS type,
                e.title AS title,
                e.created_at AS created_at,
                MAX(re.occurred_at) AS last_worked_at
         FROM recent_events re
         JOIN activity_subjects s
           ON s.workspace_id = ? AND s.activity_id = re.activity_id
         JOIN entities e
           ON e.workspace_id = ? AND e.id = s.entity_id
              AND e.deleted_at IS NULL
              ${excludeClause}
         GROUP BY e.id
         ORDER BY last_worked_at DESC, e.created_at DESC, e.id DESC
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        scanLimit,
        this.#workspaceId,
        this.#workspaceId,
        ...excluded,
        limit,
      )
      .all<RecentRow>();

    const records: RecentRecord[] = [];
    for (const row of results ?? []) {
      // A type the kernel does not recognise is skipped rather than rendered:
      // an unopenable row in a list whose entire purpose is opening things is
      // worse than a shorter list.
      let type;
      try {
        type = validateEntityType(row.type);
      } catch {
        continue;
      }
      records.push({
        id: row.id,
        type,
        title: row.title,
        createdAt: row.created_at,
        lastWorkedAt: row.last_worked_at,
      });
    }
    return records;
  }
}
