/**
 * FOLLOW-02 — the Goals whose movement is KNOWN.
 *
 * V2.4's acceptance boundary says a claim about the owner's history is proven
 * against a fixture whose events are known, not against whatever the workspace
 * happens to hold. So this writes the exact Activity the product's own paths
 * write — `task.completed`, `project.completed`, `goal.measurement_logged`,
 * `entity.updated` — and every figure the journey asserts is a figure this file
 * put there.
 *
 * ── The window is THIS week, and that is load-bearing ───────────────────────
 * FOLLOW-01's account is about a CLOSED week for a good reason: the suite
 * completes real Tasks through the real product and every one of those is
 * stamped NOW, so a running period would collect them. FOLLOW-02 is the
 * opposite case and the same reasoning gives the opposite answer — the product
 * states movement for the owner's CURRENT week, so the fixture must seed inside
 * it. What protects the assertions instead is ISOLATION: every Goal, Project
 * and Task here is owned by this file, nothing else in the suite links to them,
 * and the counts are read per-Goal rather than workspace-wide. Another spec
 * completing its own Task cannot reach a Goal it does not contribute to — which
 * is, in fact, one of the things this fixture exists to prove.
 *
 * ── It owns its isolation, explicitly ───────────────────────────────────────
 * [DEBT-173]. Everything here is prefixed `fm-`, and {@link cleanupMovementFixture}
 * removes every row it writes — dependents first, because every foreign key is
 * ON DELETE RESTRICT. Idempotent at both ends: seeding twice repairs, cleaning
 * twice is a no-op.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";

/** The seeded Area every fixture record hangs from. */
const AREA_ID = "a-dh";

/** Every Goal this fixture owns. */
export const MOVEMENT_GOAL_IDS = [
  /** 1. Unmeasured, one contributing Project, a Task completed this week. */
  "fm-goal-moving",
  /** 2. Unmeasured, one contributing Project, its only completion LAST week. */
  "fm-goal-still",
  /** 3. Measurable, a reading recorded this week and no Project movement. */
  "fm-goal-measured",
  /** 4. Measurable, no reading this week, but a contributing Project moved. */
  "fm-goal-measured-project",
  /** 5. Unmeasured, THREE contributing Projects, only two of which moved. */
  "fm-goal-partial",
  /** 6. Unmeasured, a contributing Project whose only event is a RENAME. */
  "fm-goal-metadata",
] as const;

const PROJECT_IDS = [
  "fm-proj-moving",
  "fm-proj-still",
  "fm-proj-measured",
  "fm-proj-partial-a",
  "fm-proj-partial-b",
  "fm-proj-partial-c",
  "fm-proj-books",
  "fm-proj-filing",
  "fm-proj-metadata",
  /** Advances NO Goal. Its completed Task must never reach one. */
  "fm-proj-unrelated",
] as const;

const TASK_IDS = [
  "fm-task-moving",
  "fm-task-still",
  "fm-task-measured",
  "fm-task-partial-a",
  "fm-task-partial-b",
  "fm-task-partial-c",
  "fm-task-metadata",
  "fm-task-unrelated",
  /** Under a contributing Project, completed the day BEFORE the week began. */
  "fm-task-just-outside",
] as const;

export interface MovementFixture {
  readonly todayIso: string;
  /** The first day of the owner's current calendar week (Monday by default). */
  readonly weekStart: string;
  readonly weekEnd: string;
  /** Day N of the current week, zero-based. */
  readonly day: (index: number) => string;
  readonly goalIds: readonly string[];
}

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
function weekStartOf(iso: string): string {
  const day = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  return addDays(iso, -((((day + 3) % 7) + 7) % 7));
}

export function movementFixture(): MovementFixture {
  const todayIso = ownerTodayIso();
  const start = weekStartOf(todayIso);
  return {
    todayIso,
    weekStart: start,
    weekEnd: addDays(start, 6),
    day: (index: number) => addDays(start, index),
    goalIds: MOVEMENT_GOAL_IDS,
  };
}

/**
 * An instant at `hour` OWNER-LOCAL on a wall-calendar day.
 *
 * Sydney is ahead of UTC all year, so 12:00 local is the same calendar day in
 * UTC minus ten or eleven hours — which is why every instant below is written
 * as 01:00Z or later. A fixture whose events sat at 00:00Z would land on the
 * previous owner-local day for half the year, and this feature is entirely
 * about which side of a midnight an event falls on.
 */
function at(dayIso: string, hour: number): string {
  return `${dayIso}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

/**
 * The event day every "this week" assertion uses.
 *
 * The week's FIRST day, never "today": a run at 00:30 owner-local on a Monday
 * would otherwise seed an event at 06:00 that has not happened yet, and a run
 * on the week's last day would leave no room at all. Day 0 is inside the window
 * on every day of the week, by construction.
 */
function insideWeek(fixture: MovementFixture): string {
  return fixture.day(0);
}

export function seedMovementFixture(fixture: MovementFixture): void {
  const stamp = "2026-07-19T02:00:00.000Z";
  const inside = insideWeek(fixture);
  const justBefore = addDays(fixture.weekStart, -1);
  const lastWeek = addDays(fixture.weekStart, -4);
  const sql: string[] = [];
  let sequence = 0;

  const entity = (id: string, type: string, title: string) => {
    sql.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(type)}, ${sqlLiteral(title)}, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `UPDATE entities SET deleted_at = NULL, title = ${sqlLiteral(title)}, type = ${sqlLiteral(type)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
    );
  };

  const spine = (id: string, kind: string, completedAt: string | null) => {
    sql.push(
      `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, ${sqlLiteral(kind)}, NULL);`,
      `UPDATE spine_records SET kind = ${sqlLiteral(kind)},
          completed_at = ${completedAt === null ? "NULL" : sqlLiteral(completedAt)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const link = (source: string, target: string, type: string) => {
    sql.push(
      `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(`l-${source}-${target}`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(source)}, ${sqlLiteral(target)}, ${sqlLiteral(type)}, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `UPDATE entity_links SET deleted_at = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(`l-${source}-${target}`)};`,
    );
  };

  const event = (
    subjectId: string,
    type: string,
    occurredAt: string,
    payload: Record<string, unknown>,
  ) => {
    const id = `fm-a-${String(sequence++).padStart(3, "0")}`;
    sql.push(
      `INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(type)}, 'system', NULL, ${sqlLiteral(occurredAt)}, ${sqlLiteral(JSON.stringify(payload))});`,
      `INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, ${sqlLiteral(subjectId)}, 'subject');`,
      `UPDATE activities SET occurred_at = ${sqlLiteral(occurredAt)}, type = ${sqlLiteral(type)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
    );
  };

  const goal = (
    id: string,
    title: string,
    completedAt: string | null = null,
  ) => {
    entity(id, "goal", title);
    spine(id, "goal", completedAt);
    link(id, AREA_ID, "goal.belongs_to_area");
    sql.push(
      `INSERT OR IGNORE INTO goal_details (workspace_id, entity_id, entity_type, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'goal', ${sqlLiteral(stamp)});`,
      // Unmeasured by default; the measurable Goals below override it.
      `UPDATE goal_details SET measurement_type = NULL, measurement_unit = NULL,
          baseline_value = NULL, target_value = NULL, measurement_direction = NULL,
          target_date = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const project = (
    id: string,
    title: string,
    goalId: string | null,
    completedAt: string | null = null,
  ) => {
    entity(id, "project", title);
    spine(id, "project", completedAt);
    sql.push(
      `INSERT OR IGNORE INTO project_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'project', 'active', ${sqlLiteral(stamp)});`,
      `UPDATE project_details SET status = 'active', archived_at = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
    if (goalId === null) {
      link(id, AREA_ID, "project.belongs_to_area");
    } else {
      link(id, goalId, "project.advances_goal");
    }
  };

  const task = (
    id: string,
    title: string,
    projectId: string,
    completedAt: string | null,
  ) => {
    entity(id, "task", title);
    spine(id, "task", completedAt);
    link(id, projectId, "task.belongs_to_project");
    sql.push(
      `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'task', 'todo', ${sqlLiteral(stamp)});`,
      // Completion lives on `spine_records.completed_at`; `task_details.status`
      // is the OPEN-state workflow position and has no 'done' value at all.
      `UPDATE task_details SET status = 'todo',
          priority = 'p3', due_date = NULL, scheduled_date = NULL,
          commitment_state = 'active', updated_at = ${sqlLiteral(stamp)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  /* 1. UNMEASURED, and it moved: one Task completed inside the week. */
  goal("fm-goal-moving", "FM: Learn to sail");
  project("fm-proj-moving", "FM: Sailing course", "fm-goal-moving");
  task(
    "fm-task-moving",
    "FM: Book the course",
    "fm-proj-moving",
    at(inside, 6),
  );
  event("fm-task-moving", "task.completed", at(inside, 6), {
    completedAt: at(inside, 6),
  });
  /*
   * A Task under the SAME contributing Project, completed the day BEFORE the
   * week opened. It must not be counted, and it must not raise the Project
   * count — the "activity just outside the window" case.
   */
  task(
    "fm-task-just-outside",
    "FM: Read the handbook",
    "fm-proj-moving",
    at(justBefore, 6),
  );
  event("fm-task-just-outside", "task.completed", at(justBefore, 6), {
    completedAt: at(justBefore, 6),
  });

  /* 2. UNMEASURED, and it did not move: its only completion was last week. */
  goal("fm-goal-still", "FM: Restore the shed");
  project("fm-proj-still", "FM: Shed repairs", "fm-goal-still");
  task("fm-task-still", "FM: Clear the shed", "fm-proj-still", at(lastWeek, 6));
  event("fm-task-still", "task.completed", at(lastWeek, 6), {
    completedAt: at(lastWeek, 6),
  });

  /* 3. MEASURABLE, moved by a direct reading and by nothing else. */
  goal("fm-goal-measured", "FM: Reach 70 kg");
  sql.push(
    `UPDATE goal_details SET measurement_type = 'target_value', measurement_unit = 'kg',
        baseline_value = 85, target_value = 70, measurement_direction = 'decrease',
        target_date = ${sqlLiteral(addDays(fixture.weekStart, 120))}
      WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = 'fm-goal-measured';`,
    `INSERT OR IGNORE INTO goal_measurements (id, workspace_id, entity_id, entity_type, value, measured_on, note, created_at, updated_at)
     VALUES ('fm-m-000', ${sqlLiteral(WORKSPACE)}, 'fm-goal-measured', 'goal', 79, ${sqlLiteral(addDays(fixture.weekStart, -30))}, NULL, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)});`,
    `INSERT OR IGNORE INTO goal_measurements (id, workspace_id, entity_id, entity_type, value, measured_on, note, created_at, updated_at)
     VALUES ('fm-m-001', ${sqlLiteral(WORKSPACE)}, 'fm-goal-measured', 'goal', 77, ${sqlLiteral(inside)}, NULL, ${sqlLiteral(at(inside, 7))}, ${sqlLiteral(at(inside, 7))});`,
  );
  project("fm-proj-measured", "FM: Training block", "fm-goal-measured");
  task("fm-task-measured", "FM: Weekly long run", "fm-proj-measured", null);
  event("fm-goal-measured", "goal.measurement_logged", at(inside, 7), {
    value: 77,
    measuredOn: inside,
  });

  /* 4. MEASURABLE, moved by a contributing PROJECT rather than by a reading. */
  goal("fm-goal-measured-project", "FM: Read 24 books");
  sql.push(
    `UPDATE goal_details SET measurement_type = 'accumulation', measurement_unit = 'books',
        baseline_value = 0, target_value = 24, measurement_direction = 'increase',
        target_date = ${sqlLiteral(addDays(fixture.weekStart, 200))}
      WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = 'fm-goal-measured-project';`,
    `INSERT OR IGNORE INTO goal_measurements (id, workspace_id, entity_id, entity_type, value, measured_on, note, created_at, updated_at)
     VALUES ('fm-m-002', ${sqlLiteral(WORKSPACE)}, 'fm-goal-measured-project', 'goal', 6, ${sqlLiteral(addDays(fixture.weekStart, -40))}, NULL, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)});`,
  );
  /*
   * A contributing Project COMPLETED inside the week. The Goal's number has not
   * moved and its measurement status is unchanged — which is exactly the pair of
   * answers FOLLOW-02 must be able to state at once without either overwriting
   * the other.
   */
  project(
    "fm-proj-books",
    "FM: Reading list — spring",
    "fm-goal-measured-project",
    at(inside, 8),
  );
  event("fm-proj-books", "project.completed", at(inside, 8), {
    completedAt: at(inside, 8),
  });

  /* 5. UNMEASURED with THREE contributing Projects; two of them moved. */
  goal("fm-goal-partial", "FM: Run the house well");
  project("fm-proj-partial-a", "FM: Kitchen", "fm-goal-partial");
  project("fm-proj-partial-b", "FM: Garden", "fm-goal-partial");
  project("fm-proj-partial-c", "FM: Garage", "fm-goal-partial");
  task(
    "fm-task-partial-a",
    "FM: Fix the tap",
    "fm-proj-partial-a",
    at(inside, 6),
  );
  event("fm-task-partial-a", "task.completed", at(inside, 6), {
    completedAt: at(inside, 6),
  });
  task(
    "fm-task-partial-b",
    "FM: Prune the hedge",
    "fm-proj-partial-b",
    at(inside, 9),
  );
  event("fm-task-partial-b", "task.completed", at(inside, 9), {
    completedAt: at(inside, 9),
  });
  /* The third Project's only event inside the week is a RENAME. Not movement. */
  task("fm-task-partial-c", "FM: Sort the shelves", "fm-proj-partial-c", null);
  event("fm-proj-partial-c", "entity.updated", at(inside, 10), {
    entityType: "project",
    changes: { title: { before: "FM: Garage (old)", after: "FM: Garage" } },
  });

  /* 6. UNMEASURED, and its Project's ONLY event this week is a rename. */
  goal("fm-goal-metadata", "FM: Keep the records straight");
  project("fm-proj-filing", "FM: Filing", "fm-goal-metadata");
  task("fm-task-metadata", "FM: Scan receipts", "fm-proj-filing", null);
  event("fm-proj-filing", "entity.updated", at(inside, 10), {
    entityType: "project",
    changes: { title: { before: "FM: Filing (old)", after: "FM: Filing" } },
  });

  /* A completed Task under a Project that advances NO Goal. Reaches nothing. */
  project("fm-proj-unrelated", "FM: Unrelated work", null);
  task(
    "fm-task-unrelated",
    "FM: Something else",
    "fm-proj-unrelated",
    at(inside, 6),
  );
  event("fm-task-unrelated", "task.completed", at(inside, 6), {
    completedAt: at(inside, 6),
  });

  d1Execute(sql);
}

/**
 * Remove everything this fixture wrote. Dependents first: every foreign key in
 * the schema is ON DELETE RESTRICT, so history has to go before the records it
 * points at.
 */
export function cleanupMovementFixture(): void {
  const ws = sqlLiteral(WORKSPACE);
  const goals = MOVEMENT_GOAL_IDS.map((id) => sqlLiteral(id)).join(", ");
  const projects = PROJECT_IDS.map((id) => sqlLiteral(id)).join(", ");
  const tasks = TASK_IDS.map((id) => sqlLiteral(id)).join(", ");
  const all = [...MOVEMENT_GOAL_IDS, ...PROJECT_IDS, ...TASK_IDS]
    .map((id) => sqlLiteral(id))
    .join(", ");
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${all});`,
    `DELETE FROM activities WHERE workspace_id = ${ws}
       AND NOT EXISTS (SELECT 1 FROM activity_subjects s
                       WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws}
       AND (source_entity_id IN (${all}) OR target_entity_id IN (${all}));`,
    `DELETE FROM goal_measurements WHERE workspace_id = ${ws} AND entity_id IN (${goals});`,
    `DELETE FROM goal_milestones WHERE workspace_id = ${ws} AND entity_id IN (${goals});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${tasks});`,
    `DELETE FROM project_details WHERE workspace_id = ${ws} AND entity_id IN (${projects});`,
    `DELETE FROM goal_details WHERE workspace_id = ${ws} AND entity_id IN (${goals});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${all});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id IN (${all});`,
  ]);
}
