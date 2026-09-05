/**
 * STEER-01/02 — the Goals whose OUTCOMES and CONDITIONS are known.
 *
 * V2.4's acceptance boundary, which V2.5 inherits: a numerical claim about the
 * owner's history is proven against a fixture whose facts are known, not
 * against whatever the workspace happens to hold. So this file writes the exact
 * measurement configurations, readings, target dates and owner conditions the
 * journey asserts on — every figure the spec reads is a figure this file put
 * there.
 *
 * ── Why the dates are relative ──────────────────────────────────────────────
 * The outcome ranking is computed against the owner's TODAY: "overdue" is a
 * target date in the past and "on track" is a fraction measured against elapsed
 * schedule. A fixture with fixed dates would classify correctly on the day it
 * was written and drift into a different bucket a month later — the exact time
 * bomb `goals-alignment.spec.ts` records having been caught by. Every date here
 * is therefore an offset from the owner's calendar day.
 *
 * ── It owns its isolation, explicitly ───────────────────────────────────────
 * [DEBT-173]. Everything is prefixed `st-`, and {@link cleanupSteerFixture}
 * removes every row it writes — dependents first, because every foreign key is
 * ON DELETE RESTRICT. Idempotent at both ends: seeding twice repairs, cleaning
 * twice is a no-op.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";

/** The Area every fixture Goal starts in. */
export const HOME_AREA_ID = "st-area-home";
/** The Area the move journey re-files a Goal into. */
export const DESTINATION_AREA_ID = "st-area-destination";

/**
 * The Goals, and what each one is FOR.
 *
 * Between them they cover the outcome ranking's leading buckets, both lens
 * partitions the journey reads, and both halves of the condition rule.
 */
export const STEER_GOALS = {
  /** Behind its OWN target date — the workspace's leading outcome. */
  overdue: { id: "st-goal-overdue", title: "ST: Ship the annual report" },
  /** Comfortably ahead of the line to a distant date. */
  ahead: { id: "st-goal-ahead", title: "ST: Read twenty books" },
  /**
   * ALSO behind its own date, and the owner has SET IT ASIDE. Its derived
   * facts must be identical to `overdue`'s treatment: still in the collection,
   * still "Needs attention", still counted there.
   */
  rested: { id: "st-goal-rested", title: "ST: Learn the piano" },
  /** No measurement at all — the bucket that must sort BELOW every measured one. */
  unmeasured: { id: "st-goal-unmeasured", title: "ST: Keep the shed tidy" },
  /** The Goal the move journey re-files, with a reading it must not lose. */
  movable: { id: "st-goal-movable", title: "ST: Re-file me" },
} as const;

/**
 * STEER-04 — the STRUCTURE beneath the Goals, so a next action has somewhere to
 * come from and a Goal with none can be told apart from one with all of it.
 *
 *   - `overdue` gets TWO Projects with eligible Tasks of different priorities,
 *     so the Goal-level composition has a genuine choice to make;
 *   - `rested` (the set-aside Goal) gets one Project with one eligible Task, so
 *     its record can answer while the attention surfaces do not ask;
 *   - `unmeasured` deliberately gets NOTHING, so the no-structure door is
 *     offered against a real absence rather than a contrived one;
 *   - `ahead` gets a Project whose only open Task is BLOCKED by an incomplete
 *     one that is itself waiting, so the honest "no next action" state is
 *     reachable on a Goal that clearly has work.
 */
export const STEER_PROJECTS = {
  reportDraft: { id: "st-proj-draft", title: "ST: Draft the report" },
  reportReview: { id: "st-proj-review", title: "ST: Review the report" },
  pianoLessons: { id: "st-proj-piano", title: "ST: Book piano lessons" },
  readingStalled: { id: "st-proj-stalled", title: "ST: Stalled reading" },
} as const;

export const STEER_TASKS = {
  /** P3, under `reportDraft` — the lower-ranked candidate. */
  outline: { id: "st-task-outline", title: "ST: Outline the sections" },
  /** P1, under `reportReview` — the Goal's next step, across two Projects. */
  proofread: { id: "st-task-proofread", title: "ST: Proofread the draft" },
  /** The set-aside Goal's only eligible Task. */
  piano: { id: "st-task-piano", title: "ST: Email the teacher" },
  /** Waiting on somebody else — never a next action. */
  waiting: { id: "st-task-waiting", title: "ST: Wait for the library" },
} as const;

export interface SteerFixture {
  readonly todayIso: string;
  /** A date `days` from the owner's today, as `YYYY-MM-DD`. */
  readonly day: (days: number) => string;
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

export function steerFixture(): SteerFixture {
  const todayIso = ownerTodayIso();
  return { todayIso, day: (days: number) => addDays(todayIso, days) };
}

export function seedSteerFixture(fixture: SteerFixture): void {
  const stamp = "2026-07-19T02:00:00.000Z";
  const sql: string[] = [];

  const entity = (id: string, type: string, title: string, created = stamp) => {
    sql.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(type)}, ${sqlLiteral(title)}, ${sqlLiteral(created)}, ${sqlLiteral(stamp)}, NULL);`,
      `UPDATE entities SET deleted_at = NULL, title = ${sqlLiteral(title)},
          type = ${sqlLiteral(type)}, created_at = ${sqlLiteral(created)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
    );
  };

  const spine = (id: string, kind: string) => {
    sql.push(
      `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, ${sqlLiteral(kind)}, NULL);`,
      `UPDATE spine_records SET kind = ${sqlLiteral(kind)}, completed_at = NULL
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

  /**
   * A Goal, with its measurement configuration, its target date and the
   * owner's condition — written to `goal_details` exactly as the repository
   * writes them.
   *
   * `createdAt` matters: it is the schedule's origin when a Goal has no
   * earlier reading, so "ahead" and "on track" are measured against it.
   */
  const goal = (
    id: string,
    title: string,
    options: {
      readonly areaId?: string;
      readonly createdAt?: string;
      readonly targetDate?: string | null;
      readonly measurementType?: string | null;
      readonly targetValue?: number | null;
      readonly condition?: string | null;
    } = {},
  ) => {
    entity(id, "goal", title, options.createdAt ?? stamp);
    spine(id, "goal");
    link(id, options.areaId ?? HOME_AREA_ID, "goal.belongs_to_area");
    sql.push(
      `INSERT OR IGNORE INTO goal_details (workspace_id, entity_id, entity_type, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'goal', ${sqlLiteral(stamp)});`,
      `UPDATE goal_details SET
          measurement_type = ${options.measurementType ? sqlLiteral(options.measurementType) : "NULL"},
          measurement_unit = NULL,
          measurement_direction = ${options.measurementType ? "'increase'" : "NULL"},
          baseline_value = ${options.measurementType ? "0" : "NULL"},
          target_value = ${options.targetValue === undefined || options.targetValue === null ? "NULL" : String(options.targetValue)},
          target_date = ${options.targetDate ? sqlLiteral(options.targetDate) : "NULL"},
          condition = ${options.condition ? sqlLiteral(options.condition) : "NULL"},
          icon_key = NULL, colour_slot = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const reading = (
    id: string,
    goalId: string,
    value: number,
    measuredOn: string,
  ) => {
    sql.push(
      `INSERT OR IGNORE INTO goal_measurements (id, workspace_id, entity_id, value, measured_on, note, created_at, updated_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(goalId)}, ${value}, ${sqlLiteral(measuredOn)}, NULL, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)});`,
      `UPDATE goal_measurements SET value = ${value}, measured_on = ${sqlLiteral(measuredOn)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
    );
  };

  entity(HOME_AREA_ID, "area", "ST: Steering fixtures");
  spine(HOME_AREA_ID, "area");
  entity(DESTINATION_AREA_ID, "area", "ST: Somewhere else");
  spine(DESTINATION_AREA_ID, "area");

  /*
   * Two Goals BEHIND their own target date — one pursued, one set aside. Their
   * derived facts are identical by construction, which is what makes the
   * condition's independence checkable rather than assertable.
   */
  goal(STEER_GOALS.overdue.id, STEER_GOALS.overdue.title, {
    measurementType: "accumulation",
    targetValue: 100,
    targetDate: fixture.day(-14),
  });
  reading("st-m-overdue", STEER_GOALS.overdue.id, 12, fixture.day(-3));

  goal(STEER_GOALS.rested.id, STEER_GOALS.rested.title, {
    measurementType: "accumulation",
    targetValue: 100,
    targetDate: fixture.day(-14),
    condition: "set_aside",
  });
  reading("st-m-rested", STEER_GOALS.rested.id, 12, fixture.day(-3));

  // Comfortably ahead of a distant date: 90 of 100 with most of the schedule
  // still to run.
  goal(STEER_GOALS.ahead.id, STEER_GOALS.ahead.title, {
    createdAt: `${fixture.day(-30)}T02:00:00.000Z`,
    measurementType: "accumulation",
    targetValue: 100,
    targetDate: fixture.day(180),
  });
  reading("st-m-ahead", STEER_GOALS.ahead.id, 90, fixture.day(-2));

  // No measurement at all — the absence bucket, which must sort last of the
  // open Goals however recently it was created.
  goal(STEER_GOALS.unmeasured.id, STEER_GOALS.unmeasured.title);

  // The Goal the move journey re-files. Two readings, so the move demonstrably
  // preserves a HISTORY rather than a single value.
  goal(STEER_GOALS.movable.id, STEER_GOALS.movable.title, {
    createdAt: `${fixture.day(-60)}T02:00:00.000Z`,
    measurementType: "accumulation",
    targetValue: 50,
    targetDate: fixture.day(90),
  });
  reading("st-m-movable-1", STEER_GOALS.movable.id, 10, fixture.day(-40));
  reading("st-m-movable-2", STEER_GOALS.movable.id, 25, fixture.day(-5));

  /*
   * STEER-04 — the Projects and Tasks a next action is composed FROM.
   *
   * A Project is a spine record linked to its parent by `project.advances_goal`
   * (a Goal parent) and carries a `project_details` row for its workflow
   * status; a Task is a spine record linked by `task.belongs_to_project` with a
   * `task_details` row for its priority and its waiting state. Everything is
   * written exactly as the repositories write it, so the ranked statement reads
   * real rows rather than a shape invented for the test.
   */
  const project = (
    id: string,
    title: string,
    goalId: string,
    status = "active",
  ) => {
    entity(id, "project", title);
    spine(id, "project");
    link(id, goalId, "project.advances_goal");
    sql.push(
      `INSERT OR IGNORE INTO project_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'project', ${sqlLiteral(status)}, ${sqlLiteral(stamp)});`,
      `UPDATE project_details SET status = ${sqlLiteral(status)}, archived_at = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const task = (
    id: string,
    title: string,
    projectId: string,
    options: {
      readonly priority?: string | null;
      readonly waiting?: boolean;
    } = {},
  ) => {
    entity(id, "task", title);
    spine(id, "task");
    link(id, projectId, "task.belongs_to_project");
    sql.push(
      `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'task', 'todo', ${sqlLiteral(stamp)});`,
      `UPDATE task_details SET status = 'todo',
          priority = ${options.priority ? sqlLiteral(options.priority) : "NULL"},
          commitment_state = 'active',
          waiting_since = ${options.waiting ? sqlLiteral(stamp) : "NULL"},
          waiting_note = ${options.waiting ? sqlLiteral("the library") : "NULL"},
          due_date = NULL, scheduled_date = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  /*
   * A recent `entity.created` Activity per fixture Task, so the fixture's
   * Projects lead Today's "Continue working".
   *
   * That list is capped at three and ranked by the REAL last activity
   * (`ProjectHealthSummary.lastActivityIso`), not by `updated_at` — so a fixture
   * with no Activity at all sorts LAST and never reaches the surface the journey
   * is about. The offsets below are minutes apart, which makes the top three
   * deterministic: the Project whose only open Task is WAITING is deliberately
   * among them, so the "names nothing" branch is exercised rather than assumed.
   */
  const activity = (id: string, subjectId: string, minutesAgo: number) => {
    const occurredAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    sql.push(
      `INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, 'entity.created', 'user', 'owner-subject', ${sqlLiteral(occurredAt)}, '{}');`,
      `UPDATE activities SET occurred_at = ${sqlLiteral(occurredAt)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
      `INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, ${sqlLiteral(subjectId)}, 'subject');`,
    );
  };

  project(
    STEER_PROJECTS.reportDraft.id,
    STEER_PROJECTS.reportDraft.title,
    STEER_GOALS.overdue.id,
  );
  project(
    STEER_PROJECTS.reportReview.id,
    STEER_PROJECTS.reportReview.title,
    STEER_GOALS.overdue.id,
  );
  task(
    STEER_TASKS.outline.id,
    STEER_TASKS.outline.title,
    STEER_PROJECTS.reportDraft.id,
    { priority: "p3" },
  );
  task(
    STEER_TASKS.proofread.id,
    STEER_TASKS.proofread.title,
    STEER_PROJECTS.reportReview.id,
    { priority: "p1" },
  );

  project(
    STEER_PROJECTS.pianoLessons.id,
    STEER_PROJECTS.pianoLessons.title,
    STEER_GOALS.rested.id,
  );
  task(
    STEER_TASKS.piano.id,
    STEER_TASKS.piano.title,
    STEER_PROJECTS.pianoLessons.id,
    { priority: "p2" },
  );

  project(
    STEER_PROJECTS.readingStalled.id,
    STEER_PROJECTS.readingStalled.title,
    STEER_GOALS.ahead.id,
  );
  task(
    STEER_TASKS.waiting.id,
    STEER_TASKS.waiting.title,
    STEER_PROJECTS.readingStalled.id,
    { priority: "p1", waiting: true },
  );

  // Newest first, so "Continue working"'s top three are: the Project holding the
  // Goal's next step, the Project holding the lower-ranked candidate, and the
  // Project whose only open Task is waiting.
  activity("st-act-proofread", STEER_TASKS.proofread.id, 1);
  activity("st-act-outline", STEER_TASKS.outline.id, 2);
  activity("st-act-waiting", STEER_TASKS.waiting.id, 3);
  activity("st-act-piano", STEER_TASKS.piano.id, 4);

  d1Execute(sql);
}

/**
 * Establish this fixture's claim on Today's "Continue working" band, at the
 * moment the journey asserts it (V2.8 CONV-03, DEBT-173).
 *
 * The band is bounded TWICE, and both bounds are contested by the whole
 * workspace — which is why re-stamping only one of them did not repair it:
 *
 *   1. **The CANDIDATE set.** `readActiveProjects` reads the twelve
 *      (`PROJECTS_LIMIT`) most recently UPDATED active Projects, ordered by the
 *      effective timestamp `MAX(entities.updated_at, project_details.updated_at)`.
 *      A Project the run has not touched lately is not a candidate at all,
 *      whatever its Activity says.
 *   2. **The BAND.** `rankContinueProjects` then sorts those candidates by their
 *      real last Activity and keeps the top **three** (`CONTINUE_MAX`).
 *
 * `seedSteerFixture` stamps the Activity one to four MINUTES ago in a
 * `beforeAll`, which puts this fixture ahead of the committed seed and says
 * nothing about what runs between that hook and the assertion. The
 * two-arrangement proof found exactly that: `steer-goal-story.spec.ts:201`
 * passed under the committed thirteen-partition split and failed under a derived
 * fourteen-partition one, on the same tree and the same seed, because the file
 * had different neighbours — one of 2,025 tests disagreeing.
 *
 * The first repair re-stamped the Activity alone and was MEASURED still red
 * under the real fourteen-partition arrangement: the ranking was never the
 * binding constraint there, the twelve-Project candidate page was. This bumps
 * both, in the order the reads consume them, immediately before the journey
 * looks. `workers: 1` means nothing else in the partition runs in between, so it
 * is deterministic rather than merely likelier — the same "a precondition a spec
 * depends on is a precondition that spec sets" refinement `identity.spec.ts:268`
 * and `entity-icons.spec.ts` adopted.
 *
 * The Activity offsets keep their ORDER and their spacing in SECONDS rather than
 * minutes, so the top three are still the three this fixture means them to be —
 * including the Project whose only open Task is WAITING, which is in the band
 * deliberately so the "names nothing" branch is exercised rather than assumed.
 * Minutes would lose to any Project a neighbour touched at "now"; that too was
 * measured rather than reasoned about.
 */
export function touchSteerContinueBand(): void {
  const ws = sqlLiteral(WORKSPACE);
  const nowIso = new Date().toISOString();
  const seconds = (secondsAgo: number) =>
    sqlLiteral(new Date(Date.now() - secondsAgo * 1000).toISOString());

  const sql: string[] = [];

  // (1) Inside the candidate page: the effective updated_at is the LATER of the
  // spine's and the detail row's, so both are set.
  for (const project of Object.values(STEER_PROJECTS)) {
    sql.push(
      `UPDATE entities SET updated_at = ${sqlLiteral(nowIso)}
        WHERE workspace_id = ${ws} AND id = ${sqlLiteral(project.id)};`,
      `UPDATE project_details SET updated_at = ${sqlLiteral(nowIso)}
        WHERE workspace_id = ${ws} AND entity_id = ${sqlLiteral(project.id)};`,
    );
  }

  // (2) And the order within it, newest first.
  const stamp = (id: string, secondsAgo: number) =>
    `UPDATE activities SET occurred_at = ${seconds(secondsAgo)}
      WHERE workspace_id = ${ws} AND id = ${sqlLiteral(id)};`;
  sql.push(
    stamp("st-act-proofread", 1),
    stamp("st-act-outline", 2),
    stamp("st-act-waiting", 3),
    stamp("st-act-piano", 4),
  );

  d1Execute(sql);
}

export function cleanupSteerFixture(): void {
  const ws = sqlLiteral(WORKSPACE);
  /*
   * Everything this fixture owns is identified by its `ST: ` title prefix, and
   * the sweep is keyed on that rather than on a list of ids.
   *
   * STEER-04's journey CREATES a Project through the product's own "New Project
   * for this Goal" door, so its id is not known here — but its title is, because
   * the journey names it with the same prefix. A cleanup keyed only on written
   * ids would leave that Project behind on every run, which is exactly the
   * leaking-fixture class [DEBT-173] exists to stop.
   *
   * `entities` is the last table cleared, so every statement above can still
   * resolve the id set from it. Dependents come first throughout, because every
   * foreign key is ON DELETE RESTRICT. Idempotent: running it twice is a no-op.
   */
  const owned = `SELECT id FROM entities WHERE workspace_id = ${ws} AND title LIKE 'ST: %'`;
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM activities WHERE workspace_id = ${ws}
       AND NOT EXISTS (SELECT 1 FROM activity_subjects s
                       WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws}
       AND (source_entity_id IN (${owned}) OR target_entity_id IN (${owned}));`,
    `DELETE FROM goal_measurements WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM goal_milestones WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM goal_details WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM project_details WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM area_details WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    /*
     * The Review the STEER-03 journey starts, whose title carries the same
     * prefix. `review_details` is the only review table with a foreign key onto
     * `entities` (ON DELETE RESTRICT); every other review table cascades from
     * it, so removing this row removes the sections, the workflow state, the
     * acknowledgements and any insight snapshot with it.
     */
    `DELETE FROM review_details WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${owned});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND title LIKE 'ST: %';`,
  ]);
}
