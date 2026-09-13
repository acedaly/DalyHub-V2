/**
 * UNTITLED-13 — the DESIGN fixture for `/meetings` and `/people`.
 *
 * A sibling of `notes-diary-seed.mjs` and `ux-02-seed.mjs`, and it exists for
 * the same reason those do: these surfaces are judged by looking at them, and on
 * the shared E2E seed both are close to their own empty state. `/meetings`
 * cannot show a schedule with one meeting on it, and `/people` cannot show a
 * directory, a circle rail or a stay-in-touch column with three contacts.
 *
 * What it adds, positioned RELATIVE to the owner's calendar day so the same
 * command produces the same-shaped screen on any date:
 *
 *   - **Fourteen People across every circle**, so the rail's five options are
 *     each populated and the generated avatar's six identity tints are all on
 *     screen at once. Contact data is deliberately UNEVEN — some have an email
 *     and a mobile, some one, three none at all — because the row's reach column
 *     and its designed ABSENCE are both worth looking at, and a directory where
 *     every row can be written to proves nothing. Two have a `photo_url`, so the
 *     photograph and the generated disc sit in the same column;
 *   - **follow-up cadences and last-interaction dates spread across the
 *     stay-in-touch vocabulary**, so the rhythm column shows recently connected,
 *     in touch, due for follow-up, out of touch AND the quiet "no shared history
 *     yet" — which is the one the default sort is built around;
 *   - **one archived Person**, because the Archived lens is a real mode;
 *   - **eighteen Meetings across three weeks either side of today**, several per
 *     day on the busy days and none at all on two, so the day grouping has gaps
 *     and the relative headings ("Today", "Tomorrow", "Yesterday") are all
 *     exercised;
 *   - **past meetings with real outcomes and future meetings with real agendas**
 *     — decisions, outcomes, actions and notes on the ones behind us, agenda
 *     items and bodies on some of the ones ahead and deliberately NONE on
 *     others, because the upcoming row's "No agenda" reading and the past row's
 *     outcome reading are the two things this pass changed;
 *   - **attendees on most meetings**, one with SEVEN so the header's avatar
 *     group overflows and the row's "and others" is real, and two with none;
 *   - **deliberately hostile content**: a meeting title of 140 characters, a
 *     Person with a 60-character name and a 70-character organisation, and a
 *     long agenda item — because §56 asks for long realistic content and a
 *     fixture of tidy short strings cannot answer a truncation question.
 *
 * Local-only: it talks to the Miniflare D1 through `wrangler d1 execute --local`,
 * exactly like `e2e/setup-local-db.mjs` and its two siblings. It never touches a
 * remote database, it is not part of the gate, and every id it writes carries the
 * `mp13-` prefix so `--clear` removes precisely what it added and nothing else.
 *
 *   node scripts/meetings-people-seed.mjs
 *   node scripts/meetings-people-seed.mjs --clear
 */
import { execFileSync } from "node:child_process";

const WORKSPACE = "local-dev-workspace";
const PREFIX = "mp13-";
/*
 * The OWNER's own zone, which the local workspace stores as Australia/Sydney.
 *
 * It matters, and a first draft got it wrong: seeding in Melbourne (the same
 * offset, a different IANA name) made every row of the schedule print
 * "Melbourne" under its time, because the collection names a meeting's zone
 * precisely when it differs from the owner's. That is correct behaviour and it
 * made the fixture unreadable — eighteen identical zone labels where the real
 * product would show none. One meeting below carries a genuinely foreign zone
 * instead, which is what the label is for.
 */
const TZ = "Australia/Sydney";
/** Sydney's standard offset, stated rather than resolved — see `ux-02-seed.mjs`. */
const TZ_OFFSET_HOURS = 10;

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

const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const nul = (value) =>
  value === null || value === undefined ? "NULL" : lit(value);

/** The owner's calendar day — the only "today" the product has (ADR-022). */
function ownerTodayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(new Date());
}

function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The owner's wall-clock moment on a date, as the UTC instant D1 stores. */
function instant(iso, hour, minute = 0) {
  const utc = Date.parse(
    `${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  return new Date(utc - TZ_OFFSET_HOURS * 3_600_000).toISOString();
}

const TODAY = ownerTodayIso();
const NOW = new Date().toISOString();
const ws = lit(WORKSPACE);

/* -------------------------------------------------------------------------- */
/* Clearing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Remove everything this fixture wrote, dependants first.
 *
 * Run by `--clear`, and ALSO unconditionally before seeding, which is what makes
 * the script idempotent — the same reason `notes-diary-seed.mjs` does it. Every
 * statement is bounded to the `mp13-` id prefix, so it can never touch a
 * developer's own local People or Meetings.
 */
function clearFixture() {
  const mine = `SELECT id FROM entities WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%'`;
  sql([
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${mine}) OR target_entity_id IN (${mine}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM meeting_items WHERE workspace_id = ${ws} AND meeting_id IN (${mine});`,
    `DELETE FROM meeting_details WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM person_details WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%';`,
  ]);
}

clearFixture();
if (clearing) {
  process.stdout.write("UNTITLED-13 design fixture cleared.\n");
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fourteen People, chosen to fill the rail and to exercise every column.
 *
 * `lastDays` is how many owner-days ago the fixture's own activity puts their
 * last shared moment; `null` means nothing recorded, which is the quiet state
 * the default sort is built around. `followUp` is the cadence the owner chose,
 * and `nextFollowUp` a date they set — both feed the derived rhythm rather than
 * being displayed raw.
 */
const PEOPLE = [
  {
    key: "sarah",
    title: "Sarah Whitfield",
    first: "Sarah",
    last: "Whitfield",
    preferred: "Sazz",
    relationship: "family",
    org: null,
    role: null,
    email: "sarah@example.test",
    mobile: "0412 345 678",
    prefers: "mobile",
    followUp: "fortnightly",
    lastDays: 3,
    birthday: "1988-04-17",
    pronouns: "she/her",
    photo: null,
    tags: ["family"],
  },
  {
    key: "marcus",
    title: "Marcus Oyelaran",
    first: "Marcus",
    last: "Oyelaran",
    relationship: "colleague",
    org: "Whitfield Building Co.",
    role: "Site foreman",
    email: "marcus.oyelaran@whitfieldbuilding.example",
    workPhone: "03 9123 4567",
    prefers: "email",
    followUp: "weekly",
    lastDays: 1,
    photo: null,
    tags: ["work"],
  },
  {
    key: "priya",
    title: "Priya Raman",
    first: "Priya",
    last: "Raman",
    relationship: "mentor",
    org: "Northbridge Partners",
    role: "Principal",
    email: "p.raman@northbridge.example",
    mobile: "0455 010 233",
    prefers: "email",
    followUp: "quarterly",
    lastDays: 96,
    website: "https://northbridge.example/team/raman",
    photo: null,
    tags: ["work", "mentoring"],
  },
  {
    key: "tom",
    title: "Tom Beecham",
    first: "Tom",
    last: "Beecham",
    relationship: "friend",
    org: null,
    role: null,
    mobile: "0400 111 222",
    prefers: "mobile",
    followUp: "monthly",
    lastDays: 210,
    photo: null,
    tags: [],
  },
  {
    key: "aroha",
    title: "Aroha Ngata",
    first: "Aroha",
    last: "Ngata",
    relationship: "colleague",
    org: "Meridian Health",
    role: "Programme lead",
    email: "aroha.ngata@meridianhealth.example",
    prefers: "email",
    followUp: null,
    lastDays: 11,
    photo: null,
    tags: ["work"],
  },
  {
    // A photograph, so the picture and the generated disc share a column.
    key: "jonas",
    title: "Jonas Lindqvist",
    first: "Jonas",
    last: "Lindqvist",
    relationship: "friend",
    org: null,
    role: null,
    email: "jonas@example.test",
    prefers: "email",
    followUp: "biannually",
    lastDays: 40,
    photo: "https://www.untitledui.com/images/avatars/olivia-rhye?fm=webp&q=80",
    tags: [],
  },
  {
    key: "dr",
    title: "Dr Helena Vasquez-Moreau",
    first: "Helena",
    last: "Vasquez-Moreau",
    relationship: "professional",
    org: "Fitzroy Family Practice",
    role: "GP",
    workPhone: "03 9417 0000",
    prefers: "work_phone",
    followUp: "annually",
    lastDays: 150,
    photo: null,
    tags: ["health"],
  },
  {
    // §56 — a long name AND a long organisation in one row.
    key: "long",
    title: "Konstantin Papadopoulos-Fairweather",
    first: "Konstantin",
    last: "Papadopoulos-Fairweather",
    relationship: "supplier",
    org: "Southern Highlands Reclaimed Timber & Joinery Cooperative",
    role: "Director of operations and supply",
    email:
      "konstantin.papadopoulos-fairweather@southernhighlandstimber.example",
    prefers: "email",
    followUp: null,
    lastDays: null,
    photo: null,
    tags: [],
  },
  {
    key: "mira",
    title: "Mira Okonkwo",
    first: "Mira",
    last: "Okonkwo",
    relationship: "direct_report",
    org: "Whitfield Building Co.",
    role: "Apprentice",
    email: "mira.o@whitfieldbuilding.example",
    mobile: "0466 900 123",
    prefers: "mobile",
    followUp: "weekly",
    lastDays: 2,
    photo: null,
    tags: ["work"],
  },
  {
    // Nothing reachable at all — the row's designed absence.
    key: "council",
    title: "Yarra Council — Planning",
    relationship: "government",
    org: "City of Yarra",
    role: null,
    prefers: null,
    followUp: null,
    lastDays: null,
    photo: null,
    tags: [],
  },
  {
    key: "nan",
    title: "Nan",
    first: "Margaret",
    last: "Whitfield",
    preferred: "Nan",
    relationship: "family",
    org: null,
    role: null,
    workPhone: "03 5561 2244",
    prefers: "work_phone",
    followUp: "weekly",
    lastDays: 19,
    birthday: "1941-09-02",
    photo: null,
    tags: ["family"],
  },
  {
    key: "dev",
    title: "Ben Corrigan",
    first: "Ben",
    last: "Corrigan",
    relationship: "customer",
    org: "Corrigan & Sons",
    role: "Owner",
    email: "ben@corriganandsons.example",
    mobile: "0499 555 010",
    prefers: "email",
    followUp: "monthly",
    lastDays: 34,
    photo: null,
    tags: ["work"],
  },
  {
    key: "photo2",
    title: "Lena Fischer",
    first: "Lena",
    last: "Fischer",
    relationship: "mentee",
    org: "Meridian Health",
    role: "Analyst",
    email: "lena.fischer@meridianhealth.example",
    prefers: "email",
    followUp: "monthly",
    lastDays: 7,
    photo:
      "https://www.untitledui.com/images/avatars/phoenix-baker?fm=webp&q=80",
    tags: ["mentoring"],
  },
  {
    key: "archived",
    title: "Gavin Reese",
    first: "Gavin",
    last: "Reese",
    relationship: "supplier",
    org: "Reese Electrical",
    role: null,
    email: "gavin@reese-electrical.example",
    prefers: "email",
    followUp: null,
    lastDays: 400,
    archived: true,
    photo: null,
    tags: [],
  },
];

const personId = (key) => `${PREFIX}person-${key}`;

const personStatements = [];
for (const person of PEOPLE) {
  const id = personId(person.key);
  const created = instant(addDays(TODAY, -200), 9);
  const lastInteraction =
    person.lastDays === null ? null : addDays(TODAY, -person.lastDays);
  // A follow-up date only where a cadence exists — an owner who never chose one
  // has no next date either, which is what makes the "no rhythm" row honest.
  const nextFollowUp =
    person.followUp && person.lastDays !== null
      ? addDays(
          TODAY,
          {
            weekly: 7,
            fortnightly: 14,
            monthly: 30,
            quarterly: 91,
            biannually: 182,
            annually: 365,
          }[person.followUp] - person.lastDays,
        )
      : null;
  personStatements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(id)}, ${ws}, 'person', ${lit(person.title)}, ${lit(created)}, ${lit(created)}, NULL);`,
    `INSERT INTO person_details (workspace_id, entity_id, entity_type, preferred_name, first_name, last_name, pronouns, organisation, role, email, mobile, work_phone, website, birthday, relationship, notes, favourite_contact_method, follow_up_frequency, next_follow_up, last_interaction, photo_url, archived_at, updated_at) VALUES (${ws}, ${lit(id)}, 'person', ${nul(person.preferred)}, ${nul(person.first)}, ${nul(person.last)}, ${nul(person.pronouns)}, ${nul(person.org)}, ${nul(person.role)}, ${nul(person.email)}, ${nul(person.mobile)}, ${nul(person.workPhone)}, ${nul(person.website)}, ${nul(person.birthday)}, ${nul(person.relationship)}, NULL, ${nul(person.prefers)}, ${nul(person.followUp)}, ${nul(nextFollowUp)}, ${nul(lastInteraction)}, ${nul(person.photo)}, ${person.archived ? lit(instant(addDays(TODAY, -30), 9)) : "NULL"}, ${lit(created)});`,
  );
  for (const tag of person.tags) {
    personStatements.push(
      `INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at) VALUES (${ws}, ${lit(tag)}, ${lit(tag)}, ${lit(NOW)}, ${lit(NOW)});`,
      `INSERT OR IGNORE INTO entity_tags (workspace_id, entity_id, tag_key, created_at) VALUES (${ws}, ${lit(id)}, ${lit(tag)}, ${lit(created)});`,
    );
  }
}
sql(personStatements);

/* -------------------------------------------------------------------------- */
/* Meetings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Eighteen meetings across three weeks either side of today.
 *
 * `day` is relative to the owner's today, so "Yesterday", "Today" and "Tomorrow"
 * are all on screen whenever this runs. Days −4 and +4 are deliberately EMPTY:
 * a schedule with gaps is the honest test of one.
 *
 * `agenda` / `items` decide what the UPCOMING row says, and `decisions`,
 * `outcomes`, `actions` and `notes` what the PAST row says. Two upcoming
 * meetings have neither an agenda body nor an agenda item, which is the only
 * thing the collection now warns about before the day arrives.
 */
const AGENDA_SHORT = `1. Where the slab is up to
2. The variation from last week
3. Anything blocking the plumber`;

const NOTES_BODY = `Marcus walked through where the slab is up to — the pour is
done and cured, and the inspection is booked for Thursday morning. The variation
from last week has been priced at $4,180, which is inside what we'd allowed.

Plumber is waiting on the council connection point. Aroha is going to chase the
reference number rather than us ringing again.

Nothing else outstanding.`;

const MEETINGS = [
  // ── The past ────────────────────────────────────────────────────────────
  {
    key: "retro-1",
    day: -18,
    hour: 10,
    minutes: 60,
    title: "Site walkthrough — lower ground",
    location: "Whitfield site office",
    mode: "in_person",
    status: "completed",
    held: true,
    attendees: ["marcus", "mira"],
    decisions: ["Slab pour moves to the 14th, weather permitting"],
    outcomes: ["Inspection booked"],
    actions: ["Confirm the concrete order with the supplier"],
    notes: NOTES_BODY,
  },
  {
    key: "retro-2",
    day: -14,
    hour: 14,
    minutes: 30,
    title: "Quarterly catch-up with Priya",
    mode: "online",
    meetingUrl: "https://meet.example.test/priya-q3",
    status: "completed",
    held: true,
    attendees: ["priya"],
    decisions: [
      "Step back from the Northbridge advisory seat at the end of the year",
    ],
    outcomes: ["Agreed a shorter cadence — monthly rather than quarterly"],
    actions: [
      "Draft the handover note",
      "Introduce Lena to the programme board",
    ],
    notes: `Long conversation, mostly about whether the advisory seat is still
earning its keep. It isn't. Priya's view is that stepping back cleanly in
December is better than another year of half-attention.`,
  },
  {
    key: "retro-3",
    day: -11,
    hour: 9,
    minutes: 45,
    title: "Meridian programme sync",
    location: "Meridian Health, Level 4",
    mode: "in_person",
    status: "completed",
    held: true,
    attendees: ["aroha", "photo2"],
    decisions: [],
    outcomes: ["Scope for phase two is settled"],
    actions: [],
    notes: "Short one. Phase two scope is settled; nothing to carry.",
  },
  {
    key: "retro-4",
    day: -7,
    hour: 11,
    minutes: 60,
    // §56 — a deliberately long title, to answer the truncation question.
    title:
      "Joint planning session with the Southern Highlands supply cooperative about reclaimed timber lead times and the 2027 delivery schedule",
    mode: "online",
    meetingUrl: "https://meet.example.test/timber",
    status: "completed",
    held: true,
    attendees: ["long", "marcus", "dev"],
    decisions: ["Order the framing timber in two batches rather than one"],
    outcomes: ["Lead time confirmed at eleven weeks"],
    actions: ["Get the batch-two dates in writing"],
    notes: "",
  },
  {
    key: "retro-5",
    day: -3,
    hour: 16,
    minutes: 30,
    title: "Weekly one-to-one — Mira",
    location: "Site office",
    mode: "in_person",
    status: "completed",
    held: true,
    attendees: ["mira"],
    decisions: [],
    outcomes: [],
    actions: ["Book the working-at-heights refresher"],
    notes: "",
  },
  {
    // A past meeting with NOTHING recorded — the row's designed silence.
    key: "retro-6",
    day: -3,
    hour: 17,
    minutes: 15,
    title: "Quick call with Ben",
    mode: "phone",
    status: "completed",
    held: true,
    attendees: ["dev"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "retro-7",
    day: -1,
    hour: 8,
    minutes: 30,
    title: "Morning stand-up",
    location: "Site office",
    mode: "in_person",
    status: "completed",
    held: true,
    attendees: ["marcus", "mira", "aroha"],
    decisions: ["Plumber starts Monday"],
    outcomes: [],
    actions: ["Chase the council connection reference", "Move the skip"],
    notes: "Everyone on site by 7. Skip is in the wrong place again.",
  },
  {
    key: "retro-8",
    day: -1,
    hour: 15,
    minutes: 60,
    title: "Nan — Sunday lunch plans",
    mode: "phone",
    status: "completed",
    held: true,
    attendees: ["nan"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "She's making the pudding. I'm bringing everything else.",
  },
  {
    key: "cancelled",
    day: -2,
    hour: 13,
    minutes: 30,
    title: "Council pre-lodgement (cancelled)",
    location: "City of Yarra",
    mode: "in_person",
    status: "cancelled",
    attendees: ["council"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },

  // ── Today ───────────────────────────────────────────────────────────────
  {
    key: "today-1",
    day: 0,
    hour: 9,
    minutes: 30,
    title: "Morning stand-up",
    location: "Site office",
    mode: "in_person",
    status: "planned",
    attendees: ["marcus", "mira", "aroha"],
    agenda: AGENDA_SHORT,
    items: ["Where the slab is up to", "The variation from last week"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "today-2",
    day: 0,
    hour: 13,
    minutes: 45,
    title: "Meridian phase two kickoff",
    mode: "online",
    meetingUrl: "https://meet.example.test/meridian-p2",
    status: "planned",
    // Seven attendees, so the header's avatar group overflows and the row's
    // "and others" is real rather than assumed.
    attendees: ["aroha", "photo2", "priya", "marcus", "dev", "mira", "jonas"],
    agenda: "",
    items: ["Introductions", "Scope recap", "Who owns what", "Dates"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    // The one thing the upcoming row now warns about.
    key: "today-3",
    day: 0,
    hour: 16,
    minutes: 30,
    title: "Ben — timber options",
    mode: "phone",
    status: "planned",
    attendees: ["dev"],
    agenda: "",
    items: [],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },

  // ── Ahead ───────────────────────────────────────────────────────────────
  {
    key: "next-1",
    day: 1,
    hour: 10,
    minutes: 60,
    title: "Slab inspection",
    location: "Whitfield site",
    mode: "in_person",
    status: "planned",
    attendees: ["marcus", "council"],
    agenda: `What the inspector needs to see, in order:

- the pour record and the batch dockets
- the reo photos from the 9th
- the amended engineering drawing

If the amended drawing has not come back by Wednesday we reschedule rather than
turn up without it.`,
    items: [
      "Pour record and dockets",
      "Reo photographs",
      "Amended engineering drawing",
    ],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "next-2",
    day: 2,
    hour: 11,
    minutes: 30,
    title: "Coffee with Tom",
    location: "Pellegrini's",
    mode: "in_person",
    status: "planned",
    attendees: ["tom"],
    agenda: "",
    items: [],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    // The ONE meeting in a foreign zone, so the row's zone label is exercised
    // where it carries information rather than on every line.
    key: "next-ny",
    day: 1,
    hour: 23,
    minutes: 45,
    timezone: "America/New_York",
    title: "Northbridge board observer call",
    mode: "online",
    meetingUrl: "https://meet.example.test/northbridge",
    status: "planned",
    attendees: ["priya"],
    agenda: "Standing item: the advisory seat handover.",
    items: ["Handover timing", "Who takes the seat"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "next-admin",
    day: 2,
    hour: 16,
    minutes: 30,
    title: "Council planning follow-up",
    location: "City of Yarra",
    mode: "in_person",
    status: "planned",
    attendees: ["council", "marcus"],
    agenda: "",
    items: ["Connection point reference", "Lodgement window"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "next-3",
    day: 3,
    hour: 14,
    minutes: 60,
    title: "Monthly one-to-one — Lena",
    mode: "online",
    meetingUrl: "https://meet.example.test/lena",
    status: "planned",
    attendees: ["photo2"],
    agenda:
      "How the analyst rotation is going, and whether the programme board introduction landed.",
    items: ["Rotation", "Programme board", "Anything blocking"],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "next-4",
    day: 6,
    hour: 9,
    minutes: 45,
    title: "Whitfield fortnightly review",
    location: "Site office",
    mode: "in_person",
    status: "planned",
    attendees: ["marcus", "mira"],
    agenda: AGENDA_SHORT,
    items: [
      "Where the slab is up to",
      // §56 — a long agenda item, so the row's wrapping is a measured fact.
      "The variation from last week, including the additional excavation the engineer asked for after the soil report came back and what that does to the programme",
      "Anything blocking the plumber",
    ],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "next-5",
    day: 9,
    hour: 15,
    minutes: 30,
    title: "Dr Vasquez-Moreau — annual check",
    location: "Fitzroy Family Practice",
    mode: "in_person",
    status: "planned",
    attendees: ["dr"],
    agenda: "",
    items: [],
    decisions: [],
    outcomes: [],
    actions: [],
    notes: "",
  },
  {
    key: "archived",
    day: -25,
    hour: 10,
    minutes: 60,
    title: "Old scoping session",
    mode: "online",
    status: "completed",
    held: true,
    archived: true,
    attendees: ["priya"],
    decisions: ["Shelved until the new year"],
    outcomes: [],
    actions: [],
    notes: "",
  },
];

const meetingId = (key) => `${PREFIX}meeting-${key}`;

const meetingStatements = [];
for (const meeting of MEETINGS) {
  const id = meetingId(meeting.key);
  const day = addDays(TODAY, meeting.day);
  const startsAt = instant(day, meeting.hour, 0);
  const endsAt = meeting.minutes
    ? new Date(Date.parse(startsAt) + meeting.minutes * 60_000).toISOString()
    : null;
  const created = instant(addDays(day, -7), 9);
  const archivedAt = meeting.archived ? instant(addDays(TODAY, -20), 9) : null;
  const heldAt = meeting.held ? (endsAt ?? startsAt) : null;

  meetingStatements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(id)}, ${ws}, 'meeting', ${lit(meeting.title)}, ${lit(created)}, ${lit(created)}, NULL);`,
    `INSERT INTO meeting_details (workspace_id, entity_id, entity_type, starts_at, ends_at, timezone, location, mode, meeting_url, status, agenda_markdown, notes_markdown, archived_at, updated_at, held_at) VALUES (${ws}, ${lit(id)}, 'meeting', ${lit(startsAt)}, ${nul(endsAt)}, ${lit(meeting.timezone ?? TZ)}, ${nul(meeting.location)}, ${nul(meeting.mode)}, ${nul(meeting.meetingUrl)}, ${lit(meeting.status)}, ${lit(meeting.agenda ?? "")}, ${lit(meeting.notes ?? "")}, ${nul(archivedAt)}, ${lit(created)}, ${nul(heldAt)});`,
  );

  // Items, by kind, positioned in the order they were written.
  const kinds = [
    ["agenda", meeting.items ?? []],
    ["decision", meeting.decisions ?? []],
    ["outcome", meeting.outcomes ?? []],
    ["action", meeting.actions ?? []],
  ];
  for (const [kind, bodies] of kinds) {
    bodies.forEach((body, index) => {
      meetingStatements.push(
        `INSERT INTO meeting_items (workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at) VALUES (${ws}, ${lit(`${id}-${kind}-${index}`)}, ${lit(id)}, ${lit(kind)}, ${lit(body)}, ${index}, ${lit(created)}, ${lit(created)});`,
      );
    });
  }

  // Attendees, as the canonical `meeting.attendee` EntityLink — never a
  // denormalised column, so the collection's batched read and the record's own
  // resolution both see exactly what the product writes.
  (meeting.attendees ?? []).forEach((who, index) => {
    meetingStatements.push(
      `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at) VALUES (${lit(`${id}-att-${index}`)}, ${ws}, ${lit(id)}, ${lit(personId(who))}, 'meeting.attendee', ${lit(created)}, ${lit(created)}, NULL);`,
    );
  });
}
sql(meetingStatements);

/* -------------------------------------------------------------------------- */
/* Activity — the facts the relationship model is DERIVED from                */
/* -------------------------------------------------------------------------- */

/**
 * The moments, as real Activity rows.
 *
 * This exists because the first version of this fixture did not, and the defect
 * it produced is worth recording: with fourteen People carrying a hand-entered
 * `last_interaction` date and no Activity behind it, `/people` drew SEVENTEEN
 * rows whose rhythm column all read "No shared history yet". The column was a
 * wall of one phrase.
 *
 * And the product was RIGHT. PEOPLE-03's evaluator derives a relationship from
 * the FND-05 Activity stream over the records a Person is linked to, and
 * deliberately not from the contact card — "editing someone's phone number is
 * not seeing them" is its own founding rule. A fixture that sets a date field
 * and stops has not recorded an interaction; it has recorded an opinion about
 * one. So the fixture emits what the product emits:
 *
 *   - `meeting.created` when the meeting was scheduled, naming the Meeting and
 *     every attendee as subjects;
 *   - `meeting.held` for every meeting the fixture marks as held, which MEET-03
 *     calls the strongest interaction the product records and which is what
 *     puts a real "last spoke" behind a Person's rhythm.
 *
 * Both are multi-subject events (ADR-055): one activity row, one subject row per
 * entity, exactly as `d1-meeting-repository.ts` writes them.
 */
const activityStatements = [];
let activitySeq = 0;

function emit(type, occurredAt, subjects) {
  const id = `${PREFIX}act-${activitySeq++}`;
  activityStatements.push(
    `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json) VALUES (${lit(id)}, ${ws}, ${lit(type)}, 'user', 'local-development-user', ${lit(occurredAt)}, '{}');`,
  );
  for (const [entityId, role] of subjects) {
    activityStatements.push(
      `INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role) VALUES (${ws}, ${lit(id)}, ${lit(entityId)}, ${lit(role)});`,
    );
  }
}

for (const meeting of MEETINGS) {
  const id = meetingId(meeting.key);
  const day = addDays(TODAY, meeting.day);
  const startsAt = instant(day, meeting.hour, 0);
  const endsAt = meeting.minutes
    ? new Date(Date.parse(startsAt) + meeting.minutes * 60_000).toISOString()
    : startsAt;
  const created = instant(addDays(day, -7), 9);
  const attendeeSubjects = (meeting.attendees ?? []).map((who) => [
    personId(who),
    "attendee",
  ]);

  emit("meeting.created", created, [[id, "subject"], ...attendeeSubjects]);
  if (meeting.held) {
    emit("meeting.held", endsAt, [[id, "subject"], ...attendeeSubjects]);
  }
}
sql(activityStatements);

process.stdout.write(
  `UNTITLED-13 design fixture seeded: ${PEOPLE.length} People, ${MEETINGS.length} Meetings, ${activitySeq} Activity events.\n`,
);
