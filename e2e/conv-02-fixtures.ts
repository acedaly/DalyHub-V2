/**
 * V2.8 CONV-02 — the fixture the Waiting TaskRow journey drives.
 *
 * Every claim the item makes is a claim about what the owner can DO on
 * `/today/waiting` and what the SERVER holds afterwards, so every journey needs
 * waiting Tasks it owns outright — nothing here borrows a shared seed Task,
 * and nothing it does can disturb a journey that does.
 *
 * One Project under the committed seed's DalyHub Area, and under it:
 *
 *   - three DATED chases — due today, overdue, upcoming — for the RECALL-03
 *     machine-parity claim (the row's state against the filter and the rail);
 *   - one chase to COMPLETE from the row (it departs; reopening does not
 *     restore the waiting state, and its chase date survives both);
 *   - one Task to EDIT (a priority from the row; the follow-up date through the
 *     canonical Details editor);
 *   - one Task waiting on a LONG free-text subject, for the 320 px wrap;
 *   - one REPEATING waiting Task, for the recurrence signal;
 *   - one page-one Task to complete AFTER a second page has loaded, so the
 *     accumulated pages can be seen to survive the mutation;
 *   - enough FILLERS to make the list page (page size 50).
 *
 * Every id starts with {@link CONV02_ID_PREFIX}, so one sweep removes them all.
 *
 * Fixture dates are DERIVED from the run (CONV-00-E): every chase date is the
 * owner's day shifted, and the waiting instants sit in the fixed PAST so the
 * documented Waiting order (overdue due date first, then longest-waiting)
 * places the named Tasks before the fillers on page one.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { futureInstant, ownerDayPlus, ownerTodayIso } from "./calendar-dates";
import { d1Execute, d1ExecuteFile, sqlLiteral } from "./d1";

export const WORKSPACE_ID = "local-dev-workspace";

/** Every seeded id starts with this, so one sweep finds them all. */
export const CONV02_ID_PREFIX = "e2e-conv02-";

/** The committed seed's DalyHub Area — the Project hangs off it. */
const AREA_ID = "a-dh";

/** The Project the waiting Tasks belong to (the row's parent mark). */
export const CONV02_PROJECT = {
  id: `${CONV02_ID_PREFIX}pr-waiting`,
  title: "CONV-02 fixture project",
} as const;

/** The waiting subject the ordinary rows share. */
export const CONV02_SUBJECT = "Sam Okafor";

/** The long free-text subject the 320 px journey wraps. */
export const CONV02_LONG_SUBJECT =
  "Lodged 15 July; 20 business days quoted by the planning department before a decision";

export interface Conv02Task {
  readonly id: string;
  readonly title: string;
  /** The chase date, derived from the owner's day, or null. */
  readonly followUpOn: string | null;
  readonly subject: string;
  /** The waiting instant — fixed past; earlier sorts first. */
  readonly since: string;
}

/**
 * The named Tasks, keyed by the journey that uses each. Titles carry the
 * prefix so a locator by title can never match a shared-seed row.
 */
export const CONV02_TASKS = {
  complete: {
    id: `${CONV02_ID_PREFIX}t-complete`,
    title: "CONV-02 — complete me",
    followUpOn: ownerDayPlus(-2),
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:00:00.000Z", // fixed-date: a waiting instant in the past reads as "since" and never arms
  },
  dueToday: {
    id: `${CONV02_ID_PREFIX}t-due-today`,
    title: "CONV-02 — chase today",
    followUpOn: ownerTodayIso(),
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:01:00.000Z", // fixed-date: past waiting instant
  },
  overdue: {
    id: `${CONV02_ID_PREFIX}t-overdue`,
    title: "CONV-02 — chase overdue",
    followUpOn: ownerDayPlus(-1),
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:02:00.000Z", // fixed-date: past waiting instant
  },
  upcoming: {
    id: `${CONV02_ID_PREFIX}t-upcoming`,
    title: "CONV-02 — chase later",
    followUpOn: ownerDayPlus(3),
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:03:00.000Z", // fixed-date: past waiting instant
  },
  edit: {
    id: `${CONV02_ID_PREFIX}t-edit`,
    title: "CONV-02 — edit me",
    followUpOn: null,
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:04:00.000Z", // fixed-date: past waiting instant
  },
  longSubject: {
    id: `${CONV02_ID_PREFIX}t-long`,
    title: "CONV-02 — long subject",
    followUpOn: ownerDayPlus(-5),
    subject: CONV02_LONG_SUBJECT,
    since: "2026-01-05T09:05:00.000Z", // fixed-date: past waiting instant
  },
  repeat: {
    id: `${CONV02_ID_PREFIX}t-repeat`,
    title: "CONV-02 — weekly repeat",
    followUpOn: null,
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:06:00.000Z", // fixed-date: past waiting instant
  },
  pageOne: {
    id: `${CONV02_ID_PREFIX}t-page-one`,
    title: "CONV-02 — page one",
    followUpOn: null,
    subject: CONV02_SUBJECT,
    since: "2026-01-05T09:07:00.000Z", // fixed-date: past waiting instant
  },
} as const satisfies Record<string, Conv02Task>;

/** How many filler waiting Tasks make the list page (page size 50). */
export const CONV02_FILLERS = 55;

/** Every waiting Task the fixture seeds, named and filler alike. */
export const CONV02_TASK_TOTAL =
  Object.keys(CONV02_TASKS).length + CONV02_FILLERS;

/** The chases due on or before the owner's day, by construction. */
export const CONV02_DUE_TASKS = [
  CONV02_TASKS.complete,
  CONV02_TASKS.dueToday,
  CONV02_TASKS.overdue,
  CONV02_TASKS.longSubject,
] as const;

export const fillerId = (index: number) =>
  `${CONV02_ID_PREFIX}filler-${String(index).padStart(3, "0")}`;
export const fillerTitle = (index: number) =>
  `CONV-02 filler ${String(index).padStart(3, "0")}`;

/** A filler waits from a fixed past instant AFTER every named Task's. */
const fillerSince = (index: number) =>
  new Date(Date.UTC(2026, 0, 10, 0, index, 0)).toISOString(); // fixed-date: past waiting instants

const lit = sqlLiteral;
const WS = lit(WORKSPACE_ID);

function fillers(): readonly Conv02Task[] {
  const rows: Conv02Task[] = [];
  for (let index = 0; index < CONV02_FILLERS; index += 1) {
    rows.push({
      id: fillerId(index),
      title: fillerTitle(index),
      followUpOn: null,
      subject: CONV02_SUBJECT,
      since: fillerSince(index),
    });
  }
  return rows;
}

/** Seed everything. Idempotent: it removes its own rows first. */
export function seedConv02Fixture(): void {
  cleanupConv02Fixture();

  const at = futureInstant(366);
  const statements: string[] = [
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${lit(CONV02_PROJECT.id)}, ${WS}, 'project', ${lit(CONV02_PROJECT.title)}, ${lit(at)}, ${lit(at)}, NULL);`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${WS}, ${lit(CONV02_PROJECT.id)}, 'project', NULL);`,
    `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
       VALUES (${WS}, ${lit(CONV02_PROJECT.id)}, 'active', NULL, ${lit(at)});`,
    `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${lit(`l-${CONV02_PROJECT.id}-area`)}, ${WS}, ${lit(CONV02_PROJECT.id)}, ${lit(AREA_ID)},
               'project.belongs_to_area', ${lit(at)}, ${lit(at)}, NULL);`,
  ];

  const all: readonly Conv02Task[] = [
    ...Object.values(CONV02_TASKS),
    ...fillers(),
  ];
  const values = (build: (task: Conv02Task, index: number) => string) =>
    all.map(build).join(",\n  ");

  /*
   * Multi-row statements rather than four per Task: the suite drives one dev
   * server against one local SQLite file while this helper opens it from a
   * separate process, and SQLite serialises writers — so a long fixture write
   * is a long window in which the server's own reads can fail. Five statements
   * keep that window short (the RECALL-03 fixture learned the same thing).
   */
  /*
   * Created stamps sit a year ahead so the rows sort above every record a
   * journey creates live on a newest-first surface, and the NAMED Tasks are
   * stamped latest of all (the offset counts down through the fillers), so on
   * `/tasks` sorted by creation, newest first, they lead the page.
   */
  const total = all.length;
  statements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES
  ${values(
    (task, index) =>
      `(${lit(task.id)}, ${WS}, 'task', ${lit(task.title)}, ${lit(futureInstant(366, total - index))}, ${lit(futureInstant(366, total - index))}, NULL)`,
  )};`,
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES
  ${values((task) => `(${WS}, ${lit(task.id)}, 'task', NULL)`)};`,
    `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     VALUES
  ${values(
    (task) =>
      `(${lit(`l-${task.id}`)}, ${WS}, ${lit(task.id)}, ${lit(CONV02_PROJECT.id)}, 'task.belongs_to_project', ${lit(at)}, ${lit(at)}, NULL)`,
  )};`,
    `INSERT INTO task_details
       (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date,
        time_sector, commitment_state, delegate_to, delegated_on, follow_up_on,
        waiting_since, waiting_note, updated_at)
     VALUES
  ${values(
    (task) =>
      `(${WS}, ${lit(task.id)}, 'task', 'todo', 'p3', NULL, NULL, NULL, 'active', ` +
      `${lit(CONV02_SUBJECT)}, ${lit(ownerDayPlus(-10))}, ${task.followUpOn === null ? "NULL" : lit(task.followUpOn)}, ` +
      `${lit(task.since)}, ${lit(task.subject)}, ${lit(at)})`,
  )};`,
    // The repeating Task's rule: every week, on its due date.
    `INSERT INTO task_recurrence_rules
       (workspace_id, entity_id, date_kind, frequency, interval, weekdays,
        anchor_day, anchor_month, series_id, sequence, mode, created_at, updated_at)
     VALUES (${WS}, ${lit(CONV02_TASKS.repeat.id)}, 'due', 'week', 1, NULL,
             NULL, NULL, ${lit(`${CONV02_ID_PREFIX}series-repeat`)}, 0, 'fixed', ${lit(at)}, ${lit(at)});`,
  );

  // The statement text is past the operating system's argv limit, so the
  // fixture goes through the shared FILE entry point, as the RECALL-03 fixture does.
  const dir = mkdtempSync(join(tmpdir(), "conv02-"));
  const file = join(dir, "seed.sql");
  try {
    writeFileSync(file, statements.join("\n"), "utf8");
    d1ExecuteFile(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Remove every row this fixture owns, dependents first. */
export function cleanupConv02Fixture(): void {
  const prefix = lit(`${CONV02_ID_PREFIX}%`);
  const owned = `SELECT id FROM entities WHERE workspace_id = ${WS} AND id LIKE ${prefix}`;
  d1Execute(
    [
      `DELETE FROM task_recurrence_rules WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM task_checklist_items WHERE workspace_id = ${WS} AND task_id IN (${owned});`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM activities WHERE workspace_id = ${WS} AND NOT EXISTS (
         SELECT 1 FROM activity_subjects s
         WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
      `DELETE FROM task_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM project_details WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM entity_links WHERE workspace_id = ${WS}
         AND (source_entity_id IN (${owned}) OR target_entity_id IN (${owned}));`,
      `DELETE FROM spine_records WHERE workspace_id = ${WS} AND entity_id IN (${owned});`,
      `DELETE FROM entities WHERE workspace_id = ${WS} AND id LIKE ${prefix};`,
    ].join(" "),
  );
}
