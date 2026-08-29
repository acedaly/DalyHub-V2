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
 *   node e2e/today-fixtures.mjs typical|morning|heavy|focus|empty|restore
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
  // UIX-05 — the Asset obligations and the Review sections, both keyed by their
  // owning record rather than by `entity_id`, so neither is caught by the loop
  // below and both must go before the entities they hang from.
  push(
    `DELETE FROM asset_obligations WHERE workspace_id = ${ws} AND asset_id IN (${sel});`,
  );
  push(
    `DELETE FROM review_sections WHERE workspace_id = ${ws} AND review_id IN (${sel});`,
  );
  for (const table of [
    "task_details",
    "meeting_details",
    "project_details",
    "goal_details",
    "area_details",
    // UIX-04's three writing modules. `meeting_items` cascades from
    // `meeting_details`, but the two above are deleted explicitly anyway (the
    // cascade fires on the meeting row, which is deleted in this same loop).
    "note_details",
    "diary_entry_details",
    "person_details",
    // UIX-05's two supporting modules.
    "asset_details",
    "review_details",
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
    // TODAY-10 — the workflow status, so a scenario can seed a PARKED Task.
    // `on_hold` is the one state whose absence from the day was a real defect,
    // and a fixture that cannot express it cannot prove the fix.
    status = "todo",
  } = {},
) {
  entity(id, "task", title);
  spine(id, "task", completedAt);
  push(
    `INSERT INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, description, waiting_since, waiting_note, updated_at) VALUES (${ws}, ${q(id)}, 'task', ${q(status)}, ${q(priority)}, ${q(due)}, ${q(scheduled)}, NULL, ${q(waitingSince)}, ${q(waitingNote)}, ${q(stamp())});`,
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

/**
 * One Meeting.
 *
 * `dayOffset` positions it relative to the owner's calendar day (0 = today), so
 * a scenario can seed the Today/Upcoming/Recent grouping the collection derives
 * rather than a seeded label. Everything past `mode` is UIX-04's addition: the
 * two Markdown bodies and the held/completed lifecycle a meeting NOTEBOOK needs
 * in order to be judged as one. The defaults keep every pre-existing caller
 * (`typical`, `heavy`) byte-identical.
 */
function meeting(
  id,
  title,
  {
    hour,
    minute = 0,
    location = null,
    mode = "online",
    dayOffset = 0,
    durationHours = 1,
    status = "planned",
    agenda = "",
    notes = "",
    heldAt = null,
    url = null,
  } = {},
) {
  const day = addDays(TODAY, dayOffset);
  const startsAt = ownerInstant(day, hour, minute);
  const endsAt = ownerInstant(day, hour + durationHours, minute);
  entity(id, "meeting", title);
  push(
    `INSERT INTO meeting_details (workspace_id, entity_id, entity_type, starts_at, ends_at, timezone, location, mode, meeting_url, status, agenda_markdown, notes_markdown, archived_at, held_at, updated_at) VALUES (${ws}, ${q(id)}, 'meeting', ${q(startsAt)}, ${q(endsAt)}, ${q(OWNER_TIMEZONE)}, ${q(location)}, ${q(mode)}, ${q(url)}, ${q(status)}, ${q(agenda)}, ${q(notes)}, NULL, ${q(heldAt)}, ${q(stamp())});`,
  );
}

/**
 * One structured Meeting item. `kind` is one of the four the schema allows —
 * `agenda`, `decision`, `outcome`, `action` (migration 0021) — so a fixture can
 * never seed a section the product does not own.
 */
function meetingItem(id, meetingId, kind, body, position) {
  const at = stamp();
  push(
    `INSERT INTO meeting_items (workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at) VALUES (${ws}, ${q(id)}, ${q(meetingId)}, ${q(kind)}, ${q(body)}, ${position}, ${q(at)}, ${q(at)});`,
  );
}

/** The durable "this action item became that Task" mapping (MEET-02). */
function meetingItemTask(meetingId, itemId, taskId) {
  push(
    `INSERT INTO meeting_item_tasks (workspace_id, meeting_id, item_id, task_id, created_at) VALUES (${ws}, ${q(meetingId)}, ${itemId === null ? "NULL" : q(itemId)}, ${q(taskId)}, ${q(stamp())});`,
  );
}

/**
 * V2.6 FIND-02 — attach tags through the workspace vocabulary.
 *
 * Tags stopped being a JSON column on three detail tables and became one
 * vocabulary plus one attachment table, so a fixture that wants a tagged record
 * writes both. The canonical key is the label, whitespace-normalised and
 * ASCII case-folded, exactly as `canonicalTagKey` computes it.
 */
function tagEntity(id, tags, at) {
  for (const raw of tags) {
    const label = String(raw).trim().replace(/\s+/g, " ");
    if (label.length === 0) continue;
    const key = label.replace(/[A-Z]/g, (letter) =>
      String.fromCharCode(letter.charCodeAt(0) + 32),
    );
    push(
      `INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at) VALUES (${ws}, ${q(key)}, ${q(label)}, ${q(at)}, ${q(at)});`,
    );
    push(
      `INSERT OR IGNORE INTO entity_tags (workspace_id, entity_id, tag_key, created_at) VALUES (${ws}, ${q(id)}, ${q(key)}, ${q(at)});`,
    );
  }
}

/** One Note. `content` is the Markdown source — the only thing Notes store. */
function note(id, title, { content = "", tags = [], dayOffset = 0 } = {}) {
  const at = ownerInstant(addDays(TODAY, dayOffset), 9, 0);
  entity(id, "note", title, { createdAt: at, updatedAt: at });
  push(
    `INSERT INTO note_details (workspace_id, entity_id, entity_type, content, updated_at) VALUES (${ws}, ${q(id)}, 'note', ${q(content)}, ${q(at)});`,
  );
  tagEntity(id, tags, at);
}

/**
 * One Diary entry. `occurred_at` — not `created_at` — is the chronology the
 * Timeline sorts and groups by (ADR-041), so a scenario positions an entry by
 * `dayOffset`/`hour` and gets the same day whenever it is run.
 */
function diary(
  id,
  title,
  {
    body = null,
    entryType = "note",
    dayOffset = 0,
    hour = 20,
    minute = 0,
  } = {},
) {
  const occurredAt = ownerInstant(addDays(TODAY, dayOffset), hour, minute);
  entity(id, "diary", title, { createdAt: occurredAt, updatedAt: occurredAt });
  push(
    `INSERT INTO diary_entry_details (workspace_id, entity_id, entity_type, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at) VALUES (${ws}, ${q(id)}, 'diary', ${q(entryType)}, ${q(body)}, ${q(occurredAt)}, ${q(OWNER_TIMEZONE)}, 'manual', NULL, ${q(occurredAt)});`,
  );
}

/* -------------------------------------------------------------------------- */
/* UIX-05 — the supporting records                                             */
/* -------------------------------------------------------------------------- */

/**
 * One Person, with the fields both the attendee row and the People collection
 * read.
 *
 * UIX-04 and UIX-05 each added a `person` helper — one deriving first/last from
 * the display name for a Meeting attendee, one taking the contact and
 * relationship fields the People row needs. Git merged both cleanly because they
 * never touched the same lines, which in an ES module is a duplicate declaration
 * and a SyntaxError: the whole fixture file would have refused to load. This is
 * the union, and it keeps BOTH call shapes working.
 *
 * The `relationship` is the field UIX-05 cares about most: it derives both the
 * CIRCLE (the collection's view rail) and the avatar's identity accent, so a
 * fixture that left it null would photograph a grid of neutral discs and prove
 * nothing. The contact fields are what the row's reach column links to.
 *
 * Nothing here sets a stay-in-touch STATE. That is derived by PEOPLE-03 from real
 * interaction history (see `interaction` below) plus the cadence the owner chose,
 * and a fixture that hand-set it would be photographing the fixture rather than
 * the product.
 */
function person(
  id,
  title,
  {
    // Default to splitting the display name, which is what UIX-04's attendee
    // rows relied on; an explicit first/last still wins.
    firstName = title.split(" ")[0] ?? null,
    lastName = title.split(" ").slice(1).join(" ") || null,
    organisation = null,
    role = null,
    email = null,
    mobile = null,
    workPhone = null,
    relationship = null,
    favouriteContactMethod = null,
    followUpFrequency = null,
    nextFollowUp = null,
    lastInteraction = null,
    tags = [],
  } = {},
) {
  entity(id, "person", title);
  push(
    `INSERT INTO person_details (workspace_id, entity_id, entity_type, preferred_name, first_name, middle_name, last_name, pronouns, organisation, role, department, email, secondary_email, mobile, work_phone, address, website, birthday, relationship, notes, favourite_contact_method, follow_up_frequency, next_follow_up, last_interaction, photo_url, archived_at, updated_at) VALUES (${ws}, ${q(id)}, 'person', ${q(firstName)}, ${q(firstName)}, NULL, ${q(lastName)}, NULL, ${q(organisation)}, ${q(role)}, NULL, ${q(email)}, NULL, ${q(mobile)}, ${q(workPhone)}, NULL, NULL, NULL, ${q(relationship)}, NULL, ${q(favouriteContactMethod)}, ${q(followUpFrequency)}, ${q(nextFollowUp)}, ${q(lastInteraction)}, NULL, NULL, ${q(stamp())});`,
  );
  tagEntity(id, tags, stamp());
}

/**
 * A shared moment with a Person, positioned relative to the owner's calendar day.
 *
 * `meeting.held` naming the Person as a subject is what a real interaction leaves
 * behind (ADR-055), and it is in `INTERACTION_ACTIVITY_TYPES`, so the
 * stay-in-touch state a screenshot shows is genuinely evaluated from it.
 */
function interaction(id, personId, dayOffset) {
  activity(
    id,
    "meeting.held",
    personId,
    ownerInstant(addDays(TODAY, dayOffset), 10, 0),
  );
}

/**
 * One Asset. The three canonical dates are the point: they are what the UIX-05
 * card's commitment falls back to when the Asset carries no open obligation, and
 * their offsets are relative to the owner's day so "Service overdue" stays
 * overdue whenever the fixture is run.
 */
function asset(
  id,
  title,
  {
    assetType = "other",
    status = "active",
    manufacturer = null,
    model = null,
    location = null,
    warrantyExpiry = null,
    renewalDate = null,
    nextServiceDate = null,
  } = {},
) {
  entity(id, "asset", title);
  push(
    `INSERT INTO asset_details (workspace_id, entity_id, entity_type, asset_type, status, description, manufacturer, model, serial_number, reference_code, owner_person_id, responsible_person_id, location, area_id, acquisition_date, purchase_price_minor, currency_code, supplier, replacement_value_minor, disposal_date, disposal_notes, warranty_expiry, service_interval, last_service_date, next_service_date, service_provider, maintenance_notes, issuer, reference_number, issue_date, renewal_date, url, document_notes, archived_at, updated_at) VALUES (${ws}, ${q(id)}, 'asset', ${q(assetType)}, ${q(status)}, NULL, ${q(manufacturer)}, ${q(model)}, NULL, NULL, NULL, NULL, ${q(location)}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${q(warrantyExpiry === null ? null : addDays(TODAY, warrantyExpiry))}, NULL, NULL, ${q(nextServiceDate === null ? null : addDays(TODAY, nextServiceDate))}, NULL, NULL, NULL, NULL, NULL, ${q(renewalDate === null ? null : addDays(TODAY, renewalDate))}, NULL, NULL, NULL, ${q(stamp())});`,
  );
}

/** One OPEN obligation on an Asset — the live commitment a card prefers. */
function obligation(id, assetId, title, { category = "service", dueOffset }) {
  const at = stamp();
  push(
    `INSERT INTO asset_obligations (id, workspace_id, asset_id, asset_entity_type, category, title, description, due_date, lead_days, recurrence_kind, recurrence_interval, meter_threshold, meter_interval, meter_unit, status, task_id, completed_event_id, completed_at, next_obligation_id, series_id, sequence, created_at, updated_at, archived_at, deleted_at) VALUES (${q(id)}, ${ws}, ${q(assetId)}, 'asset', ${q(category)}, ${q(title)}, NULL, ${q(addDays(TODAY, dueOffset))}, 14, 'none', NULL, NULL, NULL, NULL, 'open', NULL, NULL, NULL, NULL, ${q(`${id}-series`)}, 0, ${q(at)}, ${q(at)}, NULL, NULL);`,
  );
}

/**
 * One Review. `authored` is how many of the six summary sections carry a body,
 * because that count IS the reflection measure the UIX-05 card draws — it is not
 * a separate field, and seeding it any other way would photograph a number the
 * product does not compute.
 */
function review(
  id,
  title,
  {
    reviewType = "weekly",
    templateId = "weekly.v1",
    startOffset,
    endOffset,
    status = "in_progress",
    authored = 0,
    completedOffset = null,
  },
) {
  entity(id, "review", title);
  push(
    `INSERT INTO review_details (workspace_id, entity_id, entity_type, review_type, period_start, period_end, status, template_id, completed_at, archived_at, updated_at) VALUES (${ws}, ${q(id)}, 'review', ${q(reviewType)}, ${q(addDays(TODAY, startOffset))}, ${q(addDays(TODAY, endOffset))}, ${q(status)}, ${q(templateId)}, ${q(completedOffset === null ? null : ownerInstant(addDays(TODAY, completedOffset), 18, 0))}, NULL, ${q(stamp())});`,
  );
  const SUMMARY_SECTIONS = [
    "summary.overall",
    "summary.highlights",
    "summary.challenges",
    "summary.lessons",
    "summary.decisions",
    "summary.next_focus",
  ];
  for (const sectionId of SUMMARY_SECTIONS.slice(0, authored)) {
    push(
      `INSERT INTO review_sections (workspace_id, review_id, section_id, body_markdown, updated_at) VALUES (${ws}, ${q(id)}, ${q(sectionId)}, ${q("A calm, honest paragraph about the period.")}, ${q(stamp())});`,
    );
  }
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

/**
 * TODAY-10 — the FOCUS day: one Task of every kind the Focus panel must classify.
 *
 * `typical` and `heavy` were written against the conditional-rendering contract,
 * and between them they hold no Task that is planned for today without also being
 * due today, and none that is parked. Those are precisely the two cases TODAY-10
 * is about, so the panel's whole reason for having bands was unprovable on either
 * of them. This scenario is small on purpose — one clear example per rule, so a
 * failure names the rule rather than a row number:
 *
 *   overdue · due today · planned today · both due and planned today · future ·
 *   completed today · waiting · on hold (parked) · Inbox · several priorities ·
 *   Tasks across two Projects and an Area · a measurable Goal · an Asset
 *   obligation, so "Needs attention" has a real, non-Task row beside them.
 */
function focus() {
  baseSpine();
  area("tf-area-health", "Health");

  goal("tf-goal-ship", "Ship DalyHub V2");
  // One measurable Goal, so Goal progress is a real section under the day and
  // the hierarchy (immediate work → attention → longer-term progress) is real.
  goal("tf-goal-weight", "Reach 70 kg", {
    areaId: "tf-area-health",
    createdAt: ownerInstant(addDays(TODAY, -40), 8, 0),
    targetDate: addDays(TODAY, 90),
    measurementType: "target_value",
    unit: "kg",
    baselineValue: 85,
    targetValue: 70,
    measurements: [
      [85.0, -40],
      [81.2, -20],
      [79.5, -5],
    ],
  });

  project("tf-proj-today", "Today screen redesign", { goal: "tf-goal-ship" });
  project("tf-proj-house", "Kitchen renovation", { areaId: "tf-area-home" });

  // Slipped: two of them, so the band is plainly a band and the ordering
  // (oldest first) is observable.
  task("tf-t-overdue-old", "Send the quarterly summary", {
    due: addDays(TODAY, -6),
    priority: "p2",
    project: "tf-proj-today",
  });
  task("tf-t-overdue-plan", "Chase the invoice", {
    scheduled: addDays(TODAY, -2),
    project: "tf-proj-house",
  });

  // DUE today. Deliberately reverse-alphabetical against priority, so a panel
  // ordered A–Z and a panel ordered by priority cannot both pass.
  task("tf-t-due-p1", "Ship the release notes", {
    due: TODAY,
    priority: "p1",
    project: "tf-proj-today",
  });
  task("tf-t-due-plain", "Book the dentist", {
    due: TODAY,
    area: "tf-area-home",
  });
  // Both due AND planned today — the duplicate-prevention case. It must appear
  // once, under Due today, because a deadline outranks an intention.
  task("tf-t-due-and-planned", "Approve the design tokens", {
    due: TODAY,
    scheduled: TODAY,
    priority: "p3",
    project: "tf-proj-today",
  });

  // PLANNED today and NOT due today — the case neither existing scenario had.
  // Its due date is six weeks out, which is exactly what made the combined
  // bucket misleading: on the old panel this read as a deadline.
  task("tf-t-planned-far", "Draft the migration runbook", {
    scheduled: TODAY,
    due: addDays(TODAY, 42),
    priority: "p2",
    project: "tf-proj-house",
  });
  task("tf-t-planned-only", "Tidy the reference photos", {
    scheduled: TODAY,
    area: "tf-area-home",
  });

  // Already finished today — stays visible, dimmed, in the band it was in.
  task("tf-t-done", "Clear the inbox", {
    due: TODAY,
    completedAt: ownerInstant(TODAY, 8, 15),
    project: "tf-proj-today",
  });

  // Present in the workspace and NOT on the day, each for a different reason.
  task("tf-t-future", "Prepare the board pack", {
    due: addDays(TODAY, 9),
    project: "tf-proj-today",
  });
  task("tf-t-waiting", "Legal sign-off on the contract", {
    due: TODAY,
    waitingSince: ownerInstant(addDays(TODAY, -5), 9, 0),
    waitingNote: "Chasing legal",
    project: "tf-proj-today",
  });
  // Parked: due today, but the owner paused it. Neither Today nor
  // `/tasks?system=today` counts it — that agreement is the TODAY-10 fix.
  task("tf-t-on-hold", "Rewrite the onboarding email", {
    due: TODAY,
    status: "on_hold",
    project: "tf-proj-house",
  });

  // Inbox: unfiled work, which reaches Today as an attention COUNT, never as a
  // second copy of a Focus row.
  task("tf-t-inbox-1", "Idea: weekly review template", { area: null });
  task("tf-t-inbox-2", "Ask Sam about the offsite", { area: null });

  meeting("tf-m-1", "Design review", {
    hour: 9,
    minute: 30,
    location: "Studio",
    mode: "in_person",
  });

  // A non-Task attention row, so the Focus/Needs-attention boundary is visible
  // on the same screen: obligations are exceptional STATES, Focus is the work.
  asset("tf-asset-mower", "Mower", { assetType: "equipment" });
  obligation("tf-ob-mower", "tf-asset-mower", "Sharpen the blades", {
    category: "service",
    dueOffset: 3,
  });

  activity(
    "tf-a-1",
    "task.completed",
    "tf-t-done",
    ownerInstant(TODAY, 8, 15),
    ["tf-proj-today"],
  );
  activity(
    "tf-a-2",
    "entity.updated",
    "tf-proj-house",
    ownerInstant(addDays(TODAY, -1), 16, 0),
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

/**
 * UIX-04 — the WRITING day: Notes, Diary and Meetings with real prose in them.
 *
 * Every other scenario seeds the spine, because every other scenario is judging
 * the spine. This one is judging a WRITING surface, and a writing surface can
 * only be judged against writing: an editor photographed over two sentences
 * looks calm no matter how badly its line length is chosen, and a Note list of
 * six-word titles never shows that the excerpt has nowhere to go.
 *
 * So the content here is deliberately long-form and deliberately uneven:
 *
 *   - Notes span a 900-word structured document (headings, lists, a table, a
 *     quote, a code fence, links) down to a four-word capture, because the list
 *     row and the editor have to hold both;
 *   - one Note title is long enough to test wrapping at 390px without being
 *     absurd, which is the width the brief calls out (§4, §52);
 *   - Diary entries land across today, yesterday and the preceding fortnight,
 *     several on the SAME day at different hours, so date grouping and the
 *     within-day ordering are both visible;
 *   - Meetings cover the three groups the collection derives from `starts_at`
 *     (today, upcoming, recent) and the completed/planned lifecycle, and the
 *     recent one carries the full structured notebook: agenda items, a written
 *     body, decisions, outcomes, and actions that became real Tasks through the
 *     real `meeting_item_tasks` mapping.
 *
 * Nothing here is a display string. The groupings, the excerpts, the relative
 * dates and the linked-Task rows in the screenshots are all computed by the
 * same code production runs.
 */
function writing() {
  // The shared dev seed carries a dozen lifecycle-test Notes, People and
  // Meetings ("Blocked Delete Note", "Pagination 7", …) which would be most of
  // what a screenshot shows. Parked behind the SAME reversible sentinel the
  // other scenarios use, so `restore` brings them all back.
  for (const type of ["note", "diary", "person", "area", "meeting"]) {
    push(
      `UPDATE entities SET deleted_at = ${q(PARK_SENTINEL)} WHERE workspace_id = ${ws} AND type = '${type}' AND deleted_at IS NULL;`,
    );
  }

  area("tf-area-work", "Work & Career", { iconKey: "document" });
  area("tf-area-health", "Health & Fitness", { iconKey: "target" });
  area("tf-area-home", "Home & Family", { iconKey: "property" });
  area("tf-area-learning", "Learning & Development", { iconKey: "idea" });

  project("tf-proj-oppo", "OPPO Program Redesign", {
    areaId: "tf-area-work",
    iconKey: "board",
  });
  project("tf-proj-review", "Curriculum review", {
    areaId: "tf-area-work",
    iconKey: "document",
  });

  person("tf-p-mira", "Mira Kaplan", {
    organisation: "Faculty of Health",
    role: "Associate Dean",
  });
  person("tf-p-tomas", "Tomas Bergström", {
    organisation: "Registry",
    role: "Manager, Admissions",
  });
  person("tf-p-jules", "Jules Okonkwo", {
    organisation: "Faculty of Health",
    role: "Program Lead",
  });
  person("tf-p-anna", "Anna Whitfield", {
    organisation: "Student Experience",
    role: "Director",
  });
  person("tf-p-david", "David Ng", {
    organisation: "Planning",
    role: "Analyst",
  });

  /* ---- Notes ----------------------------------------------------------- */

  // The long one. This is the document the editor is judged against: nine
  // hundred words of ordinary working prose carrying every block the Markdown
  // pipeline renders, so "would I write a long note in this?" is a question the
  // screenshots can actually answer.
  note("tf-note-pathway", "Direct-entry pathway — options and trade-offs", {
    dayOffset: -1,
    tags: ["oppo", "policy", "draft"],
    content: `The current pathway assumes every student arrives from a completed diploma. That assumption is now wrong for roughly a third of the cohort, and the admissions rules have been quietly patched around it three times. This note is the attempt to write down what we actually want before we patch it a fourth time.

## What is actually broken

Three things, in the order they hurt:

1. **The credit table is unreadable.** It has forty-one rows, twelve of which are exceptions to other rows. Nobody in Registry can answer a student's question from it without ringing the faculty.
2. **The entry points disagree.** A student with a Certificate IV can enter through two different rules that grant different amounts of credit for the same prior study. Which one applies depends on which form they filled in.
3. **We cannot tell anyone what happens next.** There is no published progression map, so the honest answer to "what does this lead to?" is currently a conversation rather than a page.

None of these are hard problems individually. They are hard together, because fixing one without the others just moves the confusion.

## Options

### Option A — Tidy the existing table

Keep the current structure and rewrite the table so the exceptions become their own rows. Cheapest, fastest, and it does not fix the disagreement between entry points — it only makes the disagreement easier to read.

> Worth saying plainly: this is the option we will default to if we do not decide anything, because it is the only one that needs no approval.

### Option B — Collapse to three entry bands

Replace forty-one rows with three bands defined by volume of prior learning, and grant credit by band rather than by named qualification. Loses some precision at the edges. Gains an answer a human can give over the phone.

| Band | Prior learning | Credit | Typical entrant |
| --- | --- | --- | --- |
| 1 | Under 12 months | 0–2 units | School leaver, short course |
| 2 | 12–24 months | 3–6 units | Certificate IV, partial diploma |
| 3 | Over 24 months | 7–8 units | Completed diploma, associate degree |

The edge cases are real but small: we modelled last year's intake and eleven students would have received less credit than they did under the current rules. Six would have received more.

### Option C — Assess individually, publish the criteria

Drop the table entirely and assess each application against published criteria. Most accurate, most defensible, and it costs Registry roughly forty minutes per non-standard application. At current volumes that is about 1.5 FTE we do not have.

## Where I have landed

Option B, with a documented appeal path for the edge cases that Option C would have caught. The precision we lose is smaller than the precision we currently *pretend* to have — the forty-one-row table looks exact and is applied inconsistently, which is worse than a coarser rule applied the same way every time.

## Open questions

- [ ] Does the appeal path need academic-board sign-off, or is it a Registry procedure?
- [ ] What happens to students mid-pathway when the bands change? Grandfathering seems obvious but nobody has costed it.
- [ ] Who owns the published progression map after launch?

## Notes from the modelling

The band boundaries came out of the intake data rather than out of a workshop, which is the main reason I trust them. The script that produced the numbers is short enough to include:

\`\`\`python
bands = {1: (0, 12), 2: (12, 24), 3: (24, None)}

def band_for(months_prior):
    for band, (low, high) in bands.items():
        if months_prior >= low and (high is None or months_prior < high):
            return band
    raise ValueError(months_prior)
\`\`\`

Reference material: the [2025 admissions review](https://example.org/admissions-review) and the sector comparison Tomas put together. Both agree that banding is the common approach; neither is a strong argument on its own, because both are describing what institutions *do* rather than what works.

## Next step

Take Option B to the working group with the modelling attached, and ask specifically about grandfathering — that is the question most likely to sink it, and it is better raised by us than found by someone else.`,
  });

  note(
    "tf-note-briefing",
    "Briefing paper structure for the executive committee meeting",
    {
      dayOffset: -3,
      tags: ["oppo", "writing"],
      content: `Executive briefings here run to two pages and get read in the five minutes before the meeting. Structure accordingly.

## The shape that works

**Page one** answers the decision. **Page two** justifies it. Nobody reads page two in the room; they read it afterwards when someone challenges the decision.

- Lead with the recommendation, not the background. The background is why the recommendation is right, which is a different question from what we are asking them to do.
- One paragraph of context, maximum. If the context needs three paragraphs, the paper is trying to do two jobs.
- Options as a short list with the trade-off stated in the option, not in a separate section.
- Cost and risk in the same place. Splitting them lets a reader agree to the cost without having seen the risk.

## What to avoid

Long preambles about process. The committee does not need to know how many workshops it took; they need to know what came out of them. A sentence like "following extensive consultation" carries no information and costs a line.

Also avoid the passive voice for decisions already made — "it was decided" hides who decided, and that is exactly the thing a committee wants to know.`,
    },
  );

  note("tf-note-meeting-prep", "Questions for Mira before the working group", {
    dayOffset: -4,
    tags: ["oppo"],
    content: `Short list, in priority order:

1. Is academic board sign-off needed for the appeal path, or can Registry own it as procedure?
2. Has anyone costed grandfathering for the mid-pathway cohort?
3. Who is the named owner of the progression map after launch?
4. Is there an appetite for a staged rollout, or does this need to land as one change?

Everything else can wait for the paper.`,
  });

  note("tf-note-reading", "Reading list — service design", {
    dayOffset: -9,
    tags: ["learning"],
    content: `Things worth finishing rather than skimming.

- *Good Services*, Lou Downe — the fifteen principles are the most directly usable thing I have read on this.
- *Seeing Like a State*, Scott — long, and the middle third is the part that matters for us: what legibility costs the thing being made legible.
- The GOV.UK service manual. Not a book, but the sections on service patterns are better than most books.

Half-read and probably worth abandoning: two of the "design thinking" titles that keep getting recommended. Both are workshop facilitation guides wearing a strategy cover.`,
  });

  note("tf-note-house", "House — window quotes and who said what", {
    dayOffset: -12,
    tags: ["home"],
    content: `Three quotes in, all for the same six windows, all quoting slightly different work.

- **Quote 1** — $8,400. Includes the two upstairs frames, which the others exclude. Six weeks out.
- **Quote 2** — $6,950. Excludes frames. Available in a fortnight, which is the only reason it is still in contention.
- **Quote 3** — $9,100. Includes frames and the render patching. Nine weeks.

The frames are the whole question. If they need doing anyway then Quote 3 is cheapest by about six hundred dollars once the render is counted. Getting a second opinion on the frames before deciding.`,
  });

  note("tf-note-capture", "Ask Tomas about the intake data", {
    dayOffset: 0,
    tags: [],
    content: `Specifically the 2024 figures — the ones in the review look like they exclude deferrals.`,
  });

  note("tf-note-standup", "Standup notes", {
    dayOffset: -2,
    tags: ["oppo"],
    content: `Blocked on the credit table until Registry confirms the exception list is complete. Jules is chasing.

Everything else moving. Nothing needs escalating this week.`,
  });

  /* ---- Diary ------------------------------------------------------------ */

  // Two entries today at different hours, so the within-day ordering shows.
  diary("tf-diary-today-eve", "A good day for thinking", {
    dayOffset: 0,
    hour: 21,
    minute: 10,
    body: `Spent most of the afternoon on the pathway note and it was the first sustained stretch of actual thinking I have had in about three weeks. The difference is embarrassing — three hours uninterrupted got further than a fortnight of half-hours between meetings.

The thing I keep relearning: I cannot think in the gaps. Everything I have ever been pleased with came out of a long block. Everything produced in the gaps is competent and forgettable.

Worth defending Thursday mornings properly rather than nominally.`,
  });

  diary("tf-diary-today-morn", "Slow start", {
    dayOffset: 0,
    hour: 7,
    minute: 40,
    entryType: "note",
    body: `Woke early and did not get up, which is the worst of both. Walked before breakfast anyway and felt better for it.`,
  });

  diary("tf-diary-yesterday", "The working group went better than expected", {
    dayOffset: -1,
    hour: 19,
    minute: 30,
    body: `I had braced for the banding proposal to be picked apart and instead the objection was about something I had not prepared for at all — what happens to students who are already mid-pathway when the rules change.

Fair objection. Better raised now than in the committee. Anna was the one who raised it and she was right to.

What I notice about my own reaction: my first instinct was to defend the proposal rather than to take the question seriously, and I could hear myself doing it. Caught it about a sentence in and stopped. Would not have caught it two years ago.`,
  });

  diary("tf-diary-2", "Long walk, no phone", {
    dayOffset: -2,
    hour: 18,
    minute: 15,
    body: `Two hours around the bay without the phone. Came back with the structure of the briefing paper more or less finished, which is the third time that has happened and I still do not plan for it.`,
  });

  diary("tf-diary-4", "Tired and slightly flat", {
    dayOffset: -4,
    hour: 22,
    minute: 5,
    body: `Nothing wrong exactly. Just the end of a week that had four days of back-to-back in it. Reading rather than working tonight.`,
  });

  diary("tf-diary-6", "Dinner with the Bergströms", {
    dayOffset: -6,
    hour: 22,
    minute: 40,
    body: `First proper evening off in a while. Tomas is thinking about leaving Registry, which I did not see coming and probably should have.

Made a note to check in properly in a few weeks rather than letting it become a work conversation.`,
  });

  diary("tf-diary-9", "Reset weekend", {
    dayOffset: -9,
    hour: 20,
    minute: 0,
    body: `Did almost nothing deliberately and it worked. The garden is still a disaster.`,
  });

  diary("tf-diary-13", "Two years since the move", {
    dayOffset: -13,
    hour: 21,
    minute: 30,
    body: `Two years today. The house still does not feel finished and I have stopped expecting it to.

What has changed is that I no longer think of this as the temporary version of the life. It took most of the two years to notice that had happened.`,
  });

  /* ---- Meetings --------------------------------------------------------- */

  // TODAY, still ahead — prepared, with an agenda and nothing written yet.
  meeting("tf-meet-today", "Pathway working group", {
    hour: 14,
    minute: 30,
    dayOffset: 0,
    mode: "online",
    location: "Teams",
    url: "https://example.org/meet/pathway",
    agenda: `- Banding proposal — walk through the modelling
- Grandfathering: what does it cost, and who decides?
- Appeal path ownership
- Timing against the committee cycle`,
  });

  meeting("tf-meet-today-2", "Weekly catch-up with Jules", {
    hour: 9,
    minute: 0,
    dayOffset: 0,
    durationHours: 1,
    mode: "in_person",
    location: "Level 3 meeting room",
  });

  // UPCOMING — one TOMORROW, so the list's relative day heading is exercised
  // rather than assumed (the two "today" meetings above are seeded at 09:00 and
  // 14:30 owner-local, which are in the past for most of the owner's day).
  meeting("tf-meet-tomorrow", "Registry follow-up — exception list", {
    hour: 9,
    minute: 30,
    dayOffset: 1,
    mode: "online",
    location: "Teams",
    url: "https://example.org/meet/registry",
  });

  meeting("tf-meet-up-1", "Executive committee — pathway paper", {
    hour: 10,
    minute: 0,
    dayOffset: 3,
    mode: "in_person",
    location: "Chancellery boardroom",
    agenda: `- Decision: adopt three-band entry model
- Note: grandfathering approach and cost
- Note: publication timeline for the progression map`,
  });

  meeting("tf-meet-up-2", "Registry systems walkthrough", {
    hour: 11,
    minute: 30,
    dayOffset: 5,
    mode: "online",
    location: "Teams",
  });

  meeting("tf-meet-up-3", "Curriculum review — quarterly", {
    hour: 15,
    minute: 0,
    dayOffset: 11,
    mode: "in_person",
    location: "Faculty of Health, room 2.14",
  });

  /*
   * RECENT and HELD — the full notebook. This is the Meeting the detail screen
   * is judged against: every section the schema owns is populated, and the two
   * action items became REAL Tasks through the real mapping table, so the
   * linked-Task rows on the detail screen are the product's own, not a mock.
   */
  meeting("tf-meet-past-1", "Admissions rules — deep dive with Registry", {
    hour: 13,
    minute: 0,
    dayOffset: -1,
    durationHours: 2,
    mode: "in_person",
    location: "Registry, level 1",
    status: "completed",
    heldAt: ownerInstant(addDays(TODAY, -1), 15, 0),
    agenda: `- Walk the exception list end to end
- Agree which exceptions are real policy and which are accumulated practice
- Decide what a banded model would break`,
    notes: `Tomas walked the full forty-one rows. The useful finding is that only **nine** of the twelve exceptions are actual policy — the other three are practice that got written down at some point and has been treated as policy ever since. Nobody could name the decision behind them.

That changes the shape of the problem. If three exceptions can simply be retired, the table drops to a size a person could hold in their head, and the case for banding gets weaker rather than stronger.

Anna's point about mid-pathway students came up again here, independently of the working group. Two people raising the same objection from different directions is usually a sign it is the real one.

We did not resolve the credit question for Certificate IV entrants and deliberately parked it — it needs the modelling that is not finished yet, and guessing at it in the room would have produced a number we then had to defend.`,
  });

  meetingItem(
    "tf-mi-a1",
    "tf-meet-past-1",
    "agenda",
    "Walk the exception list end to end",
    0,
  );
  meetingItem(
    "tf-mi-a2",
    "tf-meet-past-1",
    "agenda",
    "Separate real policy from accumulated practice",
    1,
  );
  meetingItem(
    "tf-mi-a3",
    "tf-meet-past-1",
    "agenda",
    "Decide what a banded model would break",
    2,
  );

  meetingItem(
    "tf-mi-d1",
    "tf-meet-past-1",
    "decision",
    "Retire the three exceptions that are practice rather than policy, subject to Registry confirming no student is currently relying on them.",
    0,
  );
  meetingItem(
    "tf-mi-d2",
    "tf-meet-past-1",
    "decision",
    "Park the Certificate IV credit question until the intake modelling is complete — no number to be quoted before then.",
    1,
  );

  meetingItem(
    "tf-mi-o1",
    "tf-meet-past-1",
    "outcome",
    "The exception list is smaller than we thought: nine real, three retiring.",
    0,
  );
  meetingItem(
    "tf-mi-o2",
    "tf-meet-past-1",
    "outcome",
    "Mid-pathway grandfathering is now the main open risk, raised independently by two people.",
    1,
  );

  meetingItem(
    "tf-mi-x1",
    "tf-meet-past-1",
    "action",
    "Send the pathway draft to Mira",
    0,
  );
  meetingItem(
    "tf-mi-x2",
    "tf-meet-past-1",
    "action",
    "Confirm nobody is relying on the three retiring exceptions",
    1,
  );
  meetingItem(
    "tf-mi-x3",
    "tf-meet-past-1",
    "action",
    "Cost the grandfathering options",
    2,
  );

  task("tf-t-meet-1", "Send the pathway draft to Mira", {
    project: "tf-proj-oppo",
    due: addDays(TODAY, 1),
    priority: "p1",
  });
  task(
    "tf-t-meet-2",
    "Confirm nobody is relying on the three retiring exceptions",
    {
      project: "tf-proj-oppo",
      due: addDays(TODAY, 4),
    },
  );
  meetingItemTask("tf-meet-past-1", "tf-mi-x1", "tf-t-meet-1");
  meetingItemTask("tf-meet-past-1", "tf-mi-x2", "tf-t-meet-2");

  for (const [id, personId] of [
    ["tf-meet-past-1-at-1", "tf-p-tomas"],
    ["tf-meet-past-1-at-2", "tf-p-anna"],
    ["tf-meet-past-1-at-3", "tf-p-david"],
  ]) {
    link(id, "tf-meet-past-1", personId, "meeting.attendee");
  }
  link(
    "tf-meet-past-1-l-proj",
    "tf-meet-past-1",
    "tf-proj-oppo",
    "link.related",
  );

  // A second recent one, lighter — a meeting that happened and produced a
  // couple of lines, which is what most meetings actually are.
  meeting("tf-meet-past-2", "Curriculum review — check-in", {
    hour: 10,
    minute: 30,
    dayOffset: -3,
    mode: "online",
    location: "Teams",
    status: "completed",
    heldAt: ownerInstant(addDays(TODAY, -3), 11, 30),
    notes: `Short. Everything on track; the unit outlines are the only thing at risk and Jules has that.

Next check-in moves to the quarterly slot.`,
  });
  link(
    "tf-meet-past-2-at-1",
    "tf-meet-past-2",
    "tf-p-jules",
    "meeting.attendee",
  );
  link(
    "tf-meet-past-2-l-proj",
    "tf-meet-past-2",
    "tf-proj-review",
    "link.related",
  );

  // Five attendees on the today meeting, so the collapse behaviour (§28) is
  // exercised rather than assumed.
  for (const [id, personId] of [
    ["tf-meet-today-at-1", "tf-p-mira"],
    ["tf-meet-today-at-2", "tf-p-tomas"],
    ["tf-meet-today-at-3", "tf-p-jules"],
    ["tf-meet-today-at-4", "tf-p-anna"],
    ["tf-meet-today-at-5", "tf-p-david"],
  ]) {
    link(id, "tf-meet-today", personId, "meeting.attendee");
  }
  link("tf-meet-today-l-proj", "tf-meet-today", "tf-proj-oppo", "link.related");

  link(
    "tf-meet-tomorrow-at-1",
    "tf-meet-tomorrow",
    "tf-p-tomas",
    "meeting.attendee",
  );
  link("tf-meet-up-1-at-1", "tf-meet-up-1", "tf-p-mira", "meeting.attendee");
  link("tf-meet-up-1-at-2", "tf-meet-up-1", "tf-p-anna", "meeting.attendee");

  /* Notes linked to the work they document, so the context line has content. */
  link(
    "tf-note-pathway-l",
    "tf-note-pathway",
    "tf-proj-oppo",
    "project.supporting_note",
  );
  link(
    "tf-note-briefing-l",
    "tf-note-briefing",
    "tf-proj-oppo",
    "project.supporting_note",
  );
  link(
    "tf-note-reading-l",
    "tf-note-reading",
    "tf-area-learning",
    "link.related",
  );
}

/**
 * UIX-05 — the four supporting modules, and enough completed history for
 * Analytics to have a shape.
 *
 * The `gallery` scenario seeds Areas, Projects and Goals; `goals` seeds one Goal
 * per branch of the progress engine. Neither seeds a single Person, Asset or
 * Review, and the ordinary dev seed does not either — it only knows how to CLEAN
 * those up after the journey specs. So every surface UIX-05 redesigned would
 * photograph as its empty state, which is the one thing a redesign's evidence
 * must not be.
 *
 * What this seeds is chosen so each surface shows its DECISIONS rather than a
 * pretty average:
 *
 *   - People spans all three CIRCLES plus the deliberate absence ("Other" is a
 *     real choice and not a circle), and the stay-in-touch column spans its whole
 *     range — recently connected, in touch, due for follow-up, out of touch, and
 *     no shared history at all. Every state is DERIVED from seeded interactions
 *     and the owner's chosen cadence; none is hand-set.
 *   - Assets spans an overdue obligation, an obligation due soon, a canonical
 *     date inside the due-soon threshold, a distant renewal and an Asset with
 *     nothing scheduled — the absence the card states in words.
 *   - Reviews spans in-progress (a partial bar), completed (no bar at all), a
 *     draft with nothing written, and a RENAMED Review, which is the one case
 *     where the card keeps a title.
 *   - Analytics gets completed Tasks spread across the last twelve weeks and
 *     across Areas, so the trend has a shape and the distribution has more than
 *     one bar. The completions are real `task.completed` Activity rows over real
 *     Tasks, because that is the only thing Analytics counts.
 */
function modules() {
  /*
   * The types this scenario photographs, parked behind the SAME reversible
   * sentinel the others use — inside the scenario rather than in the shared
   * `parkExisting`, which is how UIX-04's `writing` does it and is the better
   * pattern: a scenario knows which surfaces it is judging, and widening the
   * shared helper would change what every other scenario shows.
   *
   * The dev seed carries lifecycle-test People, Assets and Reviews ("Pagination
   * 7", "Blocked Delete …") that would be most of what a screenshot shows.
   * `restore` brings them all back.
   */
  for (const type of ["person", "asset", "review"]) {
    push(
      `UPDATE entities SET deleted_at = ${q(PARK_SENTINEL)} WHERE workspace_id = ${ws} AND type = '${type}' AND deleted_at IS NULL;`,
    );
  }

  baseSpine();
  area("tf-area-health", "Health & Fitness", { iconKey: "health" });
  area("tf-area-family", "Family & Parenting", { iconKey: "family" });

  /*
   * Two Goals with contributing Projects under them, so Analytics' "Goals on
   * track" tile has something to count. AREA-03 reads a Goal as ACTIVE when
   * contributing work was recorded recently, which the completed Tasks below
   * supply — the tile is therefore derived, not seeded.
   */
  goal("tf-goal-ship", "Ship DalyHub V2", { areaId: "tf-area-work" });
  goal("tf-goal-fitness", "Run a half-marathon", {
    areaId: "tf-area-health",
  });

  project("tf-proj-redesign", "OPPO Program Redesign", {
    goal: "tf-goal-ship",
  });
  project("tf-proj-training", "Base training block", {
    goal: "tf-goal-fitness",
  });
  project("tf-proj-house", "Home setup", { areaId: "tf-area-family" });

  /* -- People ------------------------------------------------------------- */

  // Personal circle. Long silence + a chosen cadence → "Out of touch".
  person("tf-p-sarah", "Sarah Johnson", {
    firstName: "Sarah",
    lastName: "Johnson",
    relationship: "family",
    email: "sarah.j@example.com",
    mobile: "0412 345 678",
    favouriteContactMethod: "mobile",
    followUpFrequency: "monthly",
  });
  interaction("tf-a-sarah-1", "tf-p-sarah", -140);

  // Personal circle, recently connected — the calm end of the same column.
  person("tf-p-lisa", "Lisa Chen", {
    firstName: "Lisa",
    lastName: "Chen",
    relationship: "friend",
    email: "lisa.chen@example.com",
    mobile: "0432 678 901",
    followUpFrequency: "quarterly",
  });
  interaction("tf-a-lisa-1", "tf-p-lisa", -3);
  interaction("tf-a-lisa-2", "tf-p-lisa", -38);

  // Work circle, a steady rhythm → "In touch".
  person("tf-p-michael", "Michael Brown", {
    firstName: "Michael",
    lastName: "Brown",
    organisation: "Northbridge Consulting",
    role: "Program lead",
    relationship: "colleague",
    email: "michael.brown@example.com",
    workPhone: "0401 234 567",
    favouriteContactMethod: "email",
    followUpFrequency: "fortnightly",
  });
  interaction("tf-a-michael-1", "tf-p-michael", -4);
  interaction("tf-a-michael-2", "tf-p-michael", -19);
  interaction("tf-a-michael-3", "tf-p-michael", -33);

  // Work circle, cadence elapsed → "Due for follow-up".
  person("tf-p-emma", "Emma Wilson", {
    firstName: "Emma",
    lastName: "Wilson",
    organisation: "Whitfield Building Co.",
    role: "Site foreman",
    relationship: "supplier",
    email: "emma.w@example.com",
    mobile: "0413 555 019",
    followUpFrequency: "weekly",
    nextFollowUp: addDays(TODAY, -6),
  });
  interaction("tf-a-emma-1", "tf-p-emma", -24);

  // Services circle — the part of a life a person needs rather than chooses.
  person("tf-p-david", "David Lee", {
    firstName: "David",
    lastName: "Lee",
    organisation: "Lee & Partners",
    role: "Accountant",
    relationship: "professional",
    email: "david.lee@example.com",
    workPhone: "0411 587 990",
    favouriteContactMethod: "email",
  });
  interaction("tf-a-david-1", "tf-p-david", -61);

  // Services circle, no history at all — an invitation, not a deficiency.
  person("tf-p-priya", "Priya Nair", {
    firstName: "Priya",
    lastName: "Nair",
    organisation: "Kingsford Medical",
    role: "GP",
    relationship: "professional",
    workPhone: "02 9555 1200",
  });

  // "Other" is a real choice and deliberately NOT a circle: this Person appears
  // under All and nowhere else, with the neutral disc.
  person("tf-p-dan", "Dan Whitfield", {
    firstName: "Dan",
    lastName: "Whitfield",
    relationship: "other",
    email: "dan.whitfield@example.com",
    mobile: "0412 774 903",
  });
  interaction("tf-a-dan-1", "tf-p-dan", -12);

  /* -- Assets ------------------------------------------------------------- */

  // An open obligation that is OVERDUE — the live commitment, which wins over
  // the canonical date this Asset also carries.
  asset("tf-as-hilux", "Hilux", {
    assetType: "vehicle",
    manufacturer: "Toyota",
    model: "HiLux SR5",
    location: "Garage",
    nextServiceDate: 48,
    renewalDate: 96,
  });
  obligation("tf-ob-hilux-1", "tf-as-hilux", "Log-book service", {
    category: "service",
    dueOffset: -9,
  });

  // An obligation due SOON.
  asset("tf-as-trailer", "Box trailer", {
    assetType: "trailer",
    manufacturer: "Ozzi",
    model: "7x4",
    location: "Side yard",
  });
  obligation("tf-ob-trailer-1", "tf-as-trailer", "Registration renewal", {
    category: "registration",
    dueOffset: 11,
  });

  // No obligation — the canonical renewal date inside the due-soon threshold.
  asset("tf-as-insurance", "Home & contents policy", {
    assetType: "insurance",
    manufacturer: "Ardent",
    location: "Documents",
    renewalDate: 21,
  });

  // A distant date: future, and therefore calm.
  asset("tf-as-laptop", "MacBook Pro", {
    assetType: "electronics",
    manufacturer: "Apple",
    model: "M3 Pro 14”",
    location: "Study",
    warrantyExpiry: 320,
  });

  // Nothing scheduled at all — the absence the card states once, in words.
  asset("tf-as-mower", "Ride-on mower", {
    assetType: "equipment",
    manufacturer: "Husqvarna",
    model: "TS 138",
    location: "Shed",
  });

  // A lifecycle state that is not "Active".
  asset("tf-as-ute", "Old ute", {
    assetType: "vehicle",
    status: "stored",
    manufacturer: "Ford",
    model: "Falcon XR6",
    location: "Farm",
  });

  /* -- Reviews ------------------------------------------------------------ */

  // In progress, partly written — the reflection bar's ordinary case.
  review("tf-rev-week-0", "Weekly Review — this week", {
    startOffset: -6,
    endOffset: 0,
    status: "in_progress",
    authored: 4,
  });

  // A draft with nothing written — the card says "Start", not "Continue".
  review("tf-rev-week-1", "Weekly Review — last week", {
    startOffset: -13,
    endOffset: -7,
    status: "draft",
    authored: 0,
  });

  // Completed: no bar at all, and the date it closed instead.
  review("tf-rev-week-2", "Weekly Review — a fortnight ago", {
    startOffset: -20,
    endOffset: -14,
    status: "completed",
    authored: 6,
    completedOffset: -14,
  });

  // RENAMED — the one case where the card keeps a title of its own.
  review("tf-rev-month", "Post-Ekka reset", {
    reviewType: "monthly",
    templateId: "monthly.v1",
    startOffset: -44,
    endOffset: -14,
    status: "completed",
    authored: 6,
    completedOffset: -13,
  });

  // A different cadence, still open.
  review("tf-rev-quarter", "Quarterly Review — this quarter", {
    reviewType: "quarterly",
    templateId: "quarterly.v1",
    startOffset: -70,
    endOffset: 20,
    status: "in_progress",
    authored: 2,
  });

  /* -- Completed work, for Analytics -------------------------------------- */

  /*
   * Real completed Tasks with real `task.completed` Activity, spread over the
   * last twelve weeks and across three Areas.
   *
   * The shape is deliberate rather than uniform: the recent weeks are busier
   * than the older ones, so the trend has a direction to read, and the Areas get
   * different totals so the distribution has bars of different lengths. Every
   * figure Analytics shows is counted from these rows — nothing about the screen
   * is seeded directly.
   */
  const WORKLOAD = [
    // [dayOffset, howMany, project]
    // Today is included on purpose. Leaving it out made the most recent bucket a
    // zero on every capture, so the trend ended in a nosedive that was an
    // artefact of the fixture rather than a shape of the data.
    [0, 2, "tf-proj-redesign"],
    [-1, 3, "tf-proj-redesign"],
    [-2, 2, "tf-proj-training"],
    [-3, 4, "tf-proj-redesign"],
    [-4, 1, "tf-proj-house"],
    [-5, 3, "tf-proj-redesign"],
    [-6, 2, "tf-proj-training"],
    [-8, 3, "tf-proj-redesign"],
    [-10, 2, "tf-proj-house"],
    [-12, 4, "tf-proj-redesign"],
    [-15, 2, "tf-proj-training"],
    [-19, 3, "tf-proj-redesign"],
    [-24, 1, "tf-proj-house"],
    [-30, 2, "tf-proj-training"],
    [-38, 2, "tf-proj-redesign"],
    [-46, 1, "tf-proj-house"],
    [-55, 2, "tf-proj-training"],
    [-66, 1, "tf-proj-redesign"],
    [-76, 1, "tf-proj-house"],
  ];
  let done = 0;
  for (const [dayOffset, count, projectId] of WORKLOAD) {
    for (let index = 0; index < count; index += 1) {
      done += 1;
      const taskId = `tf-t-done-${done}`;
      const completedAt = ownerInstant(addDays(TODAY, dayOffset), 14, 0);
      task(taskId, `Completed work ${done}`, {
        due: addDays(TODAY, dayOffset),
        completedAt,
        project: projectId,
      });
      activity(`tf-a-done-${done}`, "task.completed", taskId, completedAt);
    }
  }

  // A little open work, so the modules do not look like a finished workspace.
  task("tf-t-open-1", "Prepare the OPPO workshop", {
    due: TODAY,
    project: "tf-proj-redesign",
  });
  task("tf-t-open-2", "Book the mower service", {
    due: addDays(TODAY, 3),
    project: "tf-proj-house",
  });
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

const SCENARIOS = {
  typical: () => typical({ completedToday: 3 }),
  morning: () => typical({ completedToday: 0 }),
  heavy,
  focus,
  empty,
  gallery,
  goals,
  writing,
  modules,
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
