# Reviews Module

REVIEWS-01 makes Reviews first-class DalyHub records for stepping back, reflecting on a defined period, closing loops and planning the next period.

## Product Purpose

A Review is durable, not a dashboard session. It stores the owner's authored reflection and lifecycle state for a wall-calendar period, then presents bounded live context from source modules. Reviews are calm reflection records: no scores, streaks, AI summaries, notifications or gamification.

## Review Types And Periods

Supported types are `weekly`, `monthly`, `quarterly`, `annual` and `custom`.

Periods are stored as ISO wall-calendar `YYYY-MM-DD` strings in `review_details.period_start` and `period_end`. They are never converted to UTC instants. Weekly periods use the persisted owner first-day-of-week preference. Monthly, quarterly and annual periods follow normal calendar boundaries, including leap years and year boundaries. Custom Reviews require `period_end >= period_start`.

Default titles are generated from the owner's date-format preference:

- `Weekly Review — 27 July–2 August 2026`
- `Monthly Review — July 2026`
- `Quarterly Review — Q3 2026`
- `Annual Review — 2026`
- `Custom Review — 15–27 July 2026`

## Data Ownership

Reviews follow the DalyHub entity/detail pattern:

- `entities` owns identity, title, workspace scope and generic lifecycle metadata.
- `review_details` owns review type, period, status, template id, completion timestamp, archive timestamp and detail update timestamp.
- `review_sections` owns authored Markdown sections keyed by a closed section vocabulary.
- EntityLinks own relationships through the Universal Relationship System.
- Activity owns structural history.

Review section ids are closed: summary overall/highlights/challenges/lessons/decisions/next focus, progress commentary, task commentary, diary commentary and people/meetings commentary. The module does not store an uncontrolled JSON Review blob.

## Live Context, Authored Content And Links

REVIEWS-01 uses live context plus durable authored reflection and durable links.

- **Live:** bounded Tasks, Diary entries and Meetings are read from their owning repositories for the Review period. Source titles and labels may reflect their current canonical state after the Review is completed.
- **Authored:** Review section Markdown is stored in `review_sections`.
- **Linked:** deliberate relationships use shared EntityLinks, usually `link.related`, and render through the shared Linked Items tab.
- **Snapshotted:** no whole source-record snapshots are stored in REVIEWS-01.

This means a completed Review preserves what the owner wrote and linked, but source-record labels remain live unless a future snapshot feature is deliberately added.

## Status And Lifecycle

Status is a closed vocabulary: `draft`, `in_progress`, `completed`. Archive is a separate lifecycle timestamp, not a status.

Completing a Review sets `status = completed`, sets `completed_at`, appends structural Activity and makes authored sections read-only in the UI. Reopening sets `status = in_progress`, clears the current `completed_at`, restores editing and preserves the previous completion event in Activity.

Archiving is reversible. Archived Reviews are excluded from active collection views but remain readable by direct URL. Editing is disabled while archived and restore is available.

Permanent deletion is separate from archive, guarded by exact-title confirmation in the shared dangerous-action dialog. It deletes Review-owned section/detail rows in FK-safe order, and never deletes linked source records.

**It refuses while any ACTIVE relationship references the Review (AUDIT-FIX-03).** Until this fix the purge deleted those links outright to make itself succeed — a live relationship destroyed without the owner ever being asked [AUDIT-04 / DEBT-80]. `permanentlyDelete` now counts active links (`deleted_at IS NULL`, workspace-scoped, in either direction) and returns `{ deleted: false, blockedReason: "has_links", linkCount }`, matching the Asset contract; the route and Settings tab turn that into the shared "unlink first" sentence with the count, never a storage detail. Soft-deleted links do **not** block — they are the Review's own dead rows and the purge removes them with it.

**The purge is delete-then-tombstone, in one atomic batch.** The order is `entity_links` → `activity_subjects` → `review_sections` → `review_details` → `entities` (`RETURNING`) → one subject-less `review.deleted` event carrying `{reviewId, title}`, inserted **directly after** the entity DELETE and guarded `WHERE changes() > 0` on it. The previous implementation placed the Activity append FIRST, which broke `D1ActivityRecorder`'s contract — that guard reads the statement immediately before it, so a leading append fired on a stale, unrelated change count and two raced purges wrote two tombstones for one destroyed Review. Its payload was `{}`, and the batch's own `activity_subjects` DELETE then removed the subject row the recorder had just inserted for it.

**Existing Activity rows survive; only their pointers go.** The `activities` rows about a Review are append-only (ADR-012) and are retained through a purge — the tombstone is subject-less precisely because its subject would be the `entities` row the same batch removed, so the payload carries the identity instead and the workspace feed renders the destroyed Review's title from it.

**Repeated and concurrent purges are idempotent.** Every destructive statement repeats the same "no active link" guard, so the batch is all-or-nothing evaluated at commit. A Review that is already gone short-circuits and writes nothing; the loser of two concurrent purges has its entity DELETE match zero rows, so no tombstone fires and it returns `{ deleted: false }` rather than the `ReviewStorageError` ← `D1_ERROR: FOREIGN KEY constraint failed` it used to raise. Exactly one tombstone can exist per destroyed Review. None of this is achieved by catching and suppressing database errors — the SQL guards make the losing operation a legitimate no-op. Proven in `test/kernel/review.test.ts` (six cases: tombstone, second-purge idempotency, a genuine two-way concurrent purge, active-link blocking then release, soft-deleted links not blocking, and fault-injected rollback) and `test/kernel/permanent-delete-contract.test.ts`.

## Duplicate Handling

Standard Reviews (`weekly`, `monthly`, `quarterly`, `annual`) have storage-level duplicate protection on `(workspace_id, review_type, period_start, period_end)` via a partial unique index. Creating the same active standard period returns the existing Review. Creating the same archived standard period restores and returns that Review instead of creating a second identity. Custom Reviews may overlap.

## Template Versioning

Templates are internal, not user-customisable. Each type resolves to a versioned id such as `review.weekly.v1`, which is stored on the Review. Template prompts guide writing but are not required for completion and are not copied into every Review row.

## Activity And Privacy

Review Activity types are structural: created, updated, status changed, completed, reopened, archived, restored and deleted.

Activity payloads carry only structural metadata such as review type, period, template id, changed field names, section ids and status transitions. Payloads must not contain reflection text, Diary content, Meeting notes, Task titles, Person details, private notes or full section content.

## Navigation, Search And Commands

Reviews register through the module registry:

- one sidebar destination: `/reviews`
- canonical record route: `/reviews/:reviewId`
- creation route: `/reviews/new`
- commands: Open Reviews, New Review
- search provider: title search over real workspace Reviews, opening the canonical record
- shared entity destination: `review` links navigate to `/reviews/:id`

Reviews are visible by default through existing Settings navigation reconciliation; there is no Settings hard-code.

## Mobile And Accessibility

The collection, creation form and record tabs are responsive. Controls wrap instead of hiding required information, and task/context links use at least 44px touch targets. The record uses the canonical Record Layout and the shared Task Drawer, Linked Items, Timeline, Markdown editor and Settings dangerous-action dialog, inheriting their keyboard and focus-management behavior.

## Test Strategy

Coverage added in REVIEWS-01:

- pure period/title/template/vocabulary unit tests
- D1/kernel tests for atomic create, duplicate protection, custom overlaps, workspace isolation, lifecycle, archived mutation protection, deletion/link safety, rollback and Activity privacy
- existing shared destination, picker and registry tests updated for Review route support

E2E coverage exists and is broader than this section originally stated (corrected 2026-07-27): [`e2e/reviews.spec.ts`](../../e2e/reviews.spec.ts) covers the weekly creation/editing/linking/lifecycle journey, search, the command palette, axe in **light and dark** on the record, and no horizontal overflow at 320px and 390px including the Settings tab; `/reviews` is also in the [`e2e/accessibility.spec.ts`](../../e2e/accessibility.spec.ts) sweep. What remains deferred is the *mobile-completion* journey ([REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile)), not baseline accessibility coverage.

**The lifecycle journey is now verified (2026-07-27).** It previously failed on most runs — `e2e/reviews.spec.ts:89` could not click *Restore review* because the shared DS-10 notification region intercepted the pointer event. That was a shared feedback-layer defect, never a Reviews one, and it is fixed at source: the region now takes pointer input only on its own controls ([DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1), closed). Because a single green run was explicitly *not* accepted as evidence for a timing-dependent failure, the journey was re-run with `--repeat-each=3` alongside the other previously-unreliable specs: **87/87 passed**, archive and restore included, through ordinary user interactions with no forced clicks and no test-only CSS.

## Deferred Scope

Deferred deliberately: AI-generated summaries, recommendations, user-designed templates, notifications/reminders, external integrations, PDF export, immutable source-record snapshots, charts/scores, Today reminder widgets beyond the clean module seam, and full unbounded period aggregation.

---

## Status (2026-07-27 reconciliation)

**Current status.** Delivered and in production use as [REVIEWS-01](../roadmap/ROADMAP_V2.md#-reviews-01--dalyhub-reviews-foundation) (merged as #73), and **cleanly verified as of 2026-07-27** — the blocking [DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1) occlusion is fixed in the shared feedback layer and the full Reviews journey passes on repeat runs (see E2E coverage above). Reviews is **not** newly complete: REVIEWS-01 was already delivered; only its verification caveat is lifted.

**Delivered capabilities.**

- First-class `review` entities with a typed `review_details` slice and structured `review_sections` (migration `0018`).
- Weekly / monthly / quarterly / annual / custom types over wall-calendar periods, honouring the owner's first-day-of-week preference.
- Storage-enforced duplicate protection for standard periods; custom periods may overlap.
- Internal versioned templates (`review.<type>.v1`) with per-type section prompts.
- `/reviews` collection views, `/reviews/new`, and the canonical `/reviews/:reviewId` record on the shared Record Layout.
- Shared Markdown authoring, Linked Items, the DS-05 Activity Timeline, and Settings-tab lifecycle (complete/reopen, reversible archive, guarded permanent deletion).
- A **real, repository-backed** search provider and `Open Reviews` / `New Review` commands — Reviews is one of only five modules that registers a real search provider.
- Bounded live period context for Tasks, Diary entries and Meetings.
- Activity payloads carry structural metadata only — never reflection text, Diary content, Meeting notes, Task titles or Person details.

**Known limitations.**

- Period context is a **bounded live helper**, not a complete aggregation: it reads Tasks, Diary and Meetings, but **not Projects updated in the period**, and does not paginate beyond its bounds — [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2).
- Source labels stay live. A completed Review preserves what the owner **wrote and linked**, but a linked record renamed later shows its new title; no immutable snapshot is stored.
- No Today entry point for "start or continue this week's Review".
- Lifecycle actions live in a record Settings tab, matching Projects/Areas/People/Assets — but there is still no shared Record Header overflow menu anywhere in the product ([DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28)).

**Deferred work.** AI-generated summaries and recommendations; user-designed templates; notifications and reminders; external integrations; PDF export; immutable source-record snapshots; charts, scores and streaks; the guided weekly flow ([REVIEW-02](../roadmap/ROADMAP_V2.md#-review-02--weekly-review)); derived reflection insights ([REVIEW-03](../roadmap/ROADMAP_V2.md#-review-03--insights--alignment)); and mobile completion beyond the DS-11 baseline ([REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile)).

**Relevant roadmap items.** [REVIEWS-01](../roadmap/ROADMAP_V2.md#-reviews-01--dalyhub-reviews-foundation) ☑ · [REVIEW-02](../roadmap/ROADMAP_V2.md#-review-02--weekly-review) ☐ · [REVIEW-03](../roadmap/ROADMAP_V2.md#-review-03--insights--alignment) ☐ · [REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile) ☐.

**Relevant product-debt items.** [DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1) (resolved 2026-07-27) · [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2) · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) · [DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3) (lands under REVIEW-03) · [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1--resolved-2026-08-02).

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**Lifecycle in the shared overflow.** Archive/Restore and the guarded permanent delete now also
appear in the Record Header overflow (⋯). A failed lifecycle post now **throws**, so the shared
confirmation dialog stays open with an inline error and a retry rather than closing as though it
had worked. The Review's tab stack adopted the shared `.dh-record-stack` rhythm.

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).

---

## UX-01 — the collection paginates in place (2026-08-01)

``/reviews`` was one of the two collections that paginated by **navigating** to the
next page: the list was replaced, the owner's scroll position was discarded, and
the control was a "Next page" link — a page-number idiom no other DalyHub collection used. It now uses the ONE shared
[`useKeysetPagination`](../../app/shared/load-more/useKeysetPagination.ts) and the
shared `LoadMore` button, exactly like Areas, Goals, Notes, Projects, People and
Assets — so all eight collections behave identically, and the request-scoped guard
that closes [DEBT-45](../product/PRODUCT_DEBT.md) applies here too.

The path a later page is requested from carries the CURRENT view and filters
(minus any cursor), so "Load more" resumes the same result set the cursor was
issued for rather than the unfiltered default.

---

## The guided weekly Review (REVIEW-02 + REVIEW-04, 2026-08-05)

REVIEW-02 turns the weekly Review from ten editors on eight tabs into an ordered,
resumable pass through the week. REVIEW-04 ships its phone stepper with it.
Decision record: [ADR-072](../decisions/ARCHITECTURE_DECISIONS.md#adr-072-the-guided-weekly-review--one-review-two-presentations-a-canonical-step-model-and-the-smallest-possible-persisted-workflow-state).

### One Review, two presentations

`/reviews/:reviewId/guide` renders **the same Review record** as `/reviews/:reviewId`:
one id, one lifecycle, one period, one stored template version, one set of
`review_sections`, one Activity history, one completion state. There is no guided-review
record, no wizard-only copy of a response and no parallel completion flag. The
general-purpose record is unchanged and remains fully usable; the weekly record simply
gains a link into the guided flow.

Only **weekly** Reviews have a guided flow. Any other type redirects to its record, as
does an archived Review (which is read-only until restored).

### The step model

The canonical registry is [`app/kernel/reviews/weekly-review-steps.ts`](../../app/kernel/reviews/weekly-review-steps.ts).
Nothing else declares step order.

| # | Id | Label | Phone label | Reads | Sections | Required | Completion rule |
|---|---|---|---|---|---|---|---|
| 1 | `overview` | Settle in | Settle in | period facts | — | no | acknowledgement only |
| 2 | `inbox` | Clear the Inbox | Inbox | Tasks Inbox | `tasks.commentary` | no | Inbox is empty, **or** acknowledged |
| 3 | `projects` | Review Projects | Projects | Project review projection | `progress.commentary` | no | acknowledgement only |
| 4 | `alignment` | Goals and Areas | Alignment | AREA-03 alignment | — | no | acknowledgement only |
| 5 | `reflection` | Reflect | Reflect | the Review's own sections | the six weekly reflection prompts + Diary and People/Meetings commentary | **yes** | any prompt answered, **or** acknowledged |
| 6 | `focus` | Next week's focus | Focus | the Review's own sections | `summary.next_focus` | **yes** | focus recorded, **or** acknowledged |
| 7 | `complete` | Complete Review | Complete | the summary | — | **yes** | the Review's lifecycle says completed |

Every step definition also carries its description, its accessible label
(`Step 3 of 7: Review Projects, current step`) and, where it has one, the wording of
its acknowledgement control.

**Required means "make a decision", not "write something".** A required step is
satisfied by an answer **or** by an explicit acknowledgement. Inbox zero is never
required, and no optional prompt ever blocks completion.

### Persisted versus derived workflow state

Derived, live, never stored: whether a prompt is answered (`review_sections`), whether
the Inbox is clear (the canonical Tasks Inbox query), whether the Review is finished
(its own lifecycle), Project health (PROJ-02), Goal alignment (AREA-03), every count.

Persisted, because nothing can derive it (migration `0029`):

- **`review_workflow_state`** — the resume bookmark (`current_step`) plus a monotonic
  `revision`.
- **`review_step_acknowledgements`** — one row per step the owner has explicitly marked
  reviewed, over a CHECK-constrained step vocabulary that deliberately excludes
  `complete` (whose only truth is the lifecycle).

Both cascade from `review_details`. **An absent row IS the documented default**, so no
existing Review needed a backfill and every pre-REVIEW-02 Review has a sensible derived
position from the moment the migration lands.

Never stored: insight scores, Project health snapshots, Goal alignment classifications,
Task counts, or any duplicate of a Review response body.

**Both tables are exported with the workspace.** They are owner-scoped product state on
the same footing as `taskSavedViews`, and the acknowledgements in particular record intent
no calculation can reproduce, so a restored workspace reopens a half-finished Review where
its owner left it with their decisions intact. Because the snapshot previously required
every collection, they are the first entries in `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`:
DalyHub always writes them, and an archive exported before they existed still validates
(normalised to `[]`) rather than being invalidated retroactively. See
[`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md#adding-a-collection-without-invalidating-existing-archives-review-02).

### Resume semantics

1. A **completed** Review always opens on its final step.
2. Otherwise the **bookmark wins unconditionally** — which is exactly what stops a Task
   completed in another tab, or an Inbox that refilled overnight, from moving the owner
   backwards.
3. With **no bookmark**, the position falls back to the first step that is not complete.

Opening a step never marks it complete. Deep-linking a step never moves the bookmark:
the bookmark records where the owner *chose* to be, so only Back, Continue and the step
menu write it.

### URL contract

```
GET  /reviews/:id/guide              → resolves the current step, REDIRECTS to it
GET  /reviews/:id/guide?step=<id>    → that step (deep-linkable, refreshable)
POST /reviews/:id/guide              → navigate / acknowledge / complete / reopen,
                                        then redirect to a canonical step URL
```

The canonical URL always names a real step. An unknown, missing or malformed `step`
recovers by redirect to the current step rather than 404-ing the owner out of their own
Review. Navigation is POST → redirect → GET, so browser Back and Forward are correct and
a refresh never re-submits. Reaching any step is allowed — jumping ahead is how you look
at something — but the final step still refuses to complete a Review whose required
steps are outstanding, so navigation can never bypass a prerequisite.

Reflection saves do **not** go through this route: they post to the existing
`/reviews/:id/mutate` `update_section` action, so there is one section-write authority.

### Inbox integration

The Inbox step reads the canonical `inbox` system view (active Tasks with no structural
parent — [ADR-062](../decisions/ARCHITECTURE_DECISIONS.md#adr-062-intentional-unassigned-tasks-inbox-semantics-and-calendar-recurrence)) and reuses the shared
`TaskQuickEditPanel`, the same panel `/tasks` and Review Inbox open. There is no second
Task editor and no second mutation path: every change posts to the canonical Task
routes, so a Task filed here is indistinguishable from one filed anywhere else.

- The remaining count is the **authoritative** workspace total from the grouped
  aggregate, not "how many were loaded"; the queue itself is one bounded page.
- After every mutation the loader revalidates, so the queue is the server's answer.
- Focus lands on the queue position when the reviewed Task changes.
- Reaching zero shows a calm empty state.
- **A Task never has to have a Project.** Leaving Inbox items deliberately is a
  decision: the step distinguishes "Inbox cleared" (derived) from "Inbox step reviewed"
  (acknowledged), and the completion summary reports "6 left, deliberately" rather than
  treating it as a failure.

### Project review projection

`ProjectRepository` and `ProjectHealthRepository` supply the facts; nothing new is
stored. Per Project the step shows title, Area and Goal context, workflow status,
derived PROJ-02 health with its reason, open / overdue / waiting counts, Tasks completed
during the period, last meaningful activity and days since, and a next action.

**Which Projects appear.** Every **open** Project (most recently updated first, so
Projects with period activity lead), plus Projects **completed during the Review's
period**. Never permanently deleted Projects, and never archived Projects with no period
relevance — `state` excludes them at the database. The list is bounded and says so.

**Order** (documented, using existing PROJ-02 vocabulary, never a new alarming label):

1. blocked or at risk
2. has overdue work
3. active with no visible next action
4. recently active
5. completed during the period

Within a band: least-recently-touched first, then title, then id.

**Next action** is derived, never invented. DalyHub has no `next_action` field, so the
rule is: the highest-ranked Task belonging to the Project in the workspace's `active`
planning scope under the canonical `smart` sort, taken from ONE bounded scan of the most
actionable Tasks. When a Project has open work but none appears within that bound, the
step says "No next action visible here" and links to the Project's own Task list. It
never claims a Project has no next action.

Actions offered: open the canonical Project, open its Task list, change status through
the Project's own Settings tab, and mark Projects reviewed. The Project form is not
embedded.

### Goal and Area alignment

Reuses AREA-03's evaluator exactly — `listGoalsByAlignment` for the workspace-wide
ranking, `listGoalProjectContributions` and `listGoalAlignmentFacts` for the facts,
`evaluateGoalAlignment` for the rules, and the shared `AlignmentIndicator` for the
presentation. Nothing is scored, cached or persisted, and no second Goal-health model
exists.

The step shows Goals with their alignment state and contributing-Project counts, Areas
with whether an active Project currently points at them, and how many active Projects
have no Goal linked. Wording stays calm and factual — "No supporting activity recorded
this period", "No active Project currently contributes to this Goal" — with no scores,
streaks, gamification, red dashboards or moral language about a neglected life Area.
Every Goal, Area, Project and Task is one link away.

Richer per-period Area attention history and alignment trend remain
[REVIEW-03](../roadmap/ROADMAP_V2_1.md#-review-03--insights--alignment) and
[DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3).

### Reflection

The prompts are the **Review's own stored template version's**, resolved through
`resolveReviewTemplateForId(review.templateId, review.type)` — the seam through which a
future `v2` arrives without rewriting a single historical Review. There is no second set
of reflection prompts.

One prompt shows at a time with previous/next controls; desktop adds a prompt
sub-navigation listing every prompt with its answered state, and a wider writing surface
kept to a reading measure. Both use the same order and the same responses.

Saving is on blur and on an explicit Save, matching the record's existing convention.
The save state is shown in words ("Unsaved changes", "Saving…", "Saved") and announced
politely; focus is never moved by a save. **Moving between prompts never marks one
answered** — only writing does.

### Next-period focus handoff

A completed weekly Review makes its focus available to the next one as a **derived
read**, never a copy. The rule, fully:

- the source must be a **weekly** Review (a month's focus is a different horizon);
- it must be **completed** — reopening one removes it from consideration immediately;
- it must not be **archived**;
- its period must end **strictly before** the consuming Review's period start, so a
  Review never hands itself its own focus;
- an **empty** focus is skipped in favour of the most recent Review that has one;
- of the qualifying Reviews, the one whose period ends **latest** wins; ties break on
  completion instant, then id, so the answer is deterministic.

When nothing qualifies the step says so calmly. Periods are compared as wall-calendar
`YYYY-MM-DD` strings, so DST transitions, month boundaries and year boundaries change
nothing, and the first-day-of-week preference continues to define the period itself.

The close-out offers Today planning, Task capture and Projects as ordinary links.
**Nothing is scheduled and no Project is modified because it was mentioned in a Review.**

### Completion

Before completing, the step summarises: Inbox status, whether Projects and Goals/Areas
were marked reviewed, how many reflection prompts are answered out of how many, whether
a focus was recorded, and any steps the owner deliberately marked reviewed. Outstanding
items are stated plainly, never scolded.

Completion is blocked **only** while a required step is neither answered nor
acknowledged. The reason is listed, and takes focus when a completion attempt is
refused. Completion itself runs through the existing `ReviewRepository.complete` and the
existing `review.completed` Activity event; the record's own Complete action is
untouched, and there is no second completion flag.

### Desktop and phone

**Desktop** uses the space it has: a persistent step rail beside the step's content, the
Review's status and period always visible, previous/continue at the foot, and the
reflection workspace kept to a reading measure. It is not three equally dense columns.

**Phone** (below `md`) removes the rail rather than shrinking it, shows one step at a
time with a compact progress header and an accessible progress bar, offers a step sheet
(the shared MOBILE-01 `Sheet`) for direct navigation, and pins Back/Continue in a sticky
footer that clears the keyboard (`--dh-keyboard-inset`), the phone navigation bar
(`--dh-bottomnav-height`) and the home indicator (`env(safe-area-inset-bottom)`). No
destructive action sits beside Continue. Task, Project, Goal and Area rows stack rather
than squeeze, so nothing overflows at 320px. The reflection editor **grows** here rather
than scrolling inside its own 70vh cap — a scroll region inside a scrolling page is the
nested-scrolling trap this item exists to avoid.

### Accessibility

- One non-skipping outline: the Review title is the `h1`, the step is the `h2`.
- The current step is exposed with `aria-current="step"` and an accessible name that
  states the position and the label.
- Completed / current / upcoming are carried by the words **Done**, **Current step** and
  **Not started**, never by colour alone.
- Progress is announced as a position — "Step 3 of 7" — on an `aria-label`led
  progressbar, never as a percentage or a score.
- Every step control is a real button in a real form, keyboard-operable.
- Focus moves to the new step heading after a **deliberate** move, and never on first
  paint, so nothing is stolen from someone who has just arrived.
- Save messages use a polite live region and never move focus while autosaving.
- The completion-blocked reason takes focus when completion is refused.
- Touch targets meet 44px; the step sheet reuses the shared modal hooks (one focus
  trap); reduced motion is respected.

### Concurrency

- **Authored reflection.** `updateSection` accepts an optional `expectedUpdatedAt`. The
  guided editor always quotes the version it loaded, so a save can never overwrite text
  written on another device: the write is refused with `ReviewConflictError`, the route
  answers `409` with the newer text, and the owner's own words stay in the editor. The
  record's existing editors omit it and behave exactly as before.
- **The bookmark.** Carries a `revision`. A stale write is refused, the newer position is
  followed, and the owner is told once — calmly. Nothing is silently overwritten.
- **Tasks and Projects** changing mid-Review are handled by revalidating against the
  server after every mutation; the queue is never a client-side guess.
- **Template version** is read from the Review and never rewritten.

Broader authored-content concurrency across the product remains
[DEBT-83](../product/PRODUCT_DEBT.md).

### Query bounds

`review-guide-context.ts` is the only place the guided flow reads a repository. Every
read is bounded by `REVIEW_GUIDE_LIMITS`, and each step's exact executed-statement count
is declared in `REVIEW_GUIDE_QUERY_BUDGET` and **asserted** against real D1 —
`overview: 9`, `inbox: 2`, `projects: 8`, `alignment: 6`, `reflection: 1`, `focus: 2`,
`complete: 1`. Two further tests prove the counts are flat with respect to workspace
size (fifteen Projects cost what three do; ten Goals cost what three do). Where a list is
bounded the surface states it ("4+") and links to the canonical destination; the Inbox
total is always the authoritative aggregate.

### Activity

Navigation, acknowledgement and viewing write **no** Activity — progress is product
state, not history, and a kernel test asserts the event count does not move. Genuine
domain mutations keep their existing events unchanged. The one lifecycle transition the
flow makes is truthful and happens once: the first deliberate move through a **draft**
Review sets it to in progress through the existing `setStatus` contract.

### Existing Reviews

- Draft, in-progress, completed, reopened and archived Reviews all continue to work.
- A Review with no workflow row gets the documented default and a sensible derived
  position — there is no backfill.
- A Review's stored template version is honoured and never rewritten; historical
  responses are never migrated to the current template.
- Duplicate-period protection, first-day-of-week handling and wall-calendar periods are
  untouched.

### Test coverage

- **Unit** — the step registry and its metadata, ordering, completion rules, required
  versus optional, current-step derivation, resume, unknown-step recovery, progress
  counting, mobile progress labels, the URL contract, prompt sequencing against the
  stored template, next-period focus selection and supersession, the completion summary,
  bounded empty-state language, and the guided shell's accessibility semantics.
- **Kernel / D1** — migration 0029 over populated data, workspace isolation on every
  read and write, existing-Review compatibility, template-version preservation, the
  bookmark and its revision guard, acknowledgement idempotency, no spurious Activity,
  authored-response conflict refusal, the asserted per-step query budget and its
  flatness, the Project projection and its ordering, the alignment projection, prior-focus
  derivation including reopen and cross-workspace isolation, completion and reopen, and
  the purge taking the new child rows with it.
- **Browser** — [`e2e/reviews-guided.spec.ts`](../../e2e/reviews-guided.spec.ts): complete
  a Review; stop and resume; the phone stepper at 320/375/390/430; Inbox processing;
  an existing Review's own template; and axe in light and dark at desktop and phone,
  including the completion-blocked state and a long Markdown editor.


## The Weekly Review assistant (AI-01, 2026-08-05)

The guided weekly Review's **Next week's focus** step offers one deliberate
action: *Generate assistant summary*. It does **not** run when the Review opens,
does not complete the Review, and creates no Tasks.

The facts are DalyHub's. Counts, overdue work and Inbox state are calculated from
repositories and sent as an authoritative block the prompt tells the model to
restate rather than recompute; a small, bounded set of open Tasks goes with them
as citable supporting records. The output distinguishes recorded fact, derived
calculation and AI inference — each pattern carries an explicit
`observation | inference` label the surface renders in words, not colour.

Accepted text is **appended** to whatever the owner has already written in the
focus section and still requires their own save, through the existing Review
repository and its REVIEW-02 optimistic-concurrency contract. Authored text is
never overwritten, and the Review is never completed automatically.

Full contract: [`AI_PLATFORM.md`](AI_PLATFORM.md).

## Record-screen anatomy (RECORD-01, #131)

The Review record follows the canonical
[record-screen anatomy](../design/DESIGN_SYSTEM.md#the-record-contract). It was
already close; what changed is metadata duplication and action weight.

"Weekly" appeared three times in the record's first two lines — a "Weekly
Review" eyebrow, a "Type: Weekly" context chip, and a title that already begins
"Weekly review". The eyebrow is gone (the breadcrumb says "Reviews"), and Type
and Template — the latter being the template's raw id, which is administrative
rather than current state — moved to Settings → Record details. The context line
keeps what the title cannot say precisely (the exact period) and what changes as
the owner works (how much of the reflection is authored).

**Complete** takes the same low-emphasis treatment as a Project's and a Goal's.
