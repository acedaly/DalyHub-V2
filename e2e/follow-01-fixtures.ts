/**
 * FOLLOW-01 — the week whose history is KNOWN.
 *
 * V2.4's acceptance boundary says a numerical claim about the owner's history is
 * proven against a fixture whose events are known, not against whatever the
 * workspace happens to hold. So this writes a complete week of Task plan
 * history — the Activity the product's own planning paths write, byte for byte
 * in shape — and every figure the journey asserts is a figure this file put
 * there.
 *
 * ── The week is LAST week, and that is load-bearing ─────────────────────────
 * The same reasoning `seed-review-insights.sql` records: E2E partitions run
 * whole spec files back to back against one shared local D1, and several of them
 * complete real Tasks through the real product. Every one of those completions
 * is stamped NOW. A period that is still running would collect them; a CLOSED
 * one cannot, because nothing else in the suite can plan or complete a Task in
 * the past. So the account this fixture asserts is exactly the account it seeded.
 *
 * ── It owns its isolation, explicitly ───────────────────────────────────────
 * PR #227 measured 217 leaked active entities in one complete local run and
 * named fixture leakage as a real development-environment problem. Everything
 * here is prefixed `fw-`, and {@link cleanupFollowFixture} removes every row it
 * writes — dependents first, because every foreign key is ON DELETE RESTRICT.
 * It is idempotent at both ends: seeding twice repairs, cleaning twice is a
 * no-op.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";

/** Every id this fixture owns, so cleanup is a list rather than a pattern. */
const TASK_IDS = [
  "fw-held",
  "fw-late",
  "fw-moved-twice",
  "fw-cleared",
  "fw-unfinished",
  "fw-moved-in",
  "fw-moved-out",
  "fw-unplanned",
  "fw-after",
] as const;

const REVIEW_ID = "fw-review";
const HABIT_ID = "fw-habit";

/** The owner's calendar day — the only "today" the product has (ADR-022). */
function ownerTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(new Date());
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The Monday of the owner's calendar week (`firstDayOfWeek` defaults to Monday). */
function weekStart(iso: string): string {
  const day = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  return addDays(iso, -((((day + 3) % 7) + 7) % 7));
}

export interface FollowFixture {
  readonly todayIso: string;
  /** Monday of LAST week — the period every assertion is about. */
  readonly weekStart: string;
  readonly weekEnd: string;
  /** Day N of the accounted week, zero-based. `day(0)` is its Monday. */
  readonly day: (index: number) => string;
  readonly reviewId: string;
  readonly taskIds: readonly string[];
}

export function followFixture(): FollowFixture {
  const todayIso = ownerTodayIso();
  const start = addDays(weekStart(todayIso), -7);
  return {
    todayIso,
    weekStart: start,
    weekEnd: addDays(start, 6),
    day: (index: number) => addDays(start, index),
    reviewId: REVIEW_ID,
    taskIds: TASK_IDS,
  };
}

/**
 * The instant at `hour` OWNER-LOCAL on a day of the accounted week.
 *
 * Sydney is ahead of UTC all year, so 12:00 local is the same calendar day in
 * UTC minus ten or eleven hours — which is why every instant below is written as
 * 01:00Z or later rather than as midnight. A fixture whose events sat at 00:00Z
 * would land on the previous owner-local day for half the year.
 */
function at(dayIso: string, hour: number): string {
  return `${dayIso}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

/** Write the fixture. Idempotent: `INSERT OR IGNORE` then `UPDATE` to exact values. */
export function seedFollowFixture(fixture: FollowFixture): void {
  const day = fixture.day;
  const stamp = "2026-07-19T02:00:00.000Z";
  const sql: string[] = [];
  let sequence = 0;

  const task = (
    id: string,
    title: string,
    scheduled: string | null,
    completedAt: string | null,
  ) => {
    sql.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, 'task', ${sqlLiteral(title)}, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'task', NULL);`,
      // Every fixture Task belongs to the seeded DalyHub Area, so none lands in
      // the Inbox band and the planning queue's own bands stay predictable.
      `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(`l-${id}-area`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'a-dh', 'task.belongs_to_area', ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'task', 'todo', ${sqlLiteral(stamp)});`,
      `UPDATE entities SET deleted_at = NULL, title = ${sqlLiteral(title)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
      `UPDATE spine_records SET completed_at = ${completedAt === null ? "NULL" : sqlLiteral(completedAt)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
      `UPDATE task_details SET status = 'todo', priority = 'p3', due_date = NULL,
          scheduled_date = ${scheduled === null ? "NULL" : sqlLiteral(scheduled)},
          time_sector = NULL, commitment_state = 'active',
          waiting_since = NULL, waiting_note = NULL, updated_at = ${sqlLiteral(stamp)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const event = (
    taskId: string,
    type: string,
    occurredAt: string,
    payload: Record<string, unknown>,
  ) => {
    const id = `fw-a-${String(sequence++).padStart(3, "0")}`;
    sql.push(
      `INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(type)}, 'system', NULL, ${sqlLiteral(occurredAt)}, ${sqlLiteral(JSON.stringify(payload))});`,
      `INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, ${sqlLiteral(taskId)}, 'subject');`,
    );
  };

  /** Planned before the week began — the ordinary case. */
  const plannedAhead = (taskId: string, to: string, minute: number) =>
    event(
      taskId,
      "task.planned",
      `${addDays(fixture.weekStart, -3)}T01:${String(minute).padStart(2, "0")}:00.000Z`,
      {
        entityType: "task",
        scheduledDate: to,
      },
    );

  /* 1. Held its day. */
  task("fw-held", "FW: held its day", day(0), at(day(0), 6));
  plannedAhead("fw-held", day(0), 0);
  event("fw-held", "task.completed", at(day(0), 6), {
    completedAt: at(day(0), 6),
  });

  /* 2. Done later than planned, inside the same week. */
  task("fw-late", "FW: done later than planned", day(0), at(day(3), 6));
  plannedAhead("fw-late", day(0), 1);
  event("fw-late", "task.completed", at(day(3), 6), {
    completedAt: at(day(3), 6),
  });

  /* 3. Moved twice, never completed — the count is the point. */
  task("fw-moved-twice", "FW: moved twice", day(4), null);
  plannedAhead("fw-moved-twice", day(0), 2);
  event("fw-moved-twice", "task.rescheduled", at(day(0), 8), {
    entityType: "task",
    scheduledDate: day(2),
    previous: day(0),
  });
  event("fw-moved-twice", "task.rescheduled", at(day(2), 8), {
    entityType: "task",
    scheduledDate: day(4),
    previous: day(2),
  });

  /* 4. Taken off the plan mid-week. */
  task("fw-cleared", "FW: taken off the plan", null, null);
  plannedAhead("fw-cleared", day(1), 3);
  event("fw-cleared", "task.plan_cleared", at(day(2), 3), {
    entityType: "task",
    previous: day(1),
  });

  /* 5. Planned, and still open when the week closed. */
  task("fw-unfinished", "FW: left unfinished", day(2), null);
  plannedAhead("fw-unfinished", day(2), 4);

  /* 6. Moved INTO the week from an earlier one. */
  task("fw-moved-in", "FW: moved into the week", day(3), null);
  event(
    "fw-moved-in",
    "task.planned",
    `${addDays(fixture.weekStart, -20)}T01:00:00.000Z`,
    {
      entityType: "task",
      scheduledDate: addDays(fixture.weekStart, -14),
    },
  );
  event("fw-moved-in", "task.rescheduled", at(day(1), 4), {
    entityType: "task",
    scheduledDate: day(3),
    previous: addDays(fixture.weekStart, -14),
  });

  /* 7. Moved OUT of the week during it. */
  task(
    "fw-moved-out",
    "FW: moved out of the week",
    addDays(fixture.weekStart, 10),
    null,
  );
  plannedAhead("fw-moved-out", day(3), 5);
  event("fw-moved-out", "task.rescheduled", at(day(2), 5), {
    entityType: "task",
    scheduledDate: addDays(fixture.weekStart, 10),
    previous: day(3),
  });

  /* 8. Completed inside the week with no plan for it. */
  task("fw-unplanned", "FW: done without a plan", null, at(day(2), 7));
  event("fw-unplanned", "task.completed", at(day(2), 7), {
    completedAt: at(day(2), 7),
  });

  /*
   * 9. Withdrawn AFTER the week closed — the case that vanished entirely before
   *    FOLLOW-01, because its current plan is outside the week and it has no
   *    event inside it.
   */
  task(
    "fw-after",
    "FW: withdrawn after the week",
    addDays(fixture.weekStart, 12),
    null,
  );
  plannedAhead("fw-after", day(4), 6);
  event(
    "fw-after",
    "task.rescheduled",
    `${addDays(fixture.weekStart, 8)}T01:00:00.000Z`,
    {
      entityType: "task",
      scheduledDate: addDays(fixture.weekStart, 12),
      previous: day(4),
    },
  );

  /* A weekly Review over the SAME period, so both consumers can be compared. */
  sql.push(
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${sqlLiteral(REVIEW_ID)}, ${sqlLiteral(WORKSPACE)}, 'review', 'FW: the week we had', ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(REVIEW_ID)}, 'review', NULL);`,
    `INSERT OR IGNORE INTO review_details
       (workspace_id, entity_id, entity_type, review_type, status, template_id, period_start, period_end, updated_at)
     VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(REVIEW_ID)}, 'review', 'weekly', 'in_progress', 'weekly',
             ${sqlLiteral(fixture.weekStart)}, ${sqlLiteral(fixture.weekEnd)}, ${sqlLiteral(stamp)});`,
    `UPDATE review_details SET period_start = ${sqlLiteral(fixture.weekStart)},
        period_end = ${sqlLiteral(fixture.weekEnd)}, review_type = 'weekly', status = 'in_progress'
      WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(REVIEW_ID)};`,
  );

  /*
   * ONE routine, scheduled Monday / Wednesday / Friday and checked in on two of
   * the three — DEBT-156's figure, with a denominator this file chose. Its
   * schedule is effective from long before the week, so the expectation is the
   * historical one rather than a version that started inside the period.
   */
  sql.push(
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${sqlLiteral(HABIT_ID)}, ${sqlLiteral(WORKSPACE)}, 'habit', 'FW: morning walk', ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
    `INSERT OR IGNORE INTO habit_details (workspace_id, entity_id, entity_type, notes, archived_at, archived_on, created_at, updated_at)
     VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(HABIT_ID)}, 'habit', NULL, NULL, NULL, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)});`,
    `INSERT OR IGNORE INTO habit_schedules (id, workspace_id, habit_id, kind, weekdays, target_count, effective_from, effective_to, created_at)
     VALUES (${sqlLiteral(`${HABIT_ID}-v1`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(HABIT_ID)}, 'weekdays', '1,3,5', NULL,
             ${sqlLiteral(addDays(fixture.weekStart, -60))}, NULL, ${sqlLiteral(stamp)});`,
    `UPDATE habit_details SET archived_at = NULL, archived_on = NULL
      WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(HABIT_ID)};`,
  );
  for (const index of [0, 2]) {
    sql.push(
      `INSERT OR IGNORE INTO habit_completions (workspace_id, habit_id, completed_on, recorded_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(HABIT_ID)}, ${sqlLiteral(day(index))}, ${sqlLiteral(at(day(index), 6))});`,
    );
  }

  d1Execute(sql);
}

/**
 * Remove everything this fixture wrote. Dependents first: every foreign key in
 * the schema is ON DELETE RESTRICT, so history has to go before the records it
 * points at, and a `habit_details` row cannot leave before its completions and
 * its schedule chain.
 */
export function cleanupFollowFixture(): void {
  const ws = sqlLiteral(WORKSPACE);
  const taskIds = TASK_IDS.map((id) => sqlLiteral(id)).join(", ");
  const allIds = [...TASK_IDS, REVIEW_ID, HABIT_ID]
    .map((id) => sqlLiteral(id))
    .join(", ");
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${allIds});`,
    `DELETE FROM activities WHERE workspace_id = ${ws}
       AND NOT EXISTS (SELECT 1 FROM activity_subjects s
                       WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws}
       AND (source_entity_id IN (${allIds}) OR target_entity_id IN (${allIds}));`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${taskIds});`,
    `DELETE FROM review_sections WHERE workspace_id = ${ws} AND review_id = ${sqlLiteral(REVIEW_ID)};`,
    `DELETE FROM review_insight_snapshots WHERE workspace_id = ${ws} AND review_id = ${sqlLiteral(REVIEW_ID)};`,
    `DELETE FROM review_details WHERE workspace_id = ${ws} AND entity_id = ${sqlLiteral(REVIEW_ID)};`,
    `DELETE FROM habit_completions WHERE workspace_id = ${ws} AND habit_id = ${sqlLiteral(HABIT_ID)};`,
    `DELETE FROM habit_schedules WHERE workspace_id = ${ws} AND habit_id = ${sqlLiteral(HABIT_ID)};`,
    `DELETE FROM habit_details WHERE workspace_id = ${ws} AND entity_id = ${sqlLiteral(HABIT_ID)};`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${allIds});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id IN (${allIds});`,
  ]);
}
