# PEOPLE_MODULE.md — The People foundation

> **Status:** PEOPLE-01, PEOPLE-02 and PEOPLE-03 implemented. People are a
> first-class Spine-backed entity in DalyHub, comparable to Areas, Goals, Projects,
> Notes and Day Diary; the Person record carries a **unified relationship timeline**
> and, over the same graph, a **derived relationship summary and stay-in-touch
> signal**.
>
> Related: relationship philosophy in [`AGENTS.md §5`](../../AGENTS.md#5-relationship-philosophy) ·
> entity kernel in [`DATA_KERNEL.md`](DATA_KERNEL.md) · module registry in
> [`MODULES.md`](MODULES.md) · the Diary analog in [`DIARY_MODULE.md`](DIARY_MODULE.md).

People are **not "contacts"**. They represent real human relationships, and the
module's job is to help the owner *remember what matters to the people in their
life* — care, never a sales pipeline (AGENTS.md §5). This document is the
authoritative reference for the People module's architecture, entity model,
extension points and roadmap.

---

## 1. Architecture

People follow DalyHub's established three-layer pattern, mirroring **Diary** (a
first-class entity with many structured fields and its own authoritative
repository):

```
app/kernel/people/            storage-independent domain contract (no D1/React)
app/platform/storage/d1/      the D1 adapter (the ONLY place SQL/snake_case live)
app/modules/people/           the product module (routes, view-model, components)
```

A Person is an ordinary `entities` row of reserved type `person` **plus** a
`person_details` row that owns the structured relationship slice. People are
**NOT** part of the Area → Goal → Project → Task spine (AGENTS.md §4) and add no
`spine_records` row; they attach *across* the spine through FND-04 EntityLinks.

- **Identity, display name and soft-delete lifecycle** stay on the shared
  `entities` row (id, workspaceId, title, timestamps, `deletedAt`) — so a Person
  renders with the same Record Header identity as every other entity, and
  rename/delete/restore reuse the generic `EntityRepository`.
- **The structured detail slice** (names, contact points, relationship, follow-up
  cadence, avatar) and the **archive** state live in `person_details`, owned by
  the authoritative `PersonRepository`.
- **The relationship history** is the shared FND-05 Activity stream — read across
  the Person AND the records they are linked to — rendered by the DS-05 Timeline
  (PEOPLE-02, [§4a](#4a-the-unified-relationship-timeline-people-02)).
- **The relationship *answer*** — the summary aggregates and the stay-in-touch state
  — is DERIVED from that same graph on every read by the `relationships` kernel, and
  stored nowhere (PEOPLE-03, [§4b](#4b-relationship-intelligence-people-03)).

### Reserved-type, create-only reservation

Like Diary reserves `diary`, People reserves `person` for **creation only**
(`isReservedPersonEntityType`, wired into `d1-entity-repository.ts`). The generic
`EntityRepository` refuses to `create` a `person` — only `PersonRepository.create`
does, writing the entity row, the detail row and the `person.created` event in
one atomic `D1Database.batch()`. This makes a detail-less Person (invisible to the
collection's INNER JOIN) structurally impossible. A Person's rename, soft-delete
and restore stay ordinary generic entity lifecycle.

### Archived vs deleted

Two independent states, deliberately not conflated:

| State | Column | Meaning | Set by |
|---|---|---|---|
| **Archived** | `person_details.archived_at` | A reversible put-away. The Person still exists and is readable; hidden from the active collection, shown in the Archived view. | `PersonRepository.archive` / `.restore` |
| **Deleted** | `entities.deleted_at` | Soft-deletion. Reads as "not found" everywhere. | `EntityRepository.softDelete` / `.restore` |

"Restore" in the UI (the Archived view and the Settings tab) means **un-archive**.
Delete is a separate, destructive Settings action.

---

## 2. Entity model

### The `person_details` table (migration `0013_create_person_details.sql`)

A `STRICT` table, composite PK `(workspace_id, entity_id)`, with a 3-column
composite FK `(workspace_id, entity_id, entity_type) → entities(workspace_id, id,
type)` `ON DELETE RESTRICT` and a `CHECK (entity_type = 'person')` — so a detail
row can only ever attach to a `person` entity. Every Person has exactly one row
here (reads INNER-JOIN). Columns:

| Column | Type | Notes |
|---|---|---|
| `preferred_name`, `first_name`, `middle_name`, `last_name` | TEXT? | names |
| `pronouns` | TEXT? | |
| `organisation`, `role`, `department` | TEXT? | |
| `email`, `secondary_email` | TEXT? | validated, one `@` |
| `mobile`, `work_phone` | TEXT? | |
| `address` | TEXT? | |
| `website` | TEXT? | http(s) only |
| `birthday`, `next_follow_up`, `last_interaction` | TEXT? | wall-calendar `YYYY-MM-DD` (no timezone) |
| `relationship` | TEXT? | closed vocabulary |
| `tags` | TEXT (JSON array, default `'[]'`) | bounded, deduped |
| `notes` | TEXT? | free text |
| `favourite_contact_method` | TEXT? | closed vocabulary |
| `follow_up_frequency` | TEXT? | closed vocabulary |
| `photo_url` | TEXT? | http(s) or `data:image/…` |
| `archived_at` | TEXT? | the reversible archive state |
| `updated_at` | TEXT NOT NULL | detail-slice update time |

The display name (`title`) and lifecycle timestamps live on `entities`.

### Domain type (`app/kernel/people/person.ts`)

`Person` = the shared entity header + `PersonDetails` + `archivedAt`. Every detail
field is optional (`| null`) except `tags` (always an array) — a Person can be
captured from a single name and enriched over time.

### Closed vocabularies

- **Relationship** — `friend`, `family`, `colleague`, `volunteer`, `customer`,
  `supplier`, `manager`, `direct_report`, `mentor`, `mentee`, `professional`,
  `government`, `emergency`, `other`.
- **Favourite contact method** — `email`, `secondary_email`, `mobile`,
  `work_phone`, `address`, `website`.
- **Follow-up frequency** — `weekly`, `fortnightly`, `monthly`, `quarterly`,
  `biannually`, `annually`.

Each is a closed TypeScript union for exhaustive rendering, but the stored column
is an ordinary validated string — never a database enum — so the open Entity
contract is unchanged and future values need no migration.

---

## 3. The repository contract (`PersonRepository`)

Workspace-bound at construction (ADR-010); no method accepts a `workspaceId`. All
mutations are atomic with their Activity append (idempotent no-ops append
nothing). Exposed on the workspace scope as `scope.people`.

| Method | Purpose | Activity |
|---|---|---|
| `create(input)` | Atomically write entity + detail + event | `person.created` |
| `get(id, { includeDeleted? })` | Read one (archived included; deleted excluded by default) | — |
| `list({ status, query, limit, cursor })` | Bounded, newest-first, scope-bound cursor; `status` = `active`/`archived`/`all`; `query` matches name/preferred/org/role/email/tags | — |
| `update(id, changes)` | Partial detail edit (only changed columns) | `person.updated` |
| `archive(id)` / `restore(id)` | Toggle `archived_at` | `person.archived` / `person.restored` |

Rename, soft-delete and undelete go through the generic `EntityRepository`
(`entity.updated` / `entity.deleted` / `entity.restored`).

Typed error family (`person-errors.ts`): `PersonValidationError` (field-scoped),
`PersonNotFoundError` (fails closed — missing/deleted/wrong-type/cross-workspace
are indistinguishable), `PersonConflictError`, `PersonStorageError`,
`InvalidPersonCursorError`. Messages never echo caller content (People are the most
sensitive data — AGENTS.md §17); Activity payloads carry only structural metadata
(which field names changed), never a Person's private values.

---

## 4. The module (routes, navigation, UI)

### Navigation & routes

The manifest declares a SINGLE `capture`-group sidebar row (**People**) plus the
sub-view, record and mutation routes. The Recent and Archived sub-views are
ordinary routes with **no** `navLabel`; the People collection's own in-page view
navigation (All / Recent / Archived) links to them. This mirrors the Meetings
module and keeps generic labels like "Archived" out of the global sidebar, where
they would be an ambiguous duplicate-link name against other modules' in-page
"Archived" controls.

| Route | Path | Nav |
|---|---|---|
| `people.index` | `/people` | **People** — the collection (sidebar row) |
| `people.recent` | `/people/recent` | in-page view — a bounded recent glance |
| `people.archived` | `/people/archived` | in-page view — archived, with Restore |
| `people.new` | `/new/person` | — (create page) |
| `people.create` | `/people/create` | — (create action endpoint) |
| `people.detail` | `/person/:personId` | — (canonical record) |
| `people.mutate` | `/person/:personId/mutate` | — (mutation endpoint) |
| `people.activity` | `/person/:personId/activity` | — (Timeline JSON) |

### Collection page

Built from the shared `CollectionLayout` + DS-04 `Card` + `EmptyState`. Adds
instant client-side **search** (name/org/role/relationship/tags), **sort**
(recently added / name / organisation / next follow-up), a **list/grid**
presentation toggle, a **quick-add** drawer, bounded **Load more** pagination and
warm empty states. Each card shows the avatar, preferred name, organisation, role,
relationship, last interaction, next follow-up, favourite contact method, tags and
an Archived badge.

### Detail page

The shared DS-02 `RecordLayout` with six tabs:

- **Summary** — large avatar, name/pronouns, organisation/role, relationship,
  quick actions (Call, Email, Diary entry, Meeting, New note, Copy email, Copy
  phone), the PEOPLE-03 **relationship summary** (DS-13 cards) and **stay-in-touch**
  panel ([§4b](#4b-relationship-intelligence-people-03)), key dates and tags.
- **Contact** — the full structured detail editor (DS-06 forms).
- **Timeline** — the unified relationship history via the DS-05 Timeline (see
  [§4a](#4a-the-unified-relationship-timeline-people-02)).
- **Linked** — the shared **Universal Relationship System** Linked Items section
  ([`RELATIONSHIPS.md`](RELATIONSHIPS.md)): records linked to the person, grouped by
  kind, each navigable with a hover-card summary, plus search-to-add and remove
  (read-only for an archived Person). Replaces PEOPLE-01's read-only
  `PersonLinkedTab`; no Person-specific link surface remains.
- **Notes** — a free-text field for what to remember.
- **Settings** — Rename, Archive/Restore and Delete, via the DS-10b Settings
  system.

Quick actions that depend on a not-yet-built module (Diary entry, Meeting, New
note) are honest placeholders that explain what they will do; Call, Email and Copy
work today.

### The Timeline tab

The single Person history surface. See [§4a](#4a-the-unified-relationship-timeline-people-02).

### Avatars

`PersonAvatar` renders an uploaded photo when a `photoUrl` is present, otherwise
generated initials on the Person entity accent. Future **Gravatar** support slots
in by resolving a `photoUrl` upstream — no component change needed. No external
integration is implemented in this PR.

### Search & command palette

- A registry-discovered **search provider** (`people.search`) resolves real
  People by name, email, organisation, role or tags and opens `/person/:id`.
- Command-palette contributions: **Open People**, **Create Person**, **Search
  People**, **Recent People**, **Archived People**.

---

---

## 4a. The unified relationship timeline (PEOPLE-02)

> Decision & rationale: [ADR-052](../decisions/ARCHITECTURE_DECISIONS.md#adr-052-the-unified-people-relationship-timeline--a-derived-multi-anchor-projection-over-the-one-activity-stream).
> Shared renderer: [`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md) · relationships: [`RELATIONSHIPS.md`](RELATIONSHIPS.md).

**There is exactly ONE Person history surface and ONE endpoint behind it.** The
Timeline tab renders the shared DS-05 `Timeline` (never a People fork of it) over
`GET /person/:personId/activity` — the same route PEOPLE-01 shipped. PEOPLE-02 did
not add a surface; it widened what that one read covers.

### Authority & data flow

```
Timeline tab ──▶ GET /person/:personId/activity
                      │
                      ├─ scope.entityLinks.listForEntity(personId)   ← WHICH records
                      │     → the anchor set: the Person + their linked records
                      │
                      ├─ scope.activity.listForEntities(anchorIds)   ← the ONE event stream
                      │
                      ├─ scope.entities.getByIds(subjectIds)         ← identity, in ONE batch
                      └─ toActivityItems(…, descriptors)             ← DS-05 view-model
```

Nothing is copied. The timeline is **derived on every read** from canonical records
and canonical links, so it always tells the truth and never needs cleaning up.

### What appears

| Source | How it gets there | Category |
|---|---|---|
| The Person's own record events (`person.created/.updated/.archived/.restored`, rename, delete/restore) | the Person is the Activity subject | Person record |
| Relationship events (`entity_link.created/.unlinked/.restored`) | the kernel records BOTH endpoints as subjects | Connections |
| A linked **Task**'s own events (created, completed, reopened, planned, waiting …) | the Task is an anchor because it is linked to the Person | Commitments |
| A linked **Meeting**'s own events (created, updated, follow-up conversion …) | attendee `meeting.attendee` links already make the Meeting an anchor | Conversations |
| A linked **Note**'s / **Diary entry**'s own events | the record is an anchor | Notes / Diary |
| Any other linked record (Asset, Project, Goal, Area, Review …) | the record is an anchor | Other records |

Meetings therefore appear **through the existing generic relationship** already
created by MEET-01/MEET-02 attendee linking. The richer, meaning-specific Meeting
history is MEET-03 — see the seam below.

### Event presentation, and why it is also the privacy boundary

Cross-module event types are labelled from the **FND-06 module registry**
(`registry.listActivityTypes()`), not by importing another module and not by a
product switch statement — every module already declares its activity types with a
human label in its manifest. A registry-derived descriptor carries a label but no
`describe`, so DS-05 renders its calm default line and emits **no payload metadata
at all**. Consequences, deliberately:

- no other module's Activity payload fields are ever rendered on a Person's
  timeline, whatever they contain;
- no Note body, Diary entry, meeting agenda/notes/decision, task description or
  `person_details` field is read or serialised by the endpoint;
- an unresolvable record (deleted, inaccessible) degrades to calm non-link text and
  discloses nothing;
- a type no module has declared still renders, through DS-05's safe fallback.

### Ordering, pagination and filtering

- **Ordering** is the kernel's total newest-first `(occurredAt, id)` order, ties
  broken by descending id, re-applied by the shared stream after merging pages —
  so repeated reads are byte-identical. Events are grouped under UTC-day headings.
- **Pagination** is cursor-based (30 per page, a shared `Load more`). The page
  cursor is opaque, versioned, bound to its Person and carries the ANCHOR SET, so
  paging reads a stable **snapshot**: a relationship added or removed mid-read is
  picked up by the next first-page read, never by a shifting page boundary. A
  cursor from another Person, another anchor set or a tampered string is refused
  with a calm `400`.
- **Filtering** reuses DS-07: a People-owned **Activity** category field (Person
  record / Connections / Commitments / Conversations / Notes / Diary / Other
  records) plus the shared **Date** field, bound to the URL by `useFilterUrlState`
  (so a filtered view survives refresh, Back/Forward and copy-paste, preserving
  unrelated params). Categories are pure and derived — never stored, never sent
  over the wire. As per the shared DS-05 contract the evaluator matches over
  LOADED items, so narrowing a long history is filter + `Load more`. A
  per-event-type filter is deliberately not offered (ADR-052).

### Lifecycle

| Change | Effect on the timeline |
|---|---|
| Link a record to the Person | its history joins immediately (next read) |
| Unlink it | its history leaves; the link events themselves remain (the Person is their subject) |
| Soft-delete a linked record | it leaves — the link kernel excludes soft-deleted counterparts |
| Restore it / re-link it | it returns |
| Archive the Person | unchanged; archive is a detail-slice state |
| Soft-delete the Person | their OWN history stays readable; relationships are not queryable, so it degrades to the Person-only set rather than failing |

### Bounds, disclosed

One read anchors the Person plus at most **40** linked records (the kernel bounds a
multi-anchor read at 64 anchors, and the link scan itself is bounded per request).
When more relationships exist, the **most recently linked** records are kept — links
are ordered by creation, so a long-standing relationship never crowds out this
month's — and the tab shows an honest note above the stream naming how many are
covered and pointing at the Linked tab. A cap is never applied silently.

### The MEET-03 integration seam

MEET-03 contributes the *substance* of a meeting to the attendee's history. It has
exactly one place to do that, and needs **no** change to this surface:

1. **Emit meaning-specific Meeting Activity that names the attendee Person as a
   subject** — e.g. `meeting.held` recording the Meeting AND each attendee Person.
   The Person is then an Activity subject in their own right, so the event appears
   even if the attendee link is later removed, and it survives on a soft-deleted
   Person's own history.
2. **Declare the new types in the Meetings manifest** (`activityTypes`, with a human
   label). That alone gives them a readable, payload-free line here — the People
   module needs no edit, no import and no switch case.
3. **Optionally register a `describe` for them in the Meetings module's own
   descriptor map** if the Meeting record's Timeline wants a richer line; the
   People surface deliberately keeps the label-only rendering (payload privacy).
4. **Keep payloads structural** — item kinds, counts, dates; never agenda, notes,
   decision or outcome text (§17), exactly as MEET-02 already does.
5. **Category:** any `meeting.*` type classifies as **Conversations** automatically
   (the category function keys on the event-type domain), so the new events are
   filterable on arrival with no People change.

What MEET-03 must NOT do: add a second Person history surface or endpoint, copy
meeting content into a People-side table, or introduce a Meetings-specific
timeline component. See [`MEETINGS_MODULE.md`](MEETINGS_MODULE.md) and
[MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration).

### Files

| File | Role |
|---|---|
| [`app/modules/people/routes/activity.tsx`](../../app/modules/people/routes/activity.tsx) | the ONE endpoint: anchors → multi-anchor read → batch resolve → DS-05 items |
| [`app/modules/people/person-timeline-anchors.ts`](../../app/modules/people/person-timeline-anchors.ts) | anchor resolution from EntityLinks + the opaque page cursor |
| [`app/modules/people/person-activity.ts`](../../app/modules/people/person-activity.ts) | page shape, People descriptors, registry-derived descriptors |
| [`app/modules/people/person-timeline.ts`](../../app/modules/people/person-timeline.ts) | pure relationship categories + the DS-07 filter fields |
| [`app/modules/people/PersonTimelineTab.tsx`](../../app/modules/people/PersonTimelineTab.tsx) | the tab: shared `FilterBar` + shared `Timeline` |
| [`app/kernel/activity`](../../app/kernel/activity) | `listForEntities`, the anchor-set cursor scope, anchor validation |

## 4b. Relationship intelligence (PEOPLE-03)

> Decision & rationale: [ADR-054](../decisions/ARCHITECTURE_DECISIONS.md#adr-054-relationship-intelligence--a-derived-non-persisted-projection-over-links-and-the-one-activity-stream).
> Aggregation architecture, data sources, extension points and performance:
> [`RELATIONSHIPS.md → Relationship intelligence`](RELATIONSHIPS.md#relationship-intelligence-people-03).
> Shared presentation: [`DESIGN_SYSTEM.md → Stay-in-touch signal`](../design/DESIGN_SYSTEM.md#stay-in-touch-signal-people-03)
> and [`→ Shared summary cards (DS-13)`](../design/DESIGN_SYSTEM.md#shared-summary-cards-ds-13).

PEOPLE-02 made a Person's history readable. PEOPLE-03 makes it **answerable**: the
same graph, aggregated, so opening a Person immediately answers *when did I last
interact with them*, *what have we shared*, *how often are we in touch* — without
scrolling a timeline and totalling it up.

**Nothing is stored.** There is no relationship table, no cached score, no
`last_interaction_at` column and no backfill. Both the summary and the signal are
recomputed on every load from the same two primitives the timeline reads, so they
can never disagree with the Activity tab beside them.

### Authority & data flow

```
Person record loader ──▶ scope.relationships.getPersonRelationshipFacts(personId)
                              │   (three grouped statements; see RELATIONSHIPS.md)
                              │
                              ├─ entity_links → entities (+ spine_records,
                              │                 project_details)   ← WHAT we share
                              └─ activity_subjects → activities     ← WHAT happened
                                     (INTERACTION_ACTIVITY_TYPES only)
                              │
                              ▼
                    evaluatePersonRelationship(facts, ownerClock)   ← the RULES
                              │
                              ├─ SummaryCards (DS-13)      ← the relationship summary
                              └─ StayInTouchPanel / Pill   ← the stay-in-touch state
```

### The relationship summary

DS-13 summary cards on the Summary tab. Every card **leads somewhere**: shared-record
counts open the **Linked** tab (which opens each record in its own module), and
interaction facts open the **Activity** tab (the ONE relationship timeline, whose
every item links to its originating record).

| Card | Derived from |
|---|---|
| Last interaction | the most recent qualifying Activity event on a linked record |
| Total interactions | the exact count of those events |
| Meetings · Diary mentions · Notes · Reviews | linked records of that type |
| Open tasks | linked Tasks whose `spine_records.completed_at` is NULL, of the total |
| Active projects | linked Projects neither complete nor archived, of the total |
| First interaction | the earliest qualifying event |

A card whose count is **zero is omitted**, not shown as `0` — an empty relationship
should read as an invitation, not a scoreboard of what is missing (AGENTS.md §5).
*Last interaction* and *Total interactions* always appear, because their absence is
itself the answer.

### Stay in touch

| State | Means | Tone |
|---|---|---|
| **No shared history yet** | nothing recorded — an invitation | `neutral` |
| **Recently connected** | a shared moment within `RECENTLY_CONNECTED_WITHIN_DAYS` (14) | `success` |
| **In touch** | interacting, still inside the expected rhythm | `neutral` |
| **Due for follow-up** | past the cadence the owner chose, or past this relationship's own demonstrated rhythm | `info` |
| **It's been a while** | nothing shared for `EXTENDED_ABSENCE_AFTER_DAYS` (180) | `info` |

Precedence: `no_history → out_of_touch → due_for_follow_up → recently_connected →
in_touch`. Whichever wins, **every** applicable reason is kept (primary first), so
the panel explains itself rather than asserting a state.

Alongside it, the panel shows the calculated cadence: days since the last shared
moment, how often you connect (`averageIntervalDays`, phrased as "about weekly"),
the **longest closed gap** so far (an in-progress silence is not yet a historical
fact), the interval the follow-up signal was measured against, and the first
interaction.

**Where a follow-up signal can come from — and only these:**

1. the owner's chosen `follow_up_frequency` (PEOPLE-01's long-unread field, finally
   given a duration in `FOLLOW_UP_CADENCE_DAYS`);
2. the owner's explicit `next_follow_up` date, once it has passed;
3. the relationship's **own** demonstrated rhythm — but only from
   `MIN_DAYS_FOR_OBSERVED_RHYTHM` (3) or more interaction days, only at
   `OBSERVED_RHYTHM_MULTIPLIER` (2×) the observed average, and never inside the
   recent-connection window.

A relationship with too little history is **left alone** rather than assigned an
invented expectation.

### Tone — care, not a CRM

The tone vocabulary is a strict subset with **no `warning` and no `danger`**: a
relationship is never an error state. There are no scores, streaks, badges or
percentages. A long silence is stated once, with its date ("Nothing shared since 1
December 2025"), never as a day count presented as a failure. Meaning is always
carried by the label; colour only reinforces it. PEOPLE-03 exposes the **calculated
state only** — reminders and notifications are deliberately not part of it.

### The hand-entered `lastInteraction` field

PEOPLE-01's `person_details.last_interaction` is now a **fallback**, not a parallel
truth. Both the record and the collection prefer the DERIVED last interaction and
fall back to the noted date only while nothing has been recorded — where the record
labels it *"Last interaction (noted)"* so the two can never be mistaken for each
other. Two fields with the same name that can disagree would be worse than one.

### On the collection

`/people` and `/people/recent` carry the SAME shared pill, from **ONE batched read
per page** (`listPersonRelationshipFacts`), and prefer the derived last interaction
over the hand-entered `lastInteraction` field, falling back to it only when nothing
has been recorded. The pill is non-interactive, so a card still has exactly one tab
stop.

`/people/archived` deliberately shows **no** signal: archiving is a reversible "put
away", and telling the owner that someone they filed away is due for a catch-up is
precisely the nagging §5 rules out. The relationship still derives fully on the
record itself.

### Files

| File | Role |
|---|---|
| [`app/kernel/relationships/person-relationship.ts`](../../app/kernel/relationships/person-relationship.ts) | thresholds, the interaction vocabulary, the facts shape and the pure evaluator |
| [`app/kernel/relationships/relationship-repository.ts`](../../app/kernel/relationships/relationship-repository.ts) | the batch-first, read-only facts contract |
| [`app/platform/storage/d1/d1-relationship-repository.ts`](../../app/platform/storage/d1/d1-relationship-repository.ts) | the three grouped, chunked statements |
| [`app/shared/relationships`](../../app/shared/relationships) | the shared pill, the record panel, the wording and the owner-clock seam |
| [`app/shared/summary-cards`](../../app/shared/summary-cards) | the DS-13 grid |
| [`app/modules/people/person-relationship-view.ts`](../../app/modules/people/person-relationship-view.ts) | the People-owned summary cards + their destinations |
| [`app/modules/people/person-collection-relationships.ts`](../../app/modules/people/person-collection-relationships.ts) | the collection's ONE batched read per page |

## 5. Accessibility & mobile

- Keyboard-complete; visible focus (inherited global ring); WAI-ARIA tabs.
- Screen-reader labels on every control; icons decorative; meaning never
  colour-only (Archived is a text badge, relationship is a labelled chip).
- 44px minimum touch targets (shared `--dh-control-height-lg`).
- No horizontal overflow from 320px up (proven across the responsive matrix).
- `person_details` PII never enters an Activity payload and never leaves the
  workspace; the unified Timeline renders no module's Activity payload at all
  ([§4a](#event-presentation-and-why-it-is-also-the-privacy-boundary)).
- The Timeline tab's filter bar and stream are keyboard-complete (the editor is a
  focus-managed popover, Escape dismisses only the editor), the day headings stay
  real headings, newly-loaded events are announced politely, and the whole tab is
  proven with axe in light AND dark and for no horizontal overflow from 320px up.
- The PEOPLE-03 Summary regions are labelled **exactly once** each — the visible
  heading labels the shared component itself (the DS-13 list, the stay-in-touch
  section), never a wrapper as well, because two nested landmarks with the same name
  is a screen-reader dead end rather than extra structure. Every navigable summary
  card is ONE link (never a card wrapping a separate link), accessibly named
  `"<label>: <value>"`, keyboard-reachable and clearing the 44px target at every
  width; the grid reflows to a single column rather than scrolling sideways. The
  collection's stay-in-touch pill is non-interactive, so a card keeps exactly one tab
  stop. Both are proven with axe in light AND dark and across the 320px-up responsive
  matrix ([`e2e/people-relationship.spec.ts`](../../e2e/people-relationship.spec.ts)).

---

## 6. Future roadmap & extension points

The kernel and repository are designed so later PRs add capability **without
breaking this contract**:

| Future work | How it slots in |
|---|---|
| **Organisations** | A new `organisation` entity + a `person.works_at` EntityLink; `person_details.organisation` stays a denormalised label. |
| **Meetings / Calls / Emails** | New entity/event types that append to the shared Activity Timeline and create EntityLinks — the Timeline and Linked tab render them with no change, and they join the PEOPLE-03 summary as shared records immediately (and as *interactions* once their event types are added to `INTERACTION_ACTIVITY_TYPES`). |
| **Follow-up reminders** | Read the already-derived PEOPLE-03 `state` + `cadence`; no schema change, no second evaluator. PEOPLE-03 exposes the calculated state and deliberately no notifications. |
| **Birthday reminders** | Read `birthday`; no schema change. |
| **Relationship graph / timeline** | Traverse `person.linked_*` links (already the kernel primitive). |
| **AI contact summaries** | Read the Person + its Timeline; People are excluded from external model context unless explicitly opted in (AGENTS.md §8, §17). |
| **Google Contacts / Microsoft 365 sync** | Map external contacts onto `CreatePersonInput` / `UpdatePersonInput`; `photo_url` already accommodates a Gravatar/remote avatar. |

The `person.linked_*` EntityLink types and the `person.*` Activity types are
declared in the manifest today so the Timeline and Links surfaces label them the
moment a future module starts creating them.

### Meeting integration (MEET-03)

A Meeting is its own entity, linked to its attendees with the MEET-01
`meeting.attendee` EntityLink type. Because PEOPLE-02 reads the Activity stream
across a Person's linked records, an attended Meeting's own record events ALREADY
appear on the attendee's Timeline. MEET-03 adds the meeting's *substance* by
emitting meaning-specific events that name the attendee as a subject — the exact
seam is specified in [§4a → The MEET-03 integration seam](#the-meet-03-integration-seam).

### Relationship model (planned depth)

The single `relationship` field is the foundation. A richer model (per-link
relationship qualifiers, bidirectional family/colleague edges) can be layered on
the EntityLink primitive without changing the Person record.

---

## 7. Not implemented (by design)

No external APIs, Google Contacts, Outlook, meeting scheduler, calendar, email
sending or SMS. This PR is the DalyHub foundation only.

---

## Status (2026-07-28 reconciliation)

**Current status.** The foundation, the relationship history and the relationship intelligence over it are complete — [PEOPLE-01](../roadmap/ROADMAP_V2.md#-people-01--person-record), [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline) and [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) are ☑. [PEOPLE-04](../roadmap/ROADMAP_V2.md#-people-04--mobile) remains ☐.

**Delivered capabilities (PEOPLE-03).** Opening a Person now answers the relationship questions directly: a DS-13 **relationship summary** (last interaction, total interactions, meetings, diary mentions, notes, open tasks, active projects, reviews, first interaction — each card navigating to the surface that opens the records behind it) and a **stay-in-touch** panel (days since the last shared moment, how often you connect, the longest recorded gap, the interval the signal was measured against). It is a DERIVED, never-cached projection over the SAME two primitives PEOPLE-02 reads, in a new `relationships` kernel pairing a read-only workspace-bound facts repository with a pure evaluator — no table, no migration, no cached score, no `last_interaction_at` column, no backfill, no second history surface. An interaction is a substantive event on a *linked record*, never an edit to the contact card, and cadence counts distinct owner-calendar days. PEOPLE-01's `follow_up_frequency` is finally read, and is the only source of a follow-up signal apart from an explicit `next_follow_up` date or a rhythm the relationship demonstrably has. The tone set excludes `warning` and `danger` outright. The facts read is batched by contract (three grouped statements per chunk for a whole page), so the collection carries the same shared pill for no extra round trips; archived People are deliberately left unsignalled. See [§4b](#4b-relationship-intelligence-people-03) and [ADR-054](../decisions/ARCHITECTURE_DECISIONS.md#adr-054-relationship-intelligence--a-derived-non-persisted-projection-over-links-and-the-one-activity-stream).

**Delivered capabilities (PEOPLE-02).** The Person Timeline is now a genuine relationship history: the ONE `/person/:personId/activity` endpoint reads the ONE FND-05 stream across the Person AND the records they are linked to, via an additive kernel multi-anchor read (`activity.listForEntities`) — no second timeline, no relationship-event store, no copied content. Cross-module events are labelled from the FND-06 module registry (so no module imports and no product switch), which is also the privacy boundary: another module's Activity payload is never rendered here. Adds DS-07 relationship-category filtering, an honest disclosure when a Person holds more relationships than one read covers, a snapshot-stable page cursor, and the documented MEET-03 seam. See [ADR-052](../decisions/ARCHITECTURE_DECISIONS.md#adr-052-the-unified-people-relationship-timeline--a-derived-multi-anchor-projection-over-the-one-activity-stream).

**Delivered capabilities (PEOPLE-01).** Person as a first-class reserved-type entity plus a `person_details` slice (migration `0013_create_person_details.sql`); closed relationship / contact-method / follow-up-frequency vocabularies; a reversible archive distinct from soft-delete; the People / Recent / Archived collection; a six-tab record (Summary / Contact / Timeline / Linked / Notes / Settings); avatars; a **real, repository-backed** search provider and five commands; the shared DS-05 Timeline over bounded, cursor-paginated `GET /person/:personId/activity` reads; and PII kept out of Activity payloads. DS-11 baseline proven — axe, 44px touch targets and no horizontal overflow from 320px up.

**Known limitations.**

- **Meetings contribute structurally, not semantically.** An attended Meeting's own record events appear (it is a linked record), but the meeting's substance — its decisions, outcomes and follow-through, scoped to the attendee — does not. [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration), whose seam is specified in [§4a](#the-meet-03-integration-seam).
- **A very well-connected Person sees a bounded history.** One read anchors at most 40 linked records; beyond that the tab discloses the bound rather than hiding it.
- **Filtering matches over loaded pages**, per the shared DS-05/DS-07 contract — narrowing a long history is filter + Load more, not a server-side query.
- **Cadence is read from a bounded sample.** Exact totals (`totalInteractions`, first and last interaction) are exact and unbounded; only the interval arithmetic reads the most recent `RELATIONSHIP_INTERACTION_SAMPLE_LIMIT` moments, and the panel discloses when it did.
- **Stay-in-touch exposes state, not reminders.** [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) deliberately ships the calculated state only. Notifications, digests and reminders are a later item that consumes it.
- **The DS-13 summary cards are shared but not yet adopted elsewhere.** Projects, Assets and Today still render their own stat grids ([DEBT-01](../product/PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p1)); converging them is follow-on debt work, not part of PEOPLE-03.
- Some record quick actions (Diary / Meeting / New note) are honest placeholders rather than wired flows.

**Deferred work.** Meetings contributing their substance ([MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration)) — which now also joins the PEOPLE-03 signal simply by adding its event types to `INTERACTION_ACTIVITY_TYPES`; follow-up reminders and notifications over the derived state; mobile completion beyond the DS-11 baseline; and all external integrations (Google Contacts, Microsoft 365, calendar, email/SMS) — the kernel is designed to accept these without an API break.

**Build order — still binding.** There is exactly **one** Person history surface and **one** endpoint behind it, and exactly **one** derivation over it. PEOPLE-02 widened `/person/:personId/activity` into the unified relationship history; PEOPLE-03 derives its summary and signal from the same graph (never a second read model, never a stored aggregate); [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) contributes meeting participation to that same stream (seam: [§4a](#the-meet-03-integration-seam)) and to the same signal (one line in `INTERACTION_ACTIVITY_TYPES`); mobile comes last. A separate "Meetings" or "Interactions" tab on the Person record would fork the model and re-create [DEBT-07](../product/PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2) inside V2.

**Relevant roadmap items.** [PEOPLE-01](../roadmap/ROADMAP_V2.md#-people-01--person-record) ☑ · [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline) ☑ · [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) ☑ · [DS-13](../roadmap/ROADMAP_V2.md#-ds-13--shared-summary-cards) ☑ · [PEOPLE-04](../roadmap/ROADMAP_V2.md#-people-04--mobile) ☐ · [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) ☐.

**Relevant product-debt items.** [DEBT-07](../product/PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2) · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) · [DEBT-40](../product/PRODUCT_DEBT.md#-debt-40--two-migrations-share-the-number-0013--p3) (this module owns one of the two `0013` migrations — always cite it by full filename).

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**Lifecycle in the shared overflow.** Archive/Restore and the guarded permanent delete now also
appear in the Record Header overflow (⋯), driving the same handlers as the Settings tab; the
success messages come from the shared lifecycle vocabulary so the two surfaces cannot drift.

**Tab vocabulary.** The person's history tab was named `Timeline` and sat mid-strip, so the
shared rule ("Activity and Settings last, in that order") did not hold on this record. The
content is unchanged — the PEOPLE-02 relationship timeline — but the tab is now `Activity`
(`?tab=activity`) in its correct position: Summary · Contact · Linked · Notes · Activity ·
Settings.

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).
