/**
 * DS-05…DS-08 — the DESIGN fixture for the local database.
 *
 * A visual convergence pass is judged by looking at the screen, and a screen with
 * nothing on it cannot be judged. The shared E2E seed is deliberately the small
 * deterministic spine the journeys assert on, so on it Analytics reads "nothing
 * completed", Meetings reads "0 Meetings", Diary is empty and every Goal is "Not
 * measured" — four of the surfaces this pass exists to redesign, invisible.
 *
 * This adds the CONTENT those surfaces need, positioned RELATIVE to today so the
 * same command produces the same-shaped screen on any date:
 *
 *   - four MEASURABLE Goals (numeric and milestone) with real reading histories
 *   - tasks completed across the last fourteen days, so a trend has a shape
 *   - today's and this week's tasks, so Today is a working day rather than a void
 *   - meetings behind and ahead of now
 *   - a fortnight of Diary entries
 *
 * Local-only: it talks to the Miniflare D1 through `wrangler d1 execute --local`,
 * exactly like `e2e/setup-local-db.mjs`. It never touches a remote database, it is
 * not part of the gate, and every id it writes carries the `dsf-` prefix so
 * `--clear` removes precisely what it added and nothing else.
 *
 *   node scripts/ds-final-seed.mjs
 *   node scripts/ds-final-seed.mjs --clear
 */
import { execFileSync } from "node:child_process";

const WORKSPACE = "local-dev-workspace";
const PREFIX = "dsf-";
const TZ = "Australia/Melbourne";

const clearing = process.argv.includes("--clear");

/** Run one SQL batch against the LOCAL D1. */
function sql(statements) {
  const command = statements.filter(Boolean).join("\n");
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

const q = (value) =>
  value === null || value === undefined
    ? "NULL"
    : `'${String(value).replace(/'/g, "''")}'`;

/* -- Dates, all relative to the machine's today ---------------------------- */

const now = new Date();
const iso = (date) => date.toISOString();
const day = (offset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d;
};
/** An owner-calendar date, `YYYY-MM-DD`. */
const cal = (offset) => day(offset).toISOString().slice(0, 10);
/** An instant on a day at a given hour. */
const at = (offset, hour) => {
  const d = day(offset);
  d.setUTCHours(hour, 0, 0, 0);
  return iso(d);
};

const STAMP = iso(now);

/* -- Clear ----------------------------------------------------------------- */

/*
 * The clear runs in DEPENDENCY ORDER, and every table the seed writes has to be
 * in it.
 *
 * Each detail slice, the spine and the activity join all hold a foreign key onto
 * `entities` with `ON DELETE RESTRICT`, so a single missing table does not
 * produce a partial clear — it refuses the `entities` delete outright, and D1
 * reports the failure against the FIRST statement of the batch rather than the
 * one that caused it. `area_details` was missing, which is why the first fix to
 * this block appeared not to work at all.
 */
if (clearing) {
  sql([
    `DELETE FROM goal_measurements WHERE workspace_id = ${q(WORKSPACE)} AND id LIKE '${PREFIX}%';`,
    `DELETE FROM goal_milestones WHERE workspace_id = ${q(WORKSPACE)} AND id LIKE '${PREFIX}%';`,
    `DELETE FROM area_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM meeting_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM diary_entry_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM task_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM note_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM project_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM goal_details WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM entity_links WHERE workspace_id = ${q(WORKSPACE)}
       AND (id LIKE '${PREFIX}%' OR source_entity_id LIKE '${PREFIX}%' OR target_entity_id LIKE '${PREFIX}%');`,
    /*
     * Activity, and the ORDER matters. `activity_subjects` holds a composite
     * foreign key onto `activities` with `ON DELETE RESTRICT`, so the subjects go
     * first or the parent delete is refused.
     *
     * Matched on `activities.id`, not on an `entity_id` column: `activities` has
     * none (`migrations/0004` — id, workspace_id, type, actor_type, actor_id,
     * occurred_at, payload_json), and the subject is a row in the join table.
     * The first version of this line addressed `activities.entity_id` and was
     * simply invalid SQL, which nothing caught because `--clear` was documented
     * and never run.
     */
    `DELETE FROM activity_subjects WHERE workspace_id = ${q(WORKSPACE)} AND activity_id LIKE '${PREFIX}%';`,
    `DELETE FROM activities WHERE workspace_id = ${q(WORKSPACE)} AND id LIKE '${PREFIX}%';`,
    `DELETE FROM spine_records WHERE workspace_id = ${q(WORKSPACE)} AND entity_id LIKE '${PREFIX}%';`,
    `DELETE FROM entities WHERE workspace_id = ${q(WORKSPACE)} AND id LIKE '${PREFIX}%';`,
  ]);
  process.stdout.write("DS-final design fixture cleared.\n");
  process.exit(0);
}

/* -- Builders -------------------------------------------------------------- */

const statements = [];
let seq = 0;
const stamp = () => {
  seq += 1;
  const d = new Date(now.getTime() - (900 - seq) * 1000);
  return iso(d);
};

/*
 * Every write here is a real UPSERT (`ON CONFLICT … DO UPDATE`), never
 * `INSERT OR REPLACE`. Replace is a DELETE followed by an INSERT, and the spine's
 * foreign keys are `ON DELETE RESTRICT` — so on the SECOND run of this script
 * every entity that already had a `spine_records` row failed the constraint. An
 * upsert leaves the row's identity alone and rewrites its columns, which is what
 * "idempotent" has to mean against a schema that protects its own references.
 */
function entity(id, type, title, createdAt = stamp()) {
  statements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${q(id)}, ${q(WORKSPACE)}, ${q(type)}, ${q(title)}, ${q(createdAt)}, ${q(createdAt)}, NULL)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at, deleted_at = NULL;`,
  );
}

function spine(id, kind, completedAt = null) {
  statements.push(
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, ${q(kind)}, ${q(completedAt)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET completed_at = excluded.completed_at;`,
  );
}

/**
 * One Activity event, with its subject.
 *
 * Completion COUNTS — Analytics' series, Reviews' insights — are read from the
 * Activity stream (`activities` JOIN `activity_subjects`), never from
 * `spine_records.completed_at`: the spine holds the record's CURRENT state, and
 * the stream holds when it changed, which is the only one of the two a trend can
 * be built from. A fixture that sets `completed_at` alone therefore produces a
 * workspace full of finished work and an Analytics screen reading "nothing
 * completed in this period", which is exactly what the first run of this script
 * did.
 */
function activity(id, type, entityId, occurredAt) {
  statements.push(
    `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
     VALUES (${q(PREFIX + id)}, ${q(WORKSPACE)}, ${q(type)}, 'owner', 'local-dev-owner', ${q(occurredAt)}, '{}')
     ON CONFLICT (id) DO UPDATE SET occurred_at = excluded.occurred_at;`,
  );
  statements.push(
    `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
     VALUES (${q(WORKSPACE)}, ${q(PREFIX + id)}, ${q(entityId)}, 'subject')
     ON CONFLICT (workspace_id, activity_id, entity_id) DO NOTHING;`,
  );
}

function link(id, source, target, type) {
  statements.push(
    `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     VALUES (${q(PREFIX + id)}, ${q(WORKSPACE)}, ${q(source)}, ${q(target)}, ${q(type)}, ${q(STAMP)}, ${q(STAMP)}, NULL)
     ON CONFLICT (id) DO UPDATE SET target_entity_id = excluded.target_entity_id,
       type = excluded.type, updated_at = excluded.updated_at, deleted_at = NULL;`,
  );
}

/* -- Areas ----------------------------------------------------------------- */

/*
 * IDENTITY-01 — the fixture exists to be JUDGED AS A GRID.
 *
 * A ramp cannot be assessed one card at a time: the questions it has to answer
 * are "are these sixteen distinguishable?", "does amber survive on a near-white
 * tile?", "does dark read as identity or as a rainbow?". So the Areas and
 * Projects below carry CHOSEN slots across the ramp — including the three §5
 * flagged as contrast edge cases (amber, lime, sky) — and several deliberately
 * carry none, so the derived fallback is visible in the same screenshot as the
 * chosen ones and a reviewer can see that an unchosen record looks exactly as it
 * did before.
 *
 * `[id, title, iconKey, colourSlot]`. A `null` slot means "chose nothing".
 */
const AREAS = [
  ["area-health", "Health & Fitness", "heart", "green"],
  ["area-work", "Work", "briefcase", "violet"],
  ["area-home", "Home", "property", "amber"],
  ["area-growth", "Learning", "book", null],
];
for (const [suffix, title, iconKey, colourSlot] of AREAS) {
  const id = PREFIX + suffix;
  entity(id, "area", title);
  spine(id, "area");
  statements.push(
    `INSERT INTO area_details (workspace_id, entity_id, entity_type, archived_at, icon_key, colour_slot, updated_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, 'area', NULL, ${q(iconKey)}, ${q(colourSlot)}, ${q(STAMP)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
       icon_key = excluded.icon_key,
       colour_slot = excluded.colour_slot,
       updated_at = excluded.updated_at;`,
  );
}

/* -- Goals — the four the concept draws, all genuinely measurable ---------- */

/**
 * Each goal states a baseline, a target, a direction and a real reading history,
 * so the progress a card renders is computed from stored data rather than
 * asserted by the fixture.
 */
const GOALS = [
  {
    suffix: "goal-weight",
    iconKey: "heart",
    // No colour of its own: it must inherit its Area's resolved identity.
    title: "Reach 78 kg",
    area: "area-health",
    unit: "kg",
    direction: "decrease",
    baseline: 92,
    target: 78,
    readings: [
      [-84, 92],
      [-70, 90.4],
      [-56, 89.1],
      [-42, 87.2],
      [-28, 85.6],
      [-14, 84.1],
      [-3, 83.0],
    ],
    targetDate: cal(120),
    dod: "Three consecutive weekly weigh-ins at or below 78 kg.",
  },
  {
    suffix: "goal-run",
    iconKey: "running",
    colour: "pink",
    title: "Run 10 km without stopping",
    area: "area-health",
    unit: "km",
    direction: "increase",
    baseline: 2,
    target: 10,
    readings: [
      [-60, 2],
      [-46, 3.5],
      [-32, 4.8],
      [-18, 6.2],
      [-7, 7.4],
      [-1, 8.1],
    ],
    targetDate: cal(75),
    dod: "One continuous 10 km run, recorded on the watch.",
  },
  {
    suffix: "goal-savings",
    iconKey: "savings",
    colour: "teal",
    title: "Build a $40k safety net",
    area: "area-work",
    unit: "$",
    type: "accumulation",
    direction: "increase",
    baseline: 6000,
    target: 40000,
    readings: [
      [-150, 6000],
      [-120, 9800],
      [-90, 14200],
      [-60, 18900],
      [-30, 22400],
      [-2, 25600],
    ],
    targetDate: cal(300),
    dod: "Forty thousand dollars held in the offset account.",
  },
  /*
   * REDESIGN-04 — a goal with exactly ONE reading. The measurement panel's
   * honesty rule ("one reading is not a trend") has to be visible in the
   * fixture, or the surface that states it can never be reviewed.
   */
  {
    suffix: "goal-sleep",
    iconKey: "sleep",
    // No colour of its own: it must inherit its Area's resolved identity.
    title: "Sleep seven hours a night",
    area: "area-health",
    unit: "h",
    direction: "increase",
    baseline: 5.9,
    target: 7,
    readings: [[-4, 6.1]],
    targetDate: cal(90),
    dod: "A fortnight averaging seven hours or more.",
  },
  /*
   * REDESIGN-04 — a goal with NO measurement configuration at all, so the
   * "invitation instead of a fabricated 0%" path is a real row on the screen.
   */
  {
    suffix: "goal-mentor",
    colour: "purple",
    title: "Mentor two junior engineers",
    area: "area-work",
    unmeasured: true,
    targetDate: null,
    dod: "Two people meeting fortnightly, with their own goals written down.",
  },
  {
    suffix: "goal-spanish",
    iconKey: "language",
    // No colour of its own: it must inherit its Area's resolved identity.
    title: "Hold a conversation in Spanish",
    area: "area-growth",
    milestones: [
      ["Finish the A1 course", true],
      ["Two hundred words of active vocabulary", true],
      ["First conversation with a tutor", true],
      ["Thirty minutes unscripted", false],
      ["A week in Madrid without English", false],
    ],
    targetDate: cal(210),
    dod: "Thirty unscripted minutes with a native speaker.",
  },
];

for (const goal of GOALS) {
  const id = PREFIX + goal.suffix;
  entity(id, "goal", goal.title);
  spine(id, "goal");
  link(`l-${goal.suffix}-area`, id, PREFIX + goal.area, "goal.belongs_to_area");

  // The controlled enum is `app/kernel/goals/goal-measurement.ts`; an
  // unrecognised value degrades to "not measured", which is silent.
  const measured = goal.unmeasured
    ? null
    : goal.milestones
      ? "milestone"
      : (goal.type ?? "target_value");
  statements.push(
    `INSERT INTO goal_details
       (workspace_id, entity_id, entity_type, target_date, definition_of_done,
        measurement_type, measurement_unit, measurement_direction, baseline_value, target_value,
        icon_key, colour_slot, updated_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, 'goal', ${q(goal.targetDate)}, ${q(goal.dod)},
       ${q(measured)}, ${q(goal.unit ?? null)}, ${q(goal.direction ?? null)},
       ${goal.baseline ?? "NULL"}, ${goal.target ?? "NULL"},
       ${q(goal.iconKey ?? null)}, ${q(goal.colour ?? null)}, ${q(STAMP)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET icon_key = excluded.icon_key,
       colour_slot = excluded.colour_slot, target_date = excluded.target_date,
       definition_of_done = excluded.definition_of_done, measurement_type = excluded.measurement_type,
       measurement_unit = excluded.measurement_unit, measurement_direction = excluded.measurement_direction,
       baseline_value = excluded.baseline_value, target_value = excluded.target_value, updated_at = excluded.updated_at;`,
  );

  for (const [offset, value] of goal.readings ?? []) {
    statements.push(
      `INSERT INTO goal_measurements
         (workspace_id, id, entity_id, entity_type, value, measured_on, note, created_at, updated_at)
       VALUES (${q(WORKSPACE)}, ${q(`${PREFIX}${goal.suffix}-m${Math.abs(offset)}`)}, ${q(id)}, 'goal',
         ${value}, ${q(cal(offset))}, NULL, ${q(at(offset, 8))}, ${q(at(offset, 8))})
       ON CONFLICT (workspace_id, id) DO UPDATE SET value = excluded.value, measured_on = excluded.measured_on, updated_at = excluded.updated_at;`,
    );
  }

  (goal.milestones ?? []).forEach(([title, done], index) => {
    statements.push(
      `INSERT INTO goal_milestones
         (workspace_id, id, entity_id, entity_type, title, weight, position, completed_at, created_at, updated_at)
       VALUES (${q(WORKSPACE)}, ${q(`${PREFIX}${goal.suffix}-ms${index}`)}, ${q(id)}, 'goal',
         ${q(title)}, 1, ${index}, ${done ? q(at(-30 + index * 7, 9)) : "NULL"}, ${q(STAMP)}, ${q(STAMP)})
       ON CONFLICT (workspace_id, id) DO UPDATE SET title = excluded.title, completed_at = excluded.completed_at, updated_at = excluded.updated_at;`,
    );
  });
}

/* -- Projects — a spread of health, staleness and progress ----------------- */

const PROJECTS = [
  {
    suffix: "proj-halfmarathon",
    colour: "lime",
    title: "Half-marathon training block",
    area: "area-health",
    goal: "goal-run",
    status: "active",
    icon: "target",
    done: 14,
    open: 6,
    overdue: 0,
  },
  {
    suffix: "proj-kitchen",
    colour: "orange",
    title: "Kitchen fit-out",
    area: "area-home",
    status: "active",
    icon: "property",
    done: 9,
    open: 11,
    overdue: 3,
  },
  {
    suffix: "proj-dalyhub",
    colour: "blue",
    title: "Ship DalyHub V2",
    area: "area-work",
    status: "active",
    icon: "software",
    done: 22,
    open: 8,
    overdue: 1,
  },
  {
    suffix: "proj-offset",
    colour: "emerald",
    title: "Refinance and offset setup",
    area: "area-work",
    goal: "goal-savings",
    status: "active",
    icon: "document",
    done: 4,
    open: 3,
    overdue: 0,
  },
  {
    suffix: "proj-spanish",
    colour: "sky",
    title: "Spanish A2 course",
    area: "area-growth",
    goal: "goal-spanish",
    status: "active",
    icon: "idea",
    done: 11,
    open: 9,
    overdue: 0,
  },
  {
    suffix: "proj-garden",
    colour: "brown",
    title: "Back garden rebuild",
    area: "area-home",
    status: "planned",
    icon: "tool",
    done: 0,
    open: 5,
    overdue: 0,
  },
  {
    suffix: "proj-website",
    colour: "fuchsia",
    title: "Consultancy site relaunch",
    area: "area-work",
    status: "active",
    icon: "board",
    done: 6,
    open: 4,
    overdue: 0,
  },
  {
    suffix: "proj-move",
    colour: "cyan",
    title: "Studio move",
    area: "area-home",
    status: "on_hold",
    icon: "travel",
    done: 12,
    open: 0,
    overdue: 0,
    completed: true,
  },
  /*
   * REDESIGN-04 — two ARCHIVED projects, so the collection's "N active · N
   * archived" count line and the Archived lifecycle tab are exercised against
   * real rows rather than an empty segment.
   */
  {
    suffix: "proj-archive-crm",
    // Deliberately unchosen: the derived fallback must be visible in the
    // SAME screenshot as the chosen ones.
    colour: null,
    title: "CRM migration",
    area: "area-work",
    status: "on_hold",
    icon: "document",
    done: 7,
    open: 2,
    overdue: 0,
    archived: true,
  },
  {
    suffix: "proj-archive-loft",
    colour: "rose",
    title: "Loft insulation",
    area: "area-home",
    status: "planned",
    icon: "property",
    done: 3,
    open: 1,
    overdue: 0,
    archived: true,
  },
];

let taskSeq = 0;
const TASK_VERBS = [
  "Draft",
  "Review",
  "Confirm",
  "Order",
  "Book",
  "Call",
  "Send",
  "Plan",
  "Chase",
  "Measure",
  "Schedule",
  "Write up",
  "Compare",
  "File",
  "Prepare",
];
const TASK_NOUNS = [
  "the supplier quote",
  "the week's sessions",
  "the invoice",
  "the bench template",
  "the tiler",
  "the rate offer",
  "the vocabulary set",
  "the risk register",
  "the delivery date",
  "the running plan",
  "the drainage survey",
  "the copy deck",
  "the insurance renewal",
  "the sprint notes",
  "the physio appointment",
];

for (const project of PROJECTS) {
  const id = PREFIX + project.suffix;
  entity(id, "project", project.title);
  spine(id, "project", project.completed ? at(-14, 10) : null);
  if (project.completed) {
    activity(`act-${project.suffix}`, "project.completed", id, at(-14, 10));
  }
  // A Project belongs to an Area OR advances a Goal — one active structural
  // parent per child is a database invariant (0005), so never both.
  if (project.goal) {
    link(
      `l-${project.suffix}-goal`,
      id,
      PREFIX + project.goal,
      "project.advances_goal",
    );
  } else {
    link(
      `l-${project.suffix}-area`,
      id,
      PREFIX + project.area,
      "project.belongs_to_area",
    );
  }
  statements.push(
    `INSERT INTO project_details (workspace_id, entity_id, entity_type, status, archived_at, icon_key, colour_slot, updated_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, 'project', ${q(project.status)}, ${q(project.archived ? at(-30, 10) : null)}, ${q(project.icon)}, ${q(project.colour ?? null)}, ${q(STAMP)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
       status = excluded.status,
       archived_at = excluded.archived_at,
       icon_key = excluded.icon_key,
       colour_slot = excluded.colour_slot,
       updated_at = excluded.updated_at;`,
  );

  /* Completed tasks, spread across the last fortnight so a trend has a shape. */
  for (let i = 0; i < project.done; i += 1) {
    taskSeq += 1;
    const tid = `${PREFIX}t${taskSeq}`;
    // A deterministic spread over the last 20 days, weighted towards recent days.
    const offset = -(1 + ((taskSeq * 7) % 20));
    entity(
      tid,
      "task",
      `${TASK_VERBS[taskSeq % TASK_VERBS.length]} ${TASK_NOUNS[(taskSeq * 3) % TASK_NOUNS.length]}`,
    );
    const completedAt = at(offset, 9 + (taskSeq % 8));
    spine(tid, "task", completedAt);
    activity(`act-t${taskSeq}`, "task.completed", tid, completedAt);
    link(`l-t${taskSeq}`, tid, id, "task.belongs_to_project");
    statements.push(
      `INSERT INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, commitment_state, description, updated_at)
       VALUES (${q(WORKSPACE)}, ${q(tid)}, 'task', 'todo', ${q(["p1", "p2", "p3"][taskSeq % 3])}, ${q(cal(offset))}, NULL, 'active', NULL, ${q(at(offset, 9))})
       ON CONFLICT (workspace_id, entity_id) DO UPDATE SET priority = excluded.priority, due_date = excluded.due_date, updated_at = excluded.updated_at;`,
    );
  }

  /* Open tasks — a handful due today, the rest ahead, `overdue` behind. */
  for (let i = 0; i < project.open; i += 1) {
    taskSeq += 1;
    const tid = `${PREFIX}t${taskSeq}`;
    const overdue = i < project.overdue;
    const dueToday =
      !overdue && i === project.overdue && project.status === "active";
    const offset = overdue
      ? -(2 + i * 3)
      : dueToday
        ? 0
        : 1 + ((taskSeq * 5) % 21);
    entity(
      tid,
      "task",
      `${TASK_VERBS[(taskSeq * 5) % TASK_VERBS.length]} ${TASK_NOUNS[(taskSeq * 11) % TASK_NOUNS.length]}`,
    );
    spine(tid, "task");
    link(`l-t${taskSeq}`, tid, id, "task.belongs_to_project");
    statements.push(
      `INSERT INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, commitment_state, description, updated_at)
       VALUES (${q(WORKSPACE)}, ${q(tid)}, 'task', ${q(i % 4 === 0 ? "in_progress" : "todo")},
         ${q(["p1", "p2", "p3", "p3"][taskSeq % 4])}, ${q(cal(offset))},
         ${dueToday ? q(cal(0)) : "NULL"}, 'active', NULL, ${q(STAMP)})
       ON CONFLICT (workspace_id, entity_id) DO UPDATE SET status = excluded.status, priority = excluded.priority, due_date = excluded.due_date, scheduled_date = excluded.scheduled_date, updated_at = excluded.updated_at;`,
    );
  }
}

/* -- Meetings — behind and ahead of now ------------------------------------ */

const MEETINGS = [
  ["meet-standup", "Weekly delivery sync", -2, 9, "completed", "online"],
  [
    "meet-builder",
    "Site walkthrough with the builder",
    -6,
    7,
    "completed",
    "in_person",
  ],
  ["meet-broker", "Mortgage broker — rate review", 1, 10, "planned", "phone"],
  ["meet-client", "Client kickoff — relaunch scope", 3, 4, "planned", "online"],
  ["meet-physio", "Physio review", 6, 7, "planned", "in_person"],
];
for (const [suffix, title, offset, hour, status, mode] of MEETINGS) {
  const id = PREFIX + suffix;
  entity(id, "meeting", title);
  const starts = at(offset, hour);
  const ends = at(offset, hour + 1);
  statements.push(
    `INSERT INTO meeting_details
       (workspace_id, entity_id, entity_type, starts_at, ends_at, timezone, location, mode, status,
        agenda_markdown, notes_markdown, held_at, archived_at, updated_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, 'meeting', ${q(starts)}, ${q(ends)}, ${q(TZ)},
       ${q(mode === "in_person" ? "On site" : null)}, ${q(mode)}, ${q(status)},
       ${q("## Agenda\n\n- Where we are\n- What is blocked\n- What happens next")},
       ${q(status === "completed" ? "## Notes\n\nAgreed the delivery date holds. Two follow-ups captured." : "")},
       ${status === "completed" ? q(starts) : "NULL"}, NULL, ${q(STAMP)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET starts_at = excluded.starts_at, ends_at = excluded.ends_at,
       status = excluded.status, notes_markdown = excluded.notes_markdown, held_at = excluded.held_at, updated_at = excluded.updated_at;`,
  );
}

/* -- Diary — a fortnight of entries ---------------------------------------- */

const DIARY = [
  [-1, "A good day. The 8 km felt easier than the 6 km did a month ago."],
  [-2, "Kitchen delivery slipped again. Annoying rather than serious."],
  [
    -4,
    "Finished the A1 Spanish course. The listening is still miles behind the reading.",
  ],
  [-6, "Long walk, no phone. Worth repeating."],
  [-9, "Rate review looks like it will save about $180 a month."],
  [-12, "Slept badly. Everything took twice as long."],
];
DIARY.forEach(([offset, body], index) => {
  const id = `${PREFIX}diary-${index}`;
  entity(id, "diary", body.slice(0, 48));
  statements.push(
    `INSERT INTO diary_entry_details
       (workspace_id, entity_id, entity_type, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, 'diary', 'reflection', ${q(body)}, ${q(at(offset, 20))}, ${q(TZ)}, 'manual', NULL, ${q(STAMP)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET body = excluded.body, occurred_at = excluded.occurred_at, updated_at = excluded.updated_at;`,
  );
});

/* -- Notes ----------------------------------------------------------------- */

const NOTES = [
  [
    "note-kitchen",
    "Kitchen fit-out brief",
    "## What we are actually trying to achieve\n\nA kitchen that works for two people cooking at once, with the fridge out of the walkway and enough bench either side of the hob to put things down.\n\n### Decisions\n\n- Bench: 20mm engineered stone, square edge\n- Splashback: tile to the underside of the cupboards\n- Handles: none on the drawers, rail on the pantry\n\n### Still open\n\n- Whether the pantry door is a cavity slider\n- Tap finish",
  ],
  [
    "note-training",
    "Half-marathon plan — weeks 1 to 6",
    "## The shape of it\n\nThree runs a week: one easy, one long, one with intervals in it. Everything else is optional.\n\n| Week | Long run | Total |\n|---|---|---|\n| 1 | 8 km | 20 km |\n| 2 | 10 km | 24 km |\n| 3 | 12 km | 27 km |\n\nThe rule is that the long run is slow enough to hold a conversation.",
  ],
  [
    "note-spanish",
    "Spanish — what is actually sticking",
    "Listening is the bottleneck, not vocabulary. Twenty minutes of podcast beats an hour of flashcards.\n\n- Verbs in the past tense are still guesswork\n- Numbers above a hundred need drilling\n- Ordering food is fine now",
  ],
];
for (const [suffix, title, body] of NOTES) {
  const id = PREFIX + suffix;
  entity(id, "note", title);
  statements.push(
    `INSERT INTO note_details (workspace_id, entity_id, entity_type, content, archived_at, updated_at)
     VALUES (${q(WORKSPACE)}, ${q(id)}, 'note', ${q(body)}, NULL, ${q(STAMP)})
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at;`,
  );
}

/* -- Write ----------------------------------------------------------------- */

// Batched: one `wrangler d1 execute` per ~150 statements keeps the command line
// under the shell's argument limit while staying far fewer round trips than one
// call per statement.
for (let i = 0; i < statements.length; i += 120) {
  sql(statements.slice(i, i + 120));
  process.stdout.write(
    `… ${Math.min(i + 120, statements.length)}/${statements.length}\n`,
  );
}
process.stdout.write(
  `DS-final design fixture seeded: ${GOALS.length} Goals (${GOALS.filter((g) => !g.unmeasured).length} measurable), ${PROJECTS.length} Projects (${PROJECTS.filter((p) => p.archived).length} archived), ${taskSeq} Tasks, ${MEETINGS.length} Meetings, ${DIARY.length} Diary entries.\n`,
);
