# DIARY_MODULE.md — The Diary: architecture & kernel foundation

> **Status:** DIARY-01A (architecture & kernel foundation) is ☑ Done, and
> DIARY-01 (the Timeline screen & quick capture) is ☑ Done — see [§7](#7-diary-01--the-timeline-screen--quick-capture-ui). This
> document describes the Diary's philosophy, its kernel architecture, its
> responsibilities and boundaries, the DIARY-01 UI built on it, and the future
> roadmap it enables. It is the authoritative developer reference for the Diary.
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
  title**; the occurred instant defaults to now, the timezone to the persisted
  owner timezone, the source to `manual`.

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
STRICT `diary_entry_details` table (migration `0011`) owns **only**
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
non-`diary` entity impossible and prevents a destructive cascade. **Every** Diary
Entry has exactly one row here (the Timeline read INNER-JOINs it, so a
detail-less `diary` entity would be invisible). Two mechanisms uphold that: new
entries are written atomically with the `entities` row and creation is reserved
(§3.5), and migration `0011` **backfills** any pre-existing `diary` entity —
which the generic repository could create before DIARY-01A — with an
explicit-default row (`entry_type='note'`, `occurred_at=created_at`,
`timezone='UTC'`, `source='manual'`). This deliberately differs from
`note_details`' no-backfill because the read semantics differ (INNER vs LEFT
JOIN); no entity is left in a partial state.

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
`groupEntriesByMonth`) over a returned page, so the future Desktop Timeline and
Mobile Capture share one correct grouping implementation. Grouping resolves each
entry's `occurredAt` in an **explicit, required display timezone** (normally the
active user/workspace zone) — not a hidden UTC default — so an entry near local
midnight lands under the correct **local** calendar day (an entry at 23:30 in
Sydney groups under that Sydney day, not the previous UTC day), correct across
daylight-saving transitions. It uses `Intl.DateTimeFormat` with an explicit
`timeZone`, which is deterministic and hydration-safe. `list` returns a flat,
ordered page; grouping composes on top.

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
| `app/kernel/diary/diary-grouping.ts` | Pure day/month grouping in an explicit display timezone. |
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

- **DIARY-01 — Timeline screen & quick capture.** ☑ Done — see [§7](#7-diary-01--the-timeline-screen--quick-capture-ui).
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

---

## 7. DIARY-01 — the Timeline screen & quick-capture UI

> **Superseded by DIARY-01B (§8).** This section records the original DIARY-01
> presentation. The route/repository/endpoint contracts below are unchanged, but
> the DIARY-01 view components (`DiaryTimeline.tsx`, `QuickCapture.tsx`,
> `DiaryEntryEditor.tsx`) were replaced by the responsive workspace in §8; see
> §8.6 for the current source map.

DIARY-01 builds the first real Diary experience on the DIARY-01A foundation,
replacing the `/diary` `ModuleComingSoon` placeholder. It composes the accepted
foundation and the design system — **no new store, link model, Activity stream,
Markdown parser, filter framework or ADR** was introduced.

### 7.1 Timeline route (`app/modules/diary/routes/index.tsx`)

A loader-backed `/diary` route reads the workspace-bound, reserved
`DiaryRepository` through `resolveAuthenticatedWorkspaceScope` (never the generic
entity collection), lists a **bounded, cursor-paginated** page (25/page) in
deterministic `(occurred_at, id)` newest-first order, and groups it with the pure
kernel `groupEntriesByDay` in the explicit display timezone (§7.5). Entry-type
and occurred-at-range filters are URL-backed; a malformed or scope-mismatched
cursor degrades to a calm error state rather than a 500. Grouping is delegated
entirely to the kernel helper — the module never re-implements day computation;
"Load more" merges only the boundary day by its `YYYY-MM-DD` key.

### 7.2 Quick capture (`QuickCapture.tsx`)

A compact capture surface sits at the top of the Timeline — **no modal, no
navigation**. The common path is a type (built-in registry selector) and a title,
in under ten seconds; `Cmd/Ctrl+Enter` submits from any field; an optional
Markdown body and an optional owner-local "when" (for backdating) stay secondary
behind a disclosure. Capture goes through `DiaryRepository.create` (via
`POST /diary/new`) — never a bare `entities.create`. `useForm` gives
duplicate-submit prevention and draft retention on failure; success is announced
via DS-10 feedback, the Timeline revalidates so the new entry appears in place,
and the form remounts (clearing it) with focus returned to the title.

### 7.3 Entry editor (`DiaryEntryEditor.tsx`)

Editing opens the shared DS-03 Drawer from an entry (`?drawer=edit:<id>`), so it
is deep-linkable, Back/Forward correct, and restores focus to the opener. The
form loads the entry from the `GET /diary/:id` resource route (so a deep link to
an off-page entry still works) and fails closed for a missing, deleted,
wrong-type or cross-workspace id. `POST /diary/:id/mutate` splits the write per
ADR-041 — **title via `EntityRepository.update`, the detail slice via
`DiaryRepository.update`** — validating every field before either write and
reporting partial success honestly (the two repositories are two writes, never a
forged atomic pair). Markdown source is preserved exactly; previews render only
through the one FND-08 sink. Delete/restore UI is deliberately deferred (the
NOTES-01C shared lifecycle pattern can be adopted later).

### 7.4 Type filter (`DiaryTypeFilter.tsx`)

A restrained, single-select, URL-backed entry-type segment — not the full DS-07
clause builder. It reads and writes one `type` param, drops `cursor` on change (so
filter-scope changes reset pagination), and "All" clears the filter.

**Shared-filter decision (post-NOTES-01C).** NOTES-01C promoted the Projects
segment to a shared `SegmentedFilter` (`app/shared/segmented-filter`). The Diary
type filter deliberately stays module-local rather than adopting it, because the
shared control does not fit two Diary requirements:

1. **Pagination-cursor reset.** The Diary Timeline cursor is scope-bound — the
   kernel rejects a cursor issued for one filter under a different one
   (`decodeDiaryCursorForScope`). `DiaryTypeFilter` therefore DROPS `cursor` when
   the filter scope changes; the shared `SegmentedFilter` only sets/clears its own
   param and preserves every other param, so a deep-linked `?type=…&cursor=…`
   would carry a stale, now-invalid cursor into the new scope and degrade the
   Timeline to its error state.
2. **Facet + presentation.** The shared control models a single mutually-exclusive
   lifecycle STATE (Active/Deleted, Open/Completed) with a few `dh-segmented`
   options; the Diary filter is a different facet — an OPEN-vocabulary entry
   TYPE — presented as ~10 restrained chips, for which the pill treatment reads
   better than a bordered few-state segment.

Adding cursor-reset semantics to the shared component solely for Diary would be a
speculative shared change for a different facet; the module-local control is a
single-purpose composition (the same pattern the shared control itself came
from), not a competing generic abstraction. If a future shared filter grows an
explicit "reset these params on change" contract, Diary can revisit this.

### 7.5 Display timezone — persisted owner preference

The Timeline groups and labels entries in a **display timezone** that is
explicit and hydration-safe (never UTC, never machine-local). Since SET-01 the
Diary route reads `WorkspaceScope.appPreferences.timezone` (default
`Australia/Sydney`) and uses it for Day-mode windows, Timeline grouping and new
entry capture defaults. An explicit `?mode=day` or `?mode=timeline` still wins
over the default Diary mode preference; the Diary's URL-backed state architecture
is unchanged. `occurred-time.ts` keeps the small DST-aware owner-local ⇄ UTC
conversion the capture/edit "when" control needs (each conversion done against an
explicit IANA zone via `Intl.DateTimeFormat`), tested across both offsets, local
midnight and both daylight-saving transitions. A converted instant must
round-trip EXACTLY to the entered wall-clock, so an invalid calendar date (JS
would normalise `Feb 31`) and a nonexistent spring-forward local time are
rejected (the route surfaces its field error) rather than silently changed; an
autumn overlap time is accepted deterministically at the standard-time
occurrence. Day-range filters bound the day inclusively — the upper bound is the
next local midnight minus 1 ms, so the final 59.999 s of the day stay inside an
inclusive `occurredTo`. This is composition of the accepted foundation and
design system, so **no new ADR** was warranted.

### 7.6 Source map (DIARY-01 additions)

| File | Responsibility |
| --- | --- |
| `app/modules/diary/routes/index.tsx` | Timeline loader + view host. |
| `app/modules/diary/routes/new.tsx` | `POST /diary/new` capture action. |
| `app/modules/diary/routes/entry.tsx` | `GET /diary/:id` single-entry read (editor). |
| `app/modules/diary/routes/mutate.tsx` | `POST /diary/:id/mutate` coordinated edit. |
| `app/modules/diary/DiaryTimeline.tsx` | Day-grouped Timeline, pagination, states, editor Drawer wiring. |
| `app/modules/diary/QuickCapture.tsx` | Sub-ten-second capture form. |
| `app/modules/diary/DiaryEntryEditor.tsx` | Route-backed Drawer editor. |
| `app/modules/diary/DiaryTypeFilter.tsx` | Restrained URL-backed entry-type filter. |
| `app/modules/diary/WhenField.tsx` | Owner-local "when" control over the DS-06 field anatomy. |
| `app/modules/diary/diary-view.ts` | View model: serialisation, label fallback, filter parsing. |
| `app/modules/diary/occurred-time.ts` | Display timezone seam + DST-aware owner-local ⇄ UTC + day headings. |
| `app/styles/diary.css` | Timeline & capture styles (DS-01 tokens only). |

## 8. DIARY-01B — the responsive day-timeline workspace

DIARY-01B is a **corrective visual & interaction follow-up** to DIARY-01: same
accepted architecture (§3–§4), a genuinely timeline-first presentation. **No new
store, link model, Activity stream, Markdown parser, migration or ADR** was
introduced — it composes the existing route, repository, grouping and conversion
foundations with the shared design system. The always-open capture card is gone;
`/diary` is now a two-mode, docked-details workspace that reads as one coherent
toolbar over a real visual timeline. The DIARY-01 `DiaryTimeline.tsx`,
`QuickCapture.tsx` and `DiaryEntryEditor.tsx` components were replaced by the
files in §8.6; their route/repository/endpoint contracts are unchanged.

### 8.1 Two real modes: Day and Timeline

The loader (`routes/index.tsx`) drives two modes off the `mode` URL param:

- **Day** (default): the entries for ONE selected local calendar day. It defaults
  to today unless a valid `?date=YYYY-MM-DD` is present. The day's occurred-at
  range is resolved with the existing display-zone helpers
  (`startOfLocalDayUtc`/`endOfLocalDayUtc`, §7.5) — never re-derived in the
  browser — so a 23:30-local entry files under its local day, DST-correctly, and
  the inclusive end-of-day bound keeps the final second of the day in view.
- **Timeline** (`?mode=timeline`): the multi-day historical timeline, with the
  bounded, cursor-paginated read model and "Load more" unchanged.

Week and Month are **deliberately absent** — a tab that does nothing is a dead
control. They appear in the mock-up as longer-term direction only, and will ship
when genuinely implemented.

### 8.2 URL state and cursor hygiene

`mode`, `date`, `type` and `cursor` are all URL-backed (deep-linkable,
Back/Forward correct). Because the Timeline cursor is scope-bound
(`decodeDiaryCursorForScope`, §7.4), **every scope change drops `cursor`**:
switching mode (`DiaryModeTabs`), changing the day (`DiaryDayNavigator`) and
changing the type (`DiaryTypeFilter`) all delete it. An invalid `?date=` degrades
to today rather than a broken range. Filter-chip counts are shown **only when
they are honest** — Day mode, unfiltered, single page (the loader passes
`typeCounts` only then; otherwise the chips show labels alone).

### 8.3 Desktop docked details (the shared DS-10 Inspector)

Opening an entry preserves the timeline beside it. Rather than a second drawer
framework, the details surface reuses the shared **DS-10 Inspector**
(`app/shared/inspector`): a non-modal, right-docked `complementary` panel on
desktop (the page reflows via padding, never covered) and a focus-trapped modal
sheet on mobile — one implementation, reusing the DS-03 focus/scroll-lock/inert
hooks. Selection is route-backed via `?inspector=view:<id>` / `edit:<id>`, so it
is deep-linkable and Back/Forward correct, and focus restores to the row on
close. The panel shows a polished **read** state (title, type, occurred date/time,
backdated status, body, created/updated) with a deliberate **edit** state; the
edit form keeps ADR-041's split write (title via `EntityRepository`, detail slice
via `DiaryRepository`). A timeline row is an accessible title button that stretches
over the whole row, with a **separate** Edit button — no interactive control is
nested inside another.

### 8.4 Compact capture entry point

The permanently-open capture card is replaced by a compact flow launched on
demand — the desktop **New entry** button, the **`c`** keyboard shortcut, or the
mobile **floating action** — hosted in the Inspector (`?inspector=new`). The
chooser presents the real entry types with icons; the fast path is unchanged
(retain the default type, type a title, submit; `Cmd/Ctrl+Enter` from any field;
body and backdated "when" behind a disclosure). Capture still goes through
`DiaryRepository.create` (`POST /diary/new`), with duplicate-submit prevention and
draft retention. After capture the timeline revalidates; a backdated entry that
belongs to **another day** is surfaced honestly with a "View that day" action
rather than silently misplaced.

### 8.5 Themes, responsiveness and deferrals

Light and dark come entirely from the DS-01 token maps (`data-theme`) — the CSS
hard-codes no colour and no theme, and type/selection/state are never signalled by
colour alone (icon nodes, type badges, `aria-current`, labelled chips). The layout
is intentional at 320/375/430px: a compact bar, the date navigator, horizontally
scrollable filter chips, a clear rule with time labels, touch-friendly rows, and
the floating capture action; no horizontal page overflow.

Mock-up elements the current data model does not support are **omitted cleanly,
not faked**: mood, attendees, linked records, attachments, projects and files are
not part of the Diary detail slice, so no "No data" placeholder sections were
invented. The shell-level bottom tab bar in the mock-up remains a deferred shell
concern (PRODUCT_EXPERIENCE post-launch); this task adds only a Diary-scoped
floating capture action, integrated with the existing shell.

### 8.6 Source map (DIARY-01B)

| File | Responsibility |
| --- | --- |
| `app/modules/diary/routes/index.tsx` | Day/Timeline loader (mode + date range) + workspace host. |
| `app/modules/diary/routes/entry.tsx` | `GET /diary/:id` read — now returns presentation-ready read-view labels (type, occurred, created/updated). |
| `app/modules/diary/DiaryWorkspace.tsx` | Workspace: Inspector wiring, toolbar, states, capture launch, `c` shortcut, mobile FAB. |
| `app/modules/diary/DiaryTimelineBody.tsx` | The visual timeline (rule, icon nodes, compact rows, selection, edit action). |
| `app/modules/diary/DiaryModeTabs.tsx` | Day/Timeline switch (drops cursor; leaving Day drops date). |
| `app/modules/diary/DiaryDayNavigator.tsx` | Prev/next/Today + native date picker (URL-backed, drops cursor). |
| `app/modules/diary/DiaryTypeFilter.tsx` | Compact scrollable type chips with honest counts (drops cursor). |
| `app/modules/diary/DiaryDetailsPanel.tsx` | Inspector read/edit host (loads entry, read view, edit form). |
| `app/modules/diary/DiaryCapture.tsx` | Compact capture chooser + fast path (Inspector-hosted). |
| `app/modules/diary/diary-icons.tsx` | Entry-type → shared-icon map for timeline nodes / chooser. |
| `app/modules/diary/occurred-time.ts` | Adds day-key helpers (add days, validate, long/medium labels, zoned date labels). |
| `app/styles/diary.css` | Rebuilt timeline workspace styles (DS-01 tokens only). |
