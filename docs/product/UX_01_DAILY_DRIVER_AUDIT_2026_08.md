# UX-01 — Daily-Driver UX, UI & Product Audit (2026-08-01)

> A full-product UX, UI and product audit of DalyHub as it stands at `dab275c`,
> answering one question: **"If this launched tomorrow, what would stop someone
> using it every day?"**
>
> This is an audit record, not a redesign proposal. Every finding is a divergence
> from something DalyHub already decided — [`AGENTS.md`](../../AGENTS.md), the
> [Design System](../design/DESIGN_SYSTEM.md), the
> [Product Experience](../design/PRODUCT_EXPERIENCE.md) spec or the
> [accessibility baseline](../development/ACCESSIBILITY_RESPONSIVE.md) — or a
> capability the product claims and does not have.

---

## Documents reviewed before implementation

Read in full before any code was changed:

| Document | Why |
|---|---|
| [`AGENTS.md`](../../AGENTS.md) | The constitution — UX, interaction, accessibility, performance and Definition of Done. |
| [`docs/roadmap/ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) | Item status, the remaining sequence, and what previous polish passes (PX-04/05/06, POLISH-01, THEME-01) already closed. |
| [`docs/product/PRODUCT_DEBT.md`](PRODUCT_DEBT.md) | The full register, DEBT-01 → DEBT-59, so nothing here re-reports known debt as new. |
| [`docs/design/DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) | The shared patterns each finding is measured against. |
| [`docs/design/PRODUCT_EXPERIENCE.md`](../design/PRODUCT_EXPERIENCE.md) | The screen-level grammar (pane header, one primary action, empty states). |
| [`docs/development/ACCESSIBILITY_RESPONSIVE.md`](../development/ACCESSIBILITY_RESPONSIVE.md) | The WCAG 2.2 AA baseline and the responsive/touch-target contract. |
| [`docs/product/UI_UX_COHERENCE_AUDIT_2026_07.md`](UI_UX_COHERENCE_AUDIT_2026_07.md) | The previous audit, so this one reports the delta rather than repeating it. |
| [`docs/product/UX_01_IMPLEMENTATION_NOTE_2026_07_28.md`](UX_01_IMPLEMENTATION_NOTE_2026_07_28.md) | What the earlier UX-01 slice did and explicitly did not do. |
| [`docs/product/PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md) | The "how it should feel" test each finding is judged by. |
| [`docs/decisions/ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) | ADR-016/021/023/024/029/043/045/053/059/064 — so a "fix" never contradicts an accepted decision. |
| [`docs/architecture/ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) | The module/kernel boundary any cross-module read must respect. |
| [`docs/design/THEME_ACCEPTANCE_MATRIX.md`](../design/THEME_ACCEPTANCE_MATRIX.md) | The five-theme contract new presentation must satisfy. |
| [`docs/development/*`](../development/) | Every module implementation note: Today, Tasks, Projects, Areas, Goals, Notes, Meetings, People, Assets, Diary, Reviews, Settings, Help/About, plus Shared Forms, Shared Search, Command Palette, Activity Timeline, Relationships, App Shell, Modules, Data Kernel. |

Code read module by module: `app/shared/*` (shell, card, collection-layout,
record-layout, drawer, sheet, forms, commands, search, empty-state, load-more,
overflow-menu, capture, task-record), and every module under `app/modules/*`
(today, tasks, projects, areas, goals, notes, meetings, people, assets, diary,
reviews, settings, help, about, ai) with their routes and manifests.

---

## Headline

**DalyHub is in far better shape than a first-pass audit would assume.** The
shared system is real and dominant: one Card, one Record Layout, one Drawer, one
Sheet, one Empty State, one overflow menu, one lifecycle vocabulary, one activity
model, one search, one forms system, one theme token file. The previous four
consistency passes (DS-12, PX-04, PX-05, PX-06) plus MOBILE-01, THEME-01 and
POLISH-01 did their jobs, and most of what a generic audit would flag has already
been closed and is recorded as closed.

What remains is narrower and more specific: **a handful of places where the
product tells the owner something that is not true, and a handful where two
surfaces derived from the same model disagree.** Those are the findings below.

Severity: **P1** = the product misleads the owner or blocks a daily task ·
**P2** = real friction or inconsistency · **P3** = polish.

---

## Phase 1–2 — Navigation

### F-01 (P1) — The desktop rail loses its "you are here" row on every record route
`app/shared/shell/PrimaryNavigation.tsx`

The rail rendered `<NavLink … end>`, which marks a row current only on an EXACT
path match. Opening any record — `/projects/pr-1`, `/notes/n-2`, `/asset/a-3`,
`/meeting/m-4`, `/tasks/tk-5` — therefore left **no** navigation row current at
all. The owner's structural anchor disappears precisely on the screens they spend
the most time on.

Worse, it is an internal disagreement: the **phone bottom bar** reads the *same*
registry-derived model and matches nested paths correctly
(`isDestinationActive` in `mobile-navigation.ts`), so DalyHub answered "which
module am I in?" two different ways depending on the viewport.

**Fixed.** One shared rule (`app/shared/shell/navigation-active.ts`) now serves
the rail, the "More" sheet and the phone bar. Longest match wins, so exactly one
row is ever current.

### F-02 (P3) — Help and About do not name themselves on a phone
`app/modules/help/routes/index.tsx`, `app/modules/about/routes/index.tsx`

The phone top bar shows the route title published by `PaneHeader`/`RecordLayout`.
Surfaces that compose neither fall back to the workspace name, so a phone user on
Help sees "DalyHub". The two create pages below have the same cause and are fixed;
Help and About are recorded rather than fixed because both use a deliberate
bespoke page shape that a `PaneHeader` would change visually — a presentation
decision, not a defect to sweep in silently.

**Recorded** as DEBT-60.

---

## Phase 3 — Today

### F-03 (P1) — Today had no answer to "what is on today?"
`app/modules/today/landing/layout.ts`

Meetings shipped weeks ago (MEET-01 → MEET-04) and had **no presence on the
landing page at all**. Today could tell the owner what to do, what had slipped,
what was waiting and what they own — but not that they are in a meeting at two.
For a surface whose whole job is "what should I do now?", that is a gap in the
answer, not a missing nicety.

**Fixed.** A `meetings` widget over two bounded, workspace-scoped repository reads
(`recent` + `upcoming`, split at now, filtered to the owner's calendar day), with
times formatted in each meeting's own timezone so the widget and the record can
never disagree. A meeting already under way says "Started" **in words**. An empty
day teaches the next step.

### F-04 (P1) — A permanent "coming soon" panel took a section of the most-used screen, every day
`app/modules/today/landing/widgets.tsx`

The **Focus** widget listed three unbuilt capabilities ("Focus mode…", "Deep-work
sessions…", "A Pomodoro timer…") under the line "coming soon". It had never once
shown information.

This is exactly the reasoning [POLISH-01](../roadmap/ROADMAP_V2.md#-polish-01--cross-module-visual-icon-and-today-polish)
recorded when it removed the Weather and Upcoming-calendar panels
([DEBT-53](PRODUCT_DEBT.md)): *"a panel that has never once shown information is
not a placeholder — it is a promise the product keeps failing to keep."* The rule
was applied to two panels and not to the third.

**Fixed.** Removed. A persisted layout naming `focus` is normalised on read, so no
owner's arrangement breaks.

### F-05 (P2) — Today served dead demonstration data, and could still render untrue copy
`app/modules/today/fixtures.ts`, `app/modules/today/TodayDrawer.tsx`,
`app/modules/today/routes/index.tsx`

The TODAY-01 fixture payload (`TODAY_FIXTURE`) was still being serialised into the
loader response of the product's **most-visited route** although nothing rendered
it. Its only remaining consumer was the drawer resolver, whose `upcoming:` /
`project:` / `note:` branches rendered fixture records with copy including *"The
full Project overview arrives with PROJ-01"* and *"Reading and editing notes
arrives with NOTES-01"* — for modules that shipped long ago. Nothing produces
those drawer keys any more (X-01 retired the Today search provider), so the copy
was unreachable — but a stale bookmark carrying `?drawer=note:n-1` would have
shown the owner a statement about their product that is simply false
([AGENTS.md §8, "fail honest"](../../AGENTS.md#8-ai-philosophy)).

**Fixed.** Fixture module deleted, dead branches removed, payload no longer sent.

### F-06 — Every other widget earns its place
Assessed against "what should I do now?": Morning brief (orientation), My day
(the answer), Recent activity (what changed), Diary, Notes, Continue working,
Areas, Goals, Assets, Insights, Capture. Each reads real workspace data, each has
a compact empty state that teaches the next action, and each is hideable. **No
further removals recommended.**

---

## Phase 4 — Mobile

MOBILE-01 did the structural work well: bottom bar within thumb reach, capture in
the middle slot, complete navigation behind More, a phone Drawer, keyboard-inset
awareness, 44px targets under touch. Driving the modules at 320/375/390/430px
surfaced no new layout breakage.

### F-07 (P2) — Two create pages are unnamed and un-navigable on a phone
`/new/meeting`, `/reviews/new`

Neither composes a `PaneHeader`, so the phone top bar showed the workspace name
and offered no Back. **Fixed** — both publish their identity through the shared
`useSetMobileTopBar` (now exported from `~/shared/shell`).

### F-08 (P3) — Card quick actions are 28px under a fine pointer at phone width
Already recorded as [DEBT-50](PRODUCT_DEBT.md); unchanged and not re-reported.

---

## Phase 5 — Speed

### F-09 (P2) — Two collections paginated by replacing the page
`MeetingsCollection.tsx`, `ReviewsCollection.tsx`

Six collections accumulate pages in place behind a "Load more" button. **Meetings
and Reviews navigated instead** — Reviews with a "Next page" link, Meetings with a
link *labelled* "Load more" that did not load more. Both discard the list, the
scroll position and the owner's place, on the two surfaces where re-finding your
place matters most (a list of past meetings; a list of reviews).

**Fixed** — see F-15.

### F-10 — Loading and optimistic behaviour
`useCollectionLoading` gives every collection the shared skeleton on a same-route
filter change; Today's completion and planning are optimistic with reconciliation;
the shared forms declare their save mode. **No new findings.** Removing the dead
Today fixture payload (F-05) is the one real payload reduction available.

> **Correction — 2026-08-09 (TASKS-09).** *"No new findings"* was wrong, and the
> original text above is left standing so the error is visible rather than tidied
> away. It was true of **Today**, which the phase checked, and it was not true of
> **Tasks**, which it generalised from Today without opening.
>
> At the audited commit `dab275c`, `/tasks` had **no optimistic path at all**, and
> said so in its own comments: *"the loader is revalidated after each change so a row
> reflects the server rather than an optimistic guess."* Every row mutation therefore
> cost a POST, then an unconditional `revalidator.revalidate()` that re-ran the
> app-shell loader and the tasks loader — four sequential hops and roughly a dozen
> statements before a checkbox moved, against this document's own **&lt;100 ms**
> interaction budget. The same rule disabled the quick-add input while a create was in
> flight, and the record drawer fetched on open rather than seeding from the row
> already in memory.
>
> The audit's method is where the miss came from, and it is the reusable lesson: a
> speed phase that samples one module and reports the finding for the product will
> keep missing the module that decided differently — and `/tasks` had decided
> differently **on purpose**, which is exactly the kind of divergence an audit exists
> to notice. The correct finding, had it been written, would have been a **P2**:
> *the primary task surface has no optimistic path and pays a full revalidation for
> every row change.*
>
> **Resolved 2026-08-09** by
> [TASKS-09](../roadmap/ROADMAP_V2_2.md) /
> [ADR-086](../decisions/ARCHITECTURE_DECISIONS.md#adr-086-optimistic-presentation-on-task-lists-with-server-authoritative-reconciliation-and-announcement),
> which gave the list an optimistic presentation with server-authoritative
> reconciliation and announcement, replaced the blanket revalidation with a tested
> predicate, and fixed the pagination reset that was collapsing loaded pages on every
> mutation.

---

## Phase 6 — Empty states

Every collection, every record tab, every Today widget, Search and the Command
Palette compose the shared `EmptyState` with an icon, a heading, one sentence and
a next action; several deep-link into Help. This is the strongest area of the
product. **No findings.** The one new empty state added here (Meetings on Today)
follows the same anatomy.

---

## Phase 7 — Forms

DS-06 is genuinely shared: one `useForm`, one `useAutosaveField`, declared save
modes, a shared error summary, progressive `<details>` disclosure on the create
forms, searchable pickers, deterministic quick-capture parsing shared by all four
capture surfaces. **No new findings** beyond the recorded
[DEBT-52](PRODUCT_DEBT.md) (the Tasks quick-add row is still structurally a fourth
surface) and [DEBT-56](PRODUCT_DEBT.md).

---

## Phase 8 — Visual consistency

### F-11 (P3) — Two modules used ASCII "..." where the product uses "…"
`ReviewsCollection.tsx`, `ReviewRecord.tsx` (×4), `settings/routes/index.tsx`

PX-06 established the copy convention and swept the product to it; Reviews and one
Settings string were missed. Six occurrences: `"Search reviews..."`,
`"Saving..."` (×2), `"Write your reflection..."`, `"Delete Review..."`,
`"Deleting..."`.

**Fixed.**

### F-12 — Everything else
Typography, spacing, headings, chips, badges, cards, drawers, dialogs and overflow
menus all resolve through DS-01 tokens and the shared components; no raw colour
exists outside `tokens.css`. The Diary timeline node remains the one documented,
deliberate Card fork ([DEBT-46](PRODUCT_DEBT.md)). **No new findings.**

---

## Phase 9 — Keyboard

### F-13 (P1) — The keyboard reference said `?` works "Anywhere". It worked on one route.
`app/modules/today/keyboard/KeyboardHelp.tsx`

The reference's own first group was titled **"Anywhere"** and its third row read
**`?` — Show this keyboard reference**. Both were false everywhere except
`/today`: the reference was a Today-scoped drawer key, and `?` was a Today
contextual command. On a keyboard-first product, the keyboard help could not be
summoned from the keyboard on fourteen of fifteen modules — and the help itself
was the thing making the untrue claim.

**Fixed.** The catalogue moved to `~/shared/commands/shortcut-reference.ts`, one
shared renderer serves both hosts, and the shell registers `?` as a **fallback**
binding (lowest precedence) that opens the reference in the shared `Sheet` on
every surface. Today keeps its Drawer host deliberately — there the reference
belongs inside the drawer *stack*, which is what makes a task drawer beneath it
stop owning the task shortcuts. Converging the two hosts remains
[DEBT-18](PRODUCT_DEBT.md).

### F-14 (P2) — A read-only Sheet's scrolling body was unreachable by keyboard
`app/shared/sheet/Sheet.tsx`

Found by the new reference's own axe scan. Every Sheet built before UX-01 held
focusable content (a capture form, an option list), so its scroll container was
always reachable. The first **read-only** Sheet exposed the latent gap: a
scrollable region with no focusable content and no tab stop (WCAG 2.1.1, axe
`scrollable-region-focusable`, serious).

**Fixed** in the shared component via an opt-in `bodyFocusable`, so a read-only
sheet is keyboard-scrollable without giving every form sheet a redundant tab stop.

### F-15 — Focus order, Enter, Escape, palette, capture
One shared dispatcher, one focus trap, deterministic Escape scoping, roving
tabindex on Today, `Mod+K` toggle policy, `/` for search, typing-suppression for
single-key shortcuts. **No new findings**; the remaining reserved-vocabulary gaps
stay recorded as [DEBT-18](PRODUCT_DEBT.md).

---

## Phase 10 — Accessibility

### F-16 (P1) — Two routes rendered a second `main` landmark
`app/modules/meetings/routes/new.tsx`, `app/modules/reviews/NewReviewForm.tsx`

Both create pages wrapped their content in `<main>`, **inside** the app shell's
`<main id="main-content">`. Two main landmarks on one page is a WCAG 2.2 landmark
defect: a screen-reader user navigating by landmark meets an ambiguous choice
between two "main" regions. It was never caught because `landmark-unique` is
globally disabled in the axe gate for a documented, unrelated reason (DS-02
repeats "Summary"/"Content" regions by design), and `landmark-no-duplicate-main`
sits outside the WCAG tag set the gate scans.

**Fixed** — both are now labelled `<section>`s, and a new e2e test asserts exactly
one `main` on each.

### F-17 — Contrast, labels, focus visibility, reduced motion, touch targets
Verified against the existing gates: tokens are contrast-proven in unit tests, the
axe sweep covers light and dark, focus rings are token-driven, motion collapses
under `prefers-reduced-motion`, touch targets pass at every phone width. Open
items ([DEBT-14](PRODUCT_DEBT.md), [DEBT-15](PRODUCT_DEBT.md),
[DEBT-26](PRODUCT_DEBT.md), [DEBT-50](PRODUCT_DEBT.md),
[DEBT-54](PRODUCT_DEBT.md), [DEBT-56](PRODUCT_DEBT.md)) are unchanged and
correctly recorded. **No new findings** beyond F-14 and F-16.

---

## Phase 11 — Product consistency

### F-18 (P2) — One idea, six implementations, two absences
Archive, Delete, Duplicate, Create, Cancel, Save, filters, sorting, search, linked
records, activity, history, overflow menus, drawer behaviour and selection are all
consistent — PX-04/PX-05/PX-06 closed those. **Pagination was the exception.**

Six collections carried six near-identical private copies of the same forty lines
(`useAreaPagination`, `useGoalPagination`, `useDeletedGoalPagination`,
`useNotePagination`, `useProjectPagination`, Assets' `usePagination`), and two
collections had none at all and navigated instead (F-09). One of the six also
carried a real defect the other five shared —
[DEBT-45](PRODUCT_DEBT.md): de-duplicating a fetched page by object identity alone
lets a revalidated copy of a previous scope's page be appended on top of a fresh
first page, advancing the cursor past everything in between and silently
stranding records.

**Fixed.** One shared `useKeysetPagination`
(`app/shared/load-more/useKeysetPagination.ts`) encoding the rule the copies got
wrong — *a page is consumed only if it was asked for since the current scope
began* — adopted by all eight collections. Closes DEBT-45.

---

## Phase 12 — Technical debt (only where it improves UX)

Addressed: DEBT-45 (F-18), half of DEBT-18 (F-13), the dead Today fixture seam
(F-05). **Not** addressed, deliberately: everything else in the register, because
it is either not UX-facing or is a feature in a debt entry's clothing. No
unrelated refactors were performed.

---

## Findings summary

| # | Severity | Area | Status |
|---|---|---|---|
| F-01 | P1 | Rail loses current row on every record route | ☑ Fixed |
| F-02 | P3 | Help/About unnamed on phone | ☐ Recorded (DEBT-60) |
| F-03 | P1 | Today cannot answer "what is on today?" | ☑ Fixed |
| F-04 | P1 | Permanent "coming soon" panel on Today | ☑ Fixed |
| F-05 | P2 | Dead fixture payload + untrue drawer copy | ☑ Fixed |
| F-07 | P2 | Create pages unnamed/un-navigable on phone | ☑ Fixed |
| F-09 | P2 | Two collections paginate by replacing the page | ☑ Fixed |
| F-11 | P3 | ASCII ellipsis in Reviews and Settings | ☑ Fixed |
| F-13 | P1 | Keyboard reference claims `?` works everywhere | ☑ Fixed |
| F-14 | P2 | Read-only Sheet body unreachable by keyboard | ☑ Fixed |
| F-16 | P1 | Duplicate `main` landmark on two routes | ☑ Fixed |
| F-18 | P2 | Six pagination copies, two absences, one shared defect | ☑ Fixed (DEBT-45) |

---

## What this audit deliberately did NOT do

- **No redesign.** No new visual language, no new component, no relayout of any
  module. Every change is either a deletion, a correction, or an adoption of a
  pattern the product already had.
- **No new modules or capabilities**, except the Today Meetings section — which is
  a read over records that already exist, in a widget shape that already exists.
- **No sweep of Diary's documented Card fork** ([DEBT-46](PRODUCT_DEBT.md)); the
  reasoning that preserved it in PX-06 still holds.
- **No attempt on the feature-shaped debt** (tags, saved cross-module views,
  export, backup, notifications). Those are roadmap items, not polish.

---

## Related documents

- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the UX-01 daily-driver entry.
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-45 closed; DEBT-18 narrowed;
  DEBT-60 added.
- [`CHANGELOG.md`](../../CHANGELOG.md) — the owner-facing summary.
- [`UI_UX_COHERENCE_AUDIT_2026_07.md`](UI_UX_COHERENCE_AUDIT_2026_07.md) — the
  previous audit this one follows.
