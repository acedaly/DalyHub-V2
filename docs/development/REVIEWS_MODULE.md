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

**Known limitations — as REVIEWS-01 shipped them.** This block is the original
2026-07 snapshot and is kept for the record; the sections below supersede it
where they overlap, and each superseded bullet says so.

- ~~Period context is a **bounded live helper**, not a complete aggregation: it reads Tasks, Diary and Meetings, but **not Projects updated in the period**, and does not paginate beyond its bounds~~ — the Projects half closed with [REVIEW-02](#the-guided-weekly-review-review-02--review-04-2026-08-05), the derived period facts with REVIEW-03, and the period's plan account with [FOLLOW-01](#the-periods-plan-account-and-routine-consistency-follow-01-2026-08-26). [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05) is **closed**.
- Source labels stay live. A completed Review preserves what the owner **wrote and linked**, but a linked record renamed later shows its new title; no immutable snapshot is stored. **Still true, and deliberate** — REVIEW-03's audit concluded that freezing source labels would make a Review disagree with the records it points at.
- ~~No Today entry point for "start or continue this week's Review".~~ **Closed 2026-08-28 by [STEER-05](../roadmap/ROADMAP_V2_5.md#-steer-05--the-weeks-door--delivered-2026-08-28)**: Today's foot carries the week's door — start, continue or read the finished one. See [the period label and the period lookup](#the-period-label-and-the-period-lookup-steer-05-2026-08-28).
- Lifecycle actions live in a record Settings tab, matching Projects/Areas/People/Assets — but there is still no shared Record Header overflow menu anywhere in the product ([DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28)).

**Deferred work.** AI-generated summaries and recommendations; user-designed templates; notifications and reminders; external integrations; PDF export; immutable source-record snapshots; charts, scores and streaks; the guided weekly flow ([REVIEW-02](../roadmap/ROADMAP_V2.md#-review-02--weekly-review)); derived reflection insights ([REVIEW-03](../roadmap/ROADMAP_V2.md#-review-03--insights--alignment)); and mobile completion beyond the DS-11 baseline ([REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile)).

**Relevant roadmap items.** [REVIEWS-01](../roadmap/ROADMAP_V2.md#-reviews-01--dalyhub-reviews-foundation) ☑ · [REVIEW-02](../roadmap/ROADMAP_V2.md#-review-02--weekly-review) ☐ · [REVIEW-03](../roadmap/ROADMAP_V2.md#-review-03--insights--alignment) ☐ · [REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile) ☐.

**Relevant product-debt items.** [DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1) (resolved 2026-07-27) · [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05) · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) · [DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3--resolved-2026-08-08-review-03) (lands under REVIEW-03) · [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1--resolved-2026-08-02).

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

**STEER-03 (2026-08-28) widened what the step SEES, and changed nothing else**
([DEBT-209](../product/PRODUCT_DEBT.md)). The paragraph above described the step
until then, and it was the problem: it showed alignment and a contributing count
and nothing more, so the owner steered the week from **less** information in the
Review than a glance at Today gave them — a Goal behind its own target date, one
that moved substantially this week, and one the owner had deliberately set aside
all read identically in the one sitting dedicated to noticing the difference.

The step now states, per Goal: GOAL-02's **measurement status** and the Goal's own
value, its **target date** (formatted with the product's own date formatting),
FOLLOW-02's **movement** sentence and STEER-02's owner-set **condition**, beside
the alignment it already had. Every one of them comes from the shared Goal story
(`~/shared/goal-progress`, [`GOALS_MODULE.md` → STEER-03](GOALS_MODULE.md#steer-03--one-goal-one-story-v25-2026-08-28))
through `loadGoalStories` — the same composition the Area record makes, from the
same evaluators, so the ritual and the record cannot describe a Goal differently.

Three things it deliberately did **not** change:

- **The selection.** `listGoalsByAlignment` still decides which Goals appear and
  in what order, because alignment is the question this step asks.
- **The shape and the place.** Same list, same section, same position in the
  flow; it is a wrapping block rather than a one-line pill now, and that is the
  whole visual difference.
- **The posture.** It remains a **reflection** surface. Every line is a fact the
  product already derived, in the words it already uses. Nothing here advises,
  ranks, coaches or proposes — and no next action is offered, because the step's
  own bounded next-action scan is a disclosed approximation and STEER-04
  deliberately left it exactly as it is.

A Goal the owner has **set aside** is therefore distinguishable from a neglected
one *in the ritual itself* — the half of STEER-02's problem that would otherwise
have survived it. Its derived facts are unchanged by that word; only the reader's
understanding is.

Richer per-period Area attention history and alignment trend remain
[REVIEW-03](../roadmap/ROADMAP_V2_1.md#-review-03--insights--alignment--delivered-2026-08-08) and
[DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3--resolved-2026-08-08-review-03).

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
`overview: 18`, `inbox: 2`, `projects: 8`, `alignment: 12`, `reflection: 1`, `focus: 2`,
`complete: 1`. Two further tests prove the counts are flat with respect to workspace
size (fifteen Projects cost what three do; ten Goals cost what three do). Where a list is
bounded the surface states it ("4+") and links to the canonical destination; the Inbox
total is always the authoritative aggregate.

**Both moved figures are STATED rather than absorbed**, which is this document's
rule about budgets. FOLLOW-01 took `overview` from 15 to 18 (the bounded Activity
window behind the period's plan account, and the active-Habit page behind routine
consistency). **STEER-03 took `alignment` from 6 to 12**: the shared Goal story is
six grouped reads executing as eight statements, and two of the step's previous
six moved *inside* that composition rather than being added — so the arithmetic
is 6 − 2 + 8. What the six buy is the Review seeing what Today already saw. Both
are flat in the number of Goals, asserted by
[`review-guide-context.test.ts`](../../test/kernel/review-guide-context.test.ts)
and [`goal-story.test.ts`](../../test/kernel/goal-story.test.ts).

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

---

## Review evidence (REVIEW-03)

REVIEW-03 makes the Review the place DalyHub starts paying the owner back for
keeping their life in it. Decision record:
[ADR-079](../decisions/ARCHITECTURE_DECISIONS.md#adr-079-review-insights--three-kinds-of-truth-one-persisted-snapshot-and-no-score).

> **X-02 integration (2026-08-08).** REVIEW-03's architecture is unchanged — no
> derivation was moved, duplicated or re-implemented, and `review_insight_snapshots`
> remains derived, non-authoritative data written only on completion. What X-02 added
> is a link in each direction:
>
> - **Out of the Review.** Three pieces of evidence now also link into the
>   cross-module [`/views`](VIEWS_MODULE.md) surface: the carried-over-overdue
>   insight offers *"Everything that changed since your last Review"*, the
>   Project-health-change insight offers *"Projects whose health moved since your
>   last Review"*, and the attention insight offers *"Open everything needing
>   attention"*. They are ordinary links to an existing destination, expressed in
>   that surface's own URL vocabulary and exported as `REVIEW_INSIGHT_VIEW_QUERIES`
>   so a unit test can decode each one and prove it still means what its label says.
>   The Review still builds no parallel record browser.
> - **Into a view.** X-02 READS the snapshot: `changedSince: "last_review"` resolves
>   to the most recent snapshot's `period_end`, and a Project's
>   `healthMovedSinceLastReview` compares today's live PROJ-02 health with the health
>   the snapshot recorded. Nothing writes here, nothing caches it, and when no
>   completed Review has a snapshot the view returns **nothing** and says so rather
>   than quietly answering a different question.
>
> The REVIEW-03 rule holds: **derived evidence, not vanity metrics.** No score,
> grade, streak, percentage or AI interpretation was introduced by the integration.

The Review now answers, from the owner's own records:

- **What changed?** Concrete movement inside the period.
- **Where did the work contribute?** Per-Goal, with the counts behind the label.
- **How did Project health move?** Improved, slipped, or newly stalled.
- **What needs attention?** Carried-over commitments and stagnation.
- **What is changing over recent Reviews?** A small bounded trend.

The authored Review is untouched. **DalyHub supplies evidence; the owner supplies
the interpretation.** Nothing here writes into a Review section, and nothing here
calls an AI model.

### The three kinds of truth

The audit behind this feature found that a Review period has three genuinely
different kinds of answer, and that conflating them is how an insight surface
starts lying. The code keeps them visibly apart
([`review-insight-facts.ts`](../../app/kernel/review-insights/review-insight-facts.ts)):

| | What it covers | Where it comes from | Available for past periods? |
|---|---|---|---|
| **1. Historical, exact** | Tasks / Projects / Goals completed; where that work landed | the append-only Activity stream (ADR-012) | **Yes** — for every period, with nothing stored in advance |
| **2. Current state only** | Project health (PROJ-02), Goal alignment (AREA-03), open / overdue / waiting counts, carry-over | recomputed live, never cached | **No** — it describes today |
| **3. Requires a snapshot** | *Change* in (2): "At risk → On track since my last Review" | `review_insight_snapshots` | **Only from the first Review completed after REVIEW-03 shipped** |

Two consequences the surface states out loud rather than hiding:

- **The trend needs no snapshot.** Because (1) is exactly reconstructible,
  "Tasks completed by Review period" is computed from Activity over the recent
  completed Reviews **of the same type**, in one grouped statement. A workspace
  that has never captured a snapshot still gets a truthful trend as soon as it
  has two completed Reviews.
- **Ancestry is current.** A completed Task is attributed to the Goal and Area
  its Project belongs to **today**, because the spine stores no link history.
  Moving a Project later moves its history with it. The surface says so.

### The snapshot

Migration `0034` adds ONE table, `review_insight_snapshots`, and it is the only
thing REVIEW-03 persists.

- **One row per Review**, cascading from `review_details`, workspace-scoped.
- **Derived facts only** — ids, states and counts. No titles, no descriptions,
  no reflection text, no Task names. A renamed Project still renders under its
  live title through its id, so the row can never become a stale second copy of
  the owner's records.
- **Versioned** (`REVIEW_INSIGHT_SNAPSHOT_VERSION`). An unrecognised version, or
  malformed JSON, reads as **"no snapshot"** — never as fabricated zeros. Rows
  carrying a state this build does not know are dropped individually.
- **Written on completion, and only on completion.** Both completion paths (the
  record's Complete action and the guided flow's final step) call the same
  capture immediately AFTER the existing `ReviewRepository.complete`, so the
  completion contract, its Activity event and its concurrency behaviour are
  unchanged. There is no second completion path and no new event.
- **Best effort.** A failed capture is swallowed: the Review is already
  complete, and failing to record derived bookkeeping must never turn a
  completion the owner made into an error they see. A missing snapshot degrades
  to "no comparison available", which the next Review states honestly.
- **Deterministic and idempotent.** The same facts build the same row, so
  completing again after a reopen simply overwrites with the state at the new
  completion.
- **Never authoritative.** Areas, Goals, Projects and Tasks remain the only
  source of truth for what they are; a snapshot only says what was true at one
  Review point, and nothing but the insight comparison reads it.
- **Exported with the workspace** as the `reviewInsightSnapshots` collection
  (`facts_json` verbatim, under its own version) — it is the one insight
  artefact a restore cannot rebuild. Added to
  `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` in the same change, so archives
  written before it existed still validate. See
  [`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md).
- **No Activity.** Capturing derived bookkeeping about a completion that already
  has its own event is not itself meaningful history.

### The insight set

The rules live in [`review-insights.ts`](../../app/kernel/review-insights/review-insights.ts)
as a pure evaluator. Every classification carries a **reason built from the
counts that produced it**, so the owner can disagree with the rule rather than
having to trust it.

**What changed.** Tasks, Projects and Goals completed in the period (exact), plus
previously-stalled Projects that moved again (needs a snapshot). A zero-valued
claim is never emitted.

**Goal contribution.** Introduces **no new threshold** — it reads completed work
rolled up through the spine plus AREA-03's own live alignment state:

| State | Label | Rule |
|---|---|---|
| `moving` | Moving | Tasks completed during the period roll up to this Goal |
| `limited` | Limited movement | none did, but AREA-03 still reads the Goal as recently active |
| `none` | No recent movement | no completed work this period, and no recent action either |
| `no_structure` | No contribution path | no Project currently advances this Goal |
| `completed` | Completed | the Goal itself is done |

`no_structure` is deliberately distinct from `none`: a Goal no Project advances
has a **missing structure**, not a stalled one, and calling it "no movement"
would blame the owner for something they never built.

**Project health change.** Needs the previous Review's snapshot. Shown as a
transition with both states named (`At risk → On track`), never as a colour.
Two rules that matter:

- **Completion is not health.** A Project is never "improved" because more Tasks
  were completed; a Project that finished is reported under *what changed*.
- **A Project appears in ONE place.** If its health moved, that is the news; if
  it is simply sitting where it was, it is an attention item. Never both.

**Attention.** Commitments that were already outstanding when the period began
and are still open — overdue (due before `period_start`) and long-waiting
(waiting since before it) — plus open, concerning Projects that completed
nothing. `cancelled` and `someday` work is excluded: a Task the owner parked or
dropped is not an unfinished commitment. With a snapshot, the surface can also
say *how many of these were already carrying over last time*.

**Where effort landed.** Areas that received completed work, with counts, and
Areas with active work that received none — with what counted as contribution
stated in the same sentence.

**Trend.** Bounded to the current period plus the last five completed Reviews of
the same type (`MAX_TREND_PERIODS` is a hard cap of 8). Two points minimum: one
point is a number with decoration. Direction compares the ends of the series,
not a fitted slope — the owner is comparing "then" with "now".

### Absence

The rule is DalyHub's existing one: **absence renders less, not a dashboard
measuring nothing.**

- A **first Review** says so in one sentence. It does not show "0 Projects
  improved, 0 Goals completed, 0 overdue resolved".
- "This is your first Review" and "your previous Review predates insight
  history" are different situations and get different sentences.
- A **failed read** is "not available", never zero.
- A section with nothing to say is **not rendered**, because an empty section
  still costs the reader a glance.
- No score, no index, no grade, no percentage, no streak. A unit test asserts
  the serialised model contains none of those words, and the tone vocabulary
  excludes `danger` entirely.

### Where it appears

No new module, no new route, no new top-level Analytics surface, and no change
to the guided stepper.

- **The guided weekly Review's first step** (`overview`, "Settle in") now renders
  the evidence. It previously showed six live counts — completed, overdue,
  Inbox, Diary, Meetings, active Projects — with nothing to compare any of them
  against; in a quiet week three of them read zero. Same step id, same label,
  same completion rule.
- **The Review record's Progress tab** renders the same model for **every**
  Review type, above the existing progress commentary. A monthly Review compares
  itself against the previous monthly Review, so horizons are never mixed.

### Drill-down

Every claim reaches the record behind it through ordinary links to existing
destinations — `/projects/:id`, `/goals/:id`, `/areas/:id`, `/tasks?task=:id`
and the canonical Task system views. The Review builds no parallel record
browser. Where a reason would otherwise name nine Projects, it names the first
four and says how many more there are; the links beneath it still reach them.

### Query bounds

[`review-insights-context.ts`](../../app/modules/reviews/insights/review-insights-context.ts)
is the only place the evidence reads a repository. One evidence load costs an
**asserted `REVIEW_INSIGHTS_QUERY_BUDGET` = 14 executed statements**, measured
against real D1, and two further tests prove the count is flat with respect to
**workspace size** and to **how many past Reviews exist**.

- The period contribution breakdown is read **once** and shared by the Project,
  Goal and Area projections — asking the same grouped question three times is an
  N+1 in disguise.
- The whole trend is **one** statement, whatever its length.
- Every list carries an explicit limit from `REVIEW_INSIGHT_LIMITS`.
- Carry-over shows a bounded list of names beside an **exact** workspace-wide
  count, so a short list never becomes a wrong number.
- Every displayed measure carries its exactness (`exact` / `bounded` /
  `unavailable`). A bounded number is never presented as an exact one.

The Review record's loader computes the evidence for **every** tab rather than
only for Progress. That is deliberate: the tab is client-side state, and making
the projection conditional on it would trade a bounded, asserted page cost for a
tab that can render empty if a revalidation does not happen. A weekly page paying
14 bounded statements is the cheaper mistake.

### Test coverage

- **Unit** — the Goal-contribution matrix, health-transition classification,
  trend direction and its two-point minimum, carry-over and repeat carry-over,
  distribution, first-Review and no-snapshot behaviour, unavailable reads,
  determinism, the naming bound, the "no score anywhere in the shape" assertion,
  snapshot build/parse/round-trip/version-fail-closed, and the evidence surface's
  headings, reasons, drill-down destinations and empty states.
- **Kernel / D1** — exact period completions (including a Task completed twice
  in one period counting once), Project/Goal completions under their own
  headings, contribution attribution through all three Area paths, deterministic
  ordering, carry-over partitioning and its `someday`/`cancelled` exclusions,
  snapshot round-trip, idempotency, cross-workspace refusal on read AND write,
  `listSnapshotsBefore` boundaries, version fail-closed, purge cascade,
  capture-on-completion and re-capture, same-type comparison, and the asserted
  query budget with both flatness proofs. Workspace isolation on every read.
- **Browser** — [`e2e/reviews-insights.spec.ts`](../../e2e/reviews-insights.spec.ts)
  over [`e2e/seed-review-insights.sql`](../../e2e/seed-review-insights.sql), a
  week that actually happened: the first-Review case, a populated Review, the
  trend read without the chart, drill-down to Project/Goal/Area, the guided step,
  390/1280/1440 with no horizontal overflow, axe in light and dark on both
  surfaces, and keyboard reach.

## Across recent Reviews (V2.9 INS-02, 2026-09-04)

The product has written one snapshot per completed Review since REVIEW-03 —
Project states, Goal contribution classifications and carry-over ids — and read
exactly one of them back. Every fact below was already stored and unreadable.

`ReviewInsightRepository.listSnapshotSeries(reviewId, n)` returns the anchor
Review's snapshot and the ones before it, oldest first, in ONE statement, with
the **same-type rule enforced in SQL** — a monthly Review never appears in a
weekly Review's series, because a period four times the length would make "at
risk in 3 of the last 4" a comparison of unlike things that looks exactly like
a comparison of like ones.

[`across-reviews.ts`](../../app/kernel/review-insights/across-reviews.ts) reads
that series into three facts, rendered as an **"Across recent Reviews"** section
of the existing evidence panel:

| Fact | When it appears | What it says |
|---|---|---|
| Project health across Reviews | only when the Project's state **differs** across the series (ADR-079 d8/d9) | "Kitchen renovation: At risk at 3 of the last 4 Reviews", with the states it held |
| Goal contribution across Reviews | when the Goal appears in two or more snapshots | "Moving at 5 of your last 6 Reviews" / "No contribution path at every one" |
| Repeated carry-over | when a Task carried over at **every** Review in the series | the commitments named in prose, with one door to `/tasks?system=overdue` |

Four rules it inherits, each load-bearing:

- **A Review that recorded no reading is skipped, never counted as a state.** A
  Project with two readings across four Reviews says "2 of the 2 that recorded
  one" (RECALL-04 / DEBT-234).
- **A missing snapshot shrinks the window rather than leaving a hole.** The
  sentence says the N the series actually holds (ADR-079 d5).
- **Every title is live, through the stored id.** Snapshots hold ids, states and
  counts and never a title, so a renamed record reads under its current name and
  a deleted one drops out (ADR-079 d3).
- **No score.** "3 of the last 4" is a count of Reviews, stated as one.

**It cost no statement.** `listSnapshotSeries` replaced the single `getSnapshot`
read, and the previous snapshot is derived from the series with the old
semantics exactly — the immediately prior Review's, or null. The evidence load's
budget stays at **17**. The guided flow's Goals step pays one more (12 → 13,
declared) for the same read, because the guided flow loads one step per request,
and that read is what gives every Goal in the ritual its
`contributionAcrossReviews` line (ADR-111 d6).

Evidence set: `docs/design/assets/review-03-2026-08/` (the folder was not committed;
the browser cases above record what the captures showed).

### What REVIEW-03 deliberately does not do

No AI, no recommendations, no time tracking, no productivity scoring, no
calendar or notification integration, no new top-level Analytics module, no
charting dependency, and no new metric added merely to make the page look
populated. If a number does not help the owner notice progress, notice
stagnation, notice imbalance, notice carry-over, understand contribution or
decide what deserves attention next, it is not shown.

---

## The period's plan account, and routine consistency (FOLLOW-01, 2026-08-26)

REVIEW-03 could say what COMPLETED in a period, where it landed, how Project
health moved and what was carrying over. It could not say what the period's
**plan** had held, and it said nothing at all about routines. V2.4 FOLLOW-01
closed both, and neither added a stored artefact.

### Where it comes from

Not from here. The account is derived by
[`~/kernel/activity-window`](../../app/kernel/activity-window/index.ts), read
through `readPeriodPlanAccount`
([`~/platform/activity-window/plan-account.server.ts`](../../app/platform/activity-window/plan-account.server.ts)),
and the SAME read backs Weekly Planning's account of the same week. That is
[ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)
decision 6 made structural: one derivation per question, shared by every
consumer, so `/plan` and the Review cannot describe one week differently.

The words are the kernel's too — `planAccountStatement`, `planAccountFacts` and
`entryReason`. This module passes `periodNoun: "period"` (a Review's period may be
a month); `/plan` passes `"week"`. Neither writes a sentence of its own.

### What the window means

`ReviewPeriodWindow` is now an **alias** of the kernel's `ActivityWindow`, and
`reviewPeriodWindow` a one-line call of the shared builder. The convention is
unchanged and now stated in one place: inclusive in wall-calendar days, half-open
in instants, with both bounds resolved through the OWNER's local midnight. Local
midnight now resolves through `ownerDayStartInstant`, which walks forward to the
first hour that exists in a zone whose DST transition skips midnight rather than
degrading to UTC — an improvement the Review inherits from the move.

### Where it appears

A section, **"The week you planned"**, at the head of the evidence surface — so
both consumers of `ReviewInsightsPanel` (the guided flow's first step and the
Review record's Progress tab) get it. It renders the sentence, the non-zero
outcome lines, and up to `MAX_NAMED_PER_PLAN_FACT` named Tasks **per line**
(rather than per section, so a week with eleven kept Tasks and one cleared one
still names the cleared one), each with the dates its outcome was read from and a
link to its record.

Absence renders less, as everywhere else on this surface: a period whose plan held
nothing and which finished nothing outside one renders **no section at all**.

### Routine consistency (DEBT-156)

One more section, **"Routines"**, and one bounded read —
`readHabitPeriodConsistency`, HABITS-01's own two-statement shape. The
denominator is HABITS-01's, summed across the schedule-VERSION chain in force
during the period; this module invents no Habit metric.

> **Routines** — 2 of 3 scheduled check-ins
> Across 1 routine. 1 scheduled day passed without one — days a routine did not
> ask for are not counted.

Two integers and the window they cover, and **no percentage**: `/habits` prints a
proportion beside its integers because that surface is about the Habits
themselves, and a Review is the one surface where a ratio is one careless sentence
away from becoming a grade ([ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks) §8).
A period that asked nothing of any Habit renders nothing — "0 of 0" is not a
reading. `firstDayOfWeek` is passed in by the caller rather than read here, so the
projection's budget does not grow by a preference lookup.

### The query budget moved, and says so

| | Before | After |
| --- | --- | --- |
| `REVIEW_INSIGHTS_QUERY_BUDGET` | 14 | **17** (+2 window, +1 active-Habit page) |
| `REVIEW_INSIGHTS_QUERY_BUDGET_WITH_HABITS` | — | **19** (+ HABITS-01's schedule and completion window reads) |
| `REVIEW_GUIDE_QUERY_BUDGET.overview` | 15 | **18** |

Both figures are asserted against real D1. The pair exists because every Habit
read in the product short-circuits on an empty page — binding a version or
completion window to no ids is a query that cannot return anything — and one
number would be wrong in one of the two cases.

### Nothing new is stored

The account is **deliberately absent** from `review_insight_snapshots`, and a
test reads the stored row's text and fails if an outcome or a Task id appears in
it. The snapshot exists for facts that cannot be re-derived (state at a past
moment); this one always can be, so storing it would be the second copy ADR-110
refuses.

Full record:
[`V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md`](../product/V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md).


## The period label and the period lookup (STEER-05, 2026-08-28)

[STEER-05](../roadmap/ROADMAP_V2_5.md#-steer-05--the-weeks-door--delivered-2026-08-28)
gave Today a door onto this week's Review
([`TODAY_DASHBOARD.md` → the week's door](TODAY_DASHBOARD.md#the-weeks-door-steer-05-2026-08-28)).
Two things moved in this module to make that possible, and nothing else about
Reviews changed: no new machinery, no second period authority, and no change to
the Review's content, steps or lifecycle.

### `reviewPeriodLabel` moved to the kernel

It lived in `app/modules/reviews/review-view.ts`, with private `monthYear` and
`quarterLabel` helpers that duplicated `app/kernel/reviews/review-periods.ts`'s
own. Today naming the week it is offering would have meant either a cross-module
import (`AGENTS.md` §9.1 forbids it) or a third implementation of a label the
product already has two of.

So the rule moved down beside `currentReviewPeriod` — the authority it labels —
and the module **re-exports it from its old path**, so no call site changed. The
duplicate `monthYear`/`quarterLabel` helpers went with the move. There is now
exactly one implementation, published from `~/kernel/reviews`, and the Reviews
collection, the Review record, the New Review form's period preview and Today's
door all read it.

### `ReviewRepository.findPeriodEntry` — the bounded existence read

```ts
findPeriodEntry(
  type: Exclude<ReviewType, "custom">,
  periodStart: string,
  periodEnd: string,
): Promise<ReviewPeriodEntry | null>;
```

A surface that offers *"start this week's Review"* has to ask the same question
`create` asks to stay idempotent — otherwise "there isn't one yet" and "there
already is one" become two rules that can disagree. So this is not a new lookup:
it is `create`'s own, exposed on the contract, and both now read a single
`PERIOD_MATCH` predicate in the D1 repository so they cannot drift.

Two deliberate shapes:

- **It answers with a `ReviewPeriodEntry`, not a `Review`** — id, title, type,
  period, status, archived. A `Review` carries ten section bodies and would cost
  a second statement to answer a yes/no question. This one is **exactly one
  bounded statement**, found or not, asserted with a counting database.
- **`custom` is excluded from the type**, because a custom period is not unique
  and `create` does not deduplicate it.

`ARCHIVED` is reported rather than filtered, and the caller decides. Today's
door treats an archived current-period Review as an absence, deliberately: the
guided flow refuses an archived Review (it redirects to the record's Settings
tab, where restore lives), so "Continue" would be a dead end — while
`/reviews/new` is not one, because `create` finds the archived Review for the
period and **restores** it rather than making a second.

### What Today may and may not do with them

Today **links**. Review creation and resumption stay this module's: `/reviews/new`
creates (and its form already opens on the current week from the same
`currentReviewPeriod` and the same owner preference), `/reviews/:id/guide`
resolves the owner's own resume step and redirects to it, and `/reviews/:id` is
the canonical record. Today holds no resume bookmark, names no step, and writes
nothing.

## The period context tells the period's truth (V2.7 RECALL-04, 2026-09-01)

[DEBT-235](../product/PRODUCT_DEBT.md#-debt-235--the-review-records-period-context-is-today-anchored-and-bounded-before-its-filter--p2--resolved-2026-09-01).
The Review record's four context lists sat under a historic period's label and
none of them was a period query:

- **Completed tasks** read the `completed` system view at `limit: 50` with no
  sort — so `smart`, priority-then-due over the workspace's ENTIRE completed
  history — and then filtered those fifty rows in JavaScript. A busy owner's
  Review could legitimately render an empty "Completed tasks" list under copy
  claiming completeness.
- **Open tasks** read the `overdue` view, which is bound to TODAY in SQL, and
  drew today's backlog under a heading about last March.
- **Diary and Meetings** took fifty recent rows (Meetings took two pages,
  `recent` and `upcoming`) and filtered them in JS, with no bound signal — so a
  truncated answer and a complete one were the same list.

### Four period-scoped statements, bounded after the predicate

[`review-period-context.ts`](../../app/modules/reviews/review-period-context.ts):

| list | predicate, in SQL | order |
|---|---|---|
| Completed tasks | `completedFrom` / `completedTo` (RECALL-02's window over `spine_records.completed_at`) | `completed`, most recent first |
| Open and overdue **now** | the `overdue` system view — current state, named as such | the view's own |
| Diary entries | `occurredFrom` / `occurredTo` | newest first |
| Meetings | `listStartingBetween` | earliest first |

Each asks for `REVIEW_PERIOD_CONTEXT_LIMIT + 1` so a full page and an exact-fit
period are distinguishable, returns at most 50, and carries `bounded` — which the
record states on the surface when it is true. **The cost fell**: five statements
to four, and no list is filtered in JavaScript.

Owner-calendar day bounds are resolved once, through `ownerDayStartInstant`, from
the owner's midnight on `periodStart` to the start of the day after `periodEnd` —
so a 23:50 entry on the last day is inside the window and a 00:10 entry on the
next day is not, asserted at thirty-minute resolution either side of both
instants.

`listStartingBetween`'s safety ceiling moved 50 → 100 so a caller can use the
`limit + 1` idiom at the Review's own page size; the Diary timeline's ceiling has
been 100 for the same class of reason.

### Open/overdue: renamed, not re-scoped — and why

RECALL-04 left implementation one choice: scope the list to a period question it
can honestly answer, or rename it to the truth it shows. **It is renamed —
"Open and overdue now".**

DalyHub stores no plan membership. [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)
decision 3 keeps the period account DERIVED and explicitly refuses a snapshot
table for a plan, so *"still open from this period's plan"* has no stored fact
behind it and answering it would mean inventing history the product deliberately
does not keep. What the query can answer truthfully is the CURRENT state, so the
heading says `now`. A historic Review therefore shows two clearly separated time
words: **"Completed in this period"** and **"Open and overdue now"**.

### The tab label matches its content

**"People & Meetings" → "Meetings".** The smaller half on purpose: RECALL-04's
non-goals forbid building People functionality to save a label, and no existing
period-scoped People read belongs there — a Person is not an event with a date
inside a window, so *"the People of this period"* is not a question the data
answers today.

The tab **id** (`people`) and its stored section id
(`people_meetings.commentary`) are UNCHANGED. They are storage keys, not copy;
renaming them would orphan every commentary the owner has already written.

### A Project with no health reading, inside the Review

`review-insights-context.ts` mapped a missing health reading to `"on_track"` —
the best of the five states, chosen because there was nothing to choose from. It
was then written into the snapshot as though measured and compared at the next
Review as a real reading, so a Project that merely became readable could be
announced as having deteriorated, and one that stopped being readable as having
improved.

- `projectStateFact` (exported, pure, and therefore falsifiable without arranging
  for a read to fail) resolves an absent reading to `healthState: null` and
  `PROJECT_HEALTH_UNAVAILABLE_LABEL`.
- The snapshot stores `health: null` rather than dropping the row — a dropped row
  reads as *"did not exist at that Review"*, which is a different untruth.
  `parseReviewInsightSnapshot` keeps an explicit `null`, still refuses a
  malformed value, and the stored version is unchanged (an existing v1 row parses
  exactly as it did).
- `classifyProjectHealthChange` gained **`unknown`**: `undefined` is "not in the
  previous snapshot" (still `new`); `null` on either side is "no reading" and
  yields no transition at all. The cross-view *"changed since your last Review"*
  boundary skips absent readings for the same reason.

### Testing

`test/kernel/recall-04-day-week-truth.test.ts` seeds a Review across a month
boundary with **62 in-period completions**, one before, one after, and one
completed inside then retitled a week after the period closed. Exactly 50 rows
come back, all in-period, in completion order, with the bound stated. Falsified
three ways: restore the history-wide limit before the filter, restore
`sort: "updated"`, restore `smart`.
`test/unit/reviews/ReviewRecordContext.test.tsx` holds the labels;
`test/unit/reviews/review-project-state.test.ts` holds the absent-reading rule.
