# PEOPLE_MODULE.md — The People foundation

> **Status:** PEOPLE-01 and PEOPLE-02 implemented. People are a first-class
> Spine-backed entity in DalyHub, comparable to Areas, Goals, Projects, Notes and
> Day Diary, and the Person record carries a **unified relationship timeline**.
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
  phone), key dates and tags.
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

---

## 6. Future roadmap & extension points

The kernel and repository are designed so later PRs add capability **without
breaking this contract**:

| Future work | How it slots in |
|---|---|
| **Organisations** | A new `organisation` entity + a `person.works_at` EntityLink; `person_details.organisation` stays a denormalised label. |
| **Meetings / Calls / Emails** | New entity/event types that append to the shared Activity Timeline and create `person.linked_*` EntityLinks — the Timeline and Linked tab render them with no change. |
| **Follow-up reminders** | Read `next_follow_up` + `follow_up_frequency`; no schema change. |
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

**Current status.** The foundation and the relationship history are complete — [PEOPLE-01](../roadmap/ROADMAP_V2.md#-people-01--person-record) and [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline) are ☑. [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) and [PEOPLE-04](../roadmap/ROADMAP_V2.md#-people-04--mobile) remain ☐.

**Delivered capabilities (PEOPLE-02).** The Person Timeline is now a genuine relationship history: the ONE `/person/:personId/activity` endpoint reads the ONE FND-05 stream across the Person AND the records they are linked to, via an additive kernel multi-anchor read (`activity.listForEntities`) — no second timeline, no relationship-event store, no copied content. Cross-module events are labelled from the FND-06 module registry (so no module imports and no product switch), which is also the privacy boundary: another module's Activity payload is never rendered here. Adds DS-07 relationship-category filtering, an honest disclosure when a Person holds more relationships than one read covers, a snapshot-stable page cursor, and the documented MEET-03 seam. See [ADR-052](../decisions/ARCHITECTURE_DECISIONS.md#adr-052-the-unified-people-relationship-timeline--a-derived-multi-anchor-projection-over-the-one-activity-stream).

**Delivered capabilities (PEOPLE-01).** Person as a first-class reserved-type entity plus a `person_details` slice (migration `0013_create_person_details.sql`); closed relationship / contact-method / follow-up-frequency vocabularies; a reversible archive distinct from soft-delete; the People / Recent / Archived collection; a six-tab record (Summary / Contact / Timeline / Linked / Notes / Settings); avatars; a **real, repository-backed** search provider and five commands; the shared DS-05 Timeline over bounded, cursor-paginated `GET /person/:personId/activity` reads; and PII kept out of Activity payloads. DS-11 baseline proven — axe, 44px touch targets and no horizontal overflow from 320px up.

**Known limitations.**

- **Meetings contribute structurally, not semantically.** An attended Meeting's own record events appear (it is a linked record), but the meeting's substance — its decisions, outcomes and follow-through, scoped to the attendee — does not. [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration), whose seam is specified in [§4a](#the-meet-03-integration-seam).
- **A very well-connected Person sees a bounded history.** One read anchors at most 40 linked records; beyond that the tab discloses the bound rather than hiding it.
- **Filtering matches over loaded pages**, per the shared DS-05/DS-07 contract — narrowing a long history is filter + Load more, not a server-side query.
- **Stay-in-touch has an input but no signal.** The follow-up-frequency field is persisted and editable, but nothing derives last-contact, due or overdue state from it, and nothing surfaces it. [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals).
- Some record quick actions (Diary / Meeting / New note) are honest placeholders rather than wired flows.

**Deferred work.** Meetings contributing their substance ([MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration)); stay-in-touch signals; mobile completion beyond the DS-11 baseline; and all external integrations (Google Contacts, Microsoft 365, calendar, email/SMS) — the kernel is designed to accept these without an API break.

**Build order — still binding.** There is exactly **one** Person history surface and **one** endpoint behind it. PEOPLE-02 widened `/person/:personId/activity` into the unified relationship history; [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) contributes meeting participation to that same stream (seam: [§4a](#the-meet-03-integration-seam)); PEOPLE-03 derives its signal from it; mobile comes last. A separate "Meetings" or "Interactions" tab on the Person record would fork the model and re-create [DEBT-07](../product/PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2) inside V2.

**Relevant roadmap items.** [PEOPLE-01](../roadmap/ROADMAP_V2.md#-people-01--person-record) ☑ · [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline) ☑ · [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) ☐ · [PEOPLE-04](../roadmap/ROADMAP_V2.md#-people-04--mobile) ☐ · [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) ☐.

**Relevant product-debt items.** [DEBT-07](../product/PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2) · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1) · [DEBT-40](../product/PRODUCT_DEBT.md#-debt-40--two-migrations-share-the-number-0013--p3) (this module owns one of the two `0013` migrations — always cite it by full filename).

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
