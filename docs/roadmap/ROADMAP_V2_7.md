# ROADMAP_V2_7.md — DalyHub V2.7, RECALL

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1, [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md)
> holds V2.2, [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) holds V2.3 (**closed**),
> [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) holds V2.4 (complete apart from
> V2.4-GATE-01's owner-held halves — one of which, **RECOVERABLE, was met on
> 2026-08-30**), [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md) holds V2.5 (**complete
> 2026-08-28**), and [`ROADMAP_V2_6.md`](ROADMAP_V2_6.md) holds V2.6
> (**complete 2026-08-29** — all four FIND items delivered, every taken entry
> closed).
>
> **This file is V2.7, and it is where new work goes.** The rules are
> unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build; this
> tells you *what*. Status is updated in the PR that changes it. No time
> estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: IN PROGRESS.** RECALL-00 and RECALL-01 ☑ delivered
2026-08-30, RECALL-02 and RECALL-03 ☑ delivered 2026-08-31; RECALL-04 is ☐. The
programme decision is recorded as
[ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine) and every finding it is built on
was re-measured against `main` at `0d08cd6` on 2026-08-30 — including the
findings of the 2026-08-29 post-V2.6 audit, two of which this pass **corrects**
rather than carries forward (see [the audit](#the-audit-this-programme-is-built-on)).

---

## The theme: RECALL — the whole record answers

**DalyHub remembers what you wrote, when you finished it, and what you promised
— not just what you titled.**

The product's first principle is *"The system is your memory… capture must be
effortless; retrieval must be certain"*
([`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md)). Six programmes
have made capture effortless and the signals honest. Retrieval is still
**title-deep**: what was said in a meeting, written in the Diary, described on
a Task or reflected in a Review cannot be found by searching for it; what was
*completed yesterday* cannot be listed by any control in the product; and a
follow-up date the owner explicitly wrote down is stored, edited, exported —
and read by no query at all.

V2.6 made the title layer fast (recency, tags, `#tag`). V2.7 finishes the
sentence: the **whole record** becomes retrievable, the **time** dimension of
the owner's own history becomes answerable, and an **explicitly recorded
commitment** comes back when it is due.

---

## Where V2.6 left the product

All four items delivered 2026-08-29:

- **FIND-01** — Search answers the empty query with recently-worked-on records,
  derived from the Activity stream (one statement, 600-row scan horizon), with
  Diary excluded from the one surface that renders unbidden and a standing line
  saying so.
- **FIND-02** — one workspace tag vocabulary (`workspace_tags` +
  `entity_tags`, ADR-113), three legacy columns converged by migration `0049`
  without losing a tag.
- **FIND-03** — Tasks adopt the model; one `tags` filter dimension resolved as
  an `EXISTS` semi-join.
- **FIND-04** — `#tag` in the capture grammar; unknown tags offered, never
  created silently.

**And the trust floor moved — after the audit was written.** The 2026-08-29
audit rated recoverability the product's P0. On **2026-08-30** an owner session
with real credentials changed the facts, and this programme is decided against
the *new* facts:

- The **Cloudflare R2 backup tier (BACKUP-01) is healthy and always was** — 20
  runs, every one `success`, unbroken since 2026-08-13. The earlier "no backup
  has ever existed" reading conflated it with the separate GitHub tier
  ([DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2), re-scoped P1 → P2).
- **Migration `0049` is applied to production** (2026-08-30 05:56:14, Worker
  deployed 21 seconds later; ledger at 51 applied migrations), and a
  **post-`0049` manual backup** was taken eleven minutes after the apply.
- **A real production artefact was restored** into a throwaway remote D1: the
  raw D1-export ordering defect was measured (the index a composite FK needs
  arrives ~3,000 lines after the first row that depends on it), canonical
  reorder tooling was added and tested
  ([DEBT-199](../product/PRODUCT_DEBT.md#-debt-199--a-d1-dump-cannot-be-restored-by-the-command-the-recovery-documentation-gave-and-whether-the-remote-path-is-affected-is-unmeasured--p1--resolved-2026-08-30) ☑ RESOLVED, PRs #239/#240),
  thirteen row-count comparisons matched production exactly, and
  `PRAGMA foreign_key_check` came back clean.
- **RECOVERABLE is met** (V2.4-GATE-01 progress note, 2026-08-30).
  [DEBT-139](../product/PRODUCT_DEBT.md#-debt-139--migration-0042-has-not-been-applied-and-no-production-backup-has-been-taken--p1--two-of-three-clauses-met-2026-08-30-one-owner-ui-check-remains)
  is down to one ~30-second owner UI check. What remains open is the
  **off-Cloudflare** encrypted copy (DEBT-198, P2, four secrets plus a security
  decision about a public repository's environment) — a different trust
  boundary, and a residual risk rather than an emergency.

**The E2E gate on `main` is red, for five recorded pre-existing causes** —
[DEBT-215](../product/PRODUCT_DEBT.md#-debt-215--three-e2e-assertions-still-address-the-area-records-goals-tab-as-a-card--p2),
DEBT-216, DEBT-219, DEBT-220 and DEBT-221 — none of them this programme's
surfaces (see [Dependencies](#dependencies)). Static, build and unit/kernel are
green on `main`'s head after #240 repaired the one Unit red #239 introduced.

---

## The audit this programme is built on

The 2026-08-29 post-V2.6 audit
([`DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md))
proposed RECALL. It was written at `b928fd4` — FIND-01 delivered, FIND-02/03/04
still ☐, recoverability still misread — so **every finding below was re-tested
against `main` at `0d08cd6` (2026-08-30)** rather than copied forward. The
verdicts:

### Confirmed, with current evidence

| Finding | Evidence on `0d08cd6` |
|---|---|
| **Search is title-deep.** | Meetings match `e.title` + `d.location` only (`d1-meeting-repository.ts:481-482`); Diary `e.title` only (`d1-diary-repository.ts:345`); Tasks `e.title` + checklist-item titles, never `description` (`d1-task-repository.ts:1741,1755`); Reviews `e.title` only (`d1-review-repository.ts:398`). The unsearched columns exist and hold the prose: `meeting_details.agenda_markdown` / `notes_markdown`, `meeting_agenda_items.body_markdown` (0014), `diary_entries.body` (0011), `task_details.description` (0006), review sections' `body_markdown` (0018). Notes remain the one body-searching provider (`d1-note-repository.ts:370-371`), with the match-source + SQL-cut excerpt mechanism RECALL-01 generalises. |
| **A linked Diary entry opens raw JSON.** | `destination.ts:54` maps `diary` → `/diary/:id`; `app/modules/diary/routes/entry.tsx` is a resource route — loader only, no default export — returning `application/json` **including the private body** (`bodySource`). Diary's own search provider targets the real surface, `/diary?inspector=view:<id>` (`diary/search.ts:69`); every `entityDestination` consumer (Linked Items, backlinks, People timeline, hover cards) gets the JSON. The file's own comment (`destination.ts:26-29`) still claims PEOPLE-03 "added the Diary entry route". |
| **`/views` binds unsafely and stops at 60.** | `#resolveLinkAnchors` binds `2 + 2n` parameters unchunked (`d1-cross-view-query-repository.ts:736-760`) — 60 note/meeting rows is 122 binds against D1's 100 cap, a failed statement; `#resolveTitles` / `#resolveParents` are also unchunked (`:664-670`, `:688-698`) while `entities.getByIds` chunks for exactly this reason (`d1-entity-repository.ts:118`). The page is `sortCandidates(...).slice(0, CROSS_VIEW_PAGE_LIMIT)` with `CROSS_VIEW_PAGE_LIMIT = 60` (`view-query.ts:31`), no cursor anywhere in the module, and per-scope candidate reads bounded at 120 (`view-query.ts:28`) with the JS sort applied after. |
| **Meeting detail reads follow-ups one at a time.** | `meetings/routes/detail.tsx:116-125`: `listFollowUps` (cap `FOLLOW_UP_CAP = 100`, `:84`) then a `for` loop calling `scope.tasks.getTask(link.taskId)` per link — up to 101 statements. `task-activity.tsx:131-151` loops `entities.getById` per subject id directly under a comment claiming *"ONE bounded batch (no N+1)"* — while `entities.getByIds` exists, chunk-safe, and ten sibling activity routes use it. |
| **The desktop search button loses its accessible name at 768–1024 px.** | The label is the only name source (`DesktopTopBar.tsx:172-193` — no `aria-label` on the button; the `role="search"` wrapper's label names the region, not the control) and `shell.css:1194-1197` sets it `display:none`, restored only `@media (min-width: 64rem)`. The mobile shell takes over at ≤48rem, so in the 768–1024 px band the control is an unnamed `<button>` (WCAG 4.1.2). The jsdom unit test passes because no stylesheet loads; no E2E runs at a band width. |
| **Singular record routes leave navigation with no current item.** | `navigation-active.ts:26-35` matches by path nesting only; People, Meetings and Assets register `/people`, `/meetings`, `/assets` but their detail routes are `person/:id`, `meeting/:id`, `asset/:id` (`routes.manifest.ts` 23/43, 15/37, 22/42) — and the create routes `new/person`, `new/meeting`, `new/asset` are orphaned the same way. No alias/`activeFor` mechanism exists on `NavigationItem` or `RouteMeta`. Every other module nests correctly. |
| **Completed work is not retrievable by time.** | `TASK_SORTS` (`task.ts:767-780`) has no completed sort; `TaskViewConfig` has `createdWithin` / `updatedWithin` / `dueFrom…` but no completed window (`task-view-config.ts:130-146`); the Completed system view says *"Finished work, most recent first."* while sorting `updated` (`task-system-views.ts:126-129`), which is `e.updated_at DESC` (`d1-task-repository.ts:2883-2884`) — edit time, not completion time. `spine_records.completed_at` (0005) is the one completion authority, already joined by the collection query (the smart sort reads `sr.completed_at`). |
| **`followUpOn` is write-only.** | `task_details.follow_up_on` (0012, `YYYY-MM-DD` CHECK, **no index**); edited (`TaskDetailsTab.tsx`), validated, exported (vault + snapshot + restore) — and **no query predicate anywhere**: absent from `task-view-filters.ts`, `task-view-config.ts`, every system view, Today's loaders, the digest facts (`digest.ts:42-75`) and both notification kinds. The only comparison in the product is a dirty-check (`d1-task-repository.ts:738`). |
| **`/today/waiting` is a bounded page presented as complete.** | `WAITING_LIMIT = 100` (`waiting.tsx:59`), `ListWaitingTasksInput` takes no cursor (`task.ts:655-660`), and the page's subtitle states the truncated count as fact. Deliberately no nav entry (manifest comment); the attention rail links it (`attention-view.ts:138`). |
| **Today never states the meetings-today fact.** | `dayChips` — including its `"Meetings today"` chip (`day-view.ts:647`) — has **no consumer**; `data.meetings` feeds only `nextUp` (`day-view.ts:841-877`), which falls through to tasks once the last meeting starts. Nuance the audit missed: the Schedule panel keeps rendering past entries (`schedule.ts:339-344`) — the meeting *rows* survive; the meeting *fact* (a count, a statement) appears nowhere. The daily **digest** states it ("N events: 09:00 Standup · …", `digest.ts:142-157`); the screen the owner opens does not. |
| **"On track" has no single meaning.** | Today: `status ∈ {on_track, ahead, achieved}` over ≤4 measured Goals, ranked **attention-first** so the sample is biased pessimistic, bound undisclosed (`measures.ts:167-198`, `goal-summary-load.ts:77-81,160-174`). Analytics: alignment `state === "active"` over ≤40 — a different evaluator (ADR-040), the only surface disclosing its bound (`analytics-context.ts:436-460`). `/goals` lens: `status IN ('on_track','ahead')` workspace-wide in SQL — no `achieved` (`goal-outcome.ts:175-177`, `d1-goal-repository.ts:198-199`). Views renders the *same* alignment state Analytics calls "On track" as **"Moving"** (`views-controls.ts:41`), and Review insights add a fourth predicate (`classifyGoalContribution` → "Moving", `review-insights.ts:150-159`). And one silent untruth: a Project with **no health facts** defaults to `"on_track"` (`review-insights-context.ts:526-527`), is snapshotted as a real reading, and can manufacture a false "improved"/"deteriorated" transition later. |
| **The Review record's period context is today-anchored and bounded before its filter.** | `review-period-context.ts:51-56` reads the **overdue-today** view workspace-wide and renders it under a historic period label with no period filter (`:80-85`); completed/diary/meeting reads take `limit: 50` **before** the JS period filter (`:47-59` vs `:62-70,87-94,112-123`) with no bounded flag — and the completed read is worse than the audit recorded: it omits `sort`, defaults to `smart`, and over an all-completed set that is priority-then-due over the workspace's **entire history**, so a busy week can legitimately render an empty "Completed tasks" list. The tab is labelled "People & Meetings" and contains only meetings. |
| **Deterministic Ask answers are gated off in error.** | The five deterministic intents (`deterministic-answers.ts:20-24`) are answered server-side **before** the `ai_disabled` throw (`assist.tsx:163-183` vs `ai-runtime.ts:181`), advertised in Help (`help-content.ts:647`) — and unreachable, because `ai/routes/index.tsx:106-108` hides the entire question form behind the enabled+configured gate. |

### Corrected — do not carry these forward

- **"Review snapshots are stored and unanswered" is WRONG on current `main`.**
  The previous snapshot is read and compared in four places
  (`review-insights.ts:608-631, 679-727, 741-768, 1183-1196` — restarted-stalled,
  health transitions rendered as "At risk → On track", carry-over continuity,
  honest first-review states), and the cross-view *"changed since your last
  Review"* boundary reads the snapshot table too
  (`d1-cross-view-query-repository.ts:272-297`). What is true is narrower:
  `listSnapshotsBefore` has zero callers, so no **multi-Review trend** exists.
  That belongs to a later Insight programme, not to RECALL.
- **"`/today/waiting` has no command-palette access" is WRONG.**
  `today.open_waiting` is registered with keywords
  (`today/commands.ts:30-37`). The real gaps are the cap, the truncated count
  stated as fact, and the deliberate absence of a nav entry.
- **Recoverability** — corrected above; the audit's P0 is materially resolved
  on the R2 tier, and DEBT-198's remainder is the cross-provider copy.
- **One dead-end the audit missed** (found by this pass): the Reviews
  collection renders **Start / Continue** guide buttons for *every* unfinished
  Review (`ReviewsCollection.tsx:403-417`) while the guide redirects every
  non-weekly type back to the record (`guide.tsx:88-91`) — "Start monthly
  review" announces itself and silently bounces.

### The chain, scored

`capture → organise → decide → do → review → learn → retrieve`, against the
questions the audit asked, on current `main`: **capture** strong (2 taps, one
grammar, `#tag`, offline queue); **organise** strong (one vocabulary, one links
model, one filter grammar); **decide** strong (Today/Plan/next-action, honest
signals); **do** strong; **review** good weekly (period tabs misreport —
above); **learn** fair (single-step snapshot comparison exists; no long trend —
deferred); **retrieve** — the break. Something remembered only by its contents:
findable only if it is a Note. Something completed at a particular time: no
control answers it. Something said in a meeting: unfindable. Something written
in Diary: unfindable, and the link paths that do reach an entry open JSON. A
commitment recorded for later (`followUpOn`): write-only. **Remember-for-me**:
the digest and asset rungs reach out; an explicitly dated follow-up never does.
The chain breaks at exactly the three verbs RECALL names: **content, time,
commitment.**

---

## The governing product argument

Six candidate programmes were weighed. Qualitative, per this repository's
tradition — no composite score.

| | **A RECALL** | B Insight | C AI activation | D Attachments | E Finance | F Consolidation |
|---|---|---|---|---|---|---|
| **Daily-driver impact** | Retrieval, completed-time and commitments are every-session, many-times-a-day verbs. **A** | Weekly, at review time | Weekly (the one shipped assistant lives in the Review) | Weekly | Weekly | Diffuse |
| **Trust impact** | Direct: five measured path/truth defects fixed, and "if I put it here I'll find it" becomes true | Low | Low until a key exists | Medium | High-risk (financial data) | Medium (a green gate) |
| **Dependency leverage** | Feeds AI evidence retrieval (DEBT-93), makes Insight's questions answerable, precedes nothing it blocks | Needs RECALL-02's completed-time read to answer its best questions | **Blocked**: no provider key has ever existed here (AI_PLATFORM §21, unchanged); 0-for-4 record on owner-held blockers | Prerequisite for Finance, blocks nothing else | Blocked twice: attachments + the cross-provider backup residue | Enables nothing new |
| **Implementation risk** | Ordinary and DalyHub-shaped: provider SQL, one sort arm, one filter dimension, bounded reads — the repository's proven strengths | Low | Low in code, **unbounded** at the provider | High (R2, export, backup, privacy decisions) | Highest (monetary data, import/dedupe) | Low |
| **Architecture readiness** | Everything needed exists: LIKE+excerpt mechanism (Notes), recency source, tag vocabulary, filter grammar, keyset cursors, notification evaluator | Snapshot store exists | Exceptional and idle | Missing storage primitive — that is the point | Missing two prerequisites | Ready |
| **Mobile value** | Finding and being reminded are what a phone is for. **A** | Low | Low | Medium | Medium | Low |
| **Makes later programmes cheaper** | AI (evidence retrieval), Insight (time reads), Finance (trust in retrieval) | AI slightly | — | Finance | — | All, slightly |
| **Can the owner already do the job another way?** | **No** — record timelines don't search prose, and no view lists completion by time | Partly (Review insights exist) | No, and cannot be proven here | No | Yes (external apps) | — |
| **Foundational or additive?** | Foundational — it completes the product's first principle | Additive | Additive (until the key, hypothetical) | Foundational for Finance only | Additive | Neither |

**Recommended next programme: A — RECALL.** It is the only candidate that is
unblocked, foundational, used many times a day, and makes three of the other
five cheaper. B's best two questions ("what did I complete", "did this Goal
move") are folded into RECALL-02/-04 or already answered by the existing
snapshot comparison; C's gate remains a **tripwire, not a theme** — the moment
a key exists, run `scripts/ai-integration-check.mjs` per the sequence V2.6
already fixed, outside any programme; D and E stay sequenced behind RECALL by
their own prerequisites; F's genuine content — the five red-gate entries — is a
bounded truth-restoration pass that should ride **beside** this programme in
its own PR (below), not become its theme.

The programme decision and the five rules every item inherits are
[ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine).

---

## NOW

Five items. The found-defects sweep first — the paths must be trustworthy
before more records travel them — then content, then time, then commitments,
then cross-surface truth.

---

### ☑ RECALL-00 — Trust the paths — **delivered 2026-08-30**

**Every path to a record leads to the record, and says what it is.**

Seven bounded defects, each measured on `main` at `0d08cd6`, each undermining
retrieval, navigation truth or information access — the inclusion rule this
item is scoped by, and the reason the five red-gate E2E entries
(DEBT-215/216/219/220/221) are **not** here: they are Assets-fixture, palette-test,
template-assertion and zoom-layout debt on other items' surfaces, owned by the
truth-restoration rider below.

This item's full implementation brief follows, at the depth a fresh session
needs to implement without re-auditing.

#### A. A Diary link opens the Diary, not JSON — closes [DEBT-222](../product/PRODUCT_DEBT.md#-debt-222--a-linked-diary-entry-opens-raw-json-because-the-shared-destination-maps-diary-to-a-ui-less-resource-route--p2)

- **Reproduced behaviour.** `entityDestination("diary", id)` returns
  `{ kind: "route", to: "/diary/<id>" }` (`app/shared/entity/destination.ts:54`);
  `GET /diary/:entryId` (`app/modules/diary/routes/entry.tsx`) is a resource
  route with no default export that returns JSON **including `bodySource`** —
  so Linked Items, backlinks, the People relationship timeline and hover cards
  all open a raw JSON document holding the entry's private body.
- **Intended behaviour.** The destination map routes `diary` to the surface the
  Diary search provider already uses:
  `/diary?inspector=view:<id>` (`app/modules/diary/search.ts:69`) — the day
  surface with the entry's inspector open, which the resource route was built
  to feed on exactly this deep link (its own header says so). **Do not** build
  a `/diary/:id` record page; the day + inspector IS Diary's canonical record
  surface, and inventing a second one would fork it. Correct the stale
  PEOPLE-03 comment in `destination.ts` in the same change.
- **Files.** `app/shared/entity/destination.ts` (the one authority; no
  per-module switch anywhere else). Consumers need no change — that is the
  point of the one map.
- **Regression tests.** Unit: `entityDestination("diary", …)` returns the
  inspector URL (there is an existing destination test suite to extend). E2E:
  from a record's Linked Items (or a Person timeline) holding a linked Diary
  entry, activate the link and assert the **Diary day surface** renders with
  the inspector open on that entry's title — and assert the response is an
  HTML document, not JSON. Falsification per the testing philosophy: point the
  map back at `/diary/:id` and watch the journey fail.
- **Note.** The encoded id lands in a query parameter; keep
  `encodeURIComponent` (already required for `?` / `&` safety).

#### B. `/views` is bind-safe and honest about its bound — closes [DEBT-223](../product/PRODUCT_DEBT.md#-debt-223--the-cross-view-repository-binds-unchunked-in-lists-that-can-exceed-d1s-parameter-cap-and-result-61-is-unreachable--p2)

- **Reproduced behaviour.** Three helpers in
  `app/platform/storage/d1/d1-cross-view-query-repository.ts` build unchunked
  `IN (…)` lists: `#resolveTitles` (`:664-670`, `1+n` binds), `#resolveParents`
  (`:688-698`, `1+n`), `#resolveLinkAnchors` (`:736-760`, `2+2n`). The page is
  60 rows (`CROSS_VIEW_PAGE_LIMIT`, `view-query.ts:31`), so a page of 60
  note/meeting results binds **122** parameters into one statement against
  D1's 100 cap — the statement fails and `/views` errors at realistic sizes.
  Result 61 is unreachable: `sortCandidates(...).slice(0, 60)` (`:252-255`),
  no cursor in the module, no load-more in `ViewsWorkspace.tsx`. Scope reads
  are SQL-bounded at 120 candidates each (`:397-401`) with `bounded` set on
  saturation, and the filter predicates ARE pushed into SQL — the JS work is
  sort + slice + derived dimensions, not filtering.
- **Intended behaviour, in two halves with different costs:**
  1. **Bind safety (the latent failure).** Chunk all three helpers the way
     `entities.getByIds` already does (`d1-entity-repository.ts:118` — chunk
     size chosen against the 100-bind cap), merging results across chunks.
     Statement count becomes `ceil(n/chunk)` per helper — bounded by the page
     size, worst case 2–3 statements per helper for a 60-row page. Prefer
     reusing `entities.getByIds` outright for `#resolveTitles` rather than
     keeping a private twin.
  2. **The bound becomes honest (the product defect).** Do **not** raise the
     60-row limit, and do not build offset paging. Decide between (a) a keyset
     cursor over the cross-view ordering — real but expensive, because the
     ordering is computed over up-to-120-per-scope candidates in JS, so a
     cursor is only honest if the ordering moves into SQL per scope — and (b)
     keeping the bound and **stating it**: the existing `bounded` flag rendered
     as the same honest sentence Analytics already uses ("of the N read"),
     plus per-scope saturation surfaced. **(b) is the recommended answer at
     DalyHub's scale**: `/views` is a cross-module answer surface, not a
     collection, and its own `bounded` flag exists precisely for this. Record
     the decision on the item either way; (a) remains available to a later
     pass without changing the contract.
- **Query budget.** After the fix: for a 60-row page, ≤ 1 (boundary) + 6 scope
  reads + ≤ 3 chunked anchor/title/parent reads ≈ **10–12 statements**, flat in
  workspace size, every statement ≤ 100 binds — asserted by a counting-DB test
  at the adversarial population (below).
- **Regression tests.** Kernel/real-D1: seed **60+ notes and meetings that all
  match one view** (this is the population the audit never built) plus hostile
  rows in a second workspace; assert the query returns 60 rows with correct
  anchors, no statement error, workspace isolation, and the bounded sentence.
  Falsification: un-chunk one helper and watch the 60-row fixture fail;
  remove a workspace predicate and watch the isolation assertion fail.

#### C. Meeting detail reads follow-ups as one bounded batch — closes [DEBT-224](../product/PRODUCT_DEBT.md#-debt-224--meeting-detail-resolves-follow-ups-one-gettask-at-a-time-and-the-task-timeline-loops-getbyid-under-a-comment-claiming-one-batch--p2)

- **Reproduced behaviour.** `app/modules/meetings/routes/detail.tsx:116-125`:
  `listFollowUps` (cap 100) then `for … await scope.tasks.getTask(link.taskId)`
  — up to **101 sequential statements** per page load, growing linearly with
  follow-ups. Same shape at `app/modules/tasks/routes/task-activity.tsx:131-151`:
  a per-id `entities.getById` loop directly under a comment claiming *"ONE
  bounded batch (no N+1)"*, while ten sibling activity routes use
  `entities.getByIds`.
- **Intended behaviour.** A bounded batched read through the **canonical Task
  authority** — follow-up grouping/state must keep deriving from the Task,
  never a cached Meeting field (the loader's own rule). Add a
  `getTasksByIds(ids)` read to the Task repository contract (mirroring
  `entities.getByIds`: chunked at the D1-safe size, workspace-scoped in SQL,
  order-preserving or caller-ordered, missing/deleted ids simply absent) and
  use it in the meeting loader. Fix `task-activity.tsx` by switching the loop
  to the `entities.getByIds` its comment already claims. Keep `FOLLOW_UP_CAP`;
  deeper paging stays the documented follow-up it already is.
- **Query budget.** Meeting detail's follow-up read: **1 + ceil(n/chunk)**
  statements (≤ 3 for the 100 cap) instead of 1 + n. Task activity: 1 page read
  + ≤ 1 chunked batch instead of up to ~60 reads. Both pinned by
  counting-DB tests.
- **Regression tests.** Kernel/real-D1: a meeting with 25+ follow-up Tasks —
  assert statement count, assert every follow-up's state matches the Task
  authority, assert a follow-up in another workspace never appears
  (hostile-row isolation). Falsification: reintroduce the loop and watch the
  statement-count assertion fail.

#### D. The search control keeps its name at every width — closes [DEBT-225](../product/PRODUCT_DEBT.md#-debt-225--the-desktop-top-bars-search-button-has-no-accessible-name-between-768-and-1024px--p2)

- **Reproduced behaviour.** `DesktopTopBar.tsx:172-193` — the button's only
  name source is the visible label span; `shell.css:1194-1197` hides it with
  `display:none` below `64rem`; the desktop bar renders above `48rem`; so in
  the 768–1024 px band the button has **no accessible name** (axe
  `button-name`, WCAG 4.1.2). The icon and the `/` hint are `aria-hidden`
  (correctly).
- **Intended behaviour.** Use the existing shell semantics — the mobile top
  bar's own pattern (`MobileTopBar.tsx:136`,
  `<span className="dh-visually-hidden">Search</span>`) — not a special-case
  duplicate label: in the collapsed band, the label span stays in the
  accessibility tree via the shared `dh-visually-hidden` treatment instead of
  `display:none` (or, equivalently, the CSS swaps `display:none` for the
  visually-hidden rule at that band). One control, one name, at every width.
  Correct the comment at `DesktopTopBar.tsx:184-188` that asserts the label
  "is the accessible name as well" — make it true instead.
- **Regression tests.** The unit test already asserts
  `toHaveAccessibleName("Search DalyHub")` but jsdom loads no stylesheet — so
  the proof must be E2E: an axe scan (no rule disabled) at **820 px and
  1024 px**, plus an explicit accessible-name assertion on the control at
  820 px. Falsification: restore `display:none` and watch the 820 px assertion
  fail while 1024 px still passes.
- **Ride-along, same files, no new debt raised:** the three stale shell
  comments describing the phone bar as `Today · Tasks · Capture · Diary · More`
  (`mobile-navigation.ts:77-80`, `AppShell.tsx:13-14`, `MobileTopBar.tsx:41-43`)
  are corrected to the composed truth (`Today · Tasks · Add · Projects · More`,
  asserted by `e2e/mobile-shell.spec.ts:45`).

#### E. One recorded active-navigation rule — closes [DEBT-226](../product/PRODUCT_DEBT.md#-debt-226--active-navigation-understands-only-path-nesting-so-singular-record-routes-leave-no-current-item--p2)

- **Reproduced behaviour.** `app/shared/shell/navigation-active.ts:26-35`
  matches a destination by `pathname === href || pathname.startsWith(href + "/")`.
  People/Meetings/Assets register plural collection hrefs while their record
  routes are singular (`/person/:id`, `/meeting/:id`, `/asset/:id` — the same
  paths `destination.ts:50-52` sends every link to) and their create routes are
  `new/person|meeting|asset` — so on any of those six route shapes the rail,
  the More sheet and the phone bar render **zero** `aria-current` items. The
  dedicated regression test (`e2e/ux-01-daily-driver.spec.ts:24-49`) only ever
  visits a nesting module.
- **Intended behaviour.** **One rule in the one authority, not six patched
  routes.** The defect is that active-navigation semantics understand only
  path nesting; the fix teaches the authority the product's own truth — a
  record route belongs to its module's collection destination. Recommended
  shape: the navigation item (or the module manifest it is built from) carries
  the module's **route path prefixes** — data the registry already holds,
  since manifests declare their routes — and `activeNavigationHref` matches a
  pathname against a destination's own prefix set (nesting stays the default;
  a module whose record paths differ contributes them once). No per-consumer
  logic: `PrimaryNavigation`, `BottomNav` and the More sheet keep reading the
  one function. Record the rule in the file header and in
  [`APP_SHELL_AUTH.md`](../development/APP_SHELL_AUTH.md)'s navigation
  section.
- **Regression tests.** Unit: `/person/p-1`, `/meeting/m-1`, `/asset/a-1`,
  `new/person` → the module's destination is active; the longest-match rule
  still resolves nested collections; a non-destination route still returns
  `null`. E2E: extend the ux-01 journey to visit `/person/:id` and assert
  `aria-current="page"` on People in the rail, and once at phone width on the
  More-sheet path. Falsification: revert the authority and watch the new unit
  fixtures fail.

#### F. The deterministic Ask answers are reachable — closes [DEBT-227](../product/PRODUCT_DEBT.md#-debt-227--the-five-deterministic-ask-dalyhub-answers-are-hidden-behind-the-provider-gate-they-do-not-need--p3)

- **Reproduced behaviour.** The five deterministic intents
  (overdue/open/inbox counts, latest/upcoming meeting —
  `deterministic-answers.ts:20-24`) are answered server-side **before** the
  `ai_disabled` throw (`assist.tsx:163-183`), cost nothing, contact no
  provider, are advertised in Help (`help-content.ts:647`) — and the UI hides
  the entire question form behind the enabled+configured gate
  (`ai/routes/index.tsx:106-108`), so they are unreachable exactly when they
  are most valuable.
- **Intended behaviour.** Unbundle: with AI disabled or unconfigured, `/ai`
  still offers the question form scoped to the deterministic path — the
  existing `deterministic` render branch (`index.tsx:165-183`) already draws
  the "Based on DalyHub records" answer — with the calm unavailability notice
  kept for the provider-backed features beside it. The server needs **no
  change** (it already behaves correctly); this is one conditional and honest
  copy. A non-deterministic question with AI off gets the same calm
  explanation it gets today — server-side, fail-closed, unchanged.
- **Boundary.** This is not AI activation: no provider call, no key, no new
  capability — a product feature that happens to live on `/ai` stops being
  misgated. ADR-073 is untouched.
- **Regression tests.** E2E (extending `e2e/ai-assistance.spec.ts`'s off-state
  journeys): with AI off, ask "how many tasks are overdue" and assert the
  deterministic answer renders with its badge; ask a non-deterministic
  question and assert the calm refusal. Falsification: restore the gate and
  watch the first journey fail.

#### G. A Review's Start button goes where it says — closes [DEBT-228](../product/PRODUCT_DEBT.md#-debt-228--the-reviews-collection-offers-startcontinue-guide-buttons-for-review-types-the-guide-redirects-away--p3)

- **Reproduced behaviour.** `ReviewsCollection.tsx:403-417` renders
  **Start / Continue** → `/reviews/:id/guide` for every unfinished, unarchived
  Review of any type; `guide.tsx:88-91` redirects every non-weekly type to the
  record. "Start monthly review" announces itself to a screen reader and
  silently bounces — a live dead-end (`AGENTS.md` §6: no dead ends).
- **Intended behaviour.** The collection offers the guide only for the type
  that has one (`weekly` — the same predicate the record page already uses,
  `ReviewRecord.tsx:330-331`); non-weekly rows keep their ordinary open-record
  affordance. **This forecloses nothing**: when a monthly guide ships, the
  button returns with it. Guided non-weekly flows remain a deliberate later
  decision, unchanged.
- **Regression tests.** Unit/component or E2E: a seeded monthly Review shows
  no Start-guide affordance while a weekly one does; falsify by removing the
  type predicate.

#### RECALL-00 — the frame around the seven

- **Scope guard.** Nothing else rides: no search work, no Task filters, no
  Today changes, no Views feature work beyond the bound decision, no E2E-debt
  repair belonging to DEBT-215/216/219/220/221, no visual polish. Each fix is
  the smallest change that makes the path truthful, each with its
  falsification.
- **Workspace isolation.** B and C touch multi-id SQL: both get hostile-row
  tests (a matching row in a second workspace never returned), asserting the
  predicate, not inferring it from the route.
- **Privacy.** A's E2E fixture uses a synthetic Diary body
  (distinctive nonsense phrase, never real-looking prose); no test may print a
  Diary body on failure — assert on titles and structure.
- **Mobile/accessibility bar.** A/E/F/G proven at 393 px as well as desktop;
  D is itself the accessibility fix; axe clean with no rule disabled on every
  touched surface.
- **Debt.** Closes DEBT-222 … DEBT-228 (all seven raised by this programme
  definition). Nothing advanced, nothing else touched.
- **Recommended branch.** `claude/v2-7-recall-00-trust-the-paths`
- **Recommended PR title.** `V2.7 RECALL-00: trust the paths — seven measured defects, seven regression tests`
- **Delivered 2026-08-30.** All seven parts, each with its regression and its
  falsification, inside the frame — no search work, no Task filters, no Today
  feature work, no Views feature beyond the bound decision, none of
  DEBT-215/216/219/220/221 absorbed, no AI activation. The recorded decisions
  and the two in-flight findings:

  **B took the recommended answer: (b), the bound stays and is stated.** No
  cursor, no offset paging, no raised limit. `CrossViewPage` gained
  `readCount` + `saturatedScopes`, `bounded` widened to cover the page-slice
  cut (61–119 merged candidates used to truncate with `bounded` still false),
  and the surface's headline carries the Analytics-style sentence ("first 60 of
  the N records read") with per-scope saturation stated in its own notice —
  "Showing the first page" promised a page nothing could reach and is gone.
  Option (a), a keyset cursor over per-scope SQL ordering, remains available to
  a later pass without changing the contract, exactly as this item recorded.
  Bind safety is chunking (45 ids for the 2+2n anchor read, 90 for parents,
  `entities.getByIds` outright for titles — the private twin deleted), pinned
  at 7 statements and ≤100 binds per statement at the adversarial population,
  and falsified live: un-chunking the anchor helper reproduced D1's
  `too many SQL variables` failure.

  **C's batch is the contract addition the item named** — `getTasksByIds`,
  mirroring `entities.getByIds` (chunked at 90, workspace-scoped in SQL,
  missing/deleted ids absent, caller-ordered by the caller's own walk), with
  the project → goal → area chain folded into the same chunked statement so
  each view deep-equals `getTask`'s: 1 + ceil(n/90) statements, pinned at 2 for
  a 26-follow-up meeting; the task-activity loop became the `entities.getByIds`
  its comment claimed (its subject resolution pinned at 1 statement).
  `FOLLOW_UP_CAP` unchanged.

  **Two same-defect findings fixed in flight, neither a scope change.** (1)
  Today's reflection card hand-built a `/diary/<id>` href — the exact
  per-module hardcode the destination authority forbids, opening the same raw
  JSON as A's measured paths — and now consults the one map (a two-line change;
  Today gained no feature). (2) F's send-notice said records "are sent to your
  configured AI provider" — false with AI off — so the off-state renders an
  honest sentence instead: nothing is sent, the five answerable questions are
  named, the rest are declined.

  Every falsification named on the items holds: the destination map reverted
  breaks A's href/content-type/landing assertions; un-chunking breaks B (proven
  live); the reintroduced loops break C's exact statement pins; `display:none`
  restored breaks D's 820px assertions while 1024px passes; the authority
  reverted breaks E's six-shape fixtures; the form gate restored breaks F's
  journey (the old test's `toHaveCount(0)` is now the inverted assertion); the
  type predicate removed breaks G at both widths.

---

### ☑ RECALL-01 — Search reaches content — **delivered 2026-08-30**

**A phrase that exists only inside a record finds the record.**

- **User problem.**
  [DEBT-229](../product/PRODUCT_DEBT.md#-debt-229--global-search-matches-titles-and-metadata-never-content-meeting-prose-diary-bodies-task-descriptions-and-review-reflections-are-unfindable--p2--resolved-2026-08-30)
  (P2): the owner must remember *which record's title* holds a fact. What was
  said in a meeting — the exact thing MEET-01's capture bar makes effortless
  to put in — cannot be found by searching for it. The current matrix, from
  the provider SQL (title = `entities.title` everywhere):

  | Provider | Metadata matched | Body matched | Excerpt shown |
  |---|---|---|---|
  | Notes | tags | **full Markdown body + headings** | **yes — match source + SQL-cut excerpt** |
  | Tasks | checklist item titles | — (`description` unmatched) | no |
  | Meetings | location | — (`agenda_markdown`, `notes_markdown`, item `body_markdown` unmatched) | no |
  | Diary | — | — (`body` unmatched) | no (subtitle = type + occurred time) |
  | Reviews | type/period | — (section `body_markdown` unmatched) | no |
  | People | preferred name, organisation, role, email | — (notes deliberately unmatched) | no |
  | Assets | manufacturer/model/location/supplier/issuer/provider, tags | — | no |
  | Areas / Goals / Projects / Habits | (habit notes; goal/project state as subtitle) | title-level only | no |

  **The matrix as SHIPPED** (2026-08-30 — this is the row to read now; the one
  above is the measurement the item was scoped from):

  | Provider | Metadata matched | Body matched | Excerpt shown |
  |---|---|---|---|
  | Notes | tags | full Markdown body + headings | yes — `Title`/`Tag`/`Heading: …`/`Under "…"` |
  | Tasks | checklist item titles | **`task_details.description`** | **yes — `Title`/`Checklist`/`Description`** |
  | Meetings | location | **`agenda_markdown`, `notes_markdown`, `meeting_items.body_markdown` (`EXISTS` semi-join)** | **yes — `Title`/`Location`/`Agenda`/`Notes`/`Decision`·`Outcome`·`Agenda item`** |
  | Diary | — | **`diary_entry_details.body`, non-empty explicit query only** | **yes — `Title`/`Entry`** |
  | Reviews | type/period (displayed, still not matched) | **`review_sections.body_markdown`** | **yes — `Title` or the section's own name** |
  | People | preferred name, organisation, role, email | — (notes deliberately unmatched, **asserted**) | no |
  | Assets | manufacturer/model/location/supplier/issuer/provider, tags | — | no |
  | Areas / Goals / Projects / Habits | (habit notes; goal/project state as subtitle) | title-level only | no |

- **Outcome.** Meeting agenda + notes + captured items, Diary bodies (under
  the recorded privacy rule below), Task descriptions and Review section
  reflections **match**, each with an honest match-source and bounded excerpt
  — using the existing Notes mechanism, generalised. People's free-text
  `notes` stay deliberately unmatched (People privacy: structured fields only,
  unchanged). One search mechanism in the product, not two.
- **Why it belongs.** It is the largest measured gap between the product and
  its first principle, and the register's new P2. It is also DEBT-93's stated
  input: deterministic evidence retrieval improves for any later AI programme
  without an embedding in sight.
- **Dependencies.** RECALL-00-A (Diary destinations must open the Diary
  **before** Diary becomes more findable) and RECALL-00's bind-safety posture.
  FIND-01's row grammar is reused unchanged.
- **The excerpt contract — one grammar, decided here.** Notes already answer
  every question the contract needs
  (`SHARED_SEARCH.md` §Notes; `notes/search.ts:29-54`); RECALL-01 promotes it
  from a Notes convention to the shared rule:
  - **Who generates:** the repository projection, in SQL — `substr(...)`
    around `instr(...)` — so a matching 1 MiB body ships a few hundred bytes,
    never the record. Syntax stripping/normalisation by one shared helper
    (promote the notes analyser's excerpt path to a shared module rather than
    fork four copies).
  - **Where it renders:** the existing `SearchResultItem.subtitle` —
    `match source · [state] · excerpt`, bounded by the existing
    `MAX_SUBTITLE_LENGTH = 300` (`limits.ts:34`). **No shape extension, no new
    row component, no per-module visual invention.** Ranking already places
    subtitle matches below title matches (tier 4), which is the right
    relevance order for body hits.
  - **Highlighting:** presentation-side, via the existing match-range `<mark>`
    infrastructure over plain text — providers ship no HTML (unchanged rule).
  - **Multiple fields matching:** one result per record, best source wins by a
    fixed precedence (title > metadata > body), exactly as Notes' match-source
    already resolves it.
  - **Sensitive types:** what an excerpt may contain is a per-type decision
    recorded in the provider table (Diary below; People body excerpts do not
    exist because People bodies are not matched).
  - **Phone:** the excerpt lives in the existing subtitle line — one line,
    truncated by the existing row overflow rules; row height is asserted, not
    assumed.
- **The Diary privacy decision, taken and recorded** (full argument in
  ADR-114): **YES — an explicit owner query may match and return a Diary
  entry's body.** The boundary FIND-01 drew is *solicitation*, not existence:
  typed intent is a deliberate act by the authenticated owner in their private
  workspace, and Diary entries are already returned for title matches today.
  What changes is match depth, not exposure class. The guardrails: Diary
  stays **excluded from the empty-query recent list** (unchanged, with its
  standing line); a Diary result's excerpt is bounded like every other and
  shows only the window around the match; Diary bodies stay structurally
  excluded from AI evidence retrieval (ADR-073 — body-search excerpts are a
  Search-surface artefact and never an AI input); no search term or result is
  logged with content, and test fixtures use synthetic distinctive phrases
  only. The alternative — Diary findable by title but not by the prose that
  is the entry — would keep the product's most personal writing write-only,
  which is the exact failure this programme exists to end.
- **Not "build a search engine".** `LIKE` within the existing bounded-provider
  model **remains the answer at DalyHub's scale**, and the burden of proof
  stays on FTS: the candidate set is already narrowed by the workspace+type
  index before any body scan; the LIKE-pattern 50-byte bound and ASCII case
  rule are shared (`like-pattern.ts`); FTS5 would create a second, derived
  representation of canonical Markdown (refused by ADR-015's reasoning,
  recorded in ADR-054 §7) and is revisited only on *measured* single-owner
  pain. No embeddings, no vector store, no external service, no AI-generated
  results (ADR-073 §20 and ADR-112 stand).
- **Explicit non-goals.** No attachment/PDF search (no attachments exist —
  deferred whole); no second index; no ranking rewrite; no cross-workspace
  anything; no People `notes` matching; no new result row anatomy
  (DEBT-128/175 still close together elsewhere).
- **Performance budget.** Per provider: **one statement**, workspace-scoped,
  filter+order+excerpt all in SQL, no JS filtering, limit-bounded, inside the
  100-bind ceiling; statement count identical for 1 match and 50 matches
  (counting-DB proven, per provider). The body predicates extend the existing
  single statement — no provider gains a second query. Meetings add three
  body sources (`agenda_markdown`, `notes_markdown`, and `EXISTS` over
  `meeting_agenda_items.body_markdown`) inside the one statement; the items
  probe must remain a semi-join so a meeting with many matching items appears
  once.
- **Measurable acceptance criteria.**
  1. A distinctive phrase that exists **only** in a meeting's notes finds the
     meeting, end-to-end, with a match-source excerpt — likewise agenda and a
     captured decision item; likewise a Task description, a Review reflection,
     a Diary body.
  2. The same phrase in a **second workspace's** record is never returned
     (hostile-row isolation, asserted in SQL-backed tests per provider).
  3. Diary body matches appear **only** for a non-empty explicit query; the
     empty-query recent list still excludes Diary for a workspace containing
     a Diary entry whose body matches recent activity (falsified: point the
     recent read at Diary and watch the privacy test fail).
  4. Search title-only behaviour is preserved for People `notes` (a phrase
     only in a Person's notes does not match — asserted, so the privacy rule
     is a test, not an intention).
  5. Excerpts are bounded (≤ the shared display limit), stripped of Markdown
     syntax, and cut in SQL — proven by a 100 KiB-body fixture whose response
     payload stays small; no raw body in any diagnostic or failure output.
  6. Every provider keeps its one-statement proof; the E2E search journeys and
     `axe` stay green; 1440 / 393 / 320, light and dark, keyboard reach.
- **Closes.** DEBT-229. **Advances.** DEBT-93 (deterministic retrieval
  deepens; embeddings stay refused) without taking it.
- **Delivered 2026-08-30.** Six body sources match, one excerpt contract, one
  statement per provider, inside the frame — no second index, no FTS, no
  embeddings, no ranking rewrite, no new result shape, no People `notes`, and
  none of DEBT-215/216/219/220/221 absorbed. The recorded decisions:

  **The excerpt contract is a module, not a convention.**
  [`app/platform/storage/d1/search-excerpt.ts`](../../app/platform/storage/d1/search-excerpt.ts)
  owns the `substr`-around-`instr` window (400 chars), the mid-line window
  repair and the call into the one Markdown analyser; the Notes repository was
  **converted to consume it** rather than left as a fifth implementation, which
  is what keeps Notes the reference. Child bodies (Meeting items, Review
  sections) use the same three columns through correlated `LIMIT 1` sub-queries
  while the admitting predicate stays an `EXISTS` semi-join — so "one result per
  record" is structural, not a de-duplication pass.
  [`app/shared/search/subtitle.ts`](../../app/shared/search/subtitle.ts) is the
  one `match source · state · excerpt` composer, bounded at the existing
  `MAX_SUBTITLE_LENGTH`.

  **Reviews gained a projection rather than a wider `list`.** The provider used
  to call `reviews.list`, which reads every returned Review's sections in a
  SECOND statement to assemble full `Review` objects — an extra read per page
  and whole reflections shipped to a search row. `searchReviews` is one
  statement, one row per Review, deterministic on `section_id` order.

  **Match source is fixed precedence — title > metadata > body — and a title hit
  carries no excerpt at all**, because the reason it is there is already visible
  in the row. Within the body sources: Meetings read agenda → notes → first
  captured item in `(kind, position, id)` order.

  **The Diary boundary is enforced before SQL exists**: `search` returns on an
  empty query before preparing a statement, so "explicit query only" is
  structural. `RECENCY_EXCLUDED_TYPES` is untouched, and
  `test/kernel/recent-records.test.ts` now proves both halves against a Diary
  entry whose BODY matches — absent from the unbidden list, present the moment
  the phrase is typed. AI evidence retrieval needed no change and got none:
  `evidence-retrieval.ts` composes NAMED fields, so `matchSource`/`excerpt` are
  simply not read and no Diary excerpt can reach a prompt.

  **The proofs, and their falsifications.**
  `test/kernel/recall-01-search-content.test.ts` (15 tests, real D1): each of the
  six body sources found by a phrase that exists nowhere else; one result for a
  Meeting matching in all three sources and for one with ten matching items; one
  result for a Review matching in three sections; ONE statement per provider and
  identical counts for 1 vs 50 matches; hostile rows in a second workspace never
  returned, per provider; a phrase only in a Person's `notes` finds nobody while
  their name still does; and a **100 KiB body** whose match returns a ≤200-char
  syntax-free excerpt in a serialised payload under 4 KB — over 25× smaller than
  the body, asserted as lengths and booleans so no failure message can print a
  record. `e2e/recall-01-search-content.spec.ts` (10 tests) drives the real
  `/search` endpoint for the honest source, the excerpt, `<mark>` highlighting,
  the canonical destinations (including RECALL-00's Diary day+inspector), the
  two privacy boundaries, one-line subtitles at 1440/393/320, keyboard reach and
  axe in light, dark and phone.

  **Four falsifications were RUN, not described.** (1) Removing the Task
  description predicate reddens *finds a Task by its description* and three
  budget/boundary assertions with it. (2) Restoring `td.description` to the
  search projection reddens the boundary assertion with the measured number —
  `expected 110038 to be less than 1000` — which is the defect this item found
  and fixed in flight: `searchTasks` selected the whole description for a
  `TaskListItem` that has no such field, so a 100 KiB description crossed the
  wire on every matching search only to be discarded
  (`TASK_SEARCH_DETAIL_COLUMNS` drops it; the shared list columns are untouched).
  (3) Replacing Meetings' workspace predicate reddens the hostile-workspace test
  and NOTHING else — exactly one assertion, which is what makes it an isolation
  proof rather than a coincidence. (4) Dropping `diary` from
  `RECENCY_EXCLUDED_TYPES` reddens the empty-query boundary while the explicit
  query in the same test still passes — the asymmetry the privacy decision rests
  on. The duplicate-suppression assertions are live rather than separately
  falsified: removing the captured-items `EXISTS` altogether reddens eight of the
  fifteen, the ten-item single-result case among them.

  **One review finding, verified and fixed** (Codex on PR #243, P2). D1 caps a
  LIKE pattern at 50 bytes, so a longer query degrades to matching its opening
  characters — documented and intended. What was NOT intended is the statement
  disagreeing with itself: the excerpt `instr()` and the match-source
  `includes()` checks bound the WHOLE query beside a bounded `LIKE`, so an
  over-long query admitted a row by its prefix and then reported no body hit —
  a body match labelled "Title", with no excerpt and nothing to highlight.
  `likeContainsNeedle()` now returns the raw text the pattern will actually
  match on, and it is the one needle the predicate, the projection, the
  match-source checks and the analyser all share (the exact-title ranking arm
  still compares the whole query, which is the one place the full text is the
  right question). The defect was PRE-EXISTING in Notes — the reference
  implementation had it first — and fixing it there too is the same rule that
  made Notes consume the shared modules rather than remain a fifth fork.
  Falsified: making `likeContainsNeedle` the identity reddens exactly the new
  regression, which asserts a 48-byte-prefix hit is labelled `description` /
  `notes` / `body` with an excerpt across Tasks, Meetings and Diary.

---

### ☑ RECALL-02 — History answers by time — **delivered 2026-08-31**

**"What did I complete yesterday?" is a control, not an archaeology dig.**

- **User problem.**
  [DEBT-230](../product/PRODUCT_DEBT.md#-debt-230--completed-work-cannot-be-retrieved-by-completion-time-and-the-completed-views-label-promises-an-order-its-sort-does-not-deliver--p2--resolved-2026-08-31)
  (P2): no completed-date sort or window exists anywhere; the Completed view
  promises "most recent first" and delivers `updated` — edit time — so a task
  completed last week and retitled today leads the list.
- **The authority, decided.** **`spine_records.completed_at` is the one
  completion-time truth.** It is already the kernel's one completion authority
  ("done is not a status"), it survives recurrence correctly (completing a
  recurring Task spawns a successor record; the completed occurrence keeps its
  own `completed_at`), and reopen clears it while withdrawing the untouched
  successor — so a reopened Task honestly stops counting as completed. The
  Activity `task.completed` event stays the audit trail and is **not** a
  second query authority: it survives reopen, so counting from it would
  double-count. No new column, no migration, no second truth.
- **Outcome.** One `completed` sort (on the already-joined `sr.completed_at`,
  naturally descending, keyset-safe like the date sorts); one
  `completedWithin` filter dimension in the one declarative vocabulary, using
  the existing `TaskRecencyWindow` grammar (`1d`/`7d`/`30d`/`90d`) plus the
  explicit `completedFrom`/`completedTo` pair the due/planned dimensions
  already model; the Completed system view sorts by it so its label becomes
  true; "Completed yesterday" and "Completed this week" reachable from the
  Tasks controls and the command palette.
- **Owner-day boundaries.** "Yesterday" and "this week" resolve against the
  owner's timezone (the one scope-level `ownerTimeZone()` authority, AUDIT-14)
  and the owner's first-day-of-week preference — the same rule the due-state
  vocabulary already uses. `completed_at` is a UTC instant; the window
  converts the owner's local day bounds to UTC instants, and a completion at
  23:50 owner-local lands in the owner's day, asserted across a boundary
  fixture.
- **Saved views and cursors.** The dimension and sort are expressible in a
  saved view exactly as every dimension is (config is stored declaratively —
  FIND-03 proved the round trip); the keyset cursor binds
  (`completed_at`, id) like the other date sorts.
- **Analytics links the same truth.** The completed-trend panel's record links
  land on the Tasks collection in completed order with the period's window
  applied — machine-value parity (the count Analytics states equals the count
  the linked list returns for the same window), asserted by comparing values,
  not sentences.
- **Explicit non-goals.** No productivity scoring, no streaks, no weekly
  grades (ADR-110); no completion heat-map; no second completion timestamp; no
  backfill migration (history already exists in `completed_at`); no changes to
  recurrence semantics.
- **Performance budget.** The sort is one `ORDER BY` arm over the existing
  join — statement count unchanged from the collection's current reads, proven
  by the existing counting tests extended to the new sort; the window filter
  is two binds. An index decision is taken with measurement, not by default:
  the collection's existing workspace scan bounds may already carry it; if a
  `spine_records(workspace_id, completed_at)` partial index is warranted, that
  is a one-line forward-only migration recorded on the item (the programme's
  only candidate migration, and schema-only — no data moves).
- **Measurable acceptance criteria.**
  1. "What did I complete yesterday?" answerable in ≤ 2 interactions from
     anywhere (palette → completed-yesterday, or Tasks → Completed with the
     window control), proven E2E, desktop and 393 px.
  2. The Completed view's label and its delivered order agree — falsified by
     restoring `sort: "updated"` and watching a completed-then-edited fixture
     break the order assertion.
  3. A task completed at 23:50 owner-local yesterday is in "yesterday"; the
     same instant under a different owner timezone fixture is not — the
     boundary is the owner's day, asserted.
  4. Reopened tasks leave the window; a recurring task's completed occurrence
     stays in it while its successor does not.
  5. Keyset pagination across the completed sort is deterministic and
     duplicate-free across pages (real-D1, seeded past one page).
  6. Workspace isolation with hostile rows; counting-DB proofs; `axe` clean.
- **Closes.** DEBT-230.
- **Delivered 2026-08-31.** One completion-time authority, one sort, three
  filter dimensions, two named entry points, an honest Completed view and an
  Analytics link that lands on the same window — with **no migration**, no
  second timestamp, no Activity-derived completion query and nothing from
  RECALL-03 or RECALL-04 absorbed. The recorded decisions:

  **The authority is `spine_records.completed_at`, and the diff contains no
  second one.** The sort is `COALESCE(sr.completed_at, <sentinel>)` over the
  join the collection query already makes; the window is three predicates over
  the same column. The Activity `task.completed` event is asserted to SURVIVE a
  reopen in the same test that asserts the reopened Task LEAVES the window —
  which is the reason it is the audit trail and never the query authority,
  written as a test rather than as an intention.

  **The window grammar was reused, not invented.** `completedWithin` is the
  existing `TaskRecencyWindow` closed set (`1d`/`7d`/`30d`/`90d`), and
  `completedFrom`/`completedTo` are the `dueFrom`/`dueTo` shape. The visibility
  dimension `completed` keeps its own name and meaning beside them — it decides
  whether finished work is SHOWN, the window decides WHEN it was finished — so
  the parameter is `completedWithin` rather than an overload of a dimension that
  already answers a different question.

  **The never-completed sentinel flips with the direction**, exactly as the
  `parent` sort's unparented sentinel does. Reversing a completion order must
  never promote "not finished" to the head of a list of finished work, and the
  regression asserts the same single record order under `natural`, `asc` and
  `desc`.

  **"Yesterday" is the owner's day, and it is falsified.** Every bound is
  converted once by `ownerDayStartInstant` — no second timezone helper — and
  `completedTo` binds the start of the NEXT owner day so the closing day is
  whole. Substituting a naïve `T00:00:00.000Z` bound reddens three assertions:
  the 23:50-owner-local case, the `completedWithin` case, and the owner-week
  case. "This week" resolves through `planningWeekStart`, so a Sunday-start and
  a Monday-start owner asking on the same Sunday get two different weeks and
  both are right.

  **The palette command is static; the date is not — so the route redirects.**
  `/tasks/completed/:window` owns no query and no component: it resolves the
  owner's day and week start and redirects into
  `/tasks?system=completed&sort=completed&completedFrom=…&completedTo=…`. A
  *rewrite* (the `/inbox`, `/upcoming` pattern) would have kept the resolved
  window hidden; those are sidebar PLACES and this is a question, so the address
  bar ends up holding an ordinary configuration that round-trips, shares and
  saves. Two interactions, proven E2E at desktop and 393 px.

  **The Completed view's sentence changed with its sort.** "Finished work, most
  recent first" was true of neither reading; it now says *"most recently
  completed first"* and sorts by completion. The falsification the item asked
  for is asserted in both layers: the kernel regression runs the
  completed-then-edited fixture under `sort: "updated"` and asserts the
  INVERSION, and the E2E does the same in the browser — so restoring the old
  sort reddens a named test rather than merely failing to be noticed.

  **Analytics converged its LINK *and* its figure.** The "Tasks completed"
  metric linked to a bare `/tasks?system=completed` — the whole workspace's
  finished work in edit order, under a figure describing one period. It now
  carries the range's own span and the completion sort, built by one kernel
  helper asserted equal to the Tasks URL codec's own output.

  The first cut of this item stopped there and left the FIGURE counting
  Activity events, on the reasoning that HARDEN-06C (F-07) made that read
  deliberately immutable for past periods and that the Review shares it. **A
  review of this branch (Codex, P2) showed that reasoning produced a quiet
  untruth**, and it was right: a `task.completed` event outlives the state it
  recorded, so a Task completed inside the period and later REOPENED still
  counted, as did one later DELETED — and this surface's own contract is that
  *"each figure links to the records behind it so a doubted number can be
  checked"*. A card saying six opening a list of four is exactly the class of
  defect this programme removes, in two entirely ordinary lifecycle cases.
  `TaskRepository.countCompletedTasksInWindows` — ONE statement, one column per
  window over `spine_records.completed_at`, under exactly the Completed
  collection's predicate — now feeds the figure, its previous-period comparison
  and the trend line, so the card, the chart and the linked list are one
  population.

  **Projects and Goals keep `countPeriodCompletions`, and the Review is
  untouched.** Both reads are correct and they answer different questions:
  immutable "what happened that week" is right for a Review's stored snapshot
  facts, and current "what am I recorded as having finished" is right for a live,
  linkable figure — only the second has a list standing behind it as evidence.
  Converging the Review's own period facts is RECALL-04's, and nothing here
  touched it. Machine-value parity is asserted over a fixture that deliberately
  contains a reopened Task and a soft-deleted completed one, **and so is the
  divergence**: the same fixture through `countPeriodCompletions` returns
  `expected + 2`, which makes the choice of authority a test rather than a
  preference. The page's budget is unchanged at eight grouped statements —
  Projects and Goals no longer need a per-bucket call, because the trend draws
  Tasks alone.

  **One in-flight finding, fixed rather than filed.** `command-palette.spec.ts`
  asked the whole listbox for the text "Tasks" to prove a record result is
  grouped by its entity type — an assertion that was unambiguous only while no
  Tasks-module COMMAND happened to match the query, because every command row
  carries its module label in a chip with the same text. "Completed yesterday"
  and "Completed this week" legitimately match "Finish", so the loose locator
  resolved to three elements. The assertion now names the record group's own
  heading, which is what it always meant. Caused by this branch, so repaired by
  it; the claim is stronger, not weaker. **DEBT-216 is left alone**, deliberately
  and per the scope guard: the palette's stale "no create-Goal command"
  assertion is red on clean `main` (re-measured on this branch with the work
  stashed) and belongs to the truth-restoration pass that owns it.

  **The index decision is measured, and the answer is no migration.**
  `EXPLAIN QUERY PLAN` over the real generated SQL: the completed sort with no
  window plans IDENTICALLY to the `updated` baseline, and the sort WITH the
  window already flips to
  `SEARCH sr USING INDEX spine_records_workspace_kind_completed_idx (… completed_at>? AND completed_at<?)`
  — the index migration **0038** added, whose own comment predicted exactly this
  use. A `spine_records(workspace_id, completed_at)` index would be a
  near-duplicate of one already chosen, costing write amplification on every
  completion for no measured read. Statement count is unchanged from the
  baseline in all four shapes; the window costs two binds and the recency form
  one, asserted. The falsifier is recorded: a plan that ever falls back to
  scanning `entities` reopens the decision.

---

### ☑ RECALL-03 — Commitments return when due — **delivered 2026-08-31**

**A follow-up date the owner wrote down stops being write-only.**

- **User problem.**
  [DEBT-231](../product/PRODUCT_DEBT.md#-debt-231--followupon-is-stored-edited-and-exported-and-no-query-anywhere-reads-it--p2--resolved-2026-08-31)
  (P2): `followUpOn` is validated, edited, exported, restored — and no query
  in the product reads it. A delegated task's "chase this on Friday" is the
  sharpest case of the remember-for-me contract failing: an explicit, dated,
  owner-recorded commitment that only returns if the owner remembers to look.
  Beside it, [DEBT-232](../product/PRODUCT_DEBT.md#-debt-232--todaywaiting-caps-at-100-and-states-the-truncated-count-as-fact--p3--resolved-2026-08-31)
  (P3): `/today/waiting` silently caps at 100 and states the truncated count
  as fact.
- **Outcome — the smallest model that makes the date live, and no new status:**
  1. **One filter dimension.** `followUp` joins the declarative vocabulary
     (due today / overdue / within the existing window grammar / none), so
     Waiting and Delegated views — and any saved view — can ask "follow-ups
     due". Same shape as every dimension; expressible in saved views by
     construction.
  2. **One Today attention fact.** The attention rail's existing waiting row
     learns the one number that makes it actionable *today*: follow-ups due
     now (e.g. "3 waiting · 1 follow-up due today"), linking to the waiting
     surface filtered to them. One fact on an existing row — not a new card,
     not a new band.
  3. **One digest line.** The daily digest — already the product's one
     reaching-out voice for time-based facts — gains a follow-ups-due line
     beside its waiting line (`digest.ts` renderer + `digest-facts.server.ts`
     read), with the digest's existing suppression rule untouched (no
     follow-ups due, no line).
  4. **The waiting surface becomes honest.** Keyset cursor (the repository
     pattern every collection already uses) or, at minimum, the count stated
     as bounded when saturated — decided by the item; the subtitle never
     states a truncated count as fact. The deliberate no-nav-entry decision
     stands (palette + rail reach it); recorded, not relitigated.
- **The meeting lead-notice decision — taken deliberately, not omitted.** The
  question: is an upcoming Meeting with a known time an explicit enough
  commitment to justify one calm lead notice through the existing evaluator?
  The evidence: `NOTIFICATION_KINDS` is a closed set of two by recorded
  design; the **digest already states today's schedule with times** each
  morning (events line, max 3 named); Today's Now band surfaces the next
  upcoming meeting all day; both notification kinds are day-granularity while
  a lead notice is minute-granularity — a genuinely new precision class with
  its own duplicate-risk against external calendar providers' own alerts
  (CAL-01 events come from calendars that already notify). **The recommended
  recorded answer is NO for this programme**: the commitment is already
  reached to the owner twice (digest + Today), a third, intraday channel is
  the first step toward the reminder engine this product refuses, and the
  external-calendar duplicate risk is real. The item records this decision
  (or, if implementation-time evidence overturns it, records the reversal
  with the same rigour); an accidental omission is not acceptable, and this
  paragraph exists so it cannot be one.
- **Recurrence/reopen implications.** `followUpOn` lives on the task's
  delegation group; a recurrence successor inherits per the existing
  delegation-inheritance rule (assert the current behaviour in a test and
  record it — do not invent a new rule); reopen leaves it untouched (it dates
  a chase, not a completion).
- **Explicit non-goals.** No new Task status; no reminders-on-everything; no
  per-event overdue nagging (stays refused); no notification-engine rewrite;
  no snooze model; no People follow-up cadence work (DEBT-44's decision stays
  its own); no new notification kind (per the recorded decision above).
- **Performance budget.** The filter is two binds on the existing statement
  (index decision measured, as RECALL-02's); the attention fact and digest
  fact are each **one bounded count read** folded into the existing loaders'
  parallel reads (Today's 21-statement budget moves by at most 1, and the
  test that pins it is updated deliberately, never quietly); the waiting
  cursor follows the standard keyset shape.
- **Measurable acceptance criteria.**
  1. A delegated task with `followUpOn = today` appears in the follow-up
     filter, the Today attention fact and that day's digest — all three from
     one seeded fixture, values compared as machine facts.
  2. Yesterday's follow-up counts as due; tomorrow's does not; owner-timezone
     boundary asserted like RECALL-02's.
  3. Export → restore round-trips the date (already true — kept true by the
     existing tests) and the filter reads the restored value.
  4. `/today/waiting` pages past 100, or states its bound honestly — per the
     recorded decision — with the 150-task fixture proving whichever holds.
  5. Falsifications: drop `followUpOn` from the due filter and watch (1)
     fail; point the digest line at `waiting.count` and watch the
     machine-value comparison fail.
  6. Workspace isolation with hostile rows on every new predicate; counting
     proofs; 393 px; `axe` clean.
- **Closes.** DEBT-231, DEBT-232.
- **Delivered 2026-08-31.** One `followUp` dimension in the one declarative
  vocabulary, one fact on Today's existing waiting row, one suppressed digest
  line, and a Waiting surface that pages — with **no migration**, no new Task
  status, no new notification kind, no reminder engine and nothing from
  RECALL-04 absorbed. The recorded decisions:

  **One predicate, four consumers, and the diff contains no second definition.**
  `followUpStatePredicate` (`d1-task-repository.ts`) is the only place
  `task_details.follow_up_on` is compared to a day, and it is consumed by the
  collection scope, the Waiting list, the Waiting count and — through them —
  Today's rail and the digest. That is what makes the four numbers comparable as
  MACHINE VALUES rather than as implementations that happen to agree, and it is
  why the three-surface parity test can compare `filter.length`,
  `waiting.followUpDue` and `digestFacts.waiting.followUpDue` directly.

  **The vocabulary was reused, not invented.** `followUp` is shaped after
  `dueState` — a derived state over a wall-calendar date, resolved against the
  owner's day — and `followUpFrom`/`followUpTo` are the `dueFrom`/`dueTo` pair
  unchanged. Five members: `due` (the actionable union of the next two),
  `due_today`, `overdue`, `upcoming`, `none`. All three live in the ONE
  `TaskViewConfig`, are bound into the keyset cursor signature, and round-trip
  through a saved view and a shared link by construction. The control's label is
  **Follow-up** and its members read "Due to chase…", deliberately: the
  collection already has a **Due** control meaning the deadline, and two controls
  sharing one word is the ambiguity ADR-114 decision 6 forbids elsewhere in this
  programme.

  **It is a filter, and there is still no `follow_up` Task status.** Asserted in
  three layers: the control declaration offers no such status, the E2E confirms
  the status vocabulary is unchanged in the running sheet, and the kernel
  regression reads an overdue-chase Task back as an ordinary `todo`.

  **"Due" is the owner's day, and it is falsified.** `follow_up_on` is a
  `YYYY-MM-DD`, so the comparison is against `cal.today_iso` — the owner's
  calendar day, already CROSS JOINed once per query for the due and planned
  states. The same stored date and the same instant resolve differently for a
  Sydney owner and a Los Angeles owner: due for one, upcoming for the other,
  asserted through the collection, the Waiting list, the count and the digest
  read. There is no naïve UTC day and no second timezone authority.

  **The Today fact rides the row that already existed.** `AttentionItem` gained
  one optional `detailAction` — a labelled segment with its OWN destination — so
  the waiting row states "3 waiting items · oldest 4 days" and, beside it,
  "1 follow-up due" linking to `/today/waiting?followUp=due`. No new card, no
  new band, no new attention kind, and the segment is absent when nothing is due
  (the rail has no "0 waiting" row and gains no "0 follow-ups" one). The
  destination is the FILTERED surface: a count that stated a filtered number and
  opened the whole collection would be the same class of untruth as the
  truncated subtitle this item also repairs, and the regression asserts the two
  hrefs differ.

  **The digest line is its own line, and its suppression is the existing rule.**
  "2 follow-ups due" appears beside the waiting line when the count is non-zero
  and is absent otherwise — never "0 follow-ups due". It reads
  `facts.waiting.followUpDue`, the same field the rail renders; the roadmap's
  own falsification (point it at `waiting.count`) reddens four assertions in
  `digest.test.ts` and one in the kernel proof, over a fixture where the two
  numbers deliberately differ.

  **The Waiting pagination decision: KEYSET, not an honest bound.** The preferred
  answer was taken because it was straightforward, and the reason it was
  straightforward is worth recording — the ordering was ALREADY total (`e.id` is
  the final tiebreaker), and the repository, the shared `useKeysetPagination`
  hook and the shared `LoadMore` control all already existed for exactly this.
  The four-part order (overdue → longest-waiting → dated-before-undated → due
  date) is projected into ONE `char(1)`-separated comparable key, and the query
  ORDERS BY that same expression — so the resume predicate and the ordering are
  the same rule by construction rather than two rules kept in step. The 150-task
  fixture proves it: six pages at 25, every row exactly once, none omitted, the
  same order at page size 7 and at 200, and row 101 reachable. Breaking the
  tie-break reddens three assertions. A cursor is rejected under another
  workspace, another owner-day or another follow-up filter.

  **The subtitle can no longer state a bound as a total.** `waitingSubtitle` (in
  the pure view-model module, so it is unit-testable away from the route's
  `cloudflare:workers` import) counts what is LOADED and says so while more
  remain — *"Showing the first 50 waiting tasks — load more to see the rest."* —
  and states a total only once the collection is exhausted. Removing that wording
  reddens the named test. The page size moved 100 → 50 deliberately: a page is
  now the first screenful rather than the whole answer.

  **The no-navigation-entry decision stands, unrelitigated.** Waiting is still
  reached from the attention rail and the palette. One command was ADDED beside
  "Open Waiting" — "Open follow-ups due" — and it is a declarative navigation to
  the same surface under the same filter parameter, not a private query: "due"
  is resolved server-side against the owner's day, which is what lets a static
  route string mean "today".

  **Recurrence and reopen were MEASURED and pinned, not invented.**
  `follow_up_on` lives on the delegation group, and `#buildSuccessorGroup`
  already resets delegation on a recurrence successor — so the successor inherits
  no chase date and the finished occurrence keeps its own. That existing rule is
  now a regression (successor answers `none`, predecessor answers `overdue`).
  Reopen leaves `follow_up_on` untouched and the Task answers its date again;
  completion does not clear it either. Completion DOES clear waiting — the
  existing `completeTask` rule, asserted in the same test so the two facts are
  not confused.

  **Export → restore proves the commitment is LIVE again, not merely stored.**
  The round trip already carried the date; the new assertion runs the new
  dimension against the RESTORED workspace and finds it, through the collection
  filter, the count and the Waiting surface.

  **The cost is what the item budgeted.** The derived state costs **zero**
  additional binds (the owner's day is a joined column, not a fifth placeholder)
  and the explicit window costs exactly **two**; statement count is unchanged
  from the unfiltered baseline for the list and for the grouped read. The
  Waiting count is ONE bounded aggregate at two binds. Today's pinned statement
  budget moved **21 → 22** for that one read, updated deliberately with the
  reasoning recorded in `today-review-door.test.ts`, `TODAY_DASHBOARD.md` and
  here — it could not ride an existing statement, because counting follow-ups
  over the bounded waiting PAGE would understate the fact on any workspace
  holding more than 50 waiting Tasks, which is the same quiet untruth this item
  removes from the subtitle.

  **The index decision is measured, and the answer is no migration.**
  `EXPLAIN QUERY PLAN` over the real follow-up count on real D1:
  `SEARCH e USING INDEX entities_active_workspace_type_created_idx (workspace_id=? AND type=?)`
  then `SEARCH td USING INDEX sqlite_autoindex_task_details_1 (workspace_id=? AND entity_id=?)`.
  The workspace+type index narrows the candidate set and `task_details` is
  reached by its composite PRIMARY KEY, so the follow-up comparison is a
  predicate on an already-fetched row rather than a lookup of its own. A
  `task_details(workspace_id, follow_up_on)` index would buy no measured read
  while paying write amplification on every Task edit. The falsifier is recorded
  and asserted: a plan that ever degrades to `SCAN td` reopens the decision.

  **The Meeting lead-notice decision, recorded rather than omitted: NO.** Asked
  at implementation time against the same evidence ADR-114 decision 5 records —
  the digest already states today's schedule with times, Today's Now band
  surfaces the next Meeting all day, both existing kinds are day-granularity
  where a lead notice is minute-granularity, and CAL-01 events come from external
  calendars that already notify. Nothing found while implementing overturned it,
  so `NOTIFICATION_KINDS` remains the closed set of two: no `meeting_lead`, no
  countdown, no new evaluator precision. The reversal condition is unchanged —
  an owner-stated need, weighed against the same evidence, in its own decision.
  Written up in [`NOTIFICATIONS.md`](../development/NOTIFICATIONS.md#the-meeting-lead-notice-asked-and-answered-no-v27-recall-03)
  so it cannot read as an accidental omission.

  **Scope guard held.** DEBT-215/216/219/220/221 are untouched; no RECALL-04
  work, no People follow-up cadence (DEBT-44), no snooze, no generic reminders,
  no Today redesign.

---

### ☐ RECALL-04 — The day and the week account for themselves

**Cross-surface facts use one truth, and every label names the question it
answers.**

- **User problem.**
  [DEBT-233](../product/PRODUCT_DEBT.md#-debt-233--today-never-states-the-meetings-today-fact-daychips-computes-it-with-no-consumer--p3),
  [DEBT-234](../product/PRODUCT_DEBT.md#-debt-234--on-track-and-moving-carry-four-different-predicates-across-surfaces-and-a-project-with-no-health-facts-defaults-to-on-track-inside-snapshots--p2),
  [DEBT-235](../product/PRODUCT_DEBT.md#-debt-235--the-review-records-period-context-is-today-anchored-and-bounded-before-its-filter--p2):
  Today cannot state that the owner had meetings today once the last one
  starts; "On track" means four different machine predicates under one or two
  words; and a Review's period tabs render today's workspace state and
  history-wide slices under a historic period's label.
- **Outcome, in four bounded parts:**
  1. **Meetings today becomes a stated fact.** One fact, not a new card: the
     Schedule panel's heading (or its note slot) states the day's count —
     revived from the dead `dayChips` computation or recomputed from the same
     schedule read Today already holds — and remains true after the last
     meeting starts. The digest and Today then state the same fact from the
     same read, asserted as machine-value parity. `dayChips`/`dayProgress`
     either gain their consumer or leave (decided and recorded; dead exports
     carrying live names misdirect the next agent).
  2. **Every "on track" names its question.** No composite score and no
     flattening (ADR-111 decisions 6/7 are binding): measurement-status,
     alignment and movement stay separate answers. The fix is naming and
     sourcing: surfaces answering the *measurement* question (Today, `/goals`)
     agree on one predicate — including whether `achieved` counts — sourced
     from the one story/vocabulary layer (`loadGoalStories` / the shared
     goal-progress vocabulary) rather than three local derivations; surfaces
     answering the *alignment* question (Analytics, Views) stop wearing the
     measurement label — alignment-active is "Recently active"/"Moving", never
     "On track"; every bounded population states its bound the way Analytics
     already does. And the silent optimistic default dies: a Project with no
     health facts reports **unavailable**, never `"on_track"`, and snapshots
     record the absence honestly so no false transition can be manufactured
     (`review-insights-context.ts:526-527`).
  3. **The period tabs tell the period's truth.** Every period-context read is
     period-scoped **in the query** and bounded **after** the period filter
     with the bound surfaced honestly: completed tasks read by RECALL-02's
     completed window ordered by completion time (this is the dependency);
     `openTasks` either scopes to the period question it can honestly answer
     (e.g. "still open from this period's plan") or is renamed to the truth it
     shows ("Open and overdue **now**") — decided and recorded, with the
     period label and the rows beneath it describing the same time window
     either way; the "People & Meetings" tab label matches its content.
  4. **The week-account decision, taken.** Whether Today surfaces the
     completed week's account at the week boundary, or Review/Plan remain the
     deliberate homes. The evidence: STEER-05's door is strictly a door (no
     facts, by recorded design); the account exists at `/plan`'s foot and in
     the Review; `/plan`'s own header records why it is not a dashboard.
     **The recommended recorded answer: the door is enough** — Today links the
     ritual; the account lives where the ritual happens; no fourth surface.
     Recorded on the item either way, so it is a decision and not a drift.
- **Explicit non-goals.** No composite Goal score of any kind (ADR-111 d7);
  no new Review dashboard; no guided monthly/quarterly flows (their own later
  decision — RECALL-00-G already removed the dead-end); no multi-snapshot
  trend (Insight's); no Today redesign — facts land on existing rows and
  panels; Today gains no height without an equal removal.
- **Performance budget.** Part 1 is zero new reads (the schedule read exists);
  part 2 re-sources existing reads (statement counts pinned before/after —
  adopting the story layer must not add per-goal reads); part 3's reads become
  period-bounded queries (each one statement, window-bound, ≤ 50 rows after
  filtering in SQL, counted); part 4 adds nothing.
- **Measurable acceptance criteria.**
  1. With three meetings all in the past, Today states "3 meetings today" (or
     the decided wording) — and the digest, Today and the schedule agree on
     the machine value, compared as values.
  2. One machine-parity test per question: the measurement predicate read on
     Today equals `/goals`' for the same fixture; Analytics' figure is
     labelled as alignment and never uses the measurement words; falsified by
     making two surfaces use different predicates and watching the parity
     test name them.
  3. A Project with no health facts shows unavailable, and a snapshot written
     across that state produces no health transition — falsified by restoring
     the `"on_track"` default.
  4. A Review seeded across a month boundary with 60+ completions in the
     period lists the period's completions (not a priority-ordered
     history-wide slice), states its bound when it truncates, and shows no
     to-day overdue row under a historic label without the recorded renaming.
  5. All proven at 393 px; `axe` clean; light and dark.
- **Closes.** DEBT-233, DEBT-234, DEBT-235. **Depends on** RECALL-02 (the
  completed-window read).

---

## Why this sequence

**RECALL-00 first** because every later item pushes *more* traffic down these
exact paths: RECALL-01 makes Diary findable by its prose — indefensible while
the product's own link paths open that prose as raw JSON; deeper search
reaches more records whose destinations and navigation state must already be
true; and the bind-safety posture (chunk every multi-id read) is the standing
rule RECALL-01's provider work inherits. It is also the trust down-payment:
seven small proofs that the paths mean what they say.

**RECALL-01 second** — the heart of the theme and its only genuinely new
capability; independent of 02/03 and wanted by both of nothing. **RECALL-02
third** — small, kernel-clean, and RECALL-04's period truth depends on it.
**RECALL-03 fourth** — independent, but its Today/digest facts land better
after the time vocabulary exists. **RECALL-04 last** because it is the
convergence item: it consumes RECALL-02's window and closes the programme on
cross-surface truth, and a convergence item cannot precede the truths it
converges.

```
RECALL-00 ──► RECALL-01        RECALL-02 ──► RECALL-04
(paths        (content;         (time)   └──► (one truth,
 truthful)     excerpts)                       period-scoped)
                        RECALL-03 ──────────► (attention fact
                        (commitments)          beside 04's facts)
```

**Riding beside the programme, in their own PRs, not absorbed:** (1) the
**truth-restoration pass** over the five red-gate entries
(DEBT-215/216/219/220/221) — the E2E gate's recorded causes, all on other
items' surfaces; V2.6 already framed this pass and RECALL-00 must not become
it; (2) the **one-Task-anatomy pair** (DEBT-128 + DEBT-175), unchanged from
V2.5/V2.6's judgement — still the strongest bounded convergence candidate, and
RECALL-01 renders the existing search row unchanged so the fork does not
widen.

---

## LATER — real, evidenced, and deliberately not V2.7

| Deferred | Evidence | Why not now |
|---|---|---|
| **AI activation** | AI_PLATFORM §21 unchanged: no request has ever been sent; the key remains owner-held; DEBT-213's stale-registry risk stands | The V2.6 decision stands whole: AI-GATE is a **tripwire**, run the day a key exists (then DEBT-91's fact block, then the Weekly Review assistant), outside any programme. RECALL feeds it: body-search projections deepen deterministic evidence retrieval (DEBT-93) — while **body-search excerpts remain a Search-surface artefact, never AI evidence** (ADR-114 d2); Diary's AI exclusion is structural and untouched. |
| **Insight over stored history** | `listSnapshotsBefore` has zero callers; `listMeasurementSeries` idle (DEBT-212); DEBT-103's orphaned Activity endpoint | Smaller than the audit thought — single-step snapshot comparison **already ships** (corrected above). What remains is multi-Review trend + a series consumer + the what-changed surface decision: a small later programme, cheaper after RECALL-02's time vocabulary. |
| **Attachments (R2)** | DEBT-35; Assets' own gap | A decision-heavy programme of its own (storage primitive, export, backup, privacy, budgets), explicitly sequenced **before Finance**. RECALL-01 searches the textual records DalyHub already owns; PDF/attachment search is deferred with attachments themselves. |
| **Finance** | The audit's §8 sketch stands | Behind two prerequisites by its own logic: attachments, and the trust residue (DEBT-198's off-Cloudflare copy) — financial records raise the data-loss cost. The smallest-viable shape is already recorded in the audit; do not grow it. |
| **The off-Cloudflare backup** | [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2) (P2): four secrets + a public-repo security decision | Owner-held by construction; **not** a V2.7 release gate — core Recoverable is proven on the R2 tier and this programme ships no data-carrying migration. Do not reopen Recoverable; do not configure secrets from a session. |
| **DEBT-139's last clause** | One ~30-second owner UI check (identity colour persists in production) | An owner action, listed beside the owner actions; no code substitutes for it. |
| **Guided monthly/quarterly Reviews** | `guide.tsx:88-91` | Their own product decision. RECALL-00-G removes the dead-end without deciding it. |
| **The E2E truth-restoration pass** | DEBT-215/216/219/220/221, seven journeys | Rides beside (above). RECALL-00 must not become "make CI green". |
| **One Task anatomy** | DEBT-128 + DEBT-175 (P2s) | Close together in their own pass; unchanged for the third programme running. |
| **Offline slice · first-run · reporting growth · project/template capabilities · capture-processing state** | Register entries unchanged | Unchanged from V2.6's LATER, none re-litigated here. |

### Standing non-goals, carried forward unchanged

V2.3 → V2.6's lists stand and are not restated (subtasks · calendar module ·
write-back · scores/streaks/grades (ADR-110) · composite Goal score (ADR-111)
· second search index / embeddings / second tag model / second filter
vocabulary (ADR-112) · the whole list). V2.7 adds its own, from ADR-114:

- **Explicit query is the retrieval boundary, not a licence.** Content
  matching never extends to unsolicited surfaces (recent lists, previews,
  suggestions) without its own recorded decision.
- **One excerpt grammar.** No per-module excerpt shapes, lengths or renderers;
  no excerpt that could carry an entire body.
- **One completion-time truth.** `spine_records.completed_at`; Activity stays
  the audit trail; nothing stores a second completion time.
- **Commitments surface through existing channels.** One filter, one attention
  fact, one digest line — no reminder engine, no new notification kind in this
  programme.
- **A label states its question and its bound.** No word ("on track",
  "moving") may span two predicates; no bounded figure presents itself as
  complete.

---

## Dependencies

**External.** None that gate merge. The two remaining owner-held items —
DEBT-198's off-Cloudflare secrets and DEBT-139's 30-second UI check — are
recorded above and are **not** V2.7 preconditions: this programme's only
candidate migration (RECALL-02's optional index) is schema-only, and the
proven R2 backup + restore path satisfies the migration order for it.
Production deployment remains a separate, owner-gated act; **programme
completion and deployment are not conflated**, exactly as V2.6 held.

**Internal.** RECALL-00-A precedes RECALL-01's Diary work; RECALL-02 precedes
RECALL-04's period read. Every item consumes — and none modifies — the DS-08
orchestrator and registry-discovered providers, the FIND-01 recency read, the
one destination map, the declarative Task filter vocabulary and its consumers,
the keyset cursor grammar, the notification evaluator and digest renderer, the
Activity stream, and ADR-113's tag model.

**The red gate, named.** `main`'s E2E gate is red for the five recorded causes
above; unit/kernel/static are green at `0d08cd6` (post-#240). V2.7 items land
against that gate the way V2.6's did: each PR proves its own journeys green
and its partitions no redder, with the five known causes named rather than
re-diagnosed. The truth-restoration rider, not RECALL, returns the gate to
green.

---

## The acceptance boundary

Every item carries the four durable rules, verbatim:

> **A visual claim about a rendered surface is proven by a measurement of that
> surface, not by looking at it.** (DHDS-13)

> **A numerical claim about the owner's history is proven against a fixture
> whose events are known, not against whatever the workspace happens to
> hold.** (V2.4)

> **A claim that two surfaces tell the same story is proven by reading the
> same machine value from both, never by comparing sentences that happen to
> match.** (V2.5)

> **A claim that data survived a change of representation is proven by moving
> real data through the migration and reading it back.** (V2.6)

And V2.7 adds one of its own, for the layer it builds:

> **A privacy rule is proven against a workspace that contains the record the
> rule protects.** An exclusion asserted on an empty fixture proves nothing:
> every RECALL privacy claim — Diary absent from the recent list, People
> notes unmatched, no body in a payload or a diagnostic — is tested against
> seeded sensitive content (synthetic, distinctive, never realistic), and
> falsified by removing the rule and watching the test name it.

Concretely, where applicable, every item is accepted against: real seeded
data; hostile rows in a second workspace on every touched query; light and
dark; 1440 and the 320/360/375/393/430 phone widths; keyboard reach, visible
focus, accessible names; `axe` clean with no rule disabled; bounded queries
with counting-DB proofs, no N+1, inside D1's 100-bind ceiling; deterministic
tests — none skipped, weakened or quarantined to look green; and the
falsification pass: for each important rule, break it deliberately and confirm
the intended test fails (the per-item falsifications are named on the items).

---

## The debt, reconciled

Every entry this programme raises, takes, or deliberately leaves is given a
disposition here and on the entry. **This pass raised DEBT-222 … DEBT-235**
(fourteen entries, next free **DEBT-236**), issuing the numbers the
2026-08-29 audit deliberately withheld.

| Entry | Severity | Disposition |
|---|---|---|
| **DEBT-222** — Diary links open raw JSON | P2 | **Raised · RECALL-00-A** |
| **DEBT-223** — cross-view unchunked binds; result 61 unreachable | P2 | **Raised · RECALL-00-B** |
| **DEBT-224** — Meeting follow-up N+1; task-activity loop under a "one batch" comment | P2 | **Raised · RECALL-00-C** |
| **DEBT-225** — unnamed search button 768–1024 px | P2 | **Raised · RECALL-00-D** |
| **DEBT-226** — active navigation is nesting-only; singular routes lose the current item | P2 | **Raised · RECALL-00-E** |
| **DEBT-227** — deterministic Ask answers gated off in error | P3 | **Raised · RECALL-00-F** |
| **DEBT-228** — Reviews collection offers a guide the guide refuses | P3 | **Raised · RECALL-00-G** |
| **DEBT-229** — Search matches titles, never content | P2 | **Raised · RECALL-01 · ☑ CLOSED 2026-08-30** |
| **DEBT-230** — completed work not retrievable by time; Completed label vs sort | P2 | **Raised · RECALL-02 · ☑ CLOSED 2026-08-31** |
| **DEBT-231** — `followUpOn` write-only | P2 | **Raised · RECALL-03 · ☑ CLOSED 2026-08-31** |
| **DEBT-232** — `/today/waiting` bounded page presented as complete | P3 | **Raised · RECALL-03 · ☑ CLOSED 2026-08-31** |
| **DEBT-233** — no meetings-today fact; `dayChips` dead | P3 | **Raised · RECALL-04** |
| **DEBT-234** — four "on track"/"moving" predicates; optimistic health default in snapshots | P2 | **Raised · RECALL-04** |
| **DEBT-235** — period context today-anchored, bounded before its filter | P2 | **Raised · RECALL-04** |
| DEBT-215 · DEBT-216 · DEBT-219 · DEBT-220 · DEBT-221 | P2 | **Deliberately not taken** — the red gate's five recorded causes, on other items' surfaces; owned by the truth-restoration rider, per the inclusion rule RECALL-00 states. |
| DEBT-198 | P2 | **Not taken; not a gate.** Off-Cloudflare copy, owner-held by construction; recorded in LATER. |
| DEBT-139 | P1 ◐ | **Not taken.** One owner UI check remains; nothing repo-side owed. |
| DEBT-128 · DEBT-175 | P2 | **Not taken**, fourth programme running: they close together in their own pass; RECALL-01 must not widen the fork (its non-goal). |
| DEBT-203 · DEBT-205 · DEBT-173 | P2 | **Standing constraints**, repaired only by a pass whose subject they are. #230 (open) advances DEBT-173 and is recommended for rebase + merge **outside** this programme. |
| DEBT-93 | P3 | **Advanced, not taken** (recorded on the entry 2026-08-30): RECALL-01's projections reach record content, so deterministic grounding deepened for free — `evidence-retrieval.ts` itself was not touched, no Diary excerpt can reach a prompt, and embeddings stay refused (ADR-073 §20). |
| DEBT-91 · DEBT-92 · DEBT-213 | P3 | **Deferred, unchanged** — the AI sequence V2.6 fixed. |
| DEBT-212 | P3 | **Deferred to Insight** — `listMeasurementSeries`' caller question, beside the multi-snapshot trend this pass found equally idle (`listSnapshotsBefore`). |
| DEBT-102 · DEBT-188 · offline slice · DEBT-103 | P3 | **Unchanged**, per V2.6's LATER; DEBT-103's surface-or-remove decision pairs naturally with Insight, not RECALL. |

---

## Related documents

- [`ROADMAP_V2_6.md`](ROADMAP_V2_6.md) — the predecessor programme, complete 2026-08-29
- [`DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md) — the proposing audit (2026-08-29, at `b928fd4`); this file re-verified its findings at `0d08cd6` and records the corrections above
- [ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine) — this programme's decision record
- [ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable) · [ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates) — V2.6's decisions, all binding
- [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question) · [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) — the stored-judgement and derived-never-stored rules RECALL-04 works inside
- [ADR-073](../decisions/ARCHITECTURE_DECISIONS.md#adr-073-the-controlled-ai-platform--provider-independence-proposal-only-writes-application-enforced-budgets-and-an-evidence-contract) — the AI platform contract the AI boundary preserves
- [`SHARED_SEARCH.md`](../development/SHARED_SEARCH.md) — the search composition RECALL-01 extends
- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) · [`MEETINGS_MODULE.md`](../development/MEETINGS_MODULE.md) · [`DIARY_MODULE.md`](../development/DIARY_MODULE.md) · [`REVIEWS_MODULE.md`](../development/REVIEWS_MODULE.md) · [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md) · [`VIEWS_MODULE.md`](../development/VIEWS_MODULE.md) — the module authorities the items touch
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is owed, including DEBT-222 … DEBT-235
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — the first principle this theme completes
