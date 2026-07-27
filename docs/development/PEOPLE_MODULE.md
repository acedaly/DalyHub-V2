# PEOPLE_MODULE.md — The People foundation

> **Status:** PEOPLE-01 implemented. People are a first-class Spine-backed entity
> in DalyHub, comparable to Areas, Goals, Projects, Notes and Day Diary.
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
- **The relationship history** is the shared FND-05 Activity stream, rendered by
  the DS-05 Timeline.

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
- **Timeline** — the relationship history via the DS-05 Timeline.
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

## 5. Accessibility & mobile

- Keyboard-complete; visible focus (inherited global ring); WAI-ARIA tabs.
- Screen-reader labels on every control; icons decorative; meaning never
  colour-only (Archived is a text badge, relationship is a labelled chip).
- 44px minimum touch targets (shared `--dh-control-height-lg`).
- No horizontal overflow from 320px up (proven across the responsive matrix).
- `person_details` PII never enters an Activity payload and never leaves the
  workspace.

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

### Meeting integration (planned)

A Meeting will be its own entity linked to one or more People via
`person.linked_meeting`. The Person Timeline already renders linked-record
Activity, and the Linked tab already reserves a "Meetings" group — so wiring
Meetings is additive.

### Relationship model (planned depth)

The single `relationship` field is the foundation. A richer model (per-link
relationship qualifiers, bidirectional family/colleague edges) can be layered on
the EntityLink primitive without changing the Person record.

---

## 7. Not implemented (by design)

No external APIs, Google Contacts, Outlook, meeting scheduler, calendar, email
sending or SMS. This PR is the DalyHub foundation only.
