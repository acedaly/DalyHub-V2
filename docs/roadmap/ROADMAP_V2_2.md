# ROADMAP_V2_2.md — V2.2, the Tasks daily driver

> The first V2.2 product programme: make Tasks as fast, direct and dependable as a
> dedicated task manager, while keeping DalyHub's Area → Goal → Project → Task spine.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds the V2.1 work. This file is V2.2.
>
> **New work now goes in [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md)** — V2.3, "Planning
> & Routines", which begins with PLAN-01 (Weekly Planning) and SMART-01 (one Task
> filter vocabulary with two consumers).
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

### ☑ TODAY-TASK-01 - One task row, and Today as the daily driver — **DELIVERED 2026-08-17**

Today stops drawing its own task row, and the screen around it is refined into the
surface it is meant to be. It CLOSES [DEBT-143](../product/PRODUCT_DEBT.md) and
[DEBT-144](../product/PRODUCT_DEBT.md), which TODAY-11 raised and deliberately
did not do. Full record:
[`TODAY_TASK_01_ONE_TASK_ROW_2026_08.md`](../design/TODAY_TASK_01_ONE_TASK_ROW_2026_08.md).

- **There is ONE product-level task row.** `TodayScreen.tsx` declares no `TaskRow`
  and no `ParentPill`; the plan's three bands render the shared
  `~/shared/task-record/TaskRow` inside the shared `TaskList`. Today's rows gained
  every capability that came with it — inline project, inline due/planned date,
  inline priority, the row overflow, the long-press, the two swipe acts, the
  offline note — and re-implemented none of them. `test/unit/today/one-task-row.test.ts`
  fails if a `TodayTaskRow`/`CompactTodayTaskRow`/`DashboardTaskRow` ever appears.
- **The plan needed NO new slot on the shared row, and that is the evidence the
  two rows were one row.** The mockup's context pill is the shared row's project
  cell; the overdue age is its date cell (which renders a passed date as "3 days
  ago", in words, in the overdue colour); the priority flag is its priority cell.
- **What grew, grew SHARED.** `toTaskRowProjection` and `applyTaskListItemPatch`
  moved into `~/shared/task-record/task-view`; `buildTaskRowActions` holds the
  overflow SET for both callers; and the column ladder below 56rem was corrected —
  it still carried the widths from before FINAL-UI swapped date and project, so
  priority had 9.5rem and project 4rem (project cell 64 → 144px, title cell
  202 → 303px at 1440). **Today declares no `.dh-today .dh-taskrow` structural
  overrides.**
- **No second mutation authority.** `useDayTaskActions` is a host — an optimistic
  patch map, an announcement, a revalidation — and every write leaves through the
  shared posters to `POST /tasks/:id` and `POST /tasks/bulk`. The route's own
  completion fetcher and `completion-feedback.ts` were deleted rather than left as
  a second door. The loader adds ONE bounded `searchTaskParents({ limit: 50 })` —
  the same call `/tasks` makes.
- **DEBT-144: one parent, one identity.** `TaskRelation` carries `colourSlot`,
  `iconKey` and `colourRank`, resolved by the SAME joined statement that already
  resolved the title (one CTE; no extra round trip, no N+1, no migration). Both
  surfaces changed: `InlineTaskParent` now draws the shared `AccentIcon` through
  `resolveIdentity` instead of the entity type's generic badge, so a Project is
  the same colour on `/projects`, `/tasks` and `/today`.
- **The visual pass, measured.** The greeting, the date and the day rail became
  ONE heading area (107 → 62px at 1440). The three bordered metric cards became a
  compact statistics strip with hairline separators, keeping every figure, note,
  link and plot (176 → 82px). The split moves to **8/4 above a 60rem container**
  and stays 7/5 below it — the measured answer, because the week strip needs
  ~40px per day and 8/4 gives it 34px at 832px and 41px at 976px. First task row
  y at 1440: **457.6 → 319.6**; plan : rail **1.42 → 2.06**.
- **Honesty rules unchanged.** No new data, no productivity score, no focus time,
  no task times, no `order`-based reordering, no MD3 regression, no new
  dependency. One thing was deliberately left: a row still restates the date its
  band already states, because `/tasks` does the same and the fix belongs on the
  shared list ([DEBT-150](../product/PRODUCT_DEBT.md)).

### ☑ FINISH-01 - Close the 16 August audit: analytics, people, notes, and one grammar — **DELIVERED 2026-08-17**

The last eight rows of the [16 August 2026 UX/UI audit](../product/UX_UI_AUDIT_COMPLETION_2026_08_16.md),
after #188–#191 had closed the rest. **The register is now COMPLETE in every row**
and the audit is closed on evidence.

- **The register was made true first, alone, before anything else was built.**
  #190 and #191 landed without reopening it, so three rows claimed work was owed
  that was already merged (the Today grid, Task row swipe, mobile Today). Every
  other MISSING/PARTIAL row was re-read against `cd385cfd` rather than trusted,
  and two were wrong in the other direction.
- **Analytics gained the overdue metric and its trend** (CONVERGE-01 §8), over
  one new bounded aggregate — no table, no column, no migration. It is the
  product's ONE overdue rule read at a past moment.
- **The People row leads with connection** (§7); **Notes' four finishing items**
  (§6), which produced the shared `TagChip` and retired two module-local copies;
  **one filter rail on Goals** (§9) and **a lighter scope chip everywhere** (§2);
  **the Project card at row scale on a phone** and **the bottom bar's labels
  fitting inside a safe-area inset** (MOBILE-02 §6, §8); **bare rows as the one
  list container** (§3), with the record tab panel recorded as its exception.
- **The audit's open question is answered on the record.**
  [ADR-100](../decisions/ARCHITECTURE_DECISIONS.md) — the Projects table becomes
  the default above forty in the current scope, and an explicit choice is never
  overridden.
- **Two audit findings were wrong, and are recorded as wrong rather than
  implemented.** CONVERGE-01 §7 was narrower than its evidence line suggested,
  and the "Grid / Table vs Grid / List" finding was the opposite of drift — two
  correct words for two different drawings, which `presentation.ts` had already
  defined as "not synonyms". Nothing was renamed; the vocabulary is recorded in
  `DESIGN_SYSTEM.md` instead.
- **No migration, and none was needed** — the phase brief said every item was
  expressible against the existing schema, and each one was.
- **Record:** [ADR-100](../decisions/ARCHITECTURE_DECISIONS.md)
  · [`DESIGN_SYSTEM.md → One list container`](../design/DESIGN_SYSTEM.md#the-collection-header-anatomy-uiq-013uiq-014)
  · [`UX_UI_AUDIT_COMPLETION_2026_08_16.md`](../product/UX_UI_AUDIT_COMPLETION_2026_08_16.md)
  · raised [DEBT-149](../product/PRODUCT_DEBT.md).
- **Found on the way, recorded rather than fixed.** Sixteen E2E journeys across
  five specs fail on `main` for reasons unrelated to this change, each verified
  by stashing the branch and re-running on the clean tree.
  [DEBT-149](../product/PRODUCT_DEBT.md) states the set with its evidence. Three
  defects this pass DID find and fix, none of them in the audit: a page-level
  horizontal scroll the Projects table caused at 390px, a `ViewSwitcher` that
  made a conditional default's choice unexpressible, and the bottom bar spending
  its safe-area inset out of its own labels.

### ☑ NOTIFY-01 - Notifications: an event ledger, an in-app inbox, and Pushover — **DELIVERED 2026-08-16**

DalyHub knows things the owner does not — an asset obligation approaching, a waiting
item ageing, a day's work assembled — and today none of it reaches the owner unless
they open the application. This closes the deferral condition on push reminders (the
in-app attention model is now correct: TODAY-09/10, DS-06) and addresses the honest
consequence recorded in
[DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2--resolved-2026-08-16-notify-01).

- **State and events are different surfaces, and this item builds the events one.**
  The attention rail is STATE — recomputed from facts, unable to go stale. A
  notification is an EVENT — a fact crossed a threshold at a moment, and DalyHub said
  so. The notification inbox therefore shows what fired and when, never a second copy
  of current concerns. If the inbox and the rail ever disagree about what needs the
  owner, the rail is right and the inbox is history. This distinction is the item's
  governing rule and belongs in the ADR.
- **One table is both the dedupe ledger and the inbox.** `notifications`
  (workspace-scoped): `kind` (`digest` | `asset_obligation`), an optional subject
  entity reference, a `dedupe_key` with a UNIQUE constraint per workspace
  (`digest:{localDate}` · `asset:{entityId}:{thresholdDays}`), rendered
  `title`/`body`/`href`, `created_at`, `read_at`. A companion
  `notification_deliveries` table records per-channel attempts (`channel`, `status`,
  `attempted_at`, `detail`). The UNIQUE constraint is the concurrency guard: insert
  the notification row FIRST; a conflict means another tick already owns this event —
  stop, silently. In-app delivery IS the insert and cannot fail separately; every
  external channel is a best-effort delivery recorded against the row, so a provider
  outage can never make an event not-have-happened, and a failed delivery is visible
  in the inbox rather than silent. This is operational metadata, not Activity — the
  owner did nothing, so nothing belongs in any record's history (the AI usage ledger's
  precedent, ADR-073).
- **The scheduler is a frequent tick, not an encoded send time.** One Cron Trigger
  every 15 minutes; each tick evaluates (a) is it at or past the owner's configured
  digest time in their configured IANA timezone with no digest row for this local
  date, and (b) has any enabled event source crossed a threshold the ledger has not
  recorded. Cron expressions stay timezone-ignorant; DST is the evaluator's problem
  and is tested as one. A tick that finds nothing writes nothing and sends nothing.
- **The digest is the attention model serialised, plus the day.** The digest renderer
  consumes the SAME pure facts `attention-view.ts` consumes (inbox count, waiting
  count + oldest age, visible asset obligations, stalled projects), plus today's
  due/overdue counts and the CAL-01 external schedule. It inherits the rail's
  suppression philosophy unchanged: an empty digest is not sent. Silence must mean
  something; a daily "nothing needs attention" trains the owner to ignore the channel.
  No new derivation logic — if the digest wants a fact the rail cannot supply, the
  fact is added to the shared facts layer, not computed twice.
- **Event sources: asset obligations only, at fixed rungs.** 30 / 7 / 1 days before
  the obligation date, one notification per rung per obligation, deduped forever by
  the ledger key. Overdue tasks and ageing waiting items remain digest-only — they
  change daily, and per-event delivery of them is the nagging failure mode this design
  exists to prevent. Rung configurability is deliberately NOT built; three fixed rungs,
  revisit on evidence.
- **Pushover is the first external channel, behind a channel contract.**
  `deliver(notification) → delivered | failed(reason)`; formatting is per-channel and
  pure; the evaluator knows no channel. The adapter POSTs
  `api.pushover.net/1/messages.json` with the application token, the owner's user key,
  `title` (≤250), `message` (≤1024, `html=1`), `url`/`url_title` as the deep link.
  Priority 0 for everything in this item — priority 1 is permitted by the contract for
  a future final-rung decision, priority 2 (emergency, retry-until-acknowledged) is
  structurally refused: nothing in a personal planner justifies it. `POST
  /1/users/validate.json` backs a "Send test notification" action in Settings; the
  channel can only be ENABLED after a successful validation.
- **In-app surface: a bell, a count, a sheet.** An unread-count indicator in the top
  bar beside the existing shell controls, opening the shared Sheet: newest first, tap
  navigates to `href` and marks read, mark-all-read, failed external deliveries badged
  on their row. No per-notification actions, no snooze, no grouping — it is a log.
  Read rows are purged after 90 days. Naming collision, resolved before code:
  `app/shared/feedback/NotificationCenter.tsx` already exists and is the
  toast/feedback layer. The new surface takes a different name (`NotificationInbox`)
  and the ADR records that "notification" in DalyHub means the ledger-backed event,
  not the transient feedback toast.
- **Settings owns the whole configuration, off by default.** A Notifications section:
  master enable · digest send time · timezone (defaulted from the profile, stated not
  hidden) · per-source toggles (digest, asset obligations) · channels. In-app is
  always on when notifications are enabled — it is the ledger's face, and turning it
  off would blind the system. Pushover: user key, application token, validate/test,
  enable. Honest copy in the register's usual style: notification content (record
  titles, dates) transits Pushover's servers under Pushover's retention; in-app
  content never leaves the Worker. The Pushover credentials are stored in the settings
  store in D1 by decision, recorded in the ADR — a single-owner deployment behind
  Cloudflare Access accepts secrets-in-database knowingly rather than by accident.
- **Failure handling is boring on purpose.** A failed external send records a failed
  delivery and does not retry within the tick; the notification row already exists, so
  nothing re-fires. A digest that arrives late because of a transient failure is
  acceptable; a duplicate is not — the ledger insert commits before any send attempt.
- **Not built, deliberately:** a generic outbound webhook; per-task "remind me at"
  reminders (a different feature with a different UI surface); Web Push /
  service-worker push (real work — VAPID, per-device subscription state — none of it
  needed to prove the channel); email-out, ntfy and any other channel beyond the
  contract they would implement; notification grouping, snoozing or actions; read
  tracking beyond `read_at`; any AI involvement.
- **Verification.** Unit: the evaluator as a pure function — local-date digest gating
  across a DST transition, empty-digest suppression, rung crossing, dedupe-key
  construction; the Pushover formatter's length bounds. Kernel (real Workers/D1):
  insert-first concurrency (two ticks, one row), delivery failure recorded without
  blocking the insert, purge behaviour. E2E: the bell count, the sheet, mark-read
  navigation, and the Settings validate→enable gate with the Pushover API faked at the
  boundary. `pnpm verify` green.
- **New ADR** (take the next free number at merge, per the register's own collision
  rule): the state/events distinction, the ledger-as-inbox decision,
  insert-before-send, the channel contract, priority-2 refusal, and
  secrets-in-database.
- Raises no debt it can avoid; DEBT-57 moves to ☑ on this item's evidence (asset
  obligations now reach the owner outside the app). If scope is cut during
  implementation, the cut is recorded as new debt with the next free ID — which is
  checked at merge, not now.
- **Size.** Comparable to CAPTURE-01. One item, one PR. Migration required —
  **three tables, not the two this line originally said**: the ledger pair plus
  `notification_settings`, following `workspace_ai_preferences`' precedent rather
  than adding nine columns (one of them a credential) to `owner_app_preferences`.
  Corrected here on delivery rather than left as a claim the migration disproves.
  Backup before migration per AGENTS.md.

**Delivered, and where the evidence is.**

- **The ledger.** `migrations/0043` · `app/kernel/notifications/` (pure: the
  domain, the evaluator, the digest, the channel contract, the Pushover
  formatter) · `app/platform/storage/d1/d1-notification-repository.ts`. The insert
  is `ON CONFLICT DO NOTHING … RETURNING` and commits before any send, so two
  ticks produce one row and a provider outage cannot make an event
  not-have-happened. Proved in `test/kernel/notifications.test.ts` (23
  assertions).
- **The tick.** On CAL-01's existing fifteen-minute cron, after the calendar
  refresh so the digest states a fresh day. `runScheduledNotifications` is inert
  until an owner turns notifications on. DST is a unit-tested property of a pure
  function in both directions, driven through the real zone conversion.
- **The digest.** Built from a SHARED facts layer
  (`app/platform/attention/attention-facts.server.ts`) that this item extracted
  from Today's loader rather than duplicating — so the digest and the rail cannot
  state two different numbers for one fact. An empty digest is not sent, and is
  not recorded either.
- **The inbox.** A counted bell in both top bars and the shared Sheet behind it:
  newest first, tap to navigate and mark read, mark-all-read, failed external
  deliveries badged in DalyHub's own words. `DesktopTopBar`'s "DalyHub has no
  notification system" comment is corrected rather than deleted.
- **Pushover.** Behind the channel contract, priority 2 refused by the TYPE, and
  the channel enableable only after a real test message has arrived — enforced in
  the route, the repository AND the database.
- **Two things moved, both for the same reason.** `schedule-load.ts` went from
  `app/modules/today/day/` to `app/platform/calendar/`, and the attention reads
  left Today's loader for the shared facts layer. A cron tick has no Today loader
  to borrow from, and a second read is how a page and a notification come to
  disagree.
- **Record:** [ADR-099](../decisions/ARCHITECTURE_DECISIONS.md#adr-099-notifications-are-events-in-a-ledger-not-a-second-attention-model--insert-before-send-a-channel-contract-and-secrets-in-the-settings-store)
  · [`NOTIFICATIONS.md`](../development/NOTIFICATIONS.md)
  · [`DESIGN_SYSTEM.md → The notification bell and inbox`](../design/DESIGN_SYSTEM.md#the-notification-bell-and-inbox-notify-01-2026-08-16)
  · [DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2--resolved-2026-08-16-notify-01) ☑
  · raised [DEBT-146](../product/PRODUCT_DEBT.md), [DEBT-147](../product/PRODUCT_DEBT.md)
  and [DEBT-148](../product/PRODUCT_DEBT.md).
- **Found on the way, recorded rather than fixed.** Three E2E specs
  (`mobile-shell`, and parts of `today` and `settings`) assert a shell TODAY-11
  and FINAL-UI already replaced — the phone bar's labels, Today's "Focus"
  landmark, the stat rank's presence, and a 200% reflow overflow that measures
  to TODAY-11's reflection panel. Confirmed by running the same specs at
  `b2622b6` in a clean worktree, and by measuring the overflow with the new bell
  hidden. [DEBT-148](../product/PRODUCT_DEBT.md) states each drift with its
  evidence. Not corrected here: they are another item's acceptance criteria.

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
  [DEBT-110](../product/PRODUCT_DEBT.md#-debt-110--bulk-operations-are-bounded-at-100-tasks-with-no-surface-that-says-so--p3--resolved-2026-08-09).
- Re-ran and preserved the phone acceptance matrix for capture, list editing, bulk
  actions and recurrence at 320, 375, 390 and 430px.
- Revalidated the full create form against the title-first composer contract: the
  full Drawer still focuses title first, accepts title-only Inbox capture, and leaves
  the faster quick-add/global capture paths unchanged.
- Fixed the completed-task double-announcement debt
  ([DEBT-115](../product/PRODUCT_DEBT.md#-debt-115--a-completed-task-is-announced-twice-once-by-the-list-once-by-the-notification-centre--p3--resolved-2026-08-09)).
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

### ☑ THEME-01 - DalyHub colour schemes — **DELIVERED 2026-08-11**

Five genuinely distinct colour schemes over ONE design system, so DalyHub stops
meaning "the violet app" without becoming five applications. Accepted as
[ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-089-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance).

> **The identifier is reused deliberately.** The V2 `THEME-01`
> ([Phase 12b](ROADMAP_V2.md#-theme-01--the-curated-theme-system)) was the seven-,
> then five-, palette CURATED theme system, retired wholesale by M3-01/ADR-074.
> This is not a revival of it: those were hand-authored palettes carrying their own
> component rules, and these are five GENERATED token maps over the Material
> Design 3 architecture ADR-074 built, with a test forbidding any module stylesheet
> from branching on one.

- **The schemes.** **Daly Violet** (default, and byte-identical to what M3X
  shipped, so nobody's colours changed), **Electric** (cobalt · violet · magenta
  over a deep blue-black shell), **Pulse** (magenta · plum · a disciplined lime
  tertiary on charcoal), **Ocean** (royal blue · teal · cyan on cool slate) and
  **Graphite** (charcoal brand, full-colour semantics).
- **Three concepts, kept apart.** Design system (never varies) · colour scheme
  (`data-color-scheme`) · appearance (`data-appearance`). The last two are
  independent: every scheme has a first-class light AND dark pair, so
  "Electric, Light" is as real a state as "Electric, Dark".
- **A scheme is a token map.** One generator, one role list, one variant, 205
  roles per scheme — no per-scheme stylesheet, no per-scheme component rule, and
  a test that fails the build if any stylesheet outside `tokens.css` so much as
  mentions the attribute. Measured cost of four extra schemes: **+8 kB gzipped**.
- **Neutral surfaces still dominate.** Working surfaces come from each scheme's
  own near-neutral palette, capped at HCT chroma 6 in light and 14 in dark (there
  is no white to tint at tone 10, which is why the ceiling is per appearance).
  Navigation is where a scheme is allowed to be strongest — Electric's dark
  navigation sits BELOW its canvas so the shell reads as a blue-black frame.
- **Semantics do not belong to the scheme.** Error, warning, success, the four
  priorities, the five record states, entity identity and the accent ramp use the
  same sources everywhere, harmonised to each seed. Asserted, per scheme, in both
  appearances: brand ≥25° from error and overdue, the priority ramp cannot
  collapse, no two entity identities share a colour, six chart series ≥25° apart.
- **Settings.** One picker under Appearance — five native radios, each with a
  name, a sentence and a three-dot preview drawn from generated per-scheme preview
  tokens, so a row shows its OWN scheme in the current appearance. Switching is
  immediate and optimistic; nothing reloads.
- **Persistence and first paint.** Owner-scoped column (migration `0039_add_owner_color_scheme_preference.sql`,
  additive, `DEFAULT 'violet'`), record as authority, `dh_color_scheme` cookie as
  a first-paint mirror reconciled by the shell loader, attribute written
  server-side. An unknown or stale value matches no scheme block and lands on the
  base `:root` — Daly Violet — so the safe fallback is a property of the cascade.
- **Non-goals, and they stay non-goals:** a custom colour picker, user-authored or
  downloaded palettes, a theme marketplace, per-Project or per-module schemes, and
  any change to typography, spacing, shape, layout, motion, icons or charts.

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
  content mutation. Migration `0039_create_capture_credentials.sql` adds
  credentials and rate-limit counters and
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

### ☑ HARDEN-02 - Release trust and the residual defects - **DELIVERED 2026-08-11**

The second hardening pass, taken after CAPTURE-01 and THEME-01 landed on top of
HARDEN-01. No feature, no redesign. Full record:
[`HARDEN_02_RELEASE_TRUST_2026_08.md`](../product/HARDEN_02_RELEASE_TRUST_2026_08.md).

- **Three merge collisions, from two pull requests that were open at once.**
  `CHANGELOG.md` failed `format:check`; two migrations both claimed `0039` (unit
  test, red); and two ADRs both claimed `088` (nothing checks that, so it was red
  nowhere). The ADR renumbered — [ADR-089](../decisions/ARCHITECTURE_DECISIONS.md#adr-089-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance)
  — and the MIGRATIONS deliberately did not: Wrangler keys `d1_migrations` on the
  complete filename, so renaming a file the parent commit already applied re-runs
  it (`duplicate column name: color_scheme`) and blocks every migration after it.
  The `0039` pair is grandfathered by exact filename beside the `0013` pair, and
  two tests now enforce that instead of describing it. The older `ADR-082`
  collision is likewise recorded rather than renumbered.
- **The DEBT-125 crash fix had never reached the browser.** HARDEN-01 changed
  what CI INSTALLS; Playwright chooses the binary at LAUNCH
  (`headless && !channel → chromium-headless-shell`), so CI kept running the
  binary that segfaults and the crash duly recurred. `playwright.config.ts` now
  sets `channel: "chromium"`. Retries stay `0`, no browser recycling, no shard
  change.
- **Two of the four residual E2E failures were PRODUCT defects**, not the test
  drift they had been read as: a phone user could not search People by name
  (UIX-05's own stated rule was made inert by the shared phone rule), and the
  capture sheet's "More note options" hand-off did nothing on the first tap
  (a blur-triggered error summary displaced the link between `pointerdown` and
  `pointerup`, so no click was ever produced). Both fixed, with regression
  coverage.
- **Eight more had not RUN on `main` for several commits** — they sat inside the
  tests shards 4 and 8 never started before `globalTimeout`, which is why a
  complete local run was the only way to see them. All eight were stale, each
  asserting something the UI programme replaced: a rail UIX-05 turned into two
  screens, an inline field UIX-06 took off the task row, a lower-case noun UIX-06
  capitalised, the retired floating action button, a task row's retired quick
  actions, Today's renamed region, and a card family whose hairline and resting
  shadow M3X removed on purpose. Each is repaired against what the product does
  now, and two weak assertions were made real while repairing them. A ninth was a
  seed defect: the search fixture's COMPLETION was never reset, so once any run
  completed that task it stayed completed on that machine forever.
- **A documentation truth pass over the high-authority documents**: the README's
  "backup/restore not in V2" and "AI is not built" contradictions, its Eisenhower
  Matrix description, Help's denial of the colour schemes that shipped the same
  day, `SETUP_AND_CI.md`'s reversed browser-install claim, one unreachable state
  documented in `TODAY_DASHBOARD.md`, and a duplicated roadmap entry.
- **Non-goals held:** no `.skip`/`.fixme`, no retry raised, no selector widened,
  no test deleted, no new feature, no new CI job, no production contact.

### ☑ PWA-12 - Offline Task mutation slice - **DELIVERED 2026-08-11**

The first deliberate offline capability beyond capture. Not "offline mode": a
bounded slice whose job is to prove that DalyHub's queue, replay, idempotency,
recurrence handling and conflict model are trustworthy before offline editing is
offered anywhere else. Full record:
[`PWA_AND_OFFLINE.md` §15](../development/PWA_AND_OFFLINE.md#15-pwa-12--the-offline-task-mutation-slice).

- **Six operations, one entity type.** Complete, reopen, rename, priority, due date,
  planned date - all through the SAME inline controls the owner already uses. There
  is no "offline editor" and no mode. A Task operation becomes offline-capable by
  being described at its call site, never by being adjacent to one that is.
- **The queue stores INTENT, never a second truth.** No `OfflineTask`, no second
  Task repository, no offline recurrence engine, no offline business rule. Replay
  posts the canonical intent to `/tasks/:taskId` - the same authenticated route the
  row and the Drawer post to - so validation, Activity, workspace scoping and the
  Task domain are exactly what they were.
- **The client never generates a recurring successor.** TASKS-07's engine stays
  server-side and decides when the completion replays. Exactly-one-successor is
  protected twice: by the receipt, and by `completeTask` being an idempotent no-op
  on an already-completed Task. Both are proven against real D1 for a fixed
  schedule, an after-completion schedule, duplicate replay under the same key,
  duplicate replay under DIFFERENT keys, and an interrupted response.
- **Conflicts are field-focused and explicit.** The server compares the one field
  the intent writes, so an offline priority change MERGES with an unrelated server
  title change instead of manufacturing a conflict. When the same field did move,
  DalyHub says so in plain language - "This task was renamed on another device
  while you were offline" - shows both values, and offers exactly two choices.
  Nothing is silently overwritten and nothing is silently discarded.
- **Idempotency reuses PWA-05's receipt protocol**, against a second table
  (migration `0040`) because a mutation receipt answers a different question from a
  capture receipt. One departure, deliberate: a conflict RELEASES its claim, so
  "keep my change" is answerable.
- **Ordering is per-entity serial, cross-entity parallel**, from a monotonic
  sequence rather than a device clock. One Task waiting on a decision never freezes
  the device. Replace-style edits coalesce; completion and reopen never do.
- **Two real defects found and fixed on the way.** Regaining a connection did not
  reconcile - `probe()` set the state and the only code calling `sync()` was a
  heartbeat that the healthy state cancelled - so reconnection is now recognised in
  one place, as a transition. And opening a task while offline took the page down,
  because a Drawer opens by navigating and two loaders re-ran for a parameter
  neither reads; both now decline. The global error boundary is untouched.
- **Bounded and quiet.** 200 outstanding changes per device, refused truthfully
  rather than silently dropping the oldest; confirmed changes are pruned, because
  the Activity stream is the audit authority and the queue is not a second history.
  A Task with nothing outstanding carries no sync chrome at all.
- **Not built, deliberately:** offline editing of any other module, Project
  reassignment (assessed, deferred - it is the one field whose TARGET can vanish
  while offline), full replication, CRDTs, collaborative editing, live multi-device
  sync, WebSockets, Background Sync as a foundation (Safari/iOS lacks it), push
  notifications, background polling, AI reconciliation, or any service-worker
  rewrite.
- Accepted via
  [ADR-090](../decisions/ARCHITECTURE_DECISIONS.md#adr-090-offline-mutation-as-a-transport-concern--a-queue-of-intents-replayed-through-the-canonical-route-with-field-focused-conflict-arbitration).

### ☑ TASKS-11 - Deterministic natural-language capture v2 — **DELIVERED 2026-08-11**

Extend the existing parser only where it is reliable and testable. **One** parser,
**one** recurrence model, no AI, and no second capture system.

- **After-completion recurrence is capturable in one sentence.** "Service Hilux
  every 6 months after completion" creates the Task the recurrence EDITOR would
  create: title `Service Hilux`, a `month`/`6` rule in the TASKS-07
  `after_completion` mode. Six suffixes are recognised and no more — `after
  completion`, `after completed`, `after completing`, `after finishing`, `after I
  complete it`, `after I finish it` — with an optional `repeat`/`repeats` lead-in.
- **The mode is never inferred.** "Pay rent every month" is still a FIXED schedule;
  the only thing that selects the other mode is the owner saying so. A regression
  suite asserts the distinction, and the two modes' late-completion behaviour is
  proved through the real engine rather than restated.
- **Two deterministic gaps closed while in there:** counted DAYS (`every 14 days`)
  and an interval of one (`every 1 month`) are now read, in both modes. Both were
  arbitrary parser-only limits; the bound is now the kernel's canonical 1–99.
- **False positives stay bounded.** A phrase that cannot be fully recognised — an
  interval outside 1–99, an after-completion suffix on a weekday-pinned rule, a
  near-miss like "after completions" — is left as ORDINARY WORDS rather than
  half-read, so the title is never damaged.
- **No new recurrence representation and no new capture backend.** The parser emits
  the existing structured rule, `/tasks/new` binds the existing mode field, and the
  same sentence through `POST /api/capture` produces the same Task — the endpoint
  gained no recurrence field, because natural-language capture through the shared
  parser is what it is for.
- **One anchor decision, made at submission.** An after-completion rule with no date
  anywhere starts on the owner's today, but that is resolved by the shared
  `resolveCapturedRecurrenceAnchor` *after* the surface's own date controls are merged
  in — so a due date the owner picked on the form always wins, and no scheduled date
  is invented alongside it. The CAPTURE-01 service now calls that same function
  instead of its own copy of the date-kind logic.
- **Non-goals held:** no AI, no fuzzy inference, no Project/Area/Goal guessing, no
  new UI surface, and no ordinal monthly patterns (that remains TASKS-12).
- Closes [DEBT-118](../product/PRODUCT_DEBT.md).

### ☑ TODAY-10 - Focus panel refinement - **DELIVERED 2026-08-12**

The roadmap asked for a refinement **only if** the evidence showed the combined
"For today" bucket was still unclear. It did, and the evidence was specific rather
than aesthetic: a Task planned for today but not due for six weeks rendered in
that list as a bare title with no date fact at all, indistinguishable from a
deadline — while the same record on `/tasks?system=today`, which Today's own
figure links to, plainly read "Sun, 20 Sep". Today was the LESS clear of the two
surfaces. Two further defects were found in the same pass and fixed with it.

- **Three named bands inside the one Focus panel** — Overdue · Due today ·
  Planned today — each drawn only when it holds work. The SET is unchanged; a
  Task both due and planned today appears once, under Due today. The distinction
  is carried by the band rather than by the row, because the row's one trailing
  slot is the Project and a 320px line cannot hold all three.
- **A stated order that replaces an alphabetical one**: slipped work oldest-first,
  then Due today, then Planned today; within each band priority, then the nearest
  deadline, then the title, with the id as a total tie-break. The row draws the
  shared P1–P4 indicator so the order can be read off the screen. No composite
  score, no priority grouping, no Matrix.
- **Completion no longer moves a row between bands.** Ticking an overdue row used
  to remove it from the overdue band and re-draw it fifteen rows lower under
  "For today", pulling a previously-hidden overdue row up into the gap — the
  opposite of what the module documentation claimed. One classifier now decides
  placement from dates alone, for open and completed work alike, which also took
  completed overdue work back out of the progress denominator it was never
  supposed to be in.
- **A stated display bound**: 8 of the day's own rows, then "View all N tasks for
  today", where N is the TRUE size of `/tasks?system=today` rather than the slice
  or the remainder. Neither band can be deleted whole to make room for the other.
- **The last Today ↔ Tasks divergence closed, centrally and in the canonical
  view.** An on-hold Task due today was counted by `/tasks?system=today` and not
  by Today (measured: 14 against 12). TASKS-04 had already decided the intent
  once — a paused Task is not today's work — so the three DATE-driven system
  views now exclude parked work (waiting **and** on hold) exactly as the planning
  read does. `inbox` is untouched; it is about filing, not dating.
- **Non-goals held:** no Today redesign, no new Task field or view, no AI, no
  productivity score, streak or gamification, no calendar or weather, no new Goal
  or Analytics measure, no second definition of "today".
- Contract, ordering, bounds, the Needs-attention boundary and the phone
  composition: [`TODAY_DASHBOARD.md → The Focus contract`](../development/TODAY_DASHBOARD.md#the-focus-contract-today-10-2026-08-12).

### ☑ CAL-01 - Unified External Schedule (with CAL-02, CAL-03) - **DELIVERED 2026-08-12**

Make Today truthful about the day it is describing, without making DalyHub a
calendar application. Delivered as one bounded end-to-end change and accepted as
[ADR-091](../decisions/ARCHITECTURE_DECISIONS.md#adr-091-external-calendars-as-a-read-only-projection--a-sealed-secret-kernel-primitive-an-rfc-5545-parser-at-the-edge-and-an-explicit-link-to-the-meeting-authority).

The objective, in one sentence:

> **DalyHub should know what is happening in the owner's day, without becoming
> another calendar application.**

- **Read-only ICS sources, configured in Settings.** Add a calendar with a name
  and a published link -- no Cloudflare CLI, no environment edit, no provider
  OAuth. Rename, pause, refresh, remove. Up to ten per workspace.
- **The link is treated as the credential it is.** Sealed with AES-256-GCM under
  a deployment secret through a new KERNEL primitive (`app/kernel/secrets`), and
  structurally unable to reach the browser: the Settings view type has no URL
  field and the repository's ordinary read does not select the column.
- **SSRF is treated as a security control, not a form check.** HTTPS (and
  `webcal:`) only, no credentials in the URL, port 443 only, no loopback /
  private / CGNAT / link-local / unique-local / reserved target, redirects
  followed manually and revalidated on every hop, body bounded while streaming.
- **RFC 5545 parsed by `ical.js`** (MPL-2.0, recorded decision), at the platform
  edge, server-only, verified in the real Workers runtime and verified absent
  from the client bundle. Recurrence, `EXDATE`, moved instances, cancelled
  instances, all-day items and DST all behave.
- **Refresh is idempotent, isolated, atomic and silent.** Identity is
  `(source, UID, RECURRENCE-ID)` -- never the title or the time -- so a renamed
  or moved event updates a row rather than replacing it. One failing source never
  affects another; a failed refresh keeps the previous projection and the UI
  states its age rather than claiming success. Nothing appends Activity.
- **Today gained one region, not a redesign.** TODAY-10's Focus contract is
  untouched. The Schedule panel it already had now holds the unified day -- every
  enabled source plus the Meetings no event represents -- with Now/Next as WORDS
  and no countdown. Today issues no additional queries.
- **Tomorrow and Next 7 days** reuse the same schedule read and the same Task
  date classifier (TODAY-10's `focusBand` was split so its due/planned half is
  shared rather than copied). Seven days is one read, not seven.
- **An imported event can explicitly become a canonical Meeting**, through the
  existing Meeting authority. The link is keyed on external identity, so it
  survives refresh, rename, time change, cancellation, the event disappearing,
  the projection being pruned, and the calendar source being removed -- and
  "one Meeting per occurrence" is a database guarantee.
- **Two real defects found by the tests and fixed:** a completed refresh was
  blocking the next one (the claim shared a column with "last attempt"), and
  Today's existing meeting row linked to `/meetings/:id` when the record route is
  `/meeting/:id`.
- **Non-goals held:** no Graph/OAuth/CalDAV/EWS, no two-way sync, no writing to
  any calendar, no RSVP, no attendee import, no People from attendees, no
  description import, no month or week grid, no drag-and-drop, no time blocking,
  no Tasks generated from events, no notifications, no realtime, and no AI.
- Full product and security documentation:
  [`CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md`](../product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md).

### ☑ MOBILE-01 - iPhone daily-driver polish - **DELIVERED 2026-08-12**

The V2.2 half of the LATER line "broader mobile polish after Tasks/Today acceptance
is stable". It reuses the MOBILE-01 identifier deliberately: the
[V2 item of the same name](ROADMAP_V2.md#-mobile-01--fast-mobile-first-daily-experience)
built the phone PLATFORM (bottom navigation, the shared `Sheet`, the keyboard
inset, the full-screen Drawer, the 44px floor) and this is the polish pass ON that
platform. Not a redesign: the visual language, the M3 direction, the information
architecture, every domain behaviour and every shared component are unchanged.

Evidence, measurements, deliberate non-changes and the residual debt:
[`MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md`](../design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md).

The audit drove 29 routes at 320 / 375 / 390 / 430 in iPhone emulation and measured
overflow, effective hit areas (probed with `elementFromPoint`, so a 20px glyph in a
44px label passes and a bare 20px glyph fails), text-entry font sizes and chrome
offsets. **The defects clustered, and the cluster is the finding**: almost every one
was a shared rule written as an enumerated list of consumers rather than as a value
or a default — and a list is not missed on purpose, it is missed by everything
written after it. So the fixes move rules into tokens and defaults, and pull the
drifted module code back in.

- **Three P1s, each a shared rule in the wrong shape.** The anti-zoom floor was
  three class names in `forms.css`, so eight module filter controls computed at
  14px and focusing any of them left iOS Safari zoomed and scrolled sideways — it
  is now `--app-field-font-size(-compact)`, consumed by the native-control baseline
  every `input`/`select`/`textarea` already inherits. `FormActions sticky` was an
  opt-in three of twenty-nine forms had taken, so "Create person" sat at y≈1,160 in
  an 844px viewport — it now defaults to sticky below `md`. And the shared ⋯ menu
  was an anchored 208px popover on a phone with actions wrapping onto three lines —
  it now renders the same items, ids, roles and keyboard contract inside the shared
  `Sheet`, with the placement and outside-pointer behaviours that belong to the
  anchored presentation switched off.
- **One real horizontal overflow, fixed at the cause and at the shape.** A Task
  with a long *Waiting for* subject took the Project record 79px wider than a 320px
  viewport, because the phone row pins its metadata run with `flex: none` and the
  `high` tier survived the narrow drop list. The fact joins priority and repeat in
  that list, and the run takes a ceiling so no future field can do it again.
- **Targets fixed intelligently, never by growing rows.** Today's completion circle
  had a 20×20 hit area — the most-used control in the product, on the surface a
  phone opens first — and now wraps the same shared label the Tasks list uses. A
  row's "open" link went from a 20–22px strip inside a 45px row to the full row
  height, via padding rather than an overlay, because both links sit inside the
  `overflow: hidden` that draws their ellipsis and hit testing respects that clip.
  A two-character record tab clears the floor on the inline axis.
- **The Diary week stopped hiding two of its seven days** (five of seven visible at
  390, six at 320, cells 26–36px wide). The arrows move onto the control line that
  already existed and the days take a full line at equal width: 7/7 visible, 51px
  at 390 and 41 at 320 — the residual is stated rather than papered over, because
  seven equal targets in a 288px content box cannot each be 45px.
- **Hygiene that is not cosmetic.** `env(safe-area-inset-*)` was 53 declarations
  across 11 stylesheets, some with the `0px` fallback and some
  without — and the bare form resolves to nothing rather than zero inside `calc()`.
  Four `--app-safe-area-*` tokens state it once; every consumer migrated. A fifth
  token, `--app-surface-current`, answers "what am I painted over?" for a sticky
  child by having the SURFACE declare itself, rather than by enumerating ancestors
  in the sticky rule — the same shape as the two defects above, caught before it
  became one.
- **Deliberate non-changes, recorded with their measurements:** Today's composition
  (Focus reaches y=248 of 844 — left alone), the central bottom-bar Capture action
  (no FAB reintroduced), the one-line Tasks row (not made into cards), swipe and
  long press (accelerators, never requirements), the Notes toolbar (no second
  editor), native `<select>` on a phone, and every domain rule — Goal progress
  arithmetic, Task recurrence, Area semantics.
- **Non-goals held:** no new design system, no CSS framework, no revived `--dh-*`
  token, no device-model breakpoint, no module-specific sheet, no second client
  data model, no state-management framework, no background sync, no new feature
  found in an empty space. Remaining debt (the duplicated record title on a phone,
  the Goals double filter row, 41px Diary cells at 320, the Diary's duplicated
  empty-state CTA) is recorded in the evidence document and NOT converted into
  work items here.
- **Perceived performance was MEASURED, on the built application rather than the
  dev server, and nothing was optimised that the numbers did not ask for.** The
  one interaction this pass changed — the overflow surface — opens in 56.5ms p50
  against a <100ms budget, ~27ms more than the anchored menu it replaces on a
  phone, which buys the portal, focus trap, inerting and scroll lock that make it
  a modal. The same interaction measures 181ms under `react-router dev`, which is
  why every figure was taken twice. Two PRE-EXISTING figures are over budget
  (client navigation 389ms, Drawer open 372ms, both server round-trip bound); they
  are recorded with their measurements rather than half-addressed, because the
  answer is prefetching or caching and this pass does not add either speculatively.
- Covered by `e2e/iphone-daily-driver.spec.ts` (23 tests across the four widths,
  including the desktop-unchanged assertions) on top of the existing
  `mobile-shell` / `mobile-modules` phone suites.

### ☑ HARDEN-03 - Close the reliability loop - **DELIVERED 2026-08-12**

The third and final hardening pass, taken so reliability can stop being a standing
programme. No feature, no redesign, no CI workflow change. Full record:
[`HARDEN_03_CLOSE_RELIABILITY_LOOP_2026_08.md`](../product/HARDEN_03_CLOSE_RELIABILITY_LOOP_2026_08.md).

- **DEBT-126 was not a hang, and the recorded cause was wrong.** The Settings
  preferences journey exceeded its own 30-second budget, and the failure landed on
  whichever wait was HOLDING THE CLOCK when it expired — which is why the reported
  step moved between CI (the Diary navigation) and a local run (the Settings one),
  and why it read as `waitForLoadState("networkidle")` never arriving. MEASURED
  with `--timeout=180000` so nothing can expire: the journey PASSES on the
  unmodified gate in 35.3s, 36.0s, 36.4s and 42.5s. Split into four journeys, one
  per preference contract, every assertion kept — 30 passed over three
  `--repeat-each` runs, each journey 11.6-18.2s against its 30s budget.
- **DEBT-127 was the arithmetic, not the product.** Two owners 25 hours apart
  cannot be a fixed number of calendar days apart. Reproduced deterministically by
  PINNING the clock rather than waiting for 10:00 UTC, then replaced with a table
  of seven pinned instants each asserting the one calendar date each zone is in.
  Strictly stronger than the gap it replaced; the file now reads no wall clock.
- **DEBT-125 is deliberately left OPEN, which is the pass's main finding.** In the
  seven `main` runs since HARDEN-02, not one produced a completed E2E result: six
  had shards 4 and/or 8 reach `globalTimeout` with 27-118 tests never executed, and
  one was red with no failing test at all. The browser fix IS holding — no SIGSEGV
  and no `browser.newContext` cluster across 56 shard jobs — and `main` is no
  longer broadly red, but a suite that cannot finish is not a signal.
- **Two entries split out rather than left inside DEBT-125 as unexplained**:
  DEBT-128 (count-based shard slicing) and DEBT-129 (four named, feature-owned
  failures). Both are answered by HARDEN-04 below.
- **Non-goals held:** no `.skip`/`.fixme`, no retry raised, no timeout increased,
  no selector widened, no test deleted, no CI workflow change, no production
  contact. The shared `networkidle` gate in `e2e/helpers.ts` was suspected,
  measured, found NOT to be the cause, and left alone rather than changed on a
  hunch across ~1,000 tests.

### ☑ HARDEN-04 - A finishing, readable E2E run - **DELIVERED 2026-08-13**

The one bounded piece of work between DalyHub and "ordinary feature work can
resume", and the last planned hardening pass. Full record:
[`HARDEN_04_FINISHING_E2E_RUN_2026_08.md`](../product/HARDEN_04_FINISHING_E2E_RUN_2026_08.md).

- **The split is derived from measured TIME, not test count** (DEBT-128).
  `--shard=n/8` divided a suite whose spec files cost between 0.8s and 53s a
  test: MEASURED on runs 31690164253 and 31697528360, shard 6 ran 198 tests in
  7.9 minutes while shard 8 spent 22.7 on 109 and left 87 NEVER RUN. The gate now
  runs the ten partitions of a generated, committed, `Static`-checked
  `e2e/partitions.json` — whole spec files, packed longest-first by their
  measured seconds, with one 465-test generated matrix file sliced by `--shard`
  inside itself. Worst partition 15.6 min of a 25-minute ceiling that was NOT
  raised; worst/mean 1.09 against 1.47.
- **A partition that does not finish can no longer look green.** Each job prints
  what it is before it runs and what happened after — collected, executed,
  passed, failed, deliberately skipped, NEVER EXECUTED, elapsed against budget —
  and fails with a distinct message when any assigned test did not execute.
  Playwright counts an unexecuted test as "skipped"; telling those apart is the
  whole difference between a result and the absence of one.
- **The four DEBT-129 failures are diagnosed individually, from the CI traces of
  the runs that failed** — not from the error messages, and none of them by
  retry, timeout, skip or a widened selector.
  - `tasks-v22-daily-driver.spec.ts:158` (TASKS-05) — **timing**: the row is
    painted "Today" optimistically but REGROUPED by the revalidation
    (`task-optimistic.ts`, ADR-086), which re-creates it and takes the open menu
    with it. The test now waits for the row to be where the server put it, which
    also asserts the regroup for the first time.
  - `today-focus.spec.ts:290` (TODAY-10) — **stale assertion**: the eight-row
    bound counts OPEN rows; a completion is drawn beyond it on purpose
    (`day-view.ts` → `boundBand`). It read 9 the moment another journey left a
    completed task on the day. Now counts open rows, and asserts the placement
    rule the failure exposed.
  - `today-focus.spec.ts:331` (TODAY-10) — **stale assertion**: rows differ by
    exactly the 1px hairline `.dh-day-row + .dh-day-row` draws between siblings
    (MEASURED 61px vs 62px at 320px), so "every row is the same height" could
    only hold when every band had one row. Now asserts the actual rule — one line
    box per title, identical row boxes.
  - `pwa-offline-tasks.spec.ts:386` (PWA-12) — **timing**: the test reloaded
    through its own replay pass, stranding the record under the documented
    two-minute `syncing` lease, then waited 45 seconds for it. It now waits for
    the queue to be at rest before reloading. The product is untouched.
- **The finishing suite immediately earned its keep**, which is the argument for
  it in one line. Its first complete run surfaced two failures nothing to do with
  this change: `goal-measurement.spec.ts` was completing a task it did not own
  (the seeded overdue task that `project-health.spec.ts` asserts keeps a Project
  at risk), and `project-activity.spec.ts:252` was passing in **29.0 s of a
  30-second budget** on `main` — ten viewports in one test. Both repaired at
  their real cause: the first owns its record now, the second is one test per
  width with every assertion kept.
- **Non-goals held:** no `.skip`/`.fixme`, no retry raised, no timeout increased
  (`globalTimeout` is unchanged at 25 minutes), no `workers` increase, no
  selector widened, no sleep added (one was REMOVED), no test deleted, no
  coverage removed, no production contact.

### ☑ HARDEN-05 - Restore a genuinely green `main` - **DELIVERED 2026-08-17**

HARDEN-01…04 made the suite FINISH and made its result READABLE. What they could
not do is make it TRUE: by 17 August `main` carried a standing red set, and the
register's own census of it (DEBT-149) was less than a quarter of the real size.
Full record: [`HARDEN_05_GREEN_MAIN_2026_08.md`](../product/HARDEN_05_GREEN_MAIN_2026_08.md).

- **The baseline was MEASURED at `f994aa0` before any edit, not inherited.**
  Ten partitions, each against a fresh local D1 and the production build — which
  is what a CI partition job is: **73 failing / 1678, across 26 spec files**,
  where DEBT-149 recorded 16 and then 36. CI run 32019461430 at the same SHA
  agrees, and its `p01` names exactly the same three failures the local `p01`
  produced.
- **73 failures, EIGHT root causes.** Sixty-four were one shape — a spec
  addressing an anatomy the product deliberately replaced: DS-04's `TaskRow`,
  CONTROL-01's controls popover and merged Task record, REDESIGN-04's Goals
  workspace and metric trio, ADR-100's default table, NOTES-06's shared filter
  grammar, IDENTITY-01's identity picker, CONVERGE-01 §B's state breakdown.
  Every one is corrected to the shipped contract with the change that caused it
  named at the assertion.
- **Nine were the product being wrong**, each measured before and after: a task
  row's open target at 19.6px on a phone (the MOBILE-01 rule had been pointing
  at the retired Card since DS-04), two fields under the 16px iOS-zoom floor,
  Today's document at 204px against a 195px viewport (WCAG 1.4.10 — the residual
  DEBT-148 could not attribute), an unnamed open link on the Projects table, and
  a `<span>` where `SelectField` should have had a `<label>`.
- **One ceiling moved, with evidence and a debt entry.** The shell precache is
  1,321 kB against a budget written at 674 kB. It is re-baselined rather than
  repaired — 731 kB of it is the stylesheet, ~200 kB of that the multi-scheme
  colour layer, and reducing either is a performance-architecture decision — and
  the ratchet TIGHTENS in exchange: ~10% headroom instead of ~1.8×, plus a new
  ceiling on the compressed bytes the suite could not see at all. Raised as
  DEBT-151.
- **Non-goals held:** no `.skip`/`.fixme`/`describe.skip`, no retry (`retries: 0`
  unchanged), no `workers` increase, no global or test timeout raised, no
  `waitForTimeout` or sleep added, no assertion weakened to an existence check,
  no selector widened to generic CSS, no test deleted, no accessibility check
  removed, no CI check made informational or `continue-on-error`, no production
  contact. One width-based touch-floor change was made and then REVERTED,
  because `dalyhub-tokens.test.ts` refuses it and is right — the tests were
  emulating a phone by width alone, and a phone is a width AND a pointer.
- **Closes DEBT-135, DEBT-148 and DEBT-149.**

### NEXT

**The DS programme — the DalyHub design system replaces Material Design 3 as the
governing design language.** DS-01 and DS-02 are delivered; DS-03 is the next
item to pick up. The stages are deliberately small and independently shippable,
and none of them is a screen redesign until DS-04.

> **Naming collision, stated once so nobody trips on it.** `DS-01`…`DS-17` are
> already used as item ids in [`ROADMAP_V2.md`](ROADMAP_V2.md), which is
> **closed**: its DS-01 was "Design tokens & theming" — the original bespoke
> `--dh-*` token system, retired wholesale by M3-01/ADR-074. These DS items are
> the **2026-08 design-system programme** and are the ones in force; a bare
> "DS-01" in current documentation means this one. When citing the old series,
> say so explicitly ("DS-01 (V2, closed)"). Renaming either series was judged
> more churn than the ambiguity is worth, since the earlier programme is closed
> and the system it built no longer exists.

The decision is
[ADR-092](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery);
the specification is
[`DALYHUB_DESIGN_SYSTEM.md`](../design/DALYHUB_DESIGN_SYSTEM.md); the audit,
component inventory, primitive-library decision and full migration map are in
[`DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md`](../design/DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md).

| Stage | Scope | Depends on | Risk |
|---|---|---|---|
| ☑ **DS-01** | Design-system foundation — **DELIVERED 2026-08-14** | — | Low |
| ☑ **DS-02** | Generic UI primitives — **DELIVERED 2026-08-14.** `app/shared/ui/` is the generic layer: `Button`/`ButtonLink`/`IconButton`/`Input`/`Textarea`/`Select`/`Checkbox`/`Badge`/`Card` built, `ConfirmationDialog` moved, `Menu`/`Popover`/`Sheet`/`Tabs`/`Tooltip`/`Switch` re-exported, the menu/dialog/tabs/tooltip/panel restyled onto `--dh-*`, and the application declaring `compact`. [ADR-093](../decisions/ARCHITECTURE_DECISIONS.md#adr-093-the-dalyhub-generic-primitive-layer--a-real-button-a-compact-application-and-three-migration-bridges) · [`DS_02…`](../design/DS_02_CORE_UI_PRIMITIVES_2026_08.md) | DS-01 | Medium |
| ☑ **DS-03** | Shell and navigation — **DELIVERED 2026-08-14.** The rail is DARK in both appearances with its own generated colour family (D35–D37); a destination is 36px on a cursor and 45 on a finger; the account moved to the bottom of the rail and search to the leading edge of a 56px bar; the tablet gets a 68px glyph rail (D38); the page frame has one origin at every width; every shell stadium is retired, including the navigation sheet's two. Fixed a real WCAG 1.4.11 failure — `primary` measures 2.40–2.42:1 over the rail. D12 amended (row height), D15 untouched. [ADR-094](../decisions/ARCHITECTURE_DECISIONS.md#adr-094-the-dark-navigation-rail--a-region-that-does-not-follow-the-appearance-a-responsive-tablet-collapse-and-one-origin-for-the-frame) · [`DS_03…`](../design/DS_03_SHELL_AND_NAVIGATION_2026_08.md) | DS-02 | Medium |
| ☑ **DS-04** | Tasks redesign and visual convergence — **DELIVERED 2026-08-14.** `/tasks` stopped rendering the generic `Card` and gained a product-level `TaskRow`/`TaskList`/`TaskGroup` on a shared column grid (`Task · Project · Due · Priority · Status`), on `compact`, drawn straight onto a white workspace with hairlines and no per-row surface. Project became an identity dot, the due date ordinary text bounded at a week, priority a dot and a tag; one pill survives per row. The row RECOMPOSES to two lines on a **container** query, which also fixed a real horizontal overflow in the Board and Time Sectors columns. Quick capture became the next row. Selector options are one line at the menu rung with a visible tick and an escape hatch to the searchable picker. The drawer lost its lavender wash product-wide (§35) and the Task record lost its nested cards. [`DS_04…`](../design/DS_04_TASKS_REDESIGN_2026_08.md) · [`TASKS_MODULE.md`](../development/TASKS_MODULE.md#the-tasks-list-after-ds-04-2026-08-14) | DS-02, DS-03 | Medium–high — the most-used surface, and D18/D32 are load-bearing |
| ☑ **DS-05** | Projects, Areas, Goals — **DELIVERED 2026-08-15.** ONE card boundary for the whole product (D44, amending D1): a hairline, a 12px corner, no shadow, hover as a border change rather than a lift. A Project card fell 215px → 117px — padding 20→16, mark 56→40, and a foot of two rows instead of three with the percentage moved off its own 24px line and onto the bar's. The Goal card's tinted reading slab is gone (D45), the six accent washes with it. Areas became a flat list on the white ground (`.dh-collection--flat`, generalised out of DS-04's Tasks-only rule) at the product's two-line row height. Goals' status rail is the shared `ViewTabs`, so the page no longer stacks two identically-shaped segmented controls. §5b's shape distinctions are intact: the anatomies still differ, only the boundary converged. [`DS_05_08…`](../design/DS_05_08_WHOLE_APP_VISUAL_COMPLETION_2026_08.md) | DS-02 | Medium — §5b's shape distinctions must not be flattened |
| ☑ **DS-06** | Today — **DELIVERED 2026-08-15.** The composition changed, not the content: the attention column spans both grid rows and Goal progress takes the two tracks beneath Focus and Schedule, which closes a MEASURED 500×300px hole in the bottom-left of the fold and puts the product's stated Goal-progress requirement above it. The overdue rail (3px crimson) is gone — the Overdue heading arrived in TODAY-10 and the trade the rule was justified by has already been taken the other way. The goal tiles lost their pastel fills (D45). The week's comparison axis gained a separator: "4 0" read as "forty". D11 stands — there is still no hero. | DS-02, DS-05 | Medium — D11 (Today has no hero) stays |
| ◐ **DS-07** | Adaptive and mobile audit — **AUDITED 2026-08-15.** `scripts/ds-final-audit.mjs` drives 13 routes × {320, 390, 768, 1366, 1920} × {light, dark} for document overflow, touch-target size and axe at WCAG 2.0/2.1/2.2 A+AA. **No document-level horizontal overflow at any width**, and one axe violation found across the matrix — `document-title` on any URL matching no route, i.e. a 404 shipping with no `<title>` (WCAG 2.4.2), fixed by a root `meta` fallback. The DENSITY PREFERENCE question is deliberately still open, and is the reason this is ◐ rather than ☑ — see [DEBT-131](../product/PRODUCT_DEBT.md). | DS-03…DS-06 | Medium |
| ◐ **DS-08** | Cleanup — **PARTIAL 2026-08-15, and measured.** Every MD3 colour role with an exact 1:1 `--dh-*` alias migrated: 1,269 references across 68 stylesheets, **verified pixel-identical** (0 differing pixels of 2,301,120 on a full-page Today capture before and after, and no scope anywhere redefines one of the 26 mapped names). Cross-module convergence landed with it: one collection header (D47), one create-action label (D47), one selected-surface treatment (D46). What did NOT move is recorded rather than forced — 983 typescale, 488 shape/motion/elevation and 190 `--md-sys-color-primary` references need a JUDGEMENT per call site, because the mapping is many-to-one and semantic; a mechanical pass would erase exactly the distinctions the `--dh-*` layer exists to draw. [DEBT-132](../product/PRODUCT_DEBT.md), [DEBT-133](../product/PRODUCT_DEBT.md), [DEBT-134](../product/PRODUCT_DEBT.md). | all | Low–medium, and only if the earlier stages actually finished |

| ☑ **FINAL-UI** | The approved product concepts become the visual authority — **DELIVERED 2026-08-15.** `concept 1/2/3.png` supersede the two exploratory references DS-03 and DS-04 were designed against, and on the largest question they disagree: all three draw a **near-white navigation rail**, so `surface-rail` re-tones 14 → 96 in light with dark foregrounds and the current destination becomes a 12% lavender row with a violet label (a new generated `on-rail-selected` role) instead of a saturated block. The canvas moves to tone 98 and the hairline to 91. Tasks takes concept 2's row: **36px** rows carrying 14px titles (56 before — this is what [DEBT-131](../product/PRODUCT_DEBT.md) asked for, and the fine-pointer completion target is what unlocked it), no column key, `date · project`, `Overdue · 20` in red sentence case, priority as a flag and a tag PRODUCT-WIDE, and a display state with no fill. Today's stat row moves below the day's work (§45), its greeting reads the page-title role and its rows take the Tasks density. The scope filter loses its tray in seven collections. Settings takes concept 1's two-line list. Three measured layout defects went with it (a filter band sized 405px inside a 1224px pane; a project name colliding with the priority flag at 390; an orphan separator at 320). [`DALYHUB_FINAL_PRODUCT_UI_2026_08.md`](../design/DALYHUB_FINAL_PRODUCT_UI_2026_08.md) · [ADR-096](../decisions/ARCHITECTURE_DECISIONS.md) | DS-01…DS-08 | Medium — it reverses ADR-094's central decision, and `contrast.test.ts` had to be rewritten rather than extended |

| ☑ **TODAY-11** | The command centre (`MOCKUP 5.png`) — **DELIVERED 2026-08-16.** Today rebuilt to the owner's newest picture, and built entirely from what the product really knows. Four RANKS replace the two-column body (measures · plan beside schedule · goals/insights/doorways · attention beside continue), because seven panels in two tall columns is how every previous Today layout came to hold a hole under the shorter one. The Schedule panel gains the mockup's **week strip** — seven days, arrow-navigable as a `tablist`, dots from the ALREADY-LOADED window, selecting a day costing no request, and never calling a selected day "Today". **Quick capture** and **Daily reflection** arrive as real panels: every control on them opens the SHARED capture sheet (the "field" is a button, exactly as `DesktopTopBar`'s search is, so Today gains no second capture implementation), and the reflection shows today's Diary entry's opening with no sentiment, no AI and no streak. **Three of the mockup's elements are omitted because the capability does not exist and none was invented**: focus time (no timer, no session record, no field), a productivity score (a composite judgement the product refuses everywhere), and a TIME on each plan row — verified at the schema, `due_date`/`scheduled_date` are `CHECK (… GLOB '????-??-??')`. Two more with them: the Reminder chip (DEBT-57) and the Upload chip (DEBT-35). "View full calendar" went too — `/today/schedule` is a POST-only resource route with no `GET`, so the one link goes to `/today/upcoming`. **§45 is amended, not ignored**: the stat rank returns above the day because the mockup puts it there, and the guard that fails on a FOURTH block above the day's work stays. **One new query in the whole pass** (today's Diary entry, `limit: 1`); the schedule window widened from one day to seven at the same statement count. [`TODAY_11_COMMAND_CENTRE_2026_08.md`](../design/TODAY_11_COMMAND_CENTRE_2026_08.md) · [DEBT-143](../product/PRODUCT_DEBT.md), [DEBT-144](../product/PRODUCT_DEBT.md), [DEBT-145](../product/PRODUCT_DEBT.md) | FINAL-UI, REFINE, CAL-01, CAPTURE-01, REDESIGN-04 | Medium — it amends FINAL-UI §45 and makes the Schedule panel permanent; the shared `TaskRow` adoption is explicitly NOT done and is recorded as DEBT-143 rather than claimed |

| ☑ **REFINE** | The final convergence pass — **DELIVERED 2026-08-15.** Confidence rather than structure. **Two hairlines** (D39): the concepts draw a card EDGE at ~1.36:1 and a row DIVIDER at ~1.03, DalyHub drew both with one value, so `outline-hairline` goes 91 → 87 and a new `outline-divider` lands at 94. **Today** stops being five equal-weight rectangles — one card for the day's work, plain sections beside it, and Goal progress loses both its outer panel and its four inner card edges. **Settings** and **Ask** read the page-title ROLE (Settings measured 28px/400 against every other page's 22/600). **Task titles** step to weight 500 so the title outranks its metadata. **Meetings** gains duration off the `endsAt` it already stores and the shared group heading; **Diary** gains a 56rem reading measure where a 72rem cap had been doing nothing. **Mobile**: the phone tab rail loses the capsule DS-04 justified against the superseded references, a Goal's detail clamps to two lines, Settings' summary re-aligns. Small caps retired from the last four band labels. Zero horizontal overflow at 320/375/390/430 across eleven routes; muted text measured at 8.90:1. | FINAL-UI | Low–medium — one new generated role, one new published token, three stale E2E assertions corrected |

Two rules hold across the programme: **a file speaking both token vocabularies is
expected rather than debt** (this migration is deliberately the opposite shape
from ADR-074's one-commit switch, because a component layer works fine at every
intermediate step and a token layer does not), and **no stage is a big-bang MD3
deletion** — DS-08 removes what has no consumers, and a name that still has one
means the stage owning it has not finished.

Everything else that was queued is in LATER, or is whatever the next audit finds.
HARDEN-04 was the last planned hardening item and the E2E gate is now a signal
rather than a coin toss.

### ☑ DS-01 - DalyHub design-system foundation — **DELIVERED 2026-08-14**

**Material Design 3 stops being the specification and becomes the machinery.**

- **The authority change, written down.** `DALYHUB_DESIGN_SYSTEM.md` is now the
  specification for what DalyHub looks like; MD3 is cited as machinery and as
  historical inspiration and no longer settles a design question. UIX-06 had
  already corrected `AGENTS.md` §6 once, and thirty-two numbered departures had
  already made "MD3 is the foundation" untrue — DS-01 moved the statement to the
  top of the right page. ADR-092 records it, amends ADR-074's design authority,
  and leaves every one of ADR-074's *mechanisms* intact.
- **A product-owned token layer.** `--dh-*` sits on top of `--app-*`,
  `--md-app-*` and `--md-sys-*` and is what a component reaches for from DS-02
  onward: colour, space, radius, borders, elevation, focus, seven type roles,
  motion and density. Nothing in it is authored — every value is a `var()` onto
  an existing token, so the generator stays the single source of truth for
  colour and `scheme:check` has nothing new to disagree with.
- **The `--dh-` prefix returns pointing the other way.** ADR-074 built an alias
  layer under this prefix and deleted it on schedule; this one maps DalyHub's
  *own* names onto M3 values rather than its *old* names, so deleting it would
  be the migration failing rather than completing. The "no `--dh-` token at all"
  guard was replaced by a stronger one: every such name must be published in
  `app/shared/tokens/dalyhub.ts` and defined only in `tokens.css`.
- **An explicit density model.** `compact` · `default` · `touch`, selected by
  `data-dh-density` on any ancestor (namespaced: plain `data-density` was already
  taken twice, with unrelated meanings), controlling eight tokens and nothing else.
  Density is a preference rather than a viewport (a trackpad-driven 27-inch
  monitor is not compact; a hand-held large tablet is not default), so the
  selector is an attribute and the `(pointer: coarse)` rule is only a default for
  a document that has not chosen. **Density may never cost a touch target:**
  compact's hit areas are floored back to the WCAG minimum on a coarse pointer,
  unconditionally.
- **The component inventory.** Every shared primitive audited and classified with
  reasoning. Nothing came out REPLACE LATER or REMOVE LATER, which is the honest
  result and the important one: the MD3 work was good engineering, and what it
  left was a vocabulary gap and a missing density model rather than bad
  components.
- **No new dependency.** Radix, React Aria, Base UI and shadcn each evaluated per
  component and declined — not because the code already exists, but because the
  existing implementations encode product decisions a library cannot know (D31's
  repainted native `<select>`, ADR-087's anchored-above-modal layer, ADR-076's
  server-authoritative inline editing). What DS-02 needs is a `Button`.
- **One line of visual change.** `base.css`'s control baseline reads
  `--dh-control-height`, which is value-identical at the default density — so the
  layer is load-bearing rather than hypothetical, and DS-03 can make a toolbar
  denser by declaring `data-dh-density` on a region rather than by writing a height.
  No screen was redesigned, no token renamed, no component restyled and no MD3
  token deleted.
- **Verification.** 15 new assertions in `test/unit/tokens/dalyhub-tokens.test.ts`
  covering registry completeness in both directions, no authored colour, no
  foreign design-language naming, definition confined to `tokens.css`, the exact
  density token set per preset, density holding nothing but density, the default
  preset matching the pre-DS-01 values, the compact/default/touch ordering, the
  coarse-pointer target floor, and density never being selected by viewport
  width. Typecheck, lint, format, `scheme:check`, unit, kernel and build all
  pass.

### LATER

- **TASKS-12 - Ordinal monthly recurrence**, only if owner routines need patterns
  such as "first Monday of every month". TASKS-11 deliberately did NOT add it to the
  capture grammar: the recurrence model has no ordinal rule to author, so a phrase
  for it would have nowhere to go.
- **Capture surfaces beyond the phone**, each of which is an authentication adapter
  plus a transport over the CAPTURE-01 contract rather than new capture
  infrastructure: a native iOS app, Apple Watch, a browser extension, a macOS
  Shortcut or Raycast command, Pushover.
- **Review Inbox with AI** - a proposal-shaped triage capability over what capture
  collected. Explicitly separate from capture, which must never depend on a provider.
- **Attachment capture and a broader external CRUD API** - each a real capability,
  none of them input, and none of them a CAPTURE-01 defect. (Inbound calendar sync
  shipped as **CAL-01 - Unified External Schedule** above.)
- ~~Broader mobile polish after Tasks/Today acceptance is stable.~~ Delivered as
  **MOBILE-01 - iPhone daily-driver polish** above. What it deliberately left is
  recorded as debt in that item's evidence document, not re-listed here.- Richer review surfaces after daily capture and attention are trusted. (The
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
- ~~Push reminders before the in-app attention model is correct.~~ The CONDITION
  was met (TODAY-09/10 and DS-06 made the rail correct) and the capability
  shipped as **NOTIFY-01** above. The line is struck rather than removed: the
  order it insisted on is the reason the notification system has an attention
  model to serialise instead of inventing a second one.
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
calendar sync, Todoist sync, ~~notifications and push reminders~~ (delivered later, as
CAL-01 and NOTIFY-01 — each a separate item with its own decision, which is the point
this list was making), email ingestion, AI task
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
