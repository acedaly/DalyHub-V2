# DALYHUB_WHOLE_APP_REPAIR_2026_08.md — the whole-application audit repair pass

> **Date:** 2026-08-20 · **Branch:** `claude/dalyhub-whole-app-audit-repairs-w8lli1`
> **Base:** `main` @ `cd6caad` (HARDEN-06A, #204) · **Kind:** hardening implementation.
>
> The repair record for
> [`DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md`](DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md).
> Every finding in that document is accounted for below — fixed, rejected or
> deferred, each with its root cause, its implementation and the test that fails
> without it. Nothing is marked resolved because a symptom stopped appearing.
>
> This is not V2.4 and it is not another audit. It is the sequence §26 of the
> audit specified, HARDEN-06B through 06E, delivered on one branch because each
> slice is small and they share a documentation and debt reconciliation — plus
> **HARDEN-06F** and **HARDEN-06G**, the two follow-ups that repaired defects
> this pass itself introduced into F-01's fix (§2).

---

## 1. The register

| Finding | Severity | Result |
| --- | --- | --- |
| **F-01** — a Meeting's agenda and notes are blind last-write-wins | **P0** | **Fixed** — `3564050` |
| **F-02** — every archive exported before 2026-08-18 is refused by Restore | **P1** | **Fixed** — `f2f7b13` |
| **F-03** — `main` is red, 33 E2E tests have never executed | P1 | Fixed before this branch, by [HARDEN-06A](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md) |
| **F-04** — a saved-view mutation is fire-and-forget | P2 | **Fixed** — `26a11eb`, `8127c5e` |
| **F-05** — "Created/Updated within" compares an owner day against a UTC instant | P2 | **Fixed** — `4c72ff6` |
| **F-06** — editing a Meeting counts as an interaction with every attendee | P2 | **Fixed** — `26a11eb` |
| **F-07** — a closed Review period's completion count changes on a later deletion | P2 | **Fixed** — `679c274` |
| **F-08** — a Project holding cancelled or Someday work can never be archived | P2 | **Fixed** — `679c274` |
| **F-09** — checklist progress is missing on the Project's Tasks tab | P2 | **Fixed (part 1)** — `fa27c50`; part 2 (the `TaskRow` adoption) deferred as **DEBT-175** |
| **F-10** — notification settings and calendar sources leave the export silently | P2 | **Fixed (documentation half)** — `fa27c50`; the export half deferred as **DEBT-176** |
| **F-11** — `reviews-guided` Journey 2 asserts over a doubled value | P3 | Fixed before this branch, by HARDEN-06A |
| **F-12** — the Activity kernel permits a 101-bound-parameter statement | P3 | **Fixed** — `26a11eb` |
| **F-13** — a Habit cadence change fails opaquely when the owner's day moves backwards | P3 | **Fixed** — `26a11eb` |
| **F-14** — the AI's weekly-review facts group by UTC day | P3 | **Fixed** — `4c72ff6` |
| **F-15** — two load-bearing code comments are now false | P3 | **Fixed** — `fa27c50` |
| **N-01** — a Meeting's agenda or notes cannot be cleared to empty | P2 (new) | **Fixed** — `3564050` |
| **N-02** — F-01's own repair made a continuous writing session refuse its next save | P2 (new) | **Fixed** — HARDEN-06F |
| **N-03** — the version handed back was the read-back's, so a writer who got in between could be overwritten | P1 (new) | **Fixed** — HARDEN-06G |

**Counts.** P0 fixed: **1**. P1 fixed: **2** (F-02 and N-03; a third, F-03, was
already fixed on `main`). P2 fixed: **8** (F-04, F-05, F-06, F-07, F-08, F-09,
N-01, N-02), of which one — F-09 — is fixed in the half that makes the figure
correct and deferred in the half that makes the class unrepeatable. P2 fixed in
part: **1** (F-10). P3 fixed: **4** (F-12, F-13, F-14, F-15). Rejected: **0**.
Deferred: **2** halves, as DEBT-175 and DEBT-176, plus one behaviour split out
as DEBT-177. Newly discovered: **3** — N-01, fixed in the same commit as the
finding whose code path it shares, and **N-02 and N-03, both defects in F-01's
own repair**, fixed by HARDEN-06F and HARDEN-06G (§2) after automated reviews of
the two PRs found them. Counting them among the fixes rather than quietly
folding them into F-01 is the point: this pass introduced them, and the second
one — a lost update — is the very class F-01 exists to close.

Every finding was re-derived against the current tree before it was touched.
None was rejected: all thirteen still-open findings reproduced.

---

## 2. What was repaired, and why each repair is where it is

### F-01 (P0) — a Meeting's agenda and notes are blind last-write-wins

- **Root cause.** `MeetingRepository.update` had no base-version parameter, so
  the Notebook's whole-document autosave had nothing to quote and the repository
  could not refuse a stale write. This is *category: product defect* at the
  repository, not a UI defect: the editor was doing exactly what a whole-document
  editor does. The precondition REVIEW-02 added for Review sections and AUDIT-08
  added for Note content was never extended to a third module, and no test
  asserted the shape as a product-wide rule — so nothing failed when a third such
  field shipped without one.
- **Reproduced first.** Two writers, one Meeting, real D1 in the Workers runtime:
  the first writer's paragraph was gone and existed nowhere, because
  `meeting.updated` is appended with an empty payload.
- **Implementation.** `Meeting.detailsUpdatedAt` is the version token —
  deliberately distinct from `updatedAt`, which is the LATER of the entity's and
  the detail row's timestamps and therefore a derived display value.
  `UpdateMeetingInput.expectedUpdatedAt` folds `AND updated_at = ?` into BOTH
  domain statements: the title lives in `entities` and the rest in
  `meeting_details`, and a refused save must change neither, so the entities
  statement is ordered first and carries an `EXISTS` on the pre-write detail
  version. A stale write raises `MeetingConflictError`; the route answers `409`
  with the newer stored text; `MeetingMarkdown` quotes its base, passes
  `serverValue`, and routes the refusal into the shared `RemoteChangeBanner`.
  The Activity append was already guarded on the detail statement's `changes()`,
  so a refused write appends nothing.
- **One deliberate exception.** The phone capture bar APPENDS a line, which is the
  one whole-document write with a deterministic safe merge. It quotes its base
  and, on refusal, re-appends onto the newer text and retries once — merging
  where it can, refusing where it cannot.
- **Files.** `app/kernel/meetings/{meeting,meeting-repository,meeting-validation}.ts`,
  `app/platform/storage/d1/d1-meeting-repository.ts`,
  `app/modules/meetings/{MeetingMarkdown.tsx,meeting-view.ts,routes/mutate.tsx,routes/detail.tsx}`.
- **Tests.** `test/kernel/meeting-content-concurrency.test.ts` — ten cases over
  real D1 AND the real route (stale save refused; the title untouched by a
  refused save; recovery after refresh; identical content still idempotent; an
  unquoted patch unchanged; the `409` body, which never echoes the draft; an
  unparseable version refused with `400` rather than degraded; the version moving
  on every write). Four fail with the guard removed.
  `e2e/meetings-concurrency.spec.ts` — the browser halves: a same-origin second
  writer, a SECOND REAL BROWSER CONTEXT with its own editor, the banner, both
  versions intact, and both recoveries.
- **Migration.** None. `meeting_details.updated_at` already existed.
- **Product Debt.** Closes the escalated half of **DEBT-47** and its closing
  condition (the Meeting notes field now passes `serverValue`). Raises
  **DEBT-174** for what is still not true: the contract is followed by three
  modules and REQUIRED of none.

### N-01 (P2, newly discovered) — a Meeting's documents could not be cleared

- **Root cause.** `meetings/routes/mutate.tsx` coerced every field with
  `String(f.get(k)) || null`, and the repository's merge reads `null` as "not
  supplied". So selecting all, deleting and saving reported success and changed
  nothing; the old text returned on the next reload. Found while reproducing F-01,
  in the same three lines.
- **Implementation.** The two authored-document fields are copied verbatim,
  including the empty string. The coercion is right for a field with a meaningful
  "unset" (a location, a link) and wrong for a document.
- **Tests.** A route-level case in the kernel suite and a browser journey in
  `e2e/meetings-concurrency.spec.ts`.

### F-02 (P1) — Restore refused every archive older than two days

- **Root cause.** TASKS-13 added `taskChecklistItems` to
  `SNAPSHOT_COLLECTION_ORDER` and to both D1 repositories but not to
  `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, whose own comment says to add to it in
  the same change. *Category: product defect (a reader), not a data defect* —
  the archives are fine. Every export written between HARDEN-01 (when
  `schemaVersion` became 2) and TASKS-13 declares the current version, passes the
  version gate, and is then refused as structurally invalid. The owner is told
  their backup is malformed.
- **Implementation.** One list entry — and then the omission made unrepeatable.
  The back-compatibility contract is now an INVARIANT over the collection list
  rather than two hard-coded collection names: every collection must be either
  opted in as optional-on-read or listed as `REQUIRED_SINCE_SCHEMA_VERSION_2` (a
  deliberate decision to refuse existing archives, which would have to bump the
  schema version).
- **Files.** `app/kernel/export/workspace-snapshot.ts`.
- **Tests.** `test/unit/export/snapshot-validation.test.ts` — the classification
  invariant, one case per collection, and an archive missing every optional
  collection at once. `test/kernel/workspace-restore.test.ts` drives the WHOLE
  reader: a genuine ZIP with recomputed checksums through `prepareRestore`,
  because the validator is where it failed and not what the owner does. It fails
  with the list entry removed.
- **Migration.** None — a reader change.

### F-04 (P2) — a saved-view mutation was fire-and-forget

- **Root cause.** One consumer defeating a shared primitive's contract:
  `SavedViewSwitcher` submitted through a bare, un-awaited `fetcher.submit` and
  both callers closed their own UI on the next line. The `ConfirmationDialog`'s
  single-flight phase, its `busyLabel` and its inline error could therefore never
  engage, and a document navigation destroyed the in-flight fetcher. Every other
  `ConfirmationDialog` consumer in the repository awaits its action.
- **Implementation.** One awaited `post` that resolves with the server's answer,
  in the shape `ProjectTemplateRecord` uses. `onConfirm` throws on refusal so the
  dialog stays open with the reason; the naming form stays open for the same
  reason, with the owner's typing still in it.
- **Files.** `app/shared/saved-views/SavedViewSwitcher.tsx`.
- **Tests.** Three component cases in `test/unit/tasks/TasksViewSwitcher.test.tsx`
  (a held POST keeping the dialog up and busy; a refusal shown in the dialog's
  own alert; the naming form surviving a refusal), plus a held-POST browser probe
  in `e2e/plan-smart-lists.spec.ts` — the same journey that caught it by
  accident, now asserting the property instead of sampling it.
- **CI.** This was p08's failure on run `32321840125`.

### F-05 (P2) and F-14 (P3) — an owner-calendar day compared against a UTC instant

- **Root cause.** One seam in five places. `todayIso` is the OWNER's calendar day
  and `created_at` / `updated_at` / `completed_at` are UTC instants, and the code
  bridged them by concatenating `T00:00:00.000Z` — with a comment describing
  that as the design. *Category: data-model defect at a module seam.*
- **Implementation.** `ownerDayStartInstant(dayIso, timeZone)` names the
  conversion once, with an explicit answer for the zones that skip midnight on a
  DST transition (walk forward to the first hour that exists — never degrade to
  UTC midnight, which is the bug). `ListWorkspaceTasksInput` and
  `ListWorkspaceTaskGroupsInput` now require `timezone`;
  `CrossViewQueryContext` gained `dayStartInstantOf`, the inverse of the
  `calendarIsoOf` it already carried, so X-02's rule holds — no second definition
  of "today" and no timezone logic inside SQL. The AI's weekly-review facts, the
  deterministic Meeting answer and every cited date in evidence retrieval now use
  the owner's day too.
- **Files.** `app/shared/datetime/index.ts`, `app/kernel/tasks/task.ts`,
  `app/kernel/views/view-query.ts`, `d1-task-repository.ts`,
  `d1-cross-view-query-repository.ts`, `app/modules/ai/review-facts.ts`,
  `app/platform/ai/{deterministic-answers,evidence-retrieval}.ts`, and the
  ~20 call sites that now pass the zone beside the day.
- **Tests.** `test/kernel/task-recency-timezone.test.ts` — the boundary in BOTH
  offset directions (Australia/Sydney and America/Los_Angeles), for
  `createdWithin` and `updatedWithin`, on both repositories. Five of the seven
  fail with the conversion removed.
- **Index use is unchanged** — still one bound instant compared with `>=`.
- **Deliberately NOT changed.** `goal-alignment.ts:recentWindowStartIso` uses the
  same construction and documents it as an approximation on a 14-day supporting
  count that cannot flip a classification. That is an honest recorded trade, and
  the audit says so.

### F-07 (P2) — a closed Review period's count moved

- **Root cause.** A reasonable per-query choice (`AND e.deleted_at IS NULL`)
  colliding with a documented guarantee one layer up. *Category: cross-module
  projection drift* — nobody owned the seam. `analytics.ts` and REVIEW-03 both
  state that completions are exact for any past range, and that exactness is the
  stated reason REVIEW-03 does not snapshot movement.
- **Product decision taken, and why.** The audit offered two defensible answers.
  The stronger one is taken: **the count is of EVENTS**, because the event is the
  fact and the record's later fate is a different question. The `entities` join
  REMAINS — its `e.type` is what stops a `project.completed` that also names its
  Area being counted as an Area completion — and only the liveness predicate is
  gone. A soft-deleted record keeps its `entities` row, and the one path that
  removes the row (an empty Area's permanent deletion) removes its
  `activity_subjects` in the same batch, so a record with no row has no events
  either. `listPeriodContributions` deliberately keeps its predicate: it groups
  by living ancestry, which a deleted record does not have.
- **Tests.** `test/kernel/review-insights.test.ts` — a completed Task deleted
  three weeks later leaves the closed period's figure unchanged. Fails with the
  predicate restored.
- **Product Debt.** The audit proposed a debt entry "if the state-it answer is
  taken". It was not, so none is raised.

### F-08 (P2) — a Project holding cancelled or Someday work could never be archived

- **Root cause.** The archive guard asked `completed_at IS NULL` and nothing
  else, while `listCarryOverTasks`, the overdue rule and `countOverdueAtPeriodEnd`
  all exclude `cancelled` and `someday` for the reason recorded there. The guard
  predates that vocabulary being treated as "not outstanding" and was never
  reconciled with it — so a Project whose leftover work was CANCELLED, DalyHub's
  documented way to remove a Task (ADR-053 §8), could not be archived at all.
- **Implementation.** The two predicates the rest of the product already uses,
  and a refusal that names what actually blocks it: *"This project still has open
  tasks. Complete, cancel or move them before archiving it."*
- **Tests.** Archive succeeding with a cancelled child and with a Someday child,
  still refusing with an open one. `collection-cards.test.ts` asserted the
  refusal by its WORDING and now asserts `ProjectArchiveBlockedError`, which is
  what it was about.

### F-06 (P2) — editing a Meeting counted as contact with every attendee

- **Root cause.** `INTERACTION_ACTIVITY_TYPES` reasoned about the Person's own
  record and stopped there. *Category: product-rule defect.*
- **Product decision taken.** The audit's first option, which it calls closer to
  the module's stated intent: `meeting.updated`, `diary_entry.updated` and
  `note.content_updated` leave the vocabulary. The rule is now written down once
  — *a record's CREATION and the product's explicit contact and commitment events
  are the moments; editing a record afterwards is maintenance.* Nothing an owner
  genuinely did with a person became invisible; only the autosaves did.
- **Consequence, stated plainly.** "Total interactions" will read LOWER than it
  did in workspaces with edited meetings. The previous number was wrong.
- **Tests.** Ten autosaves of one meeting counting as one interaction; a
  six-month-old meeting's title correction not moving `lastInteractionAt`. Both
  fail with `meeting.updated` restored.

### F-09 (P2) — checklist progress missing on the Project's Tasks tab

- **Root cause.** `TaskRowProjection` makes `checklist` optional "so a surface
  that does not project it pays nothing for it" — a sound performance contract
  and an unsound consistency one, because it makes the absence invisible.
- **Implementation (part 1, done).** Both Project task loaders read the same ONE
  bounded aggregate the other surfaces read, guarded on its own so a figure that
  cannot be read costs the figure and never the page; the row draws it through
  the shared `checklistProgressLabel` wording.
- **Implementation (part 2, deferred).** Adopting the shared `TaskRow` in
  `ProjectTasksTab` is what makes the class unrepeatable rather than merely
  fixed. It is a real UI change, the audit says it should be split out, and it is
  **DEBT-175**.
- **Tests.** `test/kernel/task-checklist-cross-surface.test.ts` drives the REAL
  loaders — `/tasks` flat, `/tasks` grouped, the Project record and the Project's
  paged task read — and asserts one Task serves one figure everywhere. Fails with
  either projection removed. Plus the row's own rendering and the absence rule.

### F-10 (P2) — notification and calendar omissions were silent

- **Root cause.** Three groups of tables absent from the snapshot and named
  nowhere, against a contract that promises an omission "is reported in
  `limitations` and in the manifest, never silently".
- **Implementation (the documentation half, done).** Three entries in
  `EXPORT_EXCLUSIONS`, each with its own reason — a credential in the row, an
  operational ledger, a sealed feed URL — and a section in
  `EXPORT_AND_PORTABILITY.md` beside the AI-platform precedent it follows. The
  sentences say what a restored workspace comes back WITHOUT, which is what an
  owner needs.
- **Implementation (the export half, deferred).** Exporting the NON-SECRET half
  by COLUMN rather than omitting it by TABLE is the better answer and is a
  snapshot-schema change. **DEBT-176.**
- **Tests.** `test/unit/export/archives.test.ts` asserts the three subjects are
  named and that the sentences say what the owner loses.

### F-12 (P3, latent) — a 101-bound-parameter statement

- **Root cause.** `MAX_ACTIVITY_PAGE_SIZE` is 100 and the subject read bound
  `workspace_id` plus one id per row, against D1's ceiling of exactly 100. Not
  reachable from product code today (every caller passes 30 or fewer), but a
  limit the validator ACCEPTS must not be a limit the storage refuses — the same
  trap TASKS-13 fell into at 100 checklist ids.
- **Implementation.** Chunked at 90, the constant `d1-entity-repository.ts`
  already uses, so the page size stays a product decision rather than being
  quietly lowered to suit a storage limit.
- **Tests.** A full page at the kernel's own maximum, against real D1. Fails
  unchunked with D1's own `too many SQL variables`.

### F-13 (P3) — a Habit cadence change failed opaquely

- **Root cause.** The change closed the version in force at `todayIso − 1`, which
  the schema's `habit_schedules_ordered` CHECK correctly refuses when the owner's
  calendar day has moved BACKWARDS (a westward timezone-preference change, or
  travel). *Category: application error-handling defect, not a data one* — the
  database was doing its job and the chain could not be corrupted. The owner saw
  "A habit storage error occurred." and could not change that Habit at all until
  their local date caught up.
- **Implementation.** A version that has not begun for the owner yet is AMENDED
  in place, rewriting no history.
- **Tests.** A Sydney-created Habit whose owner changes their zone to Los Angeles
  at the same instant. Fails with the `>=` narrowed back to `===`.

### F-15 (P3) — two false load-bearing comments

- `week-strip.ts` asserted "DalyHub has no first-day-of-week setting" (it has had
  one since before PLAN-01, and three surfaces resolve their week through it),
  which made DEBT-152 / DEBT-154 read as a settled decision rather than an
  outstanding one. Corrected to say what it actually is.
- `e2e/helpers.ts` still named Today among the surfaces that had not adopted the
  shared row; TODAY-TASK-01 adopted it. The Project's task list is now the only
  one left, and the comment says so and points at DEBT-175.

### HARDEN-06F — the follow-up F-01's own repair needed

Raised by an automated review of the merged PR, confirmed here, and fixed on the
same terms as everything above: reproduce first, then repair, then a test that
fails without it.

- **Root cause.** `useAutosaveField` coalesces edits made while a save is in
  flight and dispatches the coalesced draft the INSTANT that save resolves —
  before `onSaved()`'s revalidation can land. The Meetings mutation route
  answered a bare `{ ok: true }`, so the editor had no way to learn the version
  its own write had just produced. Its next save therefore quoted a base the
  server had already moved past and came back `409`: **"Changed elsewhere" for a
  change the same editor made, on the one device the owner was sitting at.**
  Typing without pausing is the ordinary case, so F-01's repair made the
  single-writer path worse while fixing the multi-writer one.
- **Where it came from.** `NoteContentForm` had this right and says why in as
  many words — *"keep quoting a current base so a long writing session does not
  conflict with its own previous save"*. F-01 copied the conflict half of the
  Notes precedent and not the success half. That is the audit's own theme
  arriving inside its repair.
- **Implementation.** The route returns `detailsUpdatedAt` on success
  (`MeetingUpdateResponse`), and the editor advances its base from it — forward
  only, so a revalidation landing later cannot restore a base already written
  past.
- **Tests.** A route case in `meeting-content-concurrency.test.ts` (a second
  save quoting the version the FIRST response returned succeeds) and a browser
  journey, *"a continuous writing session never REFUSES its own next save"*,
  which HOLDS the first POST so the typed-through-the-save window is a fact
  rather than a race. Both fail with the advance removed.
- **What was attempted and reverted, deliberately.** A further refinement —
  suppressing a loader value that is not strictly newer than the version the
  editor has written past — looked right and was wrong: after the owner adopts a
  remote version, the editor's own last-written text is stale, so the guard
  handed back pre-adoption text and reverted what they had just adopted. The
  two-writer journey caught it immediately and it was reverted rather than
  patched. What remains is a cosmetic banner on a lagging revalidation, it
  affects the Note body identically, it loses nothing, and it is **DEBT-177**
  with the failed approach recorded in the entry so the next attempt does not
  repeat it.

### HARDEN-06G — the version F-01's repair handed back could be somebody else's

Raised by an automated review of the HARDEN-06F PR, reproduced here before it
was touched, and the most serious thing this pass found in its own work: it is a
**lost update**, the exact class F-01 exists to close, reintroduced by the answer
to it.

- **Root cause.** `update()` commits its compare-and-set in a `batch()` and then
  reads the meeting back in a SEPARATE statement. A second writer that commits
  between the two is read as though it were us, and HARDEN-06F handed that
  version to the editor as its new base. The editor then advanced past a
  document it had never seen; its next compare-and-set matched, and the other
  writer's paragraphs were replaced with no conflict, no banner and no trace.
  Reaching it needs only the ordinary case — typing straight through a save
  while a second tab saves once.
- **Why the read-back is not the version.** They are two different facts. The
  read-back is *the current stored state*, which is what a caller wanting the
  meeting should get. The base an editor may quote next is *the version this
  write produced*, which only this call knows. `update()` now returns both:
  `meeting` unchanged in meaning, and a separate `version` — the timestamp the
  write itself wrote. When another writer got in between, the two differ, the
  next save is refused as the conflict it genuinely is, and the owner is offered
  both versions.
- **Implementation.** `MeetingRepository.update` returns
  `{ meeting, changed, version }`; the D1 adapter returns its own `ts` on the
  written path and the observed version on the two no-op paths (nothing was
  written, so the stored version IS the right base). The route answers with
  `saved.version`.
- **Test.** `meeting-content-concurrency.test.ts` — *"refuses the next save
  instead of overwriting the writer who got in between"*. The interleave is
  **injected, not raced**: the D1 handle the first writer uses runs the second
  writer's entire save at the moment the read-back begins, so the window is a
  fact rather than a timing accident, and the second writer quotes the first
  writer's committed version — a legitimate next-in-line save, not a race.
  Proven both ways: with the read-back's version returned instead, the test
  fails on the version assertion, and with that assertion removed it fails on
  the consequence — the second writer's paragraph is destroyed.

---

## 3. Rejected findings

**None.** Every one of the thirteen findings still open when this branch started
was reproduced on the current tree before it was touched. F-03 and F-11 were
already fixed by HARDEN-06A and are recorded as such rather than re-attempted.

---

## 4. Deferred findings

| Deferred | Why | Recorded as |
| --- | --- | --- |
| F-09 part 2 — adopt the shared `TaskRow` in `ProjectTasksTab` | A real UI change to the last forked surface. The audit says to split it out; bundling a row redesign into a correctness pass is how a hardening branch stops being reviewable. The FIGURE is correct today either way. | **DEBT-175** (P2) |
| F-10's export half — export the non-secret notification and calendar configuration by column | A snapshot-schema change with restore consequences, and the same judgement DEBT-94 records for AI preferences. The silence — which was the defect — is closed. | **DEBT-176** (P3) |
| The product-wide base-version RULE | F-01 makes Meetings the third module to carry the contract. Nothing yet REQUIRES a fourth to. | **DEBT-174** (P2) |

---

## 5. Newly-discovered defects

| New | Severity | Disposition |
| --- | --- | --- |
| **N-01** — a Meeting's agenda or notes cannot be cleared to empty; the save reports success and changes nothing | P2 | **Fixed in this branch**, in the same commit as F-01 — it is the same three lines of the same route, and leaving it would have meant shipping a known "accepted and did not happen" defect in a pass whose subject is exactly that. |
| **N-02** — F-01's repair made a continuous writing session refuse its own next save with a `409` | P2 | **Fixed by HARDEN-06F** (§2). Found by an automated review of the merged PR, not by this pass's own tests — which is worth recording: every journey written for F-01 made ONE save per editor, and the defect needs two. |
| **N-03** — the version returned on success was the read-back's, so an editor could advance past a document it never saw and overwrite the writer who got in between | **P1** | **Fixed by HARDEN-06G** (§2). Found by an automated review of the HARDEN-06F PR. A **lost update** — the class F-01 exists to close — reachable through F-01's own repair, and again not caught by this pass's own tests: reproducing it needs a writer to commit inside the window between the batch and the read-back, which no journey could produce by timing alone. The regression test injects that window rather than racing for it. |

No other new defect was found. Two near-misses were checked and are NOT defects:
`goal-alignment.ts`'s UTC window (documented as an approximation on a count that
cannot flip a classification) and the offline mutation queue's field vocabulary
(Tasks-only, and untouched by anything here).

---

## 6. Scope deliberately not changed

- **No migration.** Every precondition added is over a column that already
  existed. The latest migration is still `0047_task_recurrence_advanced.sql`.
- **No persisted model change**, no new table, no new column.
- **No offline operation added or changed.** The mutation queue is Tasks-only and
  is untouched; Meetings remain read-only offline.
- **No public route added or removed.** `PUBLIC_PATHS` is unchanged.
- **No dependency added or removed.**
- **No revision history, no CRDT, no automatic prose merge** — ADR-064's position
  is unchanged and F-01 copies it rather than reopening it.
- **No redesign of the Project record**, no new `TaskRow` variant, no change to
  what "overdue" means, no history table for due dates or spine links.
- **DEBT-159** (the filter-chip removal race) is untouched. Its own entry explains
  why rewriting the chip row as imperative writes is a worse trade, and the audit
  agrees.

---

## 7. Product Debt reconciliation

| Entry | Change |
| --- | --- |
| **DEBT-47** | **☑ RESOLVED.** Its closing condition — "the Meeting notes field passes `serverValue`" — is met, and the escalation it carried (the unadopted half destroying text) is closed at the repository as well as in the editor. |
| **DEBT-174** | **NEW, P2.** A whole-document autosaving field is not REQUIRED to carry a base version — the contract is per-module, not product-wide. Three modules follow it; nothing makes a fourth. |
| **DEBT-175** | **NEW, P2.** The Project record's Tasks tab is the last surface that does not render the shared `TaskRow`. |
| **DEBT-176** | **NEW, P3.** The non-secret half of notification settings and calendar sources is omitted from the export by TABLE rather than by COLUMN. |
| **DEBT-152 / DEBT-154** | Unchanged in substance; the comment that made them read as settled is corrected (F-15). |
| **DEBT-157** | Unchanged by this branch — HARDEN-06A closed its mechanism half and it is held open for its confirming run. |
| **DEBT-159**, **DEBT-160**, **DEBT-161**, **DEBT-162**…**DEBT-173** | Re-read; all still accurate as written. None is closed by anything here. |

Nothing is marked resolved on the strength of a symptom disappearing. DEBT-47 is
closed because its stated closing condition is met and the evidence is cited in
the entry.

---

## 8. Architecture

- **ADR-108** was added: the three product-wide rules this pass turns from
  per-module conventions into rules (a base version on every whole-document
  write; an owner day that never travels without its zone; maintenance that is
  not contact). One ADR rather than three, because the three findings share one
  cause — *a correct fix made in one module never became a rule* — and that is
  the thing worth remembering.
- **Kernel contracts changed:** `Meeting` gains `detailsUpdatedAt`;
  `UpdateMeetingInput` gains `expectedUpdatedAt`; `MeetingRepository.update`
  returns a `version` — the version THAT write produced, which is a different
  fact from the version its read-back observed (HARDEN-06G); `ListWorkspaceTasksInput` and
  `ListWorkspaceTaskGroupsInput` gain a REQUIRED `timezone`;
  `CrossViewQueryContext` gains `dayStartInstantOf`; `MeetingConflictError` is a
  new typed error.
- **No migration, no dependency, no public route, no persisted model and no
  offline operation changed.**

---

## 9. Related documents

- [`DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md`](DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md) — the audit this repairs
- [`HARDEN_06A_FINISHING_E2E_GATE_2026_08.md`](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md) — F-03 and F-11, fixed before this branch
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — the register reconciled in §7
- [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) — ADR-108
- [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) — F-02 and F-10
- [`MEETINGS_MODULE.md`](../development/MEETINGS_MODULE.md) · [`NOTES_PERSISTENCE.md`](../development/NOTES_PERSISTENCE.md) — F-01 and the precedent it copies
- [`RELATIONSHIPS.md`](../development/RELATIONSHIPS.md) — F-06
