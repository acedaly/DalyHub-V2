/**
 * UNTITLED-12 — the DESIGN fixture for `/notes` and `/diary`.
 *
 * A sibling of `ux-02-seed.mjs`, and it exists for the same reason that one
 * does: a writing surface is judged by looking at it, and on the shared E2E seed
 * both of this pass's surfaces are their own empty state. `/notes` says "No
 * Notes yet", so the row grammar, the metadata column, the tag chips and the
 * rail beside an open document have nothing to draw; `/diary` says "Nothing
 * recorded on this day", so the week strip has no day with anything on it and
 * the timeline has no chronology to be a chronology of.
 *
 * What it adds, positioned RELATIVE to the owner's calendar day so the same
 * command produces the same-shaped screen on any date:
 *
 *   - fourteen Notes of genuinely different LENGTHS — a four-word capture, a
 *     paragraph, and two long documents with headings, lists, quotes, links and
 *     a table — because a list whose rows all hold the same amount of text
 *     cannot show whether the row grammar works;
 *   - a real tag vocabulary, applied unevenly: some notes carry three tags, some
 *     one, most none, and one carries five so the row's bounded tag column is
 *     exercised rather than assumed;
 *   - one archived Note and one deleted one, so the Archived and Deleted lenses
 *     are real — the Deleted row is the only shape in the collection with no
 *     open target, and it cannot be reviewed without one;
 *   - forty-odd Diary entries across the last three weeks, in all nine built-in
 *     entry types, several per day on the busy days and none at all on two —
 *     a chronology with gaps is the honest test of one;
 *   - bodies on most entries and none on some, so the row's excerpt and its
 *     designed absence are both on screen;
 *   - two backdated entries, because "Backdated" is the one thing on a Diary row
 *     that contradicts where the row is sitting.
 *
 * Local-only: it talks to the Miniflare D1 through `wrangler d1 execute --local`,
 * exactly like `e2e/setup-local-db.mjs` and `ux-02-seed.mjs`. It never touches a
 * remote database, it is not part of the gate, and every id it writes carries the
 * `nd12-` prefix so `--clear` removes precisely what it added and nothing else.
 *
 *   node scripts/notes-diary-seed.mjs
 *   node scripts/notes-diary-seed.mjs --clear
 */
import { execFileSync } from "node:child_process";

const WORKSPACE = "local-dev-workspace";
const PREFIX = "nd12-";
const TZ = "Australia/Melbourne";
/** Melbourne's standard offset, stated rather than resolved — see `ux-02-seed.mjs`. */
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
function instant(iso, hour, minute) {
  const utc = Date.parse(
    `${iso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  return new Date(utc - TZ_OFFSET_HOURS * 3_600_000).toISOString();
}

const TODAY = ownerTodayIso();
const NOW = new Date().toISOString();
const ws = lit(WORKSPACE);

/** The tag vocabulary this fixture invents. Declared above the clear, which names it. */
const TAG_LABELS = {
  research: "research",
  draft: "draft",
  reference: "reference",
  reading: "reading",
  recipe: "recipe",
  health: "health",
  melbourne: "melbourne",
};

/* -------------------------------------------------------------------------- */
/* Clearing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Remove everything this fixture wrote, dependants first.
 *
 * Run by `--clear`, and ALSO unconditionally before seeding — which is what
 * makes the script idempotent, and it has to be. `INSERT OR REPLACE` on
 * `entities` is a DELETE followed by an INSERT, and `note_details` and
 * `diary_entry_details` reference that row `ON DELETE RESTRICT`: the first run
 * succeeded because there was nothing to replace, and the second failed on the
 * foreign key. Deleting in dependency order and inserting into an empty space
 * cannot hit that, and it also means a re-run picks up an edited fixture rather
 * than merging into the last one.
 *
 * Scope discipline: every statement is bounded to the `nd12-` id prefix, so it
 * can never touch a developer's own local Notes or Diary entries.
 */
function clearFixture() {
  const mine = `SELECT id FROM entities WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%'`;
  sql([
    `DELETE FROM entity_tags WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${mine}) OR target_entity_id IN (${mine}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM note_details WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM diary_entry_details WHERE workspace_id = ${ws} AND entity_id IN (${mine});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id LIKE '${PREFIX}%';`,
  ]);
}

if (clearing) {
  clearFixture();
  /*
   * The tag VOCABULARY goes only on an explicit clear, and only for the tags
   * this fixture invented. `workspace_tags` is referenced by `entity_tags`
   * `ON DELETE RESTRICT`, so a tag another record still carries survives — the
   * delete simply matches nothing for it.
   */
  sql([
    `DELETE FROM workspace_tags WHERE workspace_id = ${ws} AND tag_key IN (${Object.keys(TAG_LABELS).map(lit).join(", ")}) AND NOT EXISTS (SELECT 1 FROM entity_tags t WHERE t.workspace_id = workspace_tags.workspace_id AND t.tag_key = workspace_tags.tag_key);`,
  ]);
  process.stdout.write("UNTITLED-12 design fixture cleared.\n");
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

const LONG_DOC = `# Why the record is the file

Every entity in DalyHub is a first-class record with a consistent header, a body
and a history — the way files are first-class in an operating system. That is not
a metaphor we reach for after the fact; it is the thing that decides what the
interface is allowed to do.

## The three consequences

1. **One layout to learn.** A task, a project, a person and a note all use the
   same header, the same tab rail and the same activity stream. Learn it once.
2. **Links, not lists.** The value is in what points at what. A meeting produces
   tasks; a task belongs to a project; a project serves a goal.
3. **Export always works.** Long-form text is Markdown, stored exactly as typed.
   Nothing in the product is allowed to become un-exportable.

## What this rules out

A properties sidebar with eleven fields, for one. A note is a thing you write,
and the fastest way to stop someone writing is to ask them to classify first.

> Capture first, enrich later. If the structure is not earning its keep, remove
> it.

| Surface | Answers | Dominates |
| --- | --- | --- |
| Notes | What do I know? | The document |
| Diary | What happened? | The day |
| Meetings | What did we decide? | The outcome |

There is a fourth consequence, and it is the one that took longest to accept:
the interface has to be willing to show nothing. An untagged note should not
carry a line that says "Tags: none". A day with nothing on it should say so in a
sentence and offer the one action that fixes it, not draw an empty scaffold.

See also \`docs/design/DESIGN_DIRECTION.md\` and the product principles.
`;

const MEDIUM_DOC = `Three things came out of the reading this week, and only one of
them is actionable.

The first is that almost every "productivity system" is really a filing system
wearing a costume. The filing is the easy part. The hard part is deciding, on a
Tuesday morning, which of eleven plausible things is the one that matters, and
no amount of nesting helps with that.

The second is that the calm/urgent distinction is mostly about **who chose the
deadline**. A deadline you set is a plan. A deadline someone else set is a
demand. Interfaces that cannot tell those apart end up shouting at you about
your own intentions.

The third — the actionable one — is that the review cadence matters more than
the capture cadence. Capture is already solved. Nothing gets lost. What gets
lost is the decision to stop doing something.
`;

const SHORT_DOC = `Ask Vaughn about the roof quote before the end of the month.
Two written quotes, not one.
`;

const RECIPE_DOC = `## Weeknight dal

- 1 cup red lentils, rinsed
- 1 tin chopped tomatoes
- 2 tsp cumin seeds, 1 tsp turmeric, chilli to taste
- thumb of ginger, 4 cloves garlic
- coriander, lemon

Lentils and 3 cups water, simmer 20 minutes. Bloom the spices in ghee, add the
aromatics, then the tomatoes; reduce for ten. Stir the lot together, finish with
lemon and far more coriander than seems reasonable.

Doubles cleanly. Freezes badly — the lentils go grainy.
`;

/**
 * The Notes.
 *
 * `days` is how many days ago the note was created; `touched` how many days ago
 * it was last WRITTEN (the content timestamp), which is what the collection's
 * "Updated" column and the rail's ordering actually read. They differ on
 * purpose: a note created three weeks ago and edited yesterday is the ordinary
 * case, and a list that cannot show it is not a list of documents.
 */
const NOTES = [
  {
    slug: "record-is-the-file",
    title: "Why the record is the file",
    days: 34,
    touched: 0,
    body: LONG_DOC,
    tags: ["reference", "draft"],
  },
  {
    slug: "reading-week",
    title: "Reading notes — attention, deadlines and review cadence",
    days: 9,
    touched: 1,
    body: MEDIUM_DOC,
    tags: ["reading", "research", "draft"],
  },
  {
    slug: "roof-quote",
    title: "Roof quote",
    days: 2,
    touched: 2,
    body: SHORT_DOC,
    tags: [],
  },
  {
    slug: "weeknight-dal",
    title: "Weeknight dal",
    days: 61,
    touched: 5,
    body: RECIPE_DOC,
    tags: ["recipe"],
  },
  {
    slug: "d1-keyset",
    title:
      "Keyset pagination over D1 — why the cursor has to carry its own scope",
    days: 20,
    touched: 3,
    body: `A cursor is a position WITHIN a result set, so it is only meaningful
against the query that produced it. Carry the filter scope inside the cursor and
a stale cursor fails loudly; leave it out and it silently resumes one result set
inside another.

Three rules that fall out of that:

- a scope change drops the cursor rather than preserving it;
- the cursor encodes the ORDERING columns, both of them, because a single
  column is not a total order;
- the version byte is not optional. The encoding will change.
`,
    tags: ["reference", "research"],
  },
  {
    slug: "half-marathon",
    title: "Half-marathon — what actually went wrong",
    days: 14,
    touched: 14,
    body: `Went out at 4:35/km on a 4:55 plan and paid for it from 15k. The
training was fine. The pacing decision took four seconds and cost eleven
minutes.

Next time: first 5k slower than feels right, no exceptions, and do not look at
anyone else's watch.
`,
    tags: ["health"],
  },
  {
    slug: "melbourne-list",
    title: "Places in Melbourne worth taking people",
    days: 90,
    touched: 11,
    body: `**Food** — Tipo 00 (book), Embla, Gimlet if someone else is paying.
Supernormal for the lobster roll alone.

**Walks** — the Tan at 7am, Merri Creek from CERES north, Point Ormond at dusk.

**When it rains** — the NGV is free and enormous. Readings Carlton. The State
Library dome, which nobody who lives here seems to have been inside.
`,
    tags: ["melbourne", "reference", "draft", "reading", "recipe"],
  },
  {
    slug: "one-on-one-prep",
    title: "Prep — quarterly one-on-one",
    days: 6,
    touched: 6,
    body: `Three things going well, two that are not, one ask.

The ask is the hard one: I want the scope decision made BEFORE the planning
week, not during it, because during it means it is made by whoever is loudest on
the day.
`,
    tags: ["draft"],
  },
  {
    slug: "cascade-note",
    title: "Unlayered CSS beats layered CSS, unconditionally",
    days: 4,
    touched: 4,
    body: `Whatever the specificity. That is the whole rule and it explains
every "why is this component still the old colour" bug in the migration.

A zero-specificity FLOOR therefore cannot be written unlayered — it has to be a
real layer declared between base and components, or it outranks the thing it is
supposed to sit under.
`,
    tags: ["reference"],
  },
  {
    slug: "birthday-list",
    title: "Gift ideas",
    days: 45,
    touched: 22,
    body: `Dad — the Peter Wohlleben, or a decent pair of secateurs (Felco 2).
Mum — nothing that needs dusting.
Sam — climbing shoes, but ask what size they've settled on.
`,
    tags: [],
  },
  {
    slug: "empty-capture",
    title: "Follow up on the insurance excess",
    days: 1,
    touched: 1,
    body: "",
    tags: [],
  },
  {
    slug: "adr-sketch",
    title: "ADR sketch — one activity stream, not per-module feeds",
    days: 27,
    touched: 8,
    body: `Every meaningful change appends to ONE uniform stream. The feed and
the timeline are two renderings of that one model.

The alternative — a feed per module — was rejected because the interesting
questions are all cross-module. "What happened to this project last week"
touches tasks, meetings, notes and people, and four feeds cannot answer it
without a join nobody would maintain.
`,
    tags: ["research", "reference"],
  },
  {
    slug: "quiet-week",
    title: "A quieter week",
    days: 17,
    touched: 17,
    body: `Nothing much happened, which turned out to be the point. Two evenings
with no plans. Finished the Mantel. Walked without a podcast on.

Note to self that this is not a reward for finishing things.
`,
    tags: [],
  },
  {
    slug: "archived-migration",
    title: "Old migration plan (superseded)",
    days: 120,
    touched: 75,
    archived: true,
    body: `Superseded by the current migration guide. Kept because the sequencing
argument in section 4 is still the reason the shell went first.
`,
    tags: ["reference"],
  },
  {
    // The DELETED lens. Its row is the one shape in the collection with no open
    // target — a deleted entity's canonical route 404s everywhere in the kernel
    // — so its title is static text beside a Restore action, and it cannot be
    // reviewed at all without a deleted Note to draw.
    slug: "deleted-draft",
    title: "Abandoned draft — the third pricing model",
    days: 52,
    touched: 40,
    deleted: true,
    body: `Two paragraphs in I realised this was the same argument as the second
model with different words, and the second model is already written down.
`,
    tags: [],
  },
];

const noteStatements = [];

for (const [key, label] of Object.entries(TAG_LABELS)) {
  noteStatements.push(
    `INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at) VALUES (${ws}, ${lit(key)}, ${lit(label)}, ${lit(NOW)}, ${lit(NOW)});`,
  );
}

for (const note of NOTES) {
  const id = `${PREFIX}note-${note.slug}`;
  const created = instant(addDays(TODAY, -note.days), 9, 30);
  const touched = instant(addDays(TODAY, -note.touched), 16, 5);
  const archivedAt = note.archived
    ? instant(addDays(TODAY, -note.touched), 16, 30)
    : null;
  // Soft deletion is the generic entity's, not the Note's: `deleted_at` on
  // `entities` is what makes a record read as "not found" everywhere in the
  // kernel, which is exactly why the Deleted row has no link.
  const deletedAt = note.deleted
    ? instant(addDays(TODAY, -note.touched), 17, 0)
    : null;
  // Archive state belongs to `note_details`, not to the generic entity: a Note
  // is archived without being deleted, and the kernel keeps lifecycle facts that
  // only one entity type has on that type's own detail row.
  noteStatements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(id)}, ${ws}, 'note', ${lit(note.title)}, ${lit(created)}, ${lit(created)}, ${deletedAt ? lit(deletedAt) : "NULL"});`,
    `INSERT INTO note_details (workspace_id, entity_id, entity_type, content, updated_at, archived_at) VALUES (${ws}, ${lit(id)}, 'note', ${lit(note.body)}, ${lit(touched)}, ${archivedAt ? lit(archivedAt) : "NULL"});`,
  );
  for (const tag of note.tags) {
    noteStatements.push(
      `INSERT OR IGNORE INTO entity_tags (workspace_id, entity_id, tag_key, created_at) VALUES (${ws}, ${lit(id)}, ${lit(tag)}, ${lit(created)});`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Diary                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The entries, as `[daysAgo, hour, minute, type, title, body]`.
 *
 * Three weeks, weighted towards the recent days, with two deliberately EMPTY
 * days (−4 and −12) so the timeline has real gaps and the Day view has a real
 * "nothing recorded" state to land on. `null` for a body is not an oversight: a
 * captured moment with no detail is the commonest diary entry there is, and the
 * row has to look right without one.
 */
const ENTRIES = [
  [
    0,
    8,
    15,
    "reflection",
    "Slept badly, started anyway",
    "The first hour was useless and the second was fine. Filing this because I keep forgetting that the first hour is always useless.",
  ],
  [
    0,
    10,
    0,
    "meeting",
    "Quarterly planning — scope for the next six weeks",
    "Agreed to cut the reporting work rather than extend the window. Nobody argued, which either means it was obviously right or that nobody wanted it.",
  ],
  [
    0,
    13,
    30,
    "decision",
    "Cutting the reporting work from this quarter",
    "Two weeks of work serving a question we can answer with a query. Revisit in October if the question gets asked twice more.",
  ],
  [0, 18, 45, "note", "Bike needs a new chain", null],
  [
    1,
    7,
    40,
    "observation",
    "The magpies are back on the corner",
    "Third year running, same tree. Swooping season starts in about a fortnight if last year is anything to go by.",
  ],
  [
    1,
    11,
    20,
    "conversation",
    "Coffee with Priya",
    "She's leaving in November. Offered to introduce me to the person taking over the platform work, which I should follow up on this week rather than in November.",
  ],
  [
    1,
    16,
    0,
    "idea",
    "A diary that shows you the same week last year",
    "Not a feature request so much as a question about whether recall is the point of keeping one at all.",
  ],
  [2, 9, 5, "meeting", "Standup", null],
  [
    2,
    12,
    15,
    "note",
    "Insurance excess is $1,200 not $800",
    "Worth checking before agreeing to anything.",
  ],
  [
    2,
    20,
    30,
    "reflection",
    "On saying no badly",
    "Said no to the working group in a way that sounded like a maybe, and now there is a follow-up meeting about it. The kind thing and the clear thing were the same thing and I did neither.",
  ],
  [
    3,
    8,
    0,
    "travel",
    "Drove to Bendigo",
    "Two and a half hours each way. The Calder is genuinely fine once you're past Sunbury.",
  ],
  [
    3,
    14,
    0,
    "event",
    "Sam's recital",
    "Forty minutes of Grade 3 piano and about ninety seconds of it was extraordinary.",
  ],
  [
    5,
    9,
    45,
    "meeting",
    "One-on-one",
    "Raised the scope-decision-before-planning-week ask. Got a 'that's reasonable', which is not a yes.",
  ],
  [5, 19, 0, "note", "Finished the Mantel", null],
  [
    6,
    7,
    30,
    "reflection",
    "Three weeks of getting up at six",
    "Long enough to say it's working. The difference isn't the hour, it's that nothing is asked of me in it.",
  ],
  [
    6,
    15,
    10,
    "decision",
    "Not renewing the gym membership",
    "Eleven visits in six months. The walking is doing more and costs nothing.",
  ],
  [
    7,
    10,
    0,
    "conversation",
    "Call with Dad",
    "He's fine. The fence is not fine. Offered to come up in a fortnight and look at it properly.",
  ],
  [
    7,
    13,
    20,
    "meeting",
    "Design review — Notes and Diary",
    "Agreed the writing surface dominates and the metadata recedes. The disagreement was about the rail, and we kept it.",
  ],
  [
    8,
    11,
    0,
    "idea",
    "Weekly review as a diary read, not a form",
    "If the week is already written down, the review is reading it — not answering eleven questions about it.",
  ],
  [9, 8, 30, "travel", "Tram to the city, first time in weeks", null],
  [
    9,
    17,
    45,
    "observation",
    "Six o'clock is light again",
    "Noted mostly so that next July I have evidence that it ends.",
  ],
  [
    10,
    9,
    0,
    "meeting",
    "Kickoff",
    "Short, clear, and finished early. Rare enough to record.",
  ],
  [
    10,
    21,
    15,
    "reflection",
    "Reading before bed instead of the phone",
    "Four nights running. Sleeping better, or believing I am, which may be the same thing.",
  ],
  [
    11,
    12,
    0,
    "note",
    "Book recommendation from Priya — The Dawn of Everything",
    null,
  ],
  [
    13,
    9,
    30,
    "meeting",
    "Retro",
    "The honest finding was that we spent three weeks on something nobody had asked for and everyone had assumed someone had.",
  ],
  [13, 18, 0, "event", "Dinner at Embla", "Worth it. The bread alone."],
  [14, 7, 0, "travel", "Airport run", null],
  [
    15,
    10,
    40,
    "decision",
    "Moving the review to Friday mornings",
    "Thursday evening was a decision made by whoever was least tired, which was nobody.",
  ],
  [
    16,
    16,
    30,
    "conversation",
    "Neighbours about the tree",
    "Cordial. They're getting a quote too. Agreed to split whatever the lower one says.",
  ],
  [
    17,
    8,
    20,
    "reflection",
    "A quieter week",
    "Two evenings with nothing in them. I notice I want to justify that.",
  ],
  [18, 11, 0, "meeting", "Platform sync", null],
  [
    19,
    14,
    15,
    "idea",
    "One activity stream, not per-module feeds",
    "Every interesting question is cross-module, so four feeds can't answer any of them.",
  ],
  [20, 9, 0, "observation", "Frost on the car", "First of the year."],
  [20, 19, 30, "note", "Booked the dentist", null],
];

/** Two entries recorded LATER than the day they belong to — the backdated case. */
const BACKDATED = new Set(["3-8-0", "13-18-0"]);

const diaryStatements = [];

for (const [days, hour, minute, type, title, body] of ENTRIES) {
  const day = addDays(TODAY, -days);
  const occurred = instant(day, hour, minute);
  const key = `${days}-${hour}-${minute}`;
  // A backdated entry was CREATED after it occurred; the row reads that
  // difference, so the fixture has to state it rather than imply it.
  const created = BACKDATED.has(key)
    ? instant(addDays(TODAY, -days + 2), 21, 0)
    : occurred;
  const id = `${PREFIX}diary-${days}-${hour}${String(minute).padStart(2, "0")}`;
  diaryStatements.push(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(id)}, ${ws}, 'diary', ${lit(title)}, ${lit(created)}, ${lit(created)}, NULL);`,
    `INSERT INTO diary_entry_details (workspace_id, entity_id, entity_type, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at) VALUES (${ws}, ${lit(id)}, 'diary', ${lit(type)}, ${body === null ? "NULL" : lit(body)}, ${lit(occurred)}, ${lit(TZ)}, 'manual', NULL, ${lit(created)});`,
  );
}

// Idempotency: seed into an empty space rather than replacing rows other rows
// point at. See `clearFixture`.
clearFixture();
sql(noteStatements);
sql(diaryStatements);

process.stdout.write(
  `UNTITLED-12 design fixture seeded: ${NOTES.length} Notes (1 archived, 1 deleted) and ${ENTRIES.length} Diary entries across three weeks from ${TODAY}.\n`,
);
