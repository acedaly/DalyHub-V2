/**
 * TODAY-REDESIGN — deterministic Today-screen day fixtures for the LOCAL D1.
 *
 * The Today redesign is a conditional-rendering contract: every chip, the progress
 * indicator, each timeline section and each rail row renders only when its
 * condition holds. Proving that needs whole DAYS, not individual records — an
 * empty day, a typical day, a heavy day, a morning-before-any-work day — and a day
 * is only reproducible if the fixture owns everything the surface reads.
 *
 * So this script does two things, in one pass:
 *
 *   1. **Parks** every pre-existing record the Today surface reads (tasks,
 *      meetings, projects, goals) behind a sentinel `deleted_at`, so the shared
 *      dev seed cannot leak into a scenario. Parking is reversible — `restore`
 *      clears exactly the sentinel and nothing else — so the E2E seed survives.
 *   2. **Seeds** the scenario's own records, all under the `tf-` id prefix and the
 *      shared title prefix, positioned RELATIVE to the owner's calendar day so the
 *      same scenario is the same day whenever it is run.
 *
 * Local-only: it talks to the Miniflare D1 through `wrangler d1 execute --local`,
 * exactly like `setup-local-db.mjs`. It never touches a remote database.
 *
 * Usage:
 *   node e2e/today-fixtures.mjs typical|morning|heavy|empty|restore
 */

import { execFileSync } from "node:child_process";

const WORKSPACE_ID = "local-dev-workspace";
/** The reversible "parked by a Today fixture" marker (never a real deletion). */
const PARK_SENTINEL = "1999-01-01T00:00:00.000Z";
/** The owner's calendar timezone — must match `DEFAULT_APP_PREFERENCES.timezone`. */
const OWNER_TIMEZONE = "Australia/Sydney";
const PREFIX = "tf-";

/* -------------------------------------------------------------------------- */
/* Owner-calendar date arithmetic                                             */
/* -------------------------------------------------------------------------- */

/** The owner's calendar date `YYYY-MM-DD` for an instant. */
function ownerIso(instant) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(instant);
}

/** Shift a date-only `YYYY-MM-DD` by whole calendar days. */
function addDays(iso, days) {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** The owner-timezone offset (minutes) in effect on a given calendar day. */
function offsetMinutes(iso) {
  const probe = new Date(`${iso}T12:00:00Z`);
  const local = new Date(
    probe.toLocaleString("en-US", { timeZone: OWNER_TIMEZONE }),
  );
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

/** The UTC instant of an owner-local wall clock time on an owner calendar day. */
function ownerInstant(iso, hour, minute) {
  const offset = offsetMinutes(iso);
  const utcMs =
    Date.parse(`${iso}T00:00:00Z`) + (hour * 60 + minute - offset) * 60000;
  return new Date(utcMs).toISOString();
}

const NOW = new Date();
const TODAY = ownerIso(NOW);

/* -------------------------------------------------------------------------- */
/* SQL helpers                                                                */
/* -------------------------------------------------------------------------- */

const ws = `'${WORKSPACE_ID}'`;
const q = (value) =>
  value === null || value === undefined
    ? "NULL"
    : `'${String(value).replace(/'/g, "''")}'`;

let sequence = 0;
/** A stable-per-run creation timestamp so ordering inside a scenario is fixed. */
function stamp() {
  sequence += 1;
  return new Date(
    Date.parse(`${TODAY}T00:00:00Z`) + sequence * 1000,
  ).toISOString();
}

const statements = [];
const push = (sql) => statements.push(sql);

/** Park every record type the Today surface reads. Reversible. */
function parkExisting() {
  for (const type of ["task", "meeting", "project", "goal"]) {
    push(
      `UPDATE entities SET deleted_at = ${q(PARK_SENTINEL)} WHERE workspace_id = ${ws} AND type = '${type}' AND deleted_at IS NULL;`,
    );
  }
}

/** Remove every record a previous fixture run created (id prefix `tf-`). */
function clearFixtures() {
  const sel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%'`;
  push(
    `DELETE FROM meeting_item_tasks WHERE workspace_id = ${ws} AND (meeting_id IN (${sel}) OR task_id IN (${sel}));`,
  );
  push(
    `DELETE FROM meeting_items WHERE workspace_id = ${ws} AND meeting_id IN (${sel});`,
  );
  push(
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${sel}) OR target_entity_id IN (${sel}));`,
  );
  push(
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
  );
  push(
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  );
  // The two GOAL-02 measurable-Goal tables are cleared FIRST: both hold a
  // RESTRICT foreign key to `entities`, so a Goal a previous run measured
  // cannot be deleted while its readings survive.
  for (const table of ["goal_measurements", "goal_milestones"]) {
    push(
      `DELETE FROM ${table} WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    );
  }
  for (const table of [
    "task_details",
    "meeting_details",
    "project_details",
    "goal_details",
    "area_details",
  ]) {
    push(
      `DELETE FROM ${table} WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
    );
  }
  push(
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${sel});`,
  );
  push(
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%';`,
  );
}

function entity(id, type, title, { createdAt, updatedAt } = {}) {
  const created = createdAt ?? stamp();
  const updated = updatedAt ?? created;
  push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${q(id)}, ${ws}, ${q(type)}, ${q(title)}, ${q(created)}, ${q(updated)}, NULL);`,
  );
}

function spine(id, kind, completedAt = null) {
  push(
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at) VALUES (${ws}, ${q(id)}, ${q(kind)}, ${q(completedAt)});`,
  );
}

function link(id, source, target, type) {
  const at = stamp();
  push(
    `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at) VALUES (${q(id)}, ${ws}, ${q(source)}, ${q(target)}, ${q(type)}, ${q(at)}, ${q(at)}, NULL);`,
  );
}

/**
 * One task. `due` is the DATE-ONLY due date (tasks never carry times);
 * `scheduled` is the planning date. `completedAt` is a UTC instant.
 */
function task(
  id,
  title,
  {
    due = null,
    scheduled = null,
    priority = null,
    project = null,
    area = "tf-area-work",
    completedAt = null,
    waitingSince = null,
    waitingNote = null,
  } = {},
) {
  entity(id, "task", title);
  spine(id, "task", completedAt);
  push(
    `INSERT INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, description, waiting_since, waiting_note, updated_at) VALUES (${ws}, ${q(id)}, 'task', 'todo', ${q(priority)}, ${q(due)}, ${q(scheduled)}, NULL, ${q(waitingSince)}, ${q(waitingNote)}, ${q(stamp())});`,
  );
  if (project) {
    link(`${id}-l-project`, id, project, "task.belongs_to_project");
  } else if (area) {
    link(`${id}-l-area`, id, area, "task.belongs_to_area");
  }
}

function area(id, title, { iconKey = null } = {}) {
  entity(id, "area", title);
  spine(id, "area");
  push(
    `INSERT INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at, icon_key) VALUES (${ws}, ${q(id)}, 'area', NULL, ${q(stamp())}, ${q(iconKey)});`,
  );
}

function project(
  id,
  title,
  {
    areaId = "tf-area-work",
    status = "active",
    updatedAt = null,
    goal = null,
    iconKey = null,
  } = {},
) {
  entity(id, "project", title, { updatedAt: updatedAt ?? undefined });
  spine(id, "project");
  push(
    `INSERT INTO project_details (workspace_id, entity_id, entity_type, status, archived_at, updated_at, icon_key) VALUES (${ws}, ${q(id)}, 'project', ${q(status)}, NULL, ${q(updatedAt ?? stamp())}, ${q(iconKey)});`,
  );
  // A spine child has exactly ONE active structural parent
  // (`entity_links_one_active_parent_idx`): a Project either advances a Goal or
  // sits directly under an Area, never both.
  if (goal) {
    link(`${id}-l-goal`, id, goal, "project.advances_goal");
  } else if (areaId) {
    link(`${id}-l-area`, id, areaId, "project.belongs_to_area");
  }
}

/**
 * One Goal, optionally MEASURABLE (GOAL-02).
 *
 * The measurement options mirror the kernel's own normalisation rules
 * (`normalizeGoalMeasurementConfig`) rather than inventing a second model:
 * `direction` is INFERRED from baseline and target exactly as the product
 * infers it, so a fixture can never seed a configuration the UI could not have
 * produced. `measurements` are `[value, dayOffset]` pairs positioned relative to
 * the owner's calendar day, which is what keeps a seeded trend the same trend
 * whenever it is run.
 */
function goal(
  id,
  title,
  {
    areaId = "tf-area-work",
    targetDate = addDays(TODAY, 60),
    definitionOfDone = "A calm, measurable finish line.",
    measurementType = null,
    unit = null,
    baselineValue = null,
    targetValue = null,
    measurements = [],
    milestones = [],
    completedAt = null,
    createdAt = null,
  } = {},
) {
  entity(id, "goal", title, { createdAt: createdAt ?? undefined });
  spine(id, "goal", completedAt);
  // The kernel's inference, mirrored: 85 → 70 decreases, 0 → 12 increases.
  const direction =
    measurementType === null
      ? null
      : baselineValue !== null &&
          targetValue !== null &&
          targetValue < baselineValue
        ? "decrease"
        : "increase";
  push(
    `INSERT INTO goal_details (workspace_id, entity_id, entity_type, target_date, definition_of_done, updated_at, measurement_type, measurement_unit, measurement_direction, baseline_value, target_value) VALUES (${ws}, ${q(id)}, 'goal', ${q(targetDate)}, ${q(definitionOfDone)}, ${q(stamp())}, ${q(measurementType)}, ${q(unit)}, ${q(direction)}, ${baselineValue === null ? "NULL" : baselineValue}, ${targetValue === null ? "NULL" : targetValue});`,
  );
  for (const [
    index,
    [value, dayOffset, note = null],
  ] of measurements.entries()) {
    const at = stamp();
    push(
      `INSERT INTO goal_measurements (workspace_id, id, entity_id, entity_type, value, measured_on, note, created_at, updated_at) VALUES (${ws}, ${q(`${id}-m-${index + 1}`)}, ${q(id)}, 'goal', ${value}, ${q(addDays(TODAY, dayOffset))}, ${q(note)}, ${q(at)}, ${q(at)});`,
    );
  }
  for (const [index, [stageTitle, doneOffset = null]] of milestones.entries()) {
    const at = stamp();
    push(
      `INSERT INTO goal_milestones (workspace_id, id, entity_id, entity_type, title, weight, position, completed_at, created_at, updated_at) VALUES (${ws}, ${q(`${id}-s-${index + 1}`)}, ${q(id)}, 'goal', ${q(stageTitle)}, 1, ${index}, ${doneOffset === null ? "NULL" : q(ownerInstant(addDays(TODAY, doneOffset), 9, 0))}, ${q(at)}, ${q(at)});`,
    );
  }
  if (areaId) {
    link(`${id}-l-area`, id, areaId, "goal.belongs_to_area");
  }
}

function meeting(
  id,
  title,
  { hour, minute = 0, location = null, mode = "online" } = {},
) {
  const startsAt = ownerInstant(TODAY, hour, minute);
  const endsAt = ownerInstant(TODAY, hour + 1, minute);
  entity(id, "meeting", title);
  push(
    `INSERT INTO meeting_details (workspace_id, entity_id, entity_type, starts_at, ends_at, timezone, location, mode, meeting_url, status, agenda_markdown, notes_markdown, archived_at, held_at, updated_at) VALUES (${ws}, ${q(id)}, 'meeting', ${q(startsAt)}, ${q(endsAt)}, ${q(OWNER_TIMEZONE)}, ${q(location)}, ${q(mode)}, NULL, 'planned', '', '', NULL, NULL, ${q(stamp())});`,
  );
}

/** A meaningful Activity event, so project/goal recency is a REAL signal. */
function activity(id, type, subjectId, occurredAt, extraSubjects = []) {
  push(
    `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json) VALUES (${q(id)}, ${ws}, ${q(type)}, 'user', 'dev', ${q(occurredAt)}, '{}');`,
  );
  push(
    `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role) VALUES (${ws}, ${q(id)}, ${q(subjectId)}, 'primary');`,
  );
  for (const [index, entityId] of extraSubjects.entries()) {
    push(
      `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role) VALUES (${ws}, ${q(id)}, ${q(entityId)}, ${q(`related-${index}`)});`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                  */
/* -------------------------------------------------------------------------- */

/** The shared spine every non-empty scenario hangs from. */
function baseSpine() {
  area("tf-area-work", "Work");
  area("tf-area-home", "Home");
}

/**
 * The "typical day" the contract is specified against.
 *
 * 1 overdue task · 3 timed meetings · 5 date-only tasks due today · 2 waiting
 * items (one aged 9 days) · one project behind · one goal at risk · 3 tasks
 * already completed today · three active projects with real, differing activity.
 */
function typical({ completedToday = 3 } = {}) {
  baseSpine();

  goal("tf-goal-ship", "Ship DalyHub V2");
  goal("tf-goal-fitness", "Run a half-marathon");

  project("tf-proj-today", "Today screen redesign", { goal: "tf-goal-ship" });
  project("tf-proj-migration", "Data migration", { areaId: "tf-area-work" });
  project("tf-proj-house", "Kitchen renovation", { areaId: "tf-area-home" });
  // The goal at risk: a Goal with real structure under it but no recent Task
  // activity, which is exactly what the EXISTING alignment evaluator calls
  // "neglected". Nothing here flags it by hand.
  project("tf-proj-training", "Base training block", {
    goal: "tf-goal-fitness",
  });
  task("tf-t-training-1", "Long run", { project: "tf-proj-training" });

  // The project that is BEHIND: open work and no activity for three weeks, so
  // its EXISTING derived health reads "stale" without adding a second overdue
  // task to the day (the typical day has exactly one).
  task("tf-t-migration-1", "Reconcile the legacy export", {
    project: "tf-proj-migration",
    priority: "p1",
  });
  task("tf-t-migration-2", "Write the rollback plan", {
    project: "tf-proj-migration",
  });

  // The one overdue task on the day's timeline.
  task("tf-t-overdue", "Send the quarterly summary", {
    due: addDays(TODAY, -2),
    priority: "p1",
    project: "tf-proj-today",
  });

  // Tasks on today's list. Dates only — a task never carries a time. Some are
  // also PLANNED for today (the owner's scheduled-date commitment) and some are
  // only due today, so both halves of the "on today" rule are exercised.
  task("tf-t-due-1", "Draft the release notes", {
    due: TODAY,
    scheduled: TODAY,
    project: "tf-proj-today",
  });
  task("tf-t-due-2", "Review the accessibility audit", {
    due: TODAY,
    scheduled: TODAY,
    project: "tf-proj-today",
    priority: "p2",
  });
  task("tf-t-due-3", "Book the dentist", { due: TODAY, area: "tf-area-home" });
  task("tf-t-due-4", "Reply to the supplier quote", {
    due: TODAY,
    scheduled: TODAY,
    project: "tf-proj-house",
  });
  task("tf-t-due-5", "Update the deployment checklist", { due: TODAY });

  // Already completed today.
  const completions = [
    ["tf-t-done-1", "Clear the inbox", 7],
    ["tf-t-done-2", "Stand-up notes", 8],
    ["tf-t-done-3", "Approve the design tokens PR", 9],
  ];
  for (const [id, title, hour] of completions.slice(0, completedToday)) {
    task(id, title, {
      due: TODAY,
      completedAt: ownerInstant(TODAY, hour, 15),
      project: "tf-proj-today",
    });
  }

  // Waiting items — one of them long-running (the age is the point).
  task("tf-t-wait-1", "Legal sign-off on the contract", {
    waitingSince: ownerInstant(addDays(TODAY, -9), 9, 0),
    waitingNote: "Chasing legal",
    project: "tf-proj-migration",
  });
  task("tf-t-wait-2", "Supplier delivery date", {
    waitingSince: ownerInstant(addDays(TODAY, -2), 14, 0),
    project: "tf-proj-house",
  });

  // Unfiled captures (the inbox): tasks with no structural parent at all.
  task("tf-t-inbox-1", "Idea: weekly review template", { area: null });
  task("tf-t-inbox-2", "Ask Sam about the offsite", { area: null });

  meeting("tf-m-1", "Design review", {
    hour: 9,
    minute: 30,
    location: "Studio",
    mode: "in_person",
  });
  meeting("tf-m-2", "1:1 with Sam", { hour: 11, minute: 0, mode: "online" });
  meeting("tf-m-3", "Migration planning", {
    hour: 15,
    minute: 30,
    mode: "online",
  });

  // REAL activity recency, so "Continue working" has something honest to rank on.
  //
  // The subject is the COMPLETED task when the scenario has one, and the project
  // itself when it does not (the morning scenario deliberately has nothing done
  // yet). Naming a task the scenario never created is a foreign-key error, and
  // pointing at one that is not there would be a lie about the workspace.
  if (completedToday > 0) {
    activity(
      "tf-a-1",
      "task.completed",
      completions[completedToday - 1][0],
      ownerInstant(TODAY, 9, 15),
      ["tf-proj-today"],
    );
  } else {
    activity(
      "tf-a-1",
      "entity.updated",
      "tf-proj-today",
      ownerInstant(TODAY, 9, 15),
    );
  }
  activity(
    "tf-a-2",
    "entity.updated",
    "tf-proj-house",
    ownerInstant(addDays(TODAY, -1), 16, 0),
  );
  activity(
    "tf-a-3",
    "entity.updated",
    "tf-proj-migration",
    ownerInstant(addDays(TODAY, -21), 10, 0),
  );
  activity(
    "tf-a-4",
    "entity.updated",
    "tf-proj-training",
    ownerInstant(addDays(TODAY, -45), 10, 0),
  );
}

/** The heavy day: the caps and the "+n more" behaviour under real pressure. */
function heavy() {
  baseSpine();
  goal("tf-goal-ship", "Ship DalyHub V2");
  goal("tf-goal-fitness", "Run a half-marathon");
  goal("tf-goal-finance", "Rebuild the emergency fund");

  project("tf-proj-today", "Today screen redesign", { goal: "tf-goal-ship" });
  project("tf-proj-migration", "Data migration");
  project("tf-proj-house", "Kitchen renovation", { areaId: "tf-area-home" });
  // Two goals with structure under them but no recent Task activity, so the
  // EXISTING alignment evaluator flags both. With the inbox, waiting and two
  // at-risk projects that is SIX candidates for a rail capped at five — the
  // only way to prove the cap is to overflow it.
  project("tf-proj-hiring", "Hire a designer", { goal: "tf-goal-finance" });
  project("tf-proj-training", "Base training block", {
    goal: "tf-goal-fitness",
  });
  task("tf-t-hiring-1", "Write the role brief", { project: "tf-proj-hiring" });
  task("tf-t-training-1", "Long run", { project: "tf-proj-training" });

  const overdue = [
    ["Send the quarterly summary", 2],
    ["Renew the domain certificate", 5],
    ["Close out the incident report", 8],
    ["Chase the invoice", 11],
    ["Update the disaster-recovery doc", 20],
  ];
  overdue.forEach(([title, ago], index) => {
    task(`tf-t-od-${index}`, title, {
      due: addDays(TODAY, -ago),
      priority: index < 2 ? "p1" : null,
      project: index % 2 === 0 ? "tf-proj-migration" : "tf-proj-today",
    });
  });

  const due = [
    "Draft the release notes",
    "Review the accessibility audit",
    "Book the dentist",
    "Reply to the supplier quote",
    "Update the deployment checklist",
    "Prepare the board pack",
    "Refactor the token generator",
    "Confirm the venue",
    "Order the replacement laptop",
    "Write the migration runbook",
    "Triage the bug backlog",
    "Send the weekly digest",
  ];
  due.forEach((title, index) => {
    task(`tf-t-due-${index}`, title, {
      due: TODAY,
      project:
        index % 3 === 0
          ? "tf-proj-today"
          : index % 3 === 1
            ? "tf-proj-migration"
            : null,
      priority: index === 0 ? "p1" : null,
    });
  });

  ["Clear the inbox", "Stand-up notes"].forEach((title, index) => {
    task(`tf-t-done-${index}`, title, {
      due: TODAY,
      completedAt: ownerInstant(TODAY, 7 + index, 30),
      project: "tf-proj-today",
    });
  });

  task("tf-t-wait-1", "Legal sign-off on the contract", {
    waitingSince: ownerInstant(addDays(TODAY, -16), 9, 0),
    project: "tf-proj-migration",
  });
  task("tf-t-wait-2", "Supplier delivery date", {
    waitingSince: ownerInstant(addDays(TODAY, -3), 14, 0),
    project: "tf-proj-house",
  });
  task("tf-t-inbox-1", "Idea: weekly review template", { area: null });
  task("tf-t-inbox-2", "Ask Sam about the offsite", { area: null });
  task("tf-t-inbox-3", "Look into the new laptop stand", { area: null });

  meeting("tf-m-1", "Design review", {
    hour: 9,
    minute: 0,
    mode: "in_person",
    location: "Studio",
  });
  meeting("tf-m-2", "1:1 with Sam", { hour: 11, minute: 0 });
  meeting("tf-m-3", "Migration planning", { hour: 13, minute: 30 });
  meeting("tf-m-4", "Board update", { hour: 16, minute: 0 });

  activity(
    "tf-a-1",
    "task.completed",
    "tf-t-done-1",
    ownerInstant(TODAY, 8, 30),
    ["tf-proj-today"],
  );
  activity(
    "tf-a-2",
    "entity.updated",
    "tf-proj-migration",
    ownerInstant(addDays(TODAY, -1), 16, 0),
  );
  activity(
    "tf-a-3",
    "entity.updated",
    "tf-proj-house",
    ownerInstant(addDays(TODAY, -30), 10, 0),
  );
  activity(
    "tf-a-4",
    "entity.updated",
    "tf-proj-hiring",
    ownerInstant(addDays(TODAY, -40), 10, 0),
  );
  activity(
    "tf-a-5",
    "entity.updated",
    "tf-proj-training",
    ownerInstant(addDays(TODAY, -50), 10, 0),
  );
}

/** The empty day: nothing planned, nothing overdue, nothing needing attention. */
function empty() {
  baseSpine();
}

/**
 * UIX-02 — the GALLERY day: enough Areas and Projects to judge a gallery by eye.
 *
 * The `typical` day is specified against the Today screen's conditional
 * rendering, and it holds two Areas and four Projects. That is the right dataset
 * for Today and the wrong one for a Projects/Areas redesign: six accents cannot
 * be reviewed over four records, a three- or four-column grid cannot be reviewed
 * over a single row of cards, and "does the eye track identity down the grid"
 * has no answer at that size.
 *
 * So this scenario seeds SIX Areas — the full width of the ADR-068 accent ramp,
 * each with its own chosen icon — and eight Projects positioned to cover every
 * branch the two surfaces actually render:
 *
 *   - each workflow status (`planned`, `active`, `on_hold`) and a completed one;
 *   - each health state the evaluator can reach (`at_risk` via overdue work,
 *     `stale` via aged activity, `blocked` via all-waiting open work,
 *     `on_track`);
 *   - progress at 0%, part-way and near-complete, plus a Project with no tasks
 *     at all, which is the "absence is not 0%" case;
 *   - a Project under a Goal and Projects directly under an Area, so both parent
 *     context lines render;
 *   - one Area with no work at all, which is the calm end of the Areas list.
 *
 * Nothing here is invented for the picture: every fact is a row the product
 * already reads, and every derived signal (health, progress, momentum) is
 * computed by the same evaluators production uses.
 */
function gallery() {
  // Areas are the one spine type `parkExisting` leaves alone, because Today
  // never lists them — and the shared dev seed holds a dozen lifecycle-test
  // Areas ("Blocked Delete Area", "Pagination", …) that are invisible on Today
  // and would be most of the page here. Parking them uses the SAME reversible
  // sentinel, so `restore` brings them back with everything else.
  push(
    `UPDATE entities SET deleted_at = ${q(PARK_SENTINEL)} WHERE workspace_id = ${ws} AND type = 'area' AND deleted_at IS NULL;`,
  );

  // Six Areas, in creation order — which is the order the stable colour rank is
  // assigned in, so the ramp is exercised end to end rather than by chance.
  area("tf-area-health", "Health & Fitness", { iconKey: "target" });
  area("tf-area-learning", "Learning & Development", { iconKey: "idea" });
  area("tf-area-work", "Work & Career", { iconKey: "document" });
  area("tf-area-home", "Home & Property", { iconKey: "property" });
  area("tf-area-finance", "Finance", { iconKey: "subscription" });
  area("tf-area-travel", "Travel", { iconKey: "travel" });

  goal("tf-goal-ship", "Ship DalyHub V2", { areaId: "tf-area-work" });
  goal("tf-goal-fitness", "Run a half-marathon", {
    areaId: "tf-area-health",
  });

  /* ---- Work & Career -------------------------------------------------- */

  // AT RISK: overdue open work. Part-way progress.
  project("tf-proj-oppo", "OPPO Program Redesign", {
    areaId: "tf-area-work",
    iconKey: "board",
  });
  task("tf-t-oppo-1", "Review the pathway structure", {
    project: "tf-proj-oppo",
    due: addDays(TODAY, -3),
    priority: "p1",
  });
  task("tf-t-oppo-2", "Finalise the direct-entry model", {
    project: "tf-proj-oppo",
    due: addDays(TODAY, -1),
  });
  task("tf-t-oppo-3", "Update the issues paper", {
    project: "tf-proj-oppo",
    due: addDays(TODAY, 2),
  });
  for (const [i, title] of [
    "Draft the consultation brief",
    "Map the current cohort",
    "Agree the assessment rubric",
    "Confirm the delivery window",
    "Book the review workshop",
  ].entries()) {
    task(`tf-t-oppo-done-${i + 1}`, title, {
      project: "tf-proj-oppo",
      completedAt: ownerInstant(addDays(TODAY, -(i + 2)), 11, 0),
    });
  }

  // ON TRACK, under a Goal, and the most-complete Project on the page.
  project("tf-proj-dalyhub", "DalyHub Development", {
    goal: "tf-goal-ship",
    iconKey: "software",
  });
  task("tf-t-dh-1", "Redesign the Projects gallery", {
    project: "tf-proj-dalyhub",
    due: addDays(TODAY, 3),
  });
  task("tf-t-dh-2", "Write the design-system note", {
    project: "tf-proj-dalyhub",
    due: addDays(TODAY, 5),
  });
  for (const [i, title] of [
    "Redesign Today",
    "Redesign the task row",
    "Generate the accent ramps",
    "Ship the capture sheet",
    "Rebuild the shell",
    "Move search into the top bar",
  ].entries()) {
    task(`tf-t-dh-done-${i + 1}`, title, {
      project: "tf-proj-dalyhub",
      completedAt: ownerInstant(addDays(TODAY, -(i + 1)), 15, 0),
    });
  }

  // STALE: open work, no meaningful activity for three weeks.
  project("tf-proj-migration", "Records Migration", {
    areaId: "tf-area-work",
    iconKey: "archive",
    updatedAt: ownerInstant(addDays(TODAY, -24), 10, 0),
  });
  task("tf-t-mig-1", "Reconcile the legacy export", {
    project: "tf-proj-migration",
    priority: "p1",
  });
  task("tf-t-mig-2", "Write the rollback plan", {
    project: "tf-proj-migration",
  });
  task("tf-t-mig-done-1", "Agree the cutover window", {
    project: "tf-proj-migration",
    completedAt: ownerInstant(addDays(TODAY, -26), 9, 0),
  });

  /* ---- Learning & Development ----------------------------------------- */

  // BLOCKED: every open task is waiting on somebody else.
  project("tf-proj-rfs", "NSW RFS Learning", {
    areaId: "tf-area-learning",
    iconKey: "shield",
  });
  task("tf-t-rfs-1", "Accreditation sign-off", {
    project: "tf-proj-rfs",
    waitingSince: ownerInstant(addDays(TODAY, -18), 9, 0),
    waitingNote: "With the training officer",
  });
  task("tf-t-rfs-2", "Venue confirmation", {
    project: "tf-proj-rfs",
    waitingSince: ownerInstant(addDays(TODAY, -4), 9, 0),
  });
  for (const [i, title] of [
    "Complete the online modules",
    "Book the practical day",
    "Submit the prerequisites",
  ].entries()) {
    task(`tf-t-rfs-done-${i + 1}`, title, {
      project: "tf-proj-rfs",
      completedAt: ownerInstant(addDays(TODAY, -(i + 3)), 13, 0),
    });
  }

  // PLANNED: real structure, not started. Progress is genuinely 0%.
  project("tf-proj-platform", "Learning Platform Review", {
    areaId: "tf-area-learning",
    status: "planned",
    iconKey: "checklist",
  });
  task("tf-t-plat-1", "Shortlist the candidates", {
    project: "tf-proj-platform",
  });
  task("tf-t-plat-2", "Draft the evaluation criteria", {
    project: "tf-proj-platform",
  });

  /* ---- Health & Fitness ------------------------------------------------ */

  project("tf-proj-training", "Base Training Block", {
    goal: "tf-goal-fitness",
    iconKey: "today",
  });
  task("tf-t-train-1", "Long run", {
    project: "tf-proj-training",
    due: addDays(TODAY, 1),
  });
  task("tf-t-train-2", "Strength session", {
    project: "tf-proj-training",
    due: addDays(TODAY, 4),
  });
  for (const [i, title] of [
    "Week 1 base miles",
    "Week 2 base miles",
    "Threshold test",
  ].entries()) {
    task(`tf-t-train-done-${i + 1}`, title, {
      project: "tf-proj-training",
      completedAt: ownerInstant(addDays(TODAY, -(i + 1)), 7, 30),
    });
  }

  /* ---- Home & Property ------------------------------------------------- */

  // ON HOLD, deliberately paused — no health warning, by the shared rule.
  project("tf-proj-kitchen", "Kitchen Renovation", {
    areaId: "tf-area-home",
    status: "on_hold",
    iconKey: "appliance",
  });
  task("tf-t-kitchen-1", "Re-quote the joinery", {
    project: "tf-proj-kitchen",
  });
  task("tf-t-kitchen-done-1", "Measure the run", {
    project: "tf-proj-kitchen",
    completedAt: ownerInstant(addDays(TODAY, -30), 10, 0),
  });

  // NO TASKS AT ALL — the "absence is not 0%" case the card must not draw as a
  // bar sitting at zero.
  project("tf-proj-garden", "Garden Reset", {
    areaId: "tf-area-home",
    status: "planned",
    iconKey: "folder",
  });

  /* ---- Finance --------------------------------------------------------- */

  project("tf-proj-insurance", "Insurance Review", {
    areaId: "tf-area-finance",
    iconKey: "licence",
  });
  task("tf-t-ins-1", "Compare the home policies", {
    project: "tf-proj-insurance",
    due: addDays(TODAY, 6),
  });
  task("tf-t-ins-done-1", "Gather the renewal notices", {
    project: "tf-proj-insurance",
    completedAt: ownerInstant(addDays(TODAY, -2), 12, 0),
  });

  /* ---- Direct Area tasks, and one Area with nothing running ------------ */

  task("tf-t-area-health-1", "Book the physio", {
    area: "tf-area-health",
    due: TODAY,
  });
  task("tf-t-area-home-1", "Service the hot water system", {
    area: "tf-area-home",
    due: addDays(TODAY, 5),
  });
  // Travel deliberately holds nothing: the calm end of the Areas list, and the
  // surface that must not manufacture a metric to fill the row.

  /* ---- Real activity recency, so momentum is an honest signal ---------- */

  activity(
    "tf-a-oppo",
    "task.completed",
    "tf-t-oppo-done-1",
    ownerInstant(addDays(TODAY, -2), 11, 0),
    ["tf-proj-oppo"],
  );
  activity(
    "tf-a-dh",
    "task.completed",
    "tf-t-dh-done-1",
    ownerInstant(addDays(TODAY, -1), 15, 0),
    ["tf-proj-dalyhub"],
  );
  activity(
    "tf-a-mig",
    "entity.updated",
    "tf-proj-migration",
    ownerInstant(addDays(TODAY, -24), 10, 0),
  );
  activity(
    "tf-a-rfs",
    "task.completed",
    "tf-t-rfs-done-1",
    ownerInstant(addDays(TODAY, -3), 13, 0),
    ["tf-proj-rfs"],
  );
  activity(
    "tf-a-train",
    "task.completed",
    "tf-t-train-done-1",
    ownerInstant(addDays(TODAY, -1), 7, 30),
    ["tf-proj-training"],
  );
  activity(
    "tf-a-ins",
    "task.completed",
    "tf-t-ins-done-1",
    ownerInstant(addDays(TODAY, -2), 12, 0),
    ["tf-proj-insurance"],
  );
}

/**
 * UIX-03 — the GOALS day: one Goal for every branch the progress engine has.
 *
 * The `gallery` scenario seeds Areas and Projects, and its two Goals carry no
 * measurement at all — the right dataset for judging a Projects gallery and the
 * wrong one for judging a Goals gallery, where the whole question is whether a
 * measurable outcome reads at a glance. So this scenario seeds NINE Goals chosen
 * to cover each distinct thing the evaluator can conclude, rather than nine
 * variations on "in progress":
 *
 *   - DECREASING with history and an honest mid-series backslide (weight);
 *   - INCREASING currency, comfortably ahead of its own schedule (savings);
 *   - ACCUMULATION behind its schedule, i.e. the "Needs attention" card (books);
 *   - MILESTONE, part-complete, which is the only type with no readings at all;
 *   - TARGET EXCEEDED, so the bar caps at 100% while the value keeps its truth;
 *   - CONFIGURED BUT NOT STARTED, which must not paint a 0% bar;
 *   - a STALE Goal, measured once months ago;
 *   - a COMPLETED Goal, so the finished state is on the page;
 *   - a LEGACY QUALITATIVE Goal with no measurement, which is every Goal that
 *     existed before GOAL-02 and must still render with dignity.
 *
 * Every figure is a row the product reads. Nothing here is a display string:
 * the percentages, the statuses and the trends in the screenshots are all
 * computed by the same kernel evaluator production runs.
 */
function goals() {
  // Areas are parked for the same reason `gallery` parks them: the shared dev
  // seed's lifecycle-test Areas would otherwise be most of the identity on the
  // page. Reversible through the same sentinel.
  push(
    `UPDATE entities SET deleted_at = ${q(PARK_SENTINEL)} WHERE workspace_id = ${ws} AND type = 'area' AND deleted_at IS NULL;`,
  );

  area("tf-area-health", "Health & Fitness", { iconKey: "target" });
  area("tf-area-finance", "Finance", { iconKey: "subscription" });
  area("tf-area-learning", "Learning & Development", { iconKey: "idea" });
  area("tf-area-home", "Home & Family", { iconKey: "property" });
  area("tf-area-work", "Work & Career", { iconKey: "document" });

  /*
   * The brief's own acceptance Goal. Started 61 days ago against a target date
   * 122 days out, so a third of the schedule has elapsed against 38% of the
   * distance covered — which is what makes "On track" a derived conclusion here
   * rather than a seeded label. The series dips and recovers (80.1 → 80.6) so
   * the chart has a real backslide to draw honestly.
   */
  goal("tf-goal-weight", "Reach 70 kg", {
    areaId: "tf-area-health",
    createdAt: ownerInstant(addDays(TODAY, -61), 8, 0),
    targetDate: addDays(TODAY, 122),
    definitionOfDone:
      "Sustainably at 70 kg, holding it for a month without tracking every meal.",
    measurementType: "target_value",
    unit: "kg",
    baselineValue: 85,
    targetValue: 70,
    measurements: [
      [85.0, -61],
      [83.4, -54],
      [82.1, -47],
      [81.2, -38],
      [80.1, -31, "Held steady through a travel week."],
      [80.6, -24],
      [79.8, -17],
      [79.5, -9],
      [79.3, -2],
    ],
  });

  /* Increasing, currency-formatted, and ahead of its own straight line. */
  goal("tf-goal-savings", "Save $15,000 emergency fund", {
    areaId: "tf-area-finance",
    createdAt: ownerInstant(addDays(TODAY, -90), 8, 0),
    targetDate: addDays(TODAY, 210),
    definitionOfDone:
      "Six months of essential expenses, in the offset account.",
    measurementType: "target_value",
    unit: "$",
    baselineValue: 0,
    targetValue: 15000,
    measurements: [
      [0, -90],
      [1200, -76],
      [2650, -62],
      [3900, -45],
      [5300, -31],
      [6100, -18],
      [7240, -4],
    ],
  });

  /*
   * Accumulation, and deliberately BEHIND: 42% of the reading done with 83% of
   * the year gone. This is the Goal that proves "Needs attention" is derived
   * from the owner's own schedule and not from a mood.
   */
  goal("tf-goal-books", "Read 12 books", {
    areaId: "tf-area-learning",
    createdAt: ownerInstant(addDays(TODAY, -150), 8, 0),
    targetDate: addDays(TODAY, 30),
    definitionOfDone: "Twelve finished — started-and-abandoned does not count.",
    measurementType: "accumulation",
    unit: "books",
    baselineValue: 0,
    targetValue: 12,
    measurements: [
      [1, -132],
      [2, -104],
      [3, -80],
      [4, -47],
      [5, -21],
    ],
  });

  /* The one type with no readings: progress comes from completed stages. */
  goal("tf-goal-halfmarathon", "Run a half-marathon", {
    areaId: "tf-area-health",
    createdAt: ownerInstant(addDays(TODAY, -70), 8, 0),
    targetDate: addDays(TODAY, 96),
    definitionOfDone: "Finish the September half, running the whole way.",
    measurementType: "milestone",
    milestones: [
      ["Run 5 km without stopping", -56],
      ["Run 10 km without stopping", -21],
      ["Run 15 km", null],
      ["Run 18 km", null],
      ["Race day", null],
    ],
  });

  /* Over target: 1,130 km against 1,000. The bar caps; the value does not. */
  goal("tf-goal-walk", "Walk 1,000 km this year", {
    areaId: "tf-area-health",
    createdAt: ownerInstant(addDays(TODAY, -190), 8, 0),
    targetDate: addDays(TODAY, 40),
    definitionOfDone: "A thousand kilometres on foot, cumulative.",
    measurementType: "accumulation",
    unit: "km",
    baselineValue: 0,
    targetValue: 1000,
    measurements: [
      [210, -160],
      [430, -120],
      [620, -85],
      [810, -50],
      [975, -20],
      [1130, -3],
    ],
  });

  /* Configured, nothing recorded. Must render an invitation, never a 0% bar. */
  goal("tf-goal-screen", "Cut screen time to 90 minutes a day", {
    areaId: "tf-area-home",
    createdAt: ownerInstant(addDays(TODAY, -9), 8, 0),
    targetDate: addDays(TODAY, 84),
    definitionOfDone: "Ninety minutes of non-work screen time on a weekday.",
    measurementType: "target_value",
    unit: "minutes",
    baselineValue: 165,
    targetValue: 90,
  });

  /* Measured once, months ago — "No recent update", which is not a judgement. */
  goal("tf-goal-spanish", "Reach B1 Spanish", {
    areaId: "tf-area-learning",
    createdAt: ownerInstant(addDays(TODAY, -220), 8, 0),
    targetDate: addDays(TODAY, 150),
    definitionOfDone: "Hold a fifteen-minute conversation without switching.",
    measurementType: "manual",
    measurements: [
      [20, -190],
      [35, -96],
    ],
  });

  /* Finished, and explicitly completed — the dignified end state. */
  goal("tf-goal-deposit", "Save the house deposit", {
    areaId: "tf-area-finance",
    createdAt: ownerInstant(addDays(TODAY, -320), 8, 0),
    targetDate: addDays(TODAY, -12),
    definitionOfDone: "Twenty per cent, plus costs.",
    measurementType: "target_value",
    unit: "$",
    baselineValue: 0,
    targetValue: 60000,
    completedAt: ownerInstant(addDays(TODAY, -12), 17, 0),
    measurements: [
      [18000, -280],
      [31500, -200],
      [44000, -120],
      [55200, -48],
      [60400, -14],
    ],
  });

  /*
   * The legacy Goal: no measurement, no numbers, and genuinely not measurable.
   * Its story is its definition of done and the work underneath it, and the
   * redesign has to make that a dignified card rather than an empty one.
   */
  goal("tf-goal-family", "Be more present with the kids", {
    areaId: "tf-area-home",
    createdAt: ownerInstant(addDays(TODAY, -40), 8, 0),
    targetDate: null,
    definitionOfDone:
      "Phone in the drawer between school pick-up and bedtime, most days.",
  });

  /* ---- Supporting work, so the relationship sections have real content --- */

  project("tf-proj-nutrition", "Rebuild eating habits", {
    goal: "tf-goal-weight",
    iconKey: "target",
  });
  task("tf-t-nut-1", "Plan next week's dinners", {
    project: "tf-proj-nutrition",
    due: addDays(TODAY, 1),
  });
  task("tf-t-nut-2", "Restock the pantry staples", {
    project: "tf-proj-nutrition",
    due: addDays(TODAY, 3),
  });
  for (const [i, title] of [
    "Set up the food diary",
    "Book the dietitian",
    "Clear the treat cupboard",
  ].entries()) {
    task(`tf-t-nut-done-${i + 1}`, title, {
      project: "tf-proj-nutrition",
      completedAt: ownerInstant(addDays(TODAY, -(i + 2)), 10, 0),
    });
  }
  activity(
    "tf-act-nut-1",
    "task.completed",
    "tf-t-nut-done-1",
    ownerInstant(addDays(TODAY, -2), 10, 0),
    ["tf-proj-nutrition"],
  );

  project("tf-proj-training", "Build a running base", {
    goal: "tf-goal-weight",
    iconKey: "board",
  });
  task("tf-t-run-1", "Thursday interval session", {
    project: "tf-proj-training",
    due: addDays(TODAY, 2),
  });
  task("tf-t-run-done-1", "Buy new shoes", {
    project: "tf-proj-training",
    completedAt: ownerInstant(addDays(TODAY, -5), 9, 0),
  });

  project("tf-proj-budget", "Tighten the monthly budget", {
    goal: "tf-goal-savings",
    iconKey: "subscription",
  });
  task("tf-t-bud-1", "Cancel the unused subscriptions", {
    project: "tf-proj-budget",
    due: addDays(TODAY, 4),
  });

  project("tf-proj-reading", "Reading habit", {
    goal: "tf-goal-books",
    iconKey: "idea",
  });
  task("tf-t-read-1", "Twenty minutes before bed", {
    project: "tf-proj-reading",
  });

  project("tf-proj-family", "Evening routine", {
    goal: "tf-goal-family",
    iconKey: "property",
  });
  task("tf-t-fam-1", "Agree the phone-in-the-drawer rule", {
    project: "tf-proj-family",
    due: addDays(TODAY, 5),
  });
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

const SCENARIOS = {
  typical: () => typical({ completedToday: 3 }),
  morning: () => typical({ completedToday: 0 }),
  heavy,
  empty,
  gallery,
  goals,
};

const scenario = process.argv[2] ?? "typical";

if (scenario === "restore") {
  clearFixtures();
  push(
    `UPDATE entities SET deleted_at = NULL WHERE workspace_id = ${ws} AND deleted_at = ${q(PARK_SENTINEL)};`,
  );
} else {
  const build = SCENARIOS[scenario];
  if (!build) {
    console.error(
      `Unknown scenario '${scenario}'. Use one of: ${Object.keys(SCENARIOS).join(", ")}, restore.`,
    );
    process.exit(1);
  }
  clearFixtures();
  push(
    `UPDATE entities SET deleted_at = NULL WHERE workspace_id = ${ws} AND deleted_at = ${q(PARK_SENTINEL)};`,
  );
  parkExisting();
  build();
}

/**
 * One `wrangler` invocation for the whole scenario, so it lands as ONE
 * transaction: a half-applied day is worse than no day at all.
 *
 * `--step` runs the statements one at a time instead, which is slow and NOT
 * atomic — it exists only to name the offending statement when a constraint
 * fails, because a single-command failure reports the first line and nothing
 * more.
 */
function run(sql) {
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--command", sql],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

if (process.argv.includes("--step")) {
  for (const statement of statements) {
    try {
      run(statement);
    } catch {
      console.error(`FAILED: ${statement}`);
      process.exit(1);
    }
  }
} else {
  run(statements.join("\n"));
}

console.log(
  scenario === "restore"
    ? "Today fixtures cleared; parked records restored."
    : `Today fixture '${scenario}' seeded for owner day ${TODAY}.`,
);
