# ROADMAP_V2_2.md — V2.2, the Tasks daily driver

> The first V2.2 product programme: make Tasks as fast, direct and dependable as a
> dedicated task manager, while keeping DalyHub's Area → Goal → Project → Task spine.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds the V2.1 work. This file is V2.2.
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build;
> this tells you *what*. Status is updated in the PR that changes it. No time
> estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

---

## The programme

Four items, delivered as one coherent Tasks upgrade and accepted together as
[ADR-085](../decisions/ARCHITECTURE_DECISIONS.md#adr-085-the-tasks-daily-driver--the-matrix-removed-editing-moved-onto-the-row-bulk-made-structural-and-recurrence-given-a-second-scheduling-mode).
A fifth — **TASKS-09**, the latency contract — follows them: the four made Tasks
correct and direct, and TASKS-09 is what stops it *feeling* slow while it is.

The objective, in one sentence:

> **See Task → act on Task**, rather than *see Task → open record → find Edit →
> modify field → save → close record.*

The full behaviour is documented in
[`TASKS_MODULE.md → The daily driver (V2.2)`](../development/TASKS_MODULE.md#the-daily-driver-v22--tasks-05060708).
No Task authority changed: the spine still owns identity, completion and parentage,
`task_details` the additive fields, the shared Task Drawer the canonical record,
EntityLinks the one relationship model and Activity the one audit stream.

---

## Current audit sequence - 2026-08-09

The full-product UX/Product audit on current `main`
([`DALYHUB_UX_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md))
found no P0 Task blocker and confirmed that the expected foundational concern is
already solved: **a Task can exist without a Project, and Inbox is first-class**.
The next work should therefore harden the daily-driver loop rather than restart a
visual redesign or add speculative capability.

### NOW

### ☑ TODAY-09 - Attention rail truth and Tasks/Today wording — DELIVERED 2026-08-09

Make Today truthful enough to remain the daily entry point.

- Restored the existing Assets obligation contract as an `asset` attention row:
  obligations with no linked open Task can reach Today, while obligations already
  represented by open Tasks are counted in words rather than duplicated.
- Replaced the misleading "Due today" Today label with "For today" / "Tasks for
  today", matching the `day-view` union of due-today OR scheduled-today work.
- Made the Inbox attention count authoritative by reading the canonical Tasks
  `inbox` system view, independent of the bounded Today planning read.
- Aligned the Tasks `today` system view with Today: open, non-waiting work whose
  due date OR scheduled date is the owner's today.
- Added focused Today/unit and kernel coverage for Inbox truth, due/scheduled
  Today agreement, completed exclusion from active task counts, and Assets
  obligation surfacing/deduplication.
- **Non-goals:** weather/calendar, push notifications, a metrics dashboard, or a
  broader Today redesign.

### ☑ TASKS-10 - Daily-driver verification and capture polish — **DELIVERED 2026-08-09**

Lock the current Tasks daily-driver behaviour before adding new Task features.

- Added the missing >100 selection/bulk-bound E2E coverage recorded in
  [DEBT-110](../product/PRODUCT_DEBT.md#-debt-110--the-100-task-bulk-bound-has-unit-coverage-but-no-e2e-journey-that-accumulates-more-than-one-page--p3).
- Re-ran and preserved the phone acceptance matrix for capture, list editing, bulk
  actions and recurrence at 320, 375, 390 and 430px.
- Revalidated the full create form against the title-first composer contract: the
  full Drawer still focuses title first, accepts title-only Inbox capture, and leaves
  the faster quick-add/global capture paths unchanged.
- Fixed the completed-task double-announcement debt
  ([DEBT-115](../product/PRODUCT_DEBT.md#-debt-115--a-completed-task-is-announced-twice-once-by-the-list-once-by-the-notification-centre--p3)).
- **Non-goals:** new views, AI parsing, offline editing, subtasks or another Matrix.

### ☑ UIX-01 - Product UI redesign against the supplied references — **DELIVERED 2026-08-09**

Reproduce two supplied reference designs in the real product: the shell, Today and
Tasks, at desktop and phone widths, in both appearances.

- Added six generated **decorative accent** ramps (coral · blue · violet · green ·
  amber · teal) and a per-appearance `wash` tint strength, with contrast asserted
  for every accent's washed surface and every tonal tile's glyph in both schemes.
- Retired the floating action button; Create is the top app bar's one violet
  control on desktop and the navigation bar's central circle on a phone.
- Redrew Today as three balanced regions with a full-width Goal progress row, and
  its figures as washed tonal glance cards.
- Redrew Tasks: due-state grouping by default on the three everyday views, a tab
  rail of those views, a one-line ~45px row leading with a completion circle, and
  relative dates in words in place of the urgency chip.
- Redrew the phone Task capture sheet as `Cancel · New task · Save` over a big
  title field and three metadata rows.
- **Non-goals:** new features, new data, a second UI framework, module-by-module
  redesign beyond the shared foundations (that is UIX-02), and any change to
  TASKS-10 behaviour.
- Record: [`UIX_01_PRODUCT_REDESIGN_2026_08.md`](../design/UIX_01_PRODUCT_REDESIGN_2026_08.md).

### ☑ EDIT-03 - Inline editors must show the whole list of choices — **DELIVERED 2026-08-09**

Fix the reported defect that made inline Task editing unusable: opening Priority,
Project or Due date on a `/tasks` row showed the stored value and none of the
alternatives.

- Diagnosed as a SHARED placement defect, not three Task bugs. Both DS-16 anchored
  surfaces were `position: absolute` inside the field, so a Tasks row's three
  load-bearing `overflow: hidden` ancestors cut a 305px priority menu to a 45px,
  64px-wide sliver and wrapped `P2 · High` to `P2 · Hi / gh`.
- Added `~/shared/anchored` — one portalled, viewport-placed overlay surface plus
  the pure geometry (flip · height clamp · inline slide), generalised from DS-12's
  `menu-placement` rather than copied. `InlineSelectField` and `InlineDateField`
  adopt it; `useAnchoredAlignment` is deleted.
- Added `--app-z-anchored` (1350) so a surface opened from inside the Task record
  Drawer renders above it rather than behind it.
- Made `Sheet` portal into `<body>`: a swipe card is TRANSFORMED, so it was the
  containing block for its `position: fixed` descendants and clipped a phone sheet
  to a 45px row.
- Gave the phone the shared sheet presentation for both fields, and every Task date
  editor the product's own Today / Tomorrow / Next week shortcuts from one shared
  derivation.
- Added typeahead to the select menu, so the fifty-candidate Project chooser is
  navigable by keyboard without a filter box the menu role cannot carry.
- Audited the product's other floating surfaces in a browser: the DS-12 overflow
  menu and the combobox listbox are unclipped on the same rows and are unchanged.
- **Non-goals:** a positioning dependency, the native Popover API, converting the
  DS-12 menu, changing any route/intent/storage rule, or making the task row taller.
- Record: [ADR-087](../decisions/ARCHITECTURE_DECISIONS.md#adr-087-inline-editors-float-in-a-shared-overlay-layer-and-become-sheets-on-a-phone) ·
  [DESIGN_SYSTEM → Anchored overlay](../design/DESIGN_SYSTEM.md#anchored-overlay-edit-03) ·
  captures in [`docs/design/assets/edit-03-2026-08/`](../design/assets/edit-03-2026-08)
  (`e2e/inline-editor-overlay-screenshots.spec.ts`).

### ☑ UIX-02 - Projects & Areas product UI redesign — **DELIVERED 2026-08-10**

Extend the UIX-01 visual language into the spine's two middle rungs, against the
third supplied reference — both galleries, both records, both phone compositions
and the dark appearance.

- **Separated the two modules.** They shared one `EntityCard` in one grid, so a
  finite body of work and a permanent domain of a life were the same object with
  different words in it. A Project now has `ProjectCard` (identity above a pinned
  measure); an Area has `EntityRow` in one bordered list.
- **Moved record identity off the CHART ramp.** `area-accent-*` was `chart-*`
  reused, whose hues are chosen so a legend stays separable — it was putting an
  olive, a magenta and a crimson on Project progress bars. Identity now resolves
  to UIX-01's widget accents, plus one generated `accent-cyan` so the sixth slot
  is clear of the scheme's alarm band.
- **Removed the fabricated Area completion meter** from the Area record. Areas
  never complete; the gallery had never drawn one and the record had.
- **Gave the Area record an Overview** of what is actually in it, and gave both
  records their own identity mark on their own accent.
- **Made a Project's tasks Tasks rows**: the shared completion circle (which now
  works, through the canonical `/tasks/bulk` route), relative dates in words, and
  no routine status pills — via a `.dh-tasklist` opt-in on the UIX-01 row.
- **Shared the view tab rail** (`ViewTabs` / `.dh-viewtabs`) between Tasks and
  Projects instead of copying it, and gave its phone pills a 44px target.
- **Non-goals:** new Project methodology (Kanban, Gantt, dependencies,
  templates), an Area health score, an Area completion model, AI summaries,
  notifications, analytics, or any change to domain rules.
- Record: [`UIX_02_PROJECTS_AREAS_2026_08.md`](../design/UIX_02_PROJECTS_AREAS_2026_08.md).

### ☑ UIX-03 - Goals product UI redesign — **DELIVERED 2026-08-10**

Turn the Goals experience from a collection of project-shaped cards with
percentages into a personal progress system: the gallery, the record, the trend
chart, both phone compositions and the dark appearance.

- **Gave Goals a card of their own** (`GoalCard` / `.dh-gcard`), the third
  family in the shared grid after UIX-02's `ProjectCard`. It leads with the
  READING rather than the percentage, states the whole journey
  (`from 85 kg → 70 kg`) so the percentage is checkable by eye, and carries one
  visual chosen by the data.
- **Gave Goals identity.** A Goal inherits its AREA's accent and glyph — the
  rule Projects already follow — resolved in every Goal read. Every Goal in the
  gallery previously drew the same neutral grey flag, and Today derived a tone
  from a hash of the Goal's id.
- **Put the target on the trend chart's scale.** `TrendLine` scaled to the
  readings and drew the target only if it happened to land inside them, so the
  product's own acceptance Goal (85 kg → 79.3 kg, target 70 kg) never showed its
  target: the chart answered "have I moved?" and refused "am I getting there?".
- **Made the Goal record a progress workspace.** The measurement section moved
  out of the summary band's `description` — a chart inside a summary card inside
  a record — into a new top-level `feature` region of the shared Record Layout,
  above the band. It opens with a labelled **Start · Now · Target · Remaining**
  strip in place of one run-on sentence.
- **Added `Sparkline`** to `~/shared/charts` and the batched
  `listMeasurementSeries` read that feeds it: one grouped statement per page of
  Goals, capped per Goal inside the window function.
- **Added status views** (All / On track / Needs attention / Completed) over
  statuses the kernel evaluator already produces, and retired the alignment
  ring that dominated the gallery — the recap sentence stays as a quiet note.
- **Non-goals:** no new measurement type, no unit conversion, no forecasting
  engine, no auto-generated milestones, no change to the GOAL-02 progress
  arithmetic, and no schema change — the domain shipped in GOAL-02 was already
  correct, including inverse direction and the baseline-relative formula.
- Record: [`UIX_03_GOALS_2026_08.md`](../design/UIX_03_GOALS_2026_08.md).

### ☑ UIX-04 - Notes, Diary & Meetings product UI redesign — **DELIVERED 2026-08-10**

Turn the three writing modules from record editors with a big text field into a
writing application, a personal journal and a working notebook — sharing one
writing surface and differing in composition.

- **Fixed the writing measure.** `--app-width-editor` went from 90ch to **72ch**,
  and the cap and centring moved off `.cm-content` onto the editor's own children,
  so the toolbar, the text, the read view and the messages share ONE document
  column. The old value produced ~95-character lines *and* left a quarter of the
  canvas empty — too wide to read and too narrow to fill the page.
- **Gave documents a heading ladder.** Four `--app-writing-h*` sizes
  (28/22/18/16) consumed by both `.markdown-content` and the live editor's
  decorations. `.markdown-content` previously rendered `h2` and `h3`–`h6` at
  `body-large` — the size of the paragraph beneath them — so a structured note had
  no visible outline. List rhythm, task lists, inline code, fenced blocks (which
  now scroll inside themselves) and links were rebuilt with it.
- **Unified Read and Write.** Both take the writing column, so pressing Read no
  longer reflows the document. The read view also lost the card it was painted on.
- **Made the toolbar fit and stay.** Strikethrough and Checklist moved behind
  *More* (thirteen 44px controls do not fit a 72ch column, and the row's own
  horizontal scroll was hiding the overflow), and the strip is now sticky to the
  top of the writing surface.
- **Gave Notes a rail.** `/notes/:id` loads one bounded page of the notes list and
  renders it beside the document at ≥1024px, with `aria-current="page"` on the
  open note. The collection became a list of documents — title-dominant rows, a
  one-line preview and a right-hand date column — in place of a three-column
  gallery of tiles.
- **Made the Diary's date the control.** A week strip (Mon 8, Tue 9, Wed 10) with
  the selected day in the primary accent, replacing a prev/label/next trio that
  cost two clicks to move one day. The ten-chip type filter lost its borders and
  fills; entries got two-line previews and lost their repeated type chip.
- **Made the Meeting record a notebook.** Agenda → Notes → Decisions → Outcomes →
  Actions — every section a real column of the schema — is now the FIRST and
  default tab, in place of a metadata form holding a duration, a timezone, an
  attendee editor and two relationship lists. Attendees moved into the header as a
  compact read-only row, and the collection became a day-grouped schedule.
- **Non-goals:** no storage change (Markdown throughout), no new editor
  framework, no invented Meeting sections, no mood tracking, no calendar system,
  no tagging framework, and none of the AI/transcription/collaboration work the
  brief rules out. Meeting collection rows deliberately do not resolve attendees:
  the only read available is one query per row.
- Record: [`UIX_04_NOTES_DIARY_MEETINGS_2026_08.md`](../design/UIX_04_NOTES_DIARY_MEETINGS_2026_08.md).

### ☑ UIX-05 - People, Assets, Reviews, Analytics & Settings — **DELIVERED 2026-08-10**

The last of the five-part redesign: take the four remaining record modules off the
generic shared card, build the Analytics surface the product did not have, and
give Settings a phone composition instead of a scrolling rail.

- **Gave People a surface of its own** (`PersonRow` / `.dh-prow`) — face,
  identity, reach, rhythm. The face is the one CIRCULAR identity mark in the
  product (D26); the preferred contact is a real `mailto:`/`tel:` link, so the
  commonest act from a People list is one click rather than a record visit away;
  and PEOPLE-03's derived stay-in-touch state moved from the second of six equal
  facts to the trailing column and the default sort.
- **Added the People CIRCLE** — Personal / Work / Services, a pure derivation of
  the relationship the owner already recorded — as the collection's one view rail
  and as the avatar's identity accent. Thirteen relationship values reached the
  screen as one grey word before; every generated avatar was the same violet disc.
- **Gave Assets a card of their own** (`AssetCard` / `.dh-acard`), whose measure
  is TIME: one commitment, pinned to the floor, in the evaluator's own words. It
  is the one card family that spends its colour on STATE rather than identity
  (D27), and why is documented. The seven permanent filter controls moved into the
  ONE shared collection sheet at every width, with the shared removable chips.
- **Gave Reviews a card of their own** (`ReviewCard` / `.dh-rcard`), led by the
  PERIOD in tabular figures rather than by a name that is derived from it. The
  reflection is the measure, as an exact fraction; a completed Review draws no bar
  (D28); and an unfinished one carries Start/Continue straight into REVIEW-02's
  guided flow.
- **Built Analytics** — a new module with no repository, no write, no migration
  and no new kind of query, composed entirely from reads that already existed
  (`countPeriodCompletions`, `listPeriodContributions`, AREA-03's alignment). Four
  exact figures, each linking to the records behind it; a completion trend on the
  shared `TrendLine`; and a distribution in each Area's own identity accent.
- **Refused two figures the reference asks for.** Focus time and a daily-progress
  percentage would both have to be invented — DalyHub records no time and computes
  no percentage of a life. Comparisons are sentences rather than percentages or
  coloured arrows (D29), and there is no score, index or grade.
- **Grouped Settings and gave it a phone composition.** Three groups, each a real
  heading naming its list; a summary line per section as an `aria-describedby`
  description; and on a phone TWO SCREENS — the section list, then one section —
  resolved server-side from `?section=` so the first byte is correct.
- **Non-goals:** Notes, Diary and Meetings — UIX-04's scope, delivered
  separately and merged into this branch rather than duplicated by it; any change
  to a domain rule, a repository, a schema or a write path; and any figure
  Analytics cannot produce exactly.
- Record:
  [`UIX_05_REMAINING_MODULES_2026_08.md`](../design/UIX_05_REMAINING_MODULES_2026_08.md).

### ☑ UIX-06 - Whole-application convergence, visual QA and final polish — **DELIVERED 2026-08-11**

The point at which broad UI redesign STOPS. Not a sixth redesign: UIX-01 → UIX-05
each made one module coherent, and this pass asks the question none of them
could — do thirteen modules read as one product? A BEFORE suite capturing every
index, every detail family and the shared overlays in ONE run, at the same widths
in both appearances, answered it: coherent within each module, divergent between
them.

- **One page origin.** Three existed at 1280: a collection's title started 40px
  right of Today's and Analytics' behind a generic entity badge, and Settings'
  16px left of both on its own page padding, at a title rung six points smaller.
  The badge is gone (D30) — the documented header anatomy has always drawn the
  title leading, and it was the same glyph the sidebar shows for the same route.
  A RECORD header keeps its mark, because that mark carries the Area's accent.
- **One control baseline.** Native inputs and selects were 36px on 4px corners
  while every button, segment and filter trigger is 45px on `--app-shape-control`
  — so five collection headers drew a search field and a "Filter & sort" pill at
  two heights and two corner values, and four of them shipped the user-agent
  select chevron beside a designed control. `base.css` now states the rung and
  draws the chevron itself (D31); three module-local copies of the same six
  declarations are deleted.
- **One collection count line.** Nine collections hand-rolled the same subtitle
  in five conventions; Assets showed the current VIEW's name instead of a count,
  and "1 notes loaded" was a plural bug in two of them.
- **Made D18 true.** The task row's "two aligned trailing columns" had never
  aligned — the Project mark's auto-margin had no free space to absorb, so on six
  consecutive rows the marks began at x = 630, 510, 724, 672, 638, 670 while
  titles ellipsised with 200px of empty row beside them. Measured after: one
  Project x and one date right edge at every width from 320 to 1920.
- **Took the second control rail off Goals** and stopped an absence being drawn
  as a state — a Goal with no measurement drew a full-width slab in its Area's
  accent containing the words "Not measured", which §6 rule 3 forbids outright.
- **Made D1 reach the three card families that predate it**, untinted Today's
  glance row (D11, and both root references), gave the search field a container
  in dark — `card-subtle` and `app-bar` generate to the same value there — and
  designed the not-found surface, which was still the framework template's.
- **Fixed a 1:1 contrast bug** the 404 work surfaced: `.page a` repainted an
  `<a class="dh-btn">` in the link colour, so a filled button's label was the
  same colour as its container.
- **Non-goals:** any new module, widget, metric, dependency or UI framework; any
  change to a domain rule, repository, schema or write path; any change to the
  filter ARCHITECTURE of the four modules whose native GET forms are a deliberate
  no-JS choice; and a Goal create action on the Goals index, which would need an
  Area picker and therefore a new flow.
- Record:
  [`UIX_06_WHOLE_APP_CONVERGENCE_2026_08.md`](../design/UIX_06_WHOLE_APP_CONVERGENCE_2026_08.md).

**Broad UI redesign is complete.** Future UI work is targeted feature work
against the design system, not another whole-app pass.

### ☑ DS-17 - Select clear-control names - **DELIVERED 2026-08-11**

The cross-product select accessibility follow-up, delivered inside
[HARDEN-01](../product/HARDEN_01_RELEASE_RELIABILITY_2026_08.md).

- `SelectField`, `SelectSheetControl` and `InlineDateField` now name their clear
  control after the field it clears, through one shared helper
  (`app/shared/forms/clear-label.ts`) that DERIVES the name from the field's own
  label — so a new select cannot forget to supply one. `InlineSelectField`
  already did this and is the wording they match.
- The `getByLabel` migration turned out not to be needed. Every `getByLabel`
  string in `e2e/` was cross-referenced against every select label; the three
  candidates ("Date", "Due date", "When") each operate a date field rather than a
  select, and a full suite run after the rename confirmed no call site became
  ambiguous. The reason the first attempt was reverted was an unmeasured blast
  radius, not a real one — recorded in
  [DEBT-112](../product/PRODUCT_DEBT.md), now closed.
- Unit coverage asserts the contract directly: two populated selects on one
  surface expose two differently-named clear controls, clearing one leaves the
  other alone, and an empty field offers none.
- **Non-goals held:** selects were not redesigned and unset/empty semantics are
  unchanged.

### ☑ HARDEN-01 - CI reliability, accessibility cleanup and production truth - **DELIVERED 2026-08-11**

The hardening pass between the end of the UIX programme and the start of the next
substantial UI project. No feature work; the point was that `main`'s gate means
something before another large change lands on top of it. Full record:
[`HARDEN_01_RELEASE_RELIABILITY_2026_08.md`](../product/HARDEN_01_RELEASE_RELIABILITY_2026_08.md).

- **The deterministic E2E failures are gone**, and one of them was a real product
  defect rather than a stale test: a Tasks row's hover action rail overlaid the
  last inline editor, so a mouse user could not open it (the reserve that was
  supposed to prevent this had been made inert by UIX-06's `display: contents`).
- **DEBT-125 narrowed with measurement, not closed on a lucky green.** Chromium's
  RSS across a full shard is flat; the resource-exhaustion hypothesis for the
  browser is refuted and the sampler now measures the harness cohorts the
  question was really about.
- **DS-17** delivered (above). **AUDIT-FIX-05** delivered as a documentation-truth
  pass, with production verification left explicitly open — see
  [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md#-audit-fix-05--documentation-truth-pass-p2p3--delivered-2026-08-11).
- **Non-goals held:** no redesign, no new module, no retry raised, no test
  weakened, no shard count changed without evidence.

### ☑ CAPTURE-01 - Universal DalyHub capture - **DELIVERED 2026-08-11**

Make DalyHub easier to put a thought INTO than it is to forget the thought. Capture
from an iPhone - by Shortcut, Siri, the Share Sheet or a forwarded email - without
opening the application first.

- **One capture contract, many thin transports.** `app/kernel/capture` owns a single
  `CaptureRequest`; the HTTP endpoint, inbound email and any future client produce
  one. Adding a browser extension, a Raycast command or a native iOS app later means
  an auth adapter and a transport, not a second capture backend.
- **It terminates in the EXISTING domain.** A captured Task is the same atomic
  `TaskRepository.createTask` `/tasks/new` uses, through the same deterministic
  TASKS-01 parser; a captured Note is the same entity create plus the Note's own
  content mutation. Migration `0039` adds credentials and rate-limit counters and
  stores no captured record - there is no `shortcut_tasks` and no `email_notes`.
- **Inbox is the safety net.** `auto` classification is deterministic, conservative
  and AI-free; anything ambiguous becomes an unassigned Task, which is what DalyHub's
  Inbox already is. No Project, Area or Goal is ever guessed.
- **The credential can only bring thoughts in.** A `dhcap_` token creates Tasks and
  Notes and nothing else - and that is structural, because CAPTURE-01 adds exactly one
  endpoint and no read, update or delete surface for a leaked token to reach. Only a
  SHA-256 digest is stored; revocation is immediate; the workspace is resolved
  server-side and cannot be named by a request.
- **Idempotency, bounds and rate limits reuse what existed.** The PWA-05 receipt
  protocol (key namespaced by credential) makes a retried POST a no-op; request size
  is bounded before the domain; per-credential fixed windows bound abuse without ever
  bounding the owner.
- **Email is another transport.** A Cloudflare Email Worker on the same Worker, gated
  by envelope sender + allowlist + SPF/DKIM/DMARC, with a two-prefix syntax and HTML
  converted to plain text.
- **Not built, deliberately:** a native app, Apple Watch, a browser extension,
  attachments, AI classification, any read or general CRUD API, imports or sync.
- Accepted via
  [ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-088-universal-capture--one-capture-contract-many-thin-transports-and-a-credential-that-can-only-bring-thoughts-in).
  See [`UNIVERSAL_CAPTURE.md`](../development/UNIVERSAL_CAPTURE.md), which carries the
  Apple Shortcut setup, the required Cloudflare Access bypass, and the manual iPhone
  and email acceptance checklists.

### NEXT

### ☐ TASKS-11 - Deterministic natural-language capture v2

Extend the existing parser only where it is reliable and testable.

- Support after-completion recurrence phrases such as "Service Hilux every 6 months
  after completion".
- Keep AI out of ordinary capture; AI remains a later proposal layer, not a mutation
  path.
- Prove parser changes with unit tests and one route/browser capture journey.

### ☐ PWA-12 - Offline Task mutation slice

Define and implement the first offline Task capability beyond capture.

- Cover completion/reopen, date/priority/title edits, recurrence replay and conflict
  wording.
- Keep the slice small enough to validate the queue contract before broader offline
  editing.

### ☐ TODAY-10 - Focus panel refinement

After TODAY-09, refine the Focus panel only if the evidence shows that one combined
"For today" bucket is still unclear.

### LATER

- **TASKS-12 - Ordinal monthly recurrence**, only if owner routines need patterns
  such as "first Monday of every month".
- **Capture surfaces beyond the phone**, each of which is an authentication adapter
  plus a transport over the CAPTURE-01 contract rather than new capture
  infrastructure: a native iOS app, Apple Watch, a browser extension, a macOS
  Shortcut or Raycast command, Pushover.
- **Review Inbox with AI** - a proposal-shaped triage capability over what capture
  collected. Explicitly separate from capture, which must never depend on a provider.
- **Attachment capture, inbound calendar sync and a broader external CRUD API** -
  each a real capability, none of them input, and none of them a CAPTURE-01 defect.
- Broader mobile polish after Tasks/Today acceptance is stable.
- Richer review surfaces after daily capture and attention are trusted. (The
  **Analytics** half of this line shipped in UIX-05, and shipped early precisely
  because it turned out to need nothing new: every figure it shows comes from a
  read REVIEW-03 and AREA-03 had already built and already trusted. What stays
  deferred is anything that would require DalyHub to record something it does not
  — time tracking, effort estimates, a composite score.)

### DEFERRED / NOT PLANNED

- Eisenhower Matrix replacement.
- AI task prioritisation or autonomous rescheduling.
- Jira-style subtasks, dependencies, Gantt views or workflow builders.
- Collaboration or multi-user assignment.
- Push reminders before the in-app attention model is correct.
- A broad visual redesign before the daily-driver hardening work above.

---

### ☑ TASKS-05 — Daily Driver Workspace — **DELIVERED 2026-08-08**

**List-first execution, the Eisenhower Matrix removed, and direct editing on the row.**

- **The Matrix is genuinely removed**, not hidden: the presentation, the `quadrant`
  server grouping dimension, the Do/Defer/Delegate/Delete vocabulary, the
  `priorityQuadrant` derivations, the CSS grid, the palette command and the
  `defaultTasksView` option are all gone. P1–P4 remain untouched as data, as a filter,
  as a sort, as a grouping and as a row signal.
  - `/tasks?view=matrix` **redirects once** to `view=list&group=priority` — the same
    records, banded by the same signal, in the primary workspace.
  - A stored `defaultTasksView: "matrix"` needs no migration: the preference read
    validates against the closed set and resolves to the primary list.
- **Time Sectors was assessed and KEPT** as a secondary planning presentation. It is a
  distinct stored field answering a question no date answers, unlike the Matrix, which
  was a second reading of one field.
- **Priority, due date, planned date and Project/Area edit IN PLACE on the row**,
  through the shared DS-16 inline fields. Nine now-duplicated entries left the row's
  overflow menu.
- **A Task may still have no parent.** Inbox stays first-class, "Move to Inbox" is a
  first-class command on the inline parent control, and one selection REPLACES the
  previous Project — never clear-then-save-then-reopen-then-choose.
- Quick capture, the deterministic parser and the project-less Inbox are unchanged.

---

### ☑ TASKS-06 — Bulk Management — **DELIVERED 2026-08-08**

**Real multi-selection over the existing canonical bulk authority.**

- **Selection**: row checkboxes, Shift-range in display order, "Select all visible",
  an explicit "Select tasks" toggle, and a phone long press. Selection resets on any
  view/filter/sort/grouping change and is pruned to what is on screen.
- **A rebuilt bulk bar** with mixed-value summaries: with P1s, P2s and untriaged tasks
  selected, Priority reads *Mixed* rather than inventing a current value. Complete ·
  Reopen · Date · Priority · Move · More, with the long tail behind **More**.
- **New atomic bulk operations** on the existing `/tasks/bulk` contract:
  `reopen`, `set_parent` (including Inbox), `delete` and `restore`. Each validates
  every id and the destination before a single write, then runs ONE `D1Database.batch()`.
  There is no client loop and no per-task request anywhere.
- **Bulk delete is reversible.** A soft delete, a calm confirmation naming the count and
  the consequence, and a new built-in **Deleted** view to restore from. Permanent
  destruction is not reachable from a toolbar.
- **Follow-on, 2026-08-09:** the 100-task bulk bound is now **stated before the action**
  rather than met as a refusal after it — "Select all" is capped and says what it takes,
  and a selection past the bound shows the bound and the remedy instead of a toolbar of
  controls that would all be rejected. The rule is pure and unit-tested; the E2E case
  that accumulates more than one page is still owed
  ([DEBT-110](../product/PRODUCT_DEBT.md)).

---

### ☑ TASKS-07 — Recurrence 2.0 — **DELIVERED 2026-08-08**

**Full authoring, two scheduling modes, and explicit series operations.**

- **Two modes**, stored as structured data and never inferred from text:
  - **Fixed schedule** — "Every Monday" stays Monday when the occurrence is finished
    late. This is exactly what every pre-V2.2 rule already meant, and it is the
    migration default.
  - **After completion** — "14 days after completion" re-anchors to the day the work
    was actually done.
  - A kernel test writes a rule the OLD way (no `mode` in the insert) and completes it
    late, so the equivalence is proven rather than assumed.
- **Custom rules are authorable** — any interval 1–99 over days/weeks/months/years,
  selected weekdays for a weekly schedule, and the choice of which date the rule
  advances. The result is stated in plain language *before* it is saved, through the
  ONE shared formatter every read-only surface uses. Closes
  [DEBT-66](../product/PRODUCT_DEBT.md).
- **Series scope is explicit** for the one operation where it is meaningful: moving an
  occurrence's date is *this occurrence* (the routine keeps its schedule) or *this and
  future* (the routine re-anchors). Completed occurrences are never rewritten.
- **Skip** is first-class and truthful: the occurrence advances one step and stays
  OPEN, with its own `task.recurrence_occurrence_skipped` event. Skipped work is never
  recorded as completed.
- **Stop repeating** ends the future and keeps every past occurrence.
- Every V2.0.1/AUDIT-FIX-01 guarantee is intact: exactly one successor, safe undo,
  retained edited successors, concurrent completion, retries, sequence uniqueness and
  recurrence-row slot release.
- **Deferred, recorded honestly:** ordinal monthly patterns ("first Monday of every
  month") — see [DEBT-109](../product/PRODUCT_DEBT.md).

---

### ☑ TASKS-08 — Mobile Daily Driver — **DELIVERED 2026-08-08**

**Capture, edit, select, bulk and recurrence, designed for touch.**

- **Long press → selection mode**, with the held row selected. It is an accelerator:
  the Card checkbox and the "Select tasks" toggle are the ordinary, labelled,
  keyboard-and-screen-reader path, and the gesture is inert on a non-touch device.
- The bulk bar collapses to the M3 bottom action row the shell already uses —
  Complete · Date · Priority · Move · More — with no new overlay primitive.
- The **custom recurrence editor is phone-first**: single-column at every width, seven
  44px weekday targets that wrap rather than shrink, `inputMode="numeric"` on the
  interval, and the plain-language result above the Save button. Verified at 320, 375,
  390 and 430px.
- The existing swipe tray is unchanged and still mirrors the row's visible actions;
  nothing is gesture-only.

---

### ☑ TASKS-09 — The latency contract: an optimistic list, reconciled — **DELIVERED 2026-08-09**

**The `/tasks` list stops waiting for the server to show what it already knows, and
never claims anything the server has not said.**

Accepted as
[ADR-086](../decisions/ARCHITECTURE_DECISIONS.md#adr-086-optimistic-presentation-on-task-lists-with-server-authoritative-reconciliation-and-announcement),
which revises one sentence of ADR-085 §3 for the list surface and leaves
[ADR-029 §29.4a](../decisions/ARCHITECTURE_DECISIONS.md#adr-029-task-waiting--additive-state-a-reserved-entitylink-and-a-derived-first-class-display-state)
(completion is ONE atomic task-domain operation) untouched.

- **The split, stated once.** *Presentation may lead the server; announcements,
  Activity and any claim of success may not.* Every row mutation paints immediately;
  every live region, every toast and every Undo waits for the server's own answer —
  including the recurrence consequence of a completion, which only the server knows.
- **Nothing moved.** Completion still posts to `POST /tasks/:taskId`, field changes to
  `/tasks/bulk`, creation to `/tasks/new`, saved views to `/tasks/views`. No new
  endpoint, no list-only mutation path, no client-side task cache.
- **Revalidation became a predicate.** `shouldRevalidateTasks` asks whether a change
  could move the row out of — or reorder it inside — the configuration on screen,
  from the `TaskViewConfig` alone. A priority change on an unsorted, unfiltered list
  re-reads nothing; a completion under a filter that excludes completed work still
  does. The rules mirror the repository's own view clauses, sorts and grouping
  dimensions, and they are pure and unit-tested.
- **Each write is its own request**, so completing three rows in three seconds is
  three writes rather than two superseded ones behind a disabled toolbar.
- **Completion and reopen carry an Undo**, raised from the server's reply through the
  existing `notifyUndo`; a refusal reverts the row and raises a calm DS-10 error with
  the server's own wording.
- **"Load more" survives the work done on it.** The page accumulator used to reset on
  the identity of the loader's first page — fresh JSON on every revalidation — so any
  mutation collapsed three loaded pages back to one. It now resets on the
  configuration alone and merges a refreshed first page by id.
- **TASKS-10 follow-on:** a completion is now announced once. The workspace live
  region carries the committed completion and any recurrence consequence, while the
  visible Undo notification opts out of its own duplicate feedback live-region write
  through the shared DS-10 notify API.

---

## What this programme deliberately did NOT add

Recorded so they are not mistaken for oversights. Each is a separate product decision:
calendar sync, Todoist sync, notifications and push reminders, email ingestion, AI task
prioritisation, autonomous rescheduling, time tracking, collaboration, multi-user
assignment, attachments, subtasks, dependencies/Gantt, a kanban board added merely
because Todoist has one, another Eisenhower replacement view, a generic workflow
builder, cron expressions, realtime collaborative editing and PWA offline Task editing.

---

## Related documents

- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) — the module's full behaviour
- [`DALYHUB_UX_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md) — the current-main UX/Product audit that set the post-V2.2 sequence
- [ADR-085](../decisions/ARCHITECTURE_DECISIONS.md#adr-085-the-tasks-daily-driver--the-matrix-removed-editing-moved-onto-the-row-bulk-made-structural-and-recurrence-given-a-second-scheduling-mode) — the accepted decision
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the shared patterns this added
