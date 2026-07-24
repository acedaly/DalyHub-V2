# DIARY_MODULE.md — The Diary: architecture & kernel foundation

> **Status:** DIARY-01A (architecture & kernel foundation) is ☑ Done. This
> document describes the Diary's philosophy, its kernel architecture, its
> responsibilities and boundaries, and the future roadmap it enables. It is the
> authoritative developer reference for the Diary.
>
> Related: [`ARCHITECTURE_DECISIONS.md` → ADR-041](../decisions/ARCHITECTURE_DECISIONS.md#adr-041--the-diary-an-interstitial-journal-built-on-the-kernel-with-chronology-as-its-primary-organising-principle) ·
> [`ACTIVITY_TIMELINE.md`](./ACTIVITY_TIMELINE.md) ·
> [`NOTES_MODULE.md`](./NOTES_MODULE.md) ·
> [`SPINE_MODEL.md`](./SPINE_MODEL.md) ·
> [`MODULES.md`](./MODULES.md).

---

## 1. Philosophy

The Diary is **the chronological history of a user's life inside DalyHub** — an
_Interstitial Journal_ for the meaningful moments that fall between the
structured Area → Goal → Project → Task spine: a meeting had, a decision made, a
reflection, a trip, a phone call, an idea worth remembering.

The Diary is **not** another notes application, **not** an activity log, and
**not** a task list. Its design philosophy is:

> **Capture first. Organise later.**

A user should be able to capture a meaningful moment in **under ten seconds**;
everything else — links, structure, classification — connects itself _around_ the
captured moment afterwards. Two architectural consequences follow, and DIARY-01A
delivers both:

- **Chronology is the primary organising principle.** A Diary Entry is anchored
  to _when the moment occurred_, not when the row was written (§3.3).
- **Capture-first defaults.** The minimum viable capture is a **type and a
  title**; the occurred instant defaults to now, the timezone to UTC, the source
  to `manual`.

---

## 2. What DIARY-01A is (and is not)

DIARY-01A establishes the **architecture and kernel foundation** every future
Diary feature builds on. It is **NOT the Timeline UI**.

**Shipped:** the canonical Diary Entry model, the extensible entry-type
vocabulary, the persistence layer (migration `0011`), the authoritative
`DiaryRepository` (capture + edit + Timeline read model), pure day/month
grouping, the Activity-vs-Diary boundary, the reservation of the `diary` entity
type, comprehensive tests, and this documentation + [ADR-041](../decisions/ARCHITECTURE_DECISIONS.md#adr-041--the-diary-an-interstitial-journal-built-on-the-kernel-with-chronology-as-its-primary-organising-principle).

**Deliberately NOT shipped** (later roadmap items — the foundation enables them
without a rewrite): the Timeline screen, any desktop/mobile UI, the quick-capture
interface, AI classification, voice/photo/email/calendar capture, rich text, a
Markdown editor, and any search redesign.

---

## 3. Architecture

### 3.1 A Diary Entry is a first-class `entities` record of the `diary` type

The Diary reuses the FND-02 entity kernel (ADR-009) for identity, title,
workspace and lifecycle — exactly as Notes do. A Diary Entry is deliberately
**outside the spine** (AGENTS.md §4 lists Diary as a _supporting_ entity type):
it has no parent, no rollup and never completes. This reuses the kernel's proven
substrate rather than inventing a parallel "journal store".

### 3.2 The chronology-bearing detail slice: `diary_entry_details`

The base `entities` table models no occurred-at, entry type, body or source, so —
mirroring `task_details`/`goal_details`/`note_details` (ADR-028) — an additive,
STRICT `diary_entry_details` table (migration `0011`, no backfill) owns **only**
the slice `entities` does not:

| Column | Meaning |
|---|---|
| `entry_type` | The kind of moment (open, validated identifier — §3.4). |
| `body` | OPTIONAL Markdown source (`NULL` when there is no body). |
| `occurred_at` | The instant the moment occurred (UTC) — the Timeline sort key. |
| `timezone` | The IANA timezone captured at occurrence (storage stays UTC). |
| `source_channel` / `source_reference` | Where the entry was captured from. |
| `updated_at` | When the detail slice last changed. |

Its composite foreign key `(workspace_id, entity_id, entity_type='diary') →
entities(workspace_id, id, type)` `ON DELETE RESTRICT` makes a details row on a
non-`diary` entity impossible and prevents a destructive cascade. Unlike
`note_details`, **every** Diary Entry has exactly one row here, written atomically
with the `entities` row (§3.5).

### 3.3 Chronology first: `occurred_at`, not `created_at`

The single decision that defines the Diary: an entry's position in time is
`occurred_at` (the moment), distinct from `created_at` (the record). This makes
**Memory Mode** (backdating a moment from last week) and future-dating work with
no rewrite — `occurred_at` is validated as a real instant with **no recency
constraint**, and the Timeline orders by it. The `timezone` is carried so a
later UI can render an entry in its local wall-clock time; storage stays UTC.

### 3.4 Entry types are an OPEN, registration-based vocabulary

The initial nine types are built-in descriptors:

`note` · `conversation` · `meeting` · `decision` · `idea` · `reflection` ·
`event` · `travel` · `observation`

But an entry type is **stored as an ordinary validated identifier**, constrained
only by syntax — never a database enum or a closed union. A future custom type
(`custom.workout`), imported type, or AI-proposed type persists and round-trips
with **no migration and no code change**. The immutable, extensible
`DiaryEntryTypeRegistry` supplies human labels for known types (labels live in
code, never in the database); an unregistered type still reads back and renders
via a safe fallback. Persistence validates _syntax_, never _registry
membership_ — registration is a presentation concern, not a storage gate.

### 3.5 The `DiaryRepository`: one authority

The storage-independent `DiaryRepository` (`app/kernel/diary`) is the single
authority over Diary Entries; the D1 adapter
(`app/platform/storage/d1/d1-diary-repository.ts`) is the only place SQL lives.

- **`create`** — writes the `entities` row, the `diary_entry_details` row and one
  `diary_entry.created` Activity event in **ONE `D1Database.batch()`**
  (all-or-nothing). `occurred_at` defaults to the capture time; any past/future
  instant is accepted. Creation is **reserved**: the generic `EntityRepository`
  refuses to create a bare `diary` entity, so an entry with no place on the
  Timeline is impossible (mirrors the spine's ADR-014 §4.7 reservation).
- **`update`** — edits only the detail slice (type/body/occurred-at/timezone/
  source), never the title. One conditional statement, atomic with its
  `diary_entry.updated` event, idempotent on an unchanged edit even under
  concurrency.
- **`get`** — a single entry; fails closed (`null`) for missing/deleted/
  wrong-type/cross-workspace ids.
- **`list`** — the **Timeline read model** (§3.6).

Rename, soft-delete and restore of a Diary Entry are **ordinary entity-header
lifecycle** and stay the generic `EntityRepository`'s (like a Note) — no
duplicated lifecycle ownership. Only creation is reserved, because only creation
establishes the chronological invariant.

### 3.6 The Timeline read model

`DiaryRepository.list` returns a **bounded, cursor-paginated** page of entries
ordered by `(occurred_at, id)` — **newest- or oldest-first** — with optional
**filtering hooks**: entry-type (any-of), occurred-at range, and include-deleted.
Filters fold into parameterised SQL over the `(workspace_id, occurred_at,
entity_id)` and `(workspace_id, entry_type, occurred_at, entity_id)` indexes (no
N+1, no unbounded scan). The cursor is **dedicated and versioned**, bound to
workspace + order + filter + range + delete-mode — a cursor from any other scope
is rejected, never reinterpreted.

**Day and month grouping** are PURE kernel functions (`groupEntriesByDay`,
`groupEntriesByMonth` — UTC keys, no `Intl`) over a returned page, so the future
Desktop Timeline and Mobile Capture share one correct grouping implementation.
`list` returns a flat, ordered page; grouping composes on top.

---

## 4. Responsibilities & boundaries

The Diary **owns** only its chronological detail slice and the Timeline read
model. Everything else is a shared kernel primitive it reuses:

| Concern | Owned by |
|---|---|
| Entry identity, title, rename, soft-delete, restore | generic `EntityRepository` (ADR-009) |
| Entry type, body, occurred-at, timezone, source | `DiaryRepository` (this module) |
| Relationships (to Projects, Areas, Goals, Tasks, Notes, People) | FND-04 `EntityLinks` (ADR-002/011) |
| Audit trail | FND-05 Activity stream (ADR-005/012) |
| Markdown body rendering | FND-08 pipeline (ADR-006/015) |

There is **no** Diary-specific link table, **no** second event history, and
**no** second Markdown pipeline.

### 4.1 Relationship to Activity — the load-bearing distinction

- **Activity** is the automatic, system-authored **audit trail of changes to
  records**. _"Task completed", "Project archived", "Link created", "Note content
  updated"_ are Activity — derived, immutable, non-editable, emitted as the side
  effect of a mutation. Activity answers **"what changed, and when?"**
- **The Diary** is the intentional, human-authored record of **lived moments**.
  _"Meeting with Operations", "A reflection", "Travel to Kyoto", "Phone call",
  "Decided to pause the redesign"_ are Diary Entries — first-class records the
  user captures, edits, links and backdates. The Diary answers **"what happened
  in my life, and when?"**

A Diary Entry can _reference_ Activity (a day's completed tasks) via links, and a
Diary mutation _emits_ Activity (its own audit event) — but a Diary Entry is a
durable, editable, user-owned record while an Activity event is an immutable
system fact. Body content **never** leaks into the Activity payload (the Diary is
sensitive data, AGENTS.md §17): payloads carry only structural metadata (entry
type, occurred-at).

### 4.2 Relationship to Notes

A **Note** is a durable _document_ organised by topic and link, edited over its
whole life, with no intrinsic position in time. A **Diary Entry** is a _moment_
organised by chronology, anchored to `occurred_at`. A Note answers "what do I know
about X?"; a Diary Entry answers "what happened on this day?". A Diary Entry's
optional body reuses the Note's exact Markdown pipeline — shared content
mechanics, separate identity.

### 4.3 Relationship to the Timeline (DS-05)

The shared DS-05 Timeline & Activity Feed renders the **Activity** model. The
Diary's `list` is a **separate, entry read model** ordered by `occurred_at`. The
future Diary Timeline UI (DIARY-01+) will render Diary Entries grouped by day
using this repository and the pure grouping helpers — it is not the Activity
Feed, though both present a chronological surface.

### 4.4 Relationship to Projects / Areas / Goals / Tasks (the spine)

The spine is _future-facing units of intended action_ with parentage, rollup and
completion. A Diary Entry is _past/present-facing_ and structureless — it never
completes, never rolls up, never has a parent. A Diary Entry _attaches across_
the spine via EntityLinks (e.g. "this reflection relates to the Q3 project")
without becoming part of it.

---

## 5. Source map

| Path | Contents |
|---|---|
| `app/kernel/diary/diary-identifiers.ts` | The `diary` type, its reservation, the two Activity types. |
| `app/kernel/diary/diary-entry-type.ts` | The extensible entry-type vocabulary + registry. |
| `app/kernel/diary/diary-entry.ts` | The canonical `DiaryEntry` model + create/update inputs. |
| `app/kernel/diary/diary-validation.ts` | Boundary validation (capture-first defaults, IANA timezone, optional body). |
| `app/kernel/diary/diary-cursor.ts` | The scope-bound, versioned Timeline cursor. |
| `app/kernel/diary/diary-grouping.ts` | Pure day/month grouping (UTC, no `Intl`). |
| `app/kernel/diary/diary-repository.ts` | The `DiaryRepository` contract + Timeline input/page types. |
| `app/kernel/diary/diary-errors.ts` | The typed error family. |
| `app/platform/storage/d1/d1-diary-repository.ts` | The D1 adapter. |
| `migrations/0011_create_diary_entries.sql` | The `diary_entry_details` table + indexes. |
| `app/modules/diary/module.ts` | The module manifest (entity type + Activity types). |

Tests: `test/unit/diary/*` (pure: entry-type, cursor, grouping, validation,
architecture) and `test/kernel/diary-entry.test.ts` /
`diary-timeline.test.ts` / `migration-0011.test.ts` (real Workers/D1).

---

## 6. Future roadmap enabled by this foundation

Everything below is a purely additive layer over the stable DIARY-01A contract —
no architectural rewrite required:

- **DIARY-01 — Timeline screen & quick capture.** Render `list` grouped by day
  (via `groupEntriesByDay`); a sub-ten-second capture form over `create`.
- **DIARY-02 — Day context links.** Surface a day's related meetings/tasks/people
  via EntityLinks — a thin layer, since relationships are already kernel links.
- **DIARY-03 — Mobile capture.** Capture on the go; `source.channel = "mobile"`.
- **Memory Mode.** Backdating already works: `occurred_at` accepts any instant.
- **AI-assisted classification.** Propose an `entry_type` — the open vocabulary
  and the AI-proposal architecture (ADR-004) mean no schema change.
- **Voice / photo / email / calendar capture.** Each is simply another
  `source.channel` value (`voice`, `photo`, `email`, `calendar`) — no migration.
- **Linked conversations / people / files.** Ordinary EntityLinks to future
  entity types.
- **Month grouping.** `groupEntriesByMonth` already ships for a future month view.
