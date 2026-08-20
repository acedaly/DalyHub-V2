# DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md — Whole-application bug search & product-integrity audit

> **Date:** 2026-08-20 · **Base:** `main` @ `f031e0ee09300371fc19857fc38f7c166289185a`
> (TASKS-12, #202 — the last V2.3 item) · **Kind:** investigation and audit. **No product
> code, test, migration or fixture was changed.** Every instrumentation file written to
> prove a finding was removed before this document was committed. The commit carries
> three files: this document, its row in [`docs/README.md`](../README.md), and two
> traceable re-ratings in [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) (DEBT-47 and DEBT-157 —
> the two entries §23 found no longer accurate). No new debt entry was written; §24
> proposes them for the PRs that will do the work.
>
> This is a *diagnosis*, deliberately not a fix. §26–§27 propose the repair sequence.

---

## 1. Executive assessment

DalyHub is a genuinely well-built product. The kernel is small and honest, the
architecture rules are enforced rather than merely written down, the token layer and
its contrast contract are proved exhaustively, workspace isolation and CSRF are
handled at ONE boundary, and the offline mutation queue has a real, tested conflict
contract. 6,134 unit tests and 2,811 real-D1 kernel tests pass with nothing skipped,
and eight of ten E2E partitions run to completion green.

It is also, right now, **red on `main`, with a data-loss path in Meetings and a
broken recovery path in Restore** — and the three most serious findings in this
audit are all of the same shape the brief predicted:

> *Each module works in isolation, but their assumptions no longer agree.*

- **Meetings never received the concurrency fix Notes and Reviews did.** AUDIT-08
  escalated "an editor does not adopt a change" to "an editor DESTROYS one" and was
  fixed at the Notes repository (compare-and-set) and the Review repository
  (`expectedUpdatedAt`). `MeetingRepository.update` still has neither, and the
  Meeting agenda/notes editor autosaves the WHOLE document. Two writers, one
  meeting: the first writer's paragraphs are gone and exist nowhere, because
  `meeting.updated` carries an empty Activity payload. **Reproduced.**
- **TASKS-13 added a required snapshot collection without adding it to the
  older-archive opt-in list.** Every workspace archive an owner exported between
  2026-08-11 and 2026-08-18 declares the current `schemaVersion: 2`, passes the
  version gate, and is then refused by the validator as structurally invalid.
  "The normal recovery path is the DalyHub backup" is currently broken for every
  archive older than two days. **Reproduced.**
- **CI has never been green on `main` since TASKS-12 merged.** Partition p05 hit
  Playwright's 25-minute `globalTimeout`: **33 of its 245 tests never executed**,
  and partition p08 failed on a real product defect. The partition manifest carries
  **no measurement at all for ten of its 111 spec files** — including
  `tasks-dependencies.spec.ts`, estimated at the 120 s default and actually costing
  **324 s**. DEBT-157 predicted exactly this and it has now happened.

Beneath those, the recurring theme is **date/instant confusion at module seams**
(the Tasks and Views "created/updated within" filters compare an owner-local
calendar day against a UTC instant) and **projections that agree about the record
but not about what counts** (a meeting edit is an "interaction" with every attendee;
a deleted Task retroactively lowers a closed Review's completion count).

Nothing found is a security or workspace-isolation failure. Nothing found corrupts
the database. The strongest parts of the product survived deliberate attack
untouched (§ "Strongest parts", below).

---

## 2. Repository and baseline state

| | |
| --- | --- |
| Branch audited | `main`, fast-forwarded to `origin/main`, working tree clean |
| Commit | `f031e0ee09300371fc19857fc38f7c166289185a` |
| Head of history | `f031e0e TASKS-12: widen the recurrence vocabulary and add Task dependencies (#202)` |
| TASKS-12 present | yes — ROADMAP_V2_3 marks it ☑ DELIVERED 2026-08-19 |
| V2.3 roadmap status | every item ☑ (PLAN-01, SMART-01, HABITS-01, V2.3-GATE-01, TASKS-13, UX-02, PROJECT-02, TASKS-12); **NEXT: nothing** |
| Latest migration | `0047_task_recurrence_advanced.sql` (49 files; the recorded `0013` and `0039` collisions are grandfathered by exact filename and re-checked by `test/unit/migrations/migration-numbering.test.ts`) |
| Latest ADR | **ADR-107** (102 ADRs) |
| Latest Product Debt | **DEBT-172**; next free **DEBT-173** |
| CI state on `main` | **RED.** Run `32321840125` — `CI Gate` **failure** |

### CI run 32321840125 (`main` @ `f031e0ee`), as it finished

| Job | Result |
| --- | --- |
| Scope, Static, Unit, Build | success |
| E2E p01, p02, p03, p04, p06, p07, p09, p10 | success |
| **E2E p05** | **failure — DID NOT COMPLETE.** 245 collected · 212 executed · **33 NEVER EXECUTED** · 1 failed · 25.0 min against a 19.4 min budget |
| **E2E p08** | **failure.** 123 collected · 123 executed · 1 failed |
| **CI Gate** | **failure** |

### Local gates, this commit, from a clean install

```
pnpm install --frozen-lockfile          ok
pnpm run format:check                   exit 0
pnpm run lint                           exit 0
pnpm run typecheck                      exit 0
pnpm run scheme:check                   exit 0
pnpm run icons:check                    exit 0
pnpm run e2e:partitions:check           exit 0
pnpm run test:unit                      exit 0   — 434 files, 6134 tests, 0 failed (181 s)
pnpm run test:kernel                    exit 0   — 175 files, 2811 tests, 0 failed (435 s)
pnpm run build                          exit 0   — built in 5.02 s
```

The full local `pnpm run e2e:gate` was **started and abandoned**: on this 4-core
sandbox it ran at roughly 7× CI wall-clock (21 tests in ~15 minutes of p01), which
extrapolates past 19 hours. The authoritative E2E baseline in this audit is
therefore **CI run 32321840125 itself**, which is the repository's own authoritative
mechanism and had already executed nine partitions to completion. Targeted local
Playwright runs were used to reproduce specific failures (§4, §5) and targeted
real-D1 kernel probes to reproduce the rest.

Console/server observations during the local runs: no unexplained console errors,
no D1 errors, no browser crashes, no 5xx. `vitest run` prints a burst of
`ECONNREFUSED 127.0.0.1:3000` / `socket hang up` lines during the unit suite — these
come from a suite deliberately exercising a failing fetch and are not errors.

---

## 3. Overall release confidence

**6.5 / 10.**

Not lower, because: the kernel is genuinely trustworthy, isolation and CSRF are
right, the offline queue is well-designed and proven, the design-token contract is
verified exhaustively in both appearances, and the vast majority of the product's
behaviour is covered by tests that describe the intended contract rather than the
current implementation.

Not higher, because a daily driver is judged on whether you can trust it with the
things you cannot get back. Today, DalyHub can silently destroy meeting notes
written on another device, and cannot restore a backup an owner took last week.
Both are single-defect fixes with a known precedent inside the repository; neither
is architectural. And `main` is red with 33 tests that have never run, which means
the number above is stated over a suite that is not currently telling the whole
truth.

---

## 4. P0 findings

### F-01 — A Meeting's agenda and notes are blind last-write-wins, and the overwritten text exists nowhere — **P0**

| | |
| --- | --- |
| Module | Meetings (kernel + platform + editor) |
| Reproducible | Yes — 5/5 at the repository level against real D1; deterministic |
| Viewport/browser | Not viewport-dependent |

**User impact.** Two writers on one Meeting — a laptop and a phone, or two tabs, or
the phone capture bar and an open Notebook tab — and one of them loses everything
they wrote. Nothing fails, nothing is announced, and the text is not recoverable:
`meeting.updated` is appended with an **empty payload**, so the Activity trail
records that the notes changed and not what they were. There is no revision history.

**Exact reproduction** (real D1, Workers runtime):

```ts
const meeting = await meetings.create({ title: "Board sync", startsAt, timezone });
// Both tabs loaded the same (empty) notes.
await meetings.update(meeting.id, { notesMarkdown: "Ada: the budget is approved." });
await meetings.update(meeting.id, { notesMarkdown: "Grace: we ship on Friday." });
(await meetings.get(meeting.id))!.notesMarkdown;
```

**Expected.** The second write quotes the version it was based on; a stale write is
refused with a typed conflict, the route answers `409` with the newer text, and the
draft stays in the editor and is offered through the shared `RemoteChangeBanner` —
i.e. exactly what `NoteDetailsRepository.update` and `ReviewRepository.updateSection`
already do.

**Actual.** `"Grace: we ship on Friday."` — Ada's paragraph is gone.

**Code path.**
`app/modules/meetings/MeetingMarkdown.tsx` (`useAutosaveField`, whole-document
`intent=update` POST, no base version, no `serverValue`) →
`app/modules/meetings/routes/mutate.tsx` →
`MeetingRepository.update(id, input)` (`app/kernel/meetings/meeting-repository.ts:165`) →
`app/platform/storage/d1/d1-meeting-repository.ts` (`same` short-circuit for identical
content, then an unconditional UPDATE).

**Likely root cause.** `MeetingRepository.update` has no `expectedUpdatedAt`
parameter — the precondition REVIEW-02 added for Review sections and AUDIT-FIX-06
added for Note content was never extended to Meetings, and the Meeting editor
therefore has nothing to quote. Separately, `useAutosaveField`'s NOTES-05
reconciliation contract is **opt-in** via `serverValue`, and only the Note body has
adopted it (DEBT-47 says so in as many words).

**Evidence.** Kernel probe against real D1 in the Workers pool; `#eventModel` in
`d1-meeting-repository.ts:230` shows `payload: {}` for every `meeting.updated`.

**Existing test coverage.** `test/kernel/note-content-concurrency.test.ts` covers
this exact defect for Notes, thoroughly, including the route's `409`. Meetings have
`meeting-item-positioning.test.ts` (ordinal contention), `meeting-held.test.ts`,
`meeting-follow-up.test.ts` — nothing about concurrent body writes.

**Why existing tests missed it.** The concurrency work was scoped per module. The
Notes fix was written as *"Notes now follow the same shape [as Reviews]"*, and no
test asserts the shape as a PRODUCT-WIDE rule — i.e. *"every whole-document
autosaving field accepts a base version"*. Nothing fails when a third such field
exists without one.

**Recommended fix direction.** Extend `UpdateMeetingInput` with an optional
`expectedUpdatedAt`, fold it into the same statement as the write (an
`AND updated_at = ?` predicate, exactly as `note_details` does), raise a typed
`MeetingConflictError`, answer `409` with the newer text from
`meetings/routes/mutate.tsx`, and have `MeetingMarkdown` quote the base and pass
`serverValue` so the shared `RemoteChangeBanner` offers the choice. This also closes
the open half of **DEBT-47**.

**Regression tests required.** A kernel pair mirroring
`note-content-concurrency.test.ts` (stale write refused; newer text intact; identical
content still idempotent), a route test for the `409` body, and a two-writer browser
journey in `e2e/meetings-*.spec.ts` in the shape of the one `e2e/notes.spec.ts`
already has.

**Migration / data repair.** None. `meeting_details.updated_at` already exists.

**Existing debt.** Partially — **DEBT-47** covers *"does not adopt a change"* and
explicitly records that the Meeting notes field has not adopted `serverValue`. It
does **not** cover *"destroys one"*; **DEBT-83** did, for Notes only, and is closed.

---

## 5. P1 findings

### F-02 — Every workspace archive exported before 2026-08-18 is refused by Restore — **P1**

| | |
| --- | --- |
| Module | Export / Restore (kernel) |
| Reproducible | Yes — deterministic |

**User impact.** Settings → Privacy & data → Restore is documented as *"the normal
recovery path"*. An archive the owner exported at any point between HARDEN-01
(#160, when `schemaVersion` became 2) and TASKS-13 (#199, 2026-08-18) declares the
**current** schema version, so the version gate accepts it — and the validator then
rejects it with `records.taskChecklistItems must be an array`. The owner is told
their backup is malformed. It is not; it is simply older than a collection.

**Exact reproduction.**

```ts
const snapshot = structuredClone(makeSnapshot());       // a valid v2 snapshot
delete (snapshot.records as Record<string, unknown>).taskChecklistItems;
validateWorkspaceSnapshot(snapshot);
// → [{ path: "records.taskChecklistItems", message: "must be an array" }]
```

**Expected.** `[]`, and the collection normalised to `[]` in place — the behaviour
`SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` exists to provide, and which
`reviewWorkflowState`, `goalMeasurements`, `habitDetails`, `projectTemplateDetails`
and eight others all have.

**Actual.** One validation issue; `readBackupArchive` turns that into a
`RestoreRejectedError`.

**Code path.** `app/kernel/export/workspace-snapshot.ts:955`
(`SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` — `taskChecklistItems` absent) ·
`app/kernel/export/snapshot-validation.ts:365–384` (the required-collection loop) ·
`app/platform/restore/read-backup-archive.ts`.

**Likely root cause.** `04f6e51` (TASKS-13, #199) added `taskChecklistItems` to
`SnapshotCollectionRowMap` and `SNAPSHOT_COLLECTION_ORDER` and to both D1
repositories, but not to the opt-in list — even though the list's own comment says
*"Add to this list in the SAME change that adds a collection, and never remove from
it."* HABITS-01 and PROJECT-02 did it correctly on either side of it.

**Evidence.** `git log -S taskChecklistItems -- app/kernel/export/workspace-snapshot.ts`
→ `04f6e51` only; the failing validator run above.

**Existing test coverage.** `test/unit/export/snapshot-validation.test.ts` has *"still
accepts an archive written before these collections existed"* — but it is written
against `reviewWorkflowState` / `reviewStepAcknowledgements` by name.

**Why existing tests missed it.** The back-compatibility contract is tested with two
hard-coded collection names rather than as an invariant over the collection list.
Nothing asserts *"every collection added after `SNAPSHOT_SCHEMA_VERSION` last
changed is opted in"*.

**Recommended fix direction.** Add `taskChecklistItems` to
`SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` with the same one-line justification the
other entries carry. Then make the omission unrepeatable: a test that iterates
`SNAPSHOT_COLLECTION_ORDER`, deletes each collection in turn from a valid snapshot,
and asserts it either validates (opted in) or is on an explicit
`REQUIRED_SINCE_VERSION_2` list.

**Regression tests required.** The two above.

**Migration / data repair.** None — this is a reader change.

**Existing debt.** No entry covers it.

---

### F-03 — `main` is red, and 33 E2E tests have never executed on the merge commit — **P1**

| | |
| --- | --- |
| Module | Test infrastructure (E2E partitioning) |
| Reproducible | Yes — it is the current state of `main` |

**User impact.** Indirect but severe: the gate that decides whether DalyHub works no
longer knows. On CI run `32321840125`, partition p05 hit Playwright's 25-minute
`globalTimeout` after **25.0 min against its own 19.4 min budget**. Per the
repository's own rule — *"a suite that cannot finish stops reporting, and a report
that stops is indistinguishable from a pass"* — nothing at all can be concluded
about:

```
NEVER RAN   3 tests in e2e/tasks-dependencies.spec.ts
NEVER RAN   4 tests in e2e/tasks-optimistic.spec.ts
NEVER RAN  10 tests in e2e/today-keyboard.spec.ts
NEVER RAN  10 tests in e2e/ux-01-daily-driver.spec.ts
NEVER RAN   6 tests in e2e/visual-system.spec.ts
```

**Root cause, measured.** `e2e/partitions.json` has **no duration entry for ten of
its 111 spec files** (and no test count for them either), each of which is therefore sized at the `defaultSpecSeconds`
pessimistic guess of 120 s:

```
habits · today-task-convergence · identity · ux-02-plan-habits · spine-workspaces
plan-weekly-planning · tasks-dependencies · notifications · plan-responsive · plan-smart-lists
```

TASKS-12's `e2e/tasks-dependencies.spec.ts` is in p05 and actually costs **324 s**
(the run's own "Slow test file" line: 5.4 m) — **2.7× its estimate**, and 204 s more
than the manifest believes. p05's estimate of 19.4 min was therefore already wrong
by more than three minutes before runner variance, and `accessibility.spec.ts`
(446 s measured, 8.6 m observed) sits in the same partition.

This is precisely **DEBT-157**: the durations can only be refreshed from a run that
uploads `results.json`, and a GREEN partition uploads none — so ten new spec files
across four merges have accumulated with guessed costs. The failing p05 run has now
uploaded exactly the artefact needed (`e2e-report-p05`, artifact 9390527305), so the
refresh is finally possible.

**Also failing in the same run:** p08 (§ F-04) and, inside p05, one real test failure
(§ F-11).

**Expected.** Every partition completes inside its budget; the green gate means
every assigned test ran and passed.

**Actual.** `CI Gate` failure; two partitions red; 33 tests unexecuted.

**Recommended fix direction.** Re-derive the manifest from the p05 and p08 reports
(`pnpm run e2e:partitions:generate --from playwright-report/results.json`) and,
separately, close the hole DEBT-157 names — e.g. upload `results.json` from every
partition, green or red, so the manifest can be refreshed without waiting for a
failure. Do **not** raise `globalTimeout`; the repository's own header explains why.

**Regression tests required.** `e2e:partitions:check` should additionally fail when
any spec file on disk has no measured duration, so a guessed cost cannot survive a
merge silently.

**Existing debt.** **DEBT-157** covers the mechanism exactly and predicted this
consequence; it is P2 there and should be re-rated.

**Disposition — FIXED by [HARDEN-06A](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md)
(2026-08-20).** Re-derived from run `32321840125`'s own p05 and p08 artefacts rather
than from this document. The diagnosis holds — p05's thirteen files were budgeted
19.4 min and cost **22.9 min of measured test time** before any wall-clock overhead,
so it could not have finished — and one thing this document did not say came out of
the same artefacts: the manifest was wrong in **both** directions
(`tasks-v22-daily-driver` −35%, `pwa-offline-tasks` −45% as well as
`tasks-dependencies` 2.7× low), which is why the imbalance survived four merges. The
over-estimates hid the under-estimates, so the total looked stable while the
distribution did not.

All 111 spec files now carry a measured duration, a measured test count and a
recorded source, and every one of those measurements comes from **one CI run**
(`32333645709`) rather than from a mixture. `e2e:partitions:check` fails while any
gate spec on disk lacks one — asked over the same `listSpecFiles()` discovery the
gate partitions on — and it also enforces a partition ceiling **derived** from
`globalTimeout` instead of the flat "under 20 minutes" the failing p05 satisfied at
19.4 min. Ten partitions became twelve, the derivation's only knob, so the heaviest
is **15.2 min**: 68% of the ceiling against the 87% it was at.

**Verified, not asserted, on two twelve-partition runs.** Run `32333645709` (the
one the manifest was then re-derived from) collected **1847 tests and executed
1847**; run `32338241602`, with the re-derived manifest, did the same and **failed
none of them** — **CI Gate green**, twelve partitions started and finished, worst at
76% of `globalTimeout`. This finding's headline number — 33 tests that had never
run — is zero on both. `globalTimeout`, `workers`, the algorithm and the manifest
schema are all unchanged.

---

## 6. P2 findings

### F-04 — A saved-view create / rename / update / delete is fire-and-forget, and the dialog closes as if it succeeded — **P2**

| | |
| --- | --- |
| Module | Shared saved views (`/tasks` view switcher, `/views`) |
| Reproducible | Yes — 1/1 deterministically with a 2 s delay on the POST; intermittently on a loaded CI runner (it is the p08 failure) |

**User impact.** The owner confirms *"Delete view"*, the confirmation dialog closes,
and the view is still there. Nothing says so. The same shape applies to saving,
renaming and updating a view: the naming form closes on submit and the request is
never awaited.

**Exact reproduction.**

```ts
await page.route("**/tasks/views", async (r) => {
  if (r.request().method() === "POST") await new Promise((f) => setTimeout(f, 2000));
  await r.continue();
});
// open the switcher → Manage Tasks views → Delete "<view>" → confirm
await gotoFixture(page, "/tasks");           // the owner navigates immediately
// → the view is still listed:  count = 1
```

**Expected.** The dialog stays up showing "Deleting…" until the action settles (that
is `ConfirmationDialog`'s documented contract: *"runs whatever async `onConfirm` the
consumer supplies… a failure surfaces an inline alert while keeping the dialog
open"*), and a refusal is reported.

**Actual.** `count = 1`, no message. The in-flight `fetcher` is destroyed by the
document navigation.

**Code path.** `app/shared/saved-views/SavedViewSwitcher.tsx:455` —

```tsx
onConfirm={async () => {
  if (pendingDelete) submit({ intent: "delete", viewId: pendingDelete.id });
  setPendingDelete(null);           // ← resolves before the POST is sent
}}
```

`submit` is a bare `fetcher.submit(...)` (line 147) and is never awaited, so the
dialog's single-flight / pending / error machinery — and its own `busyLabel="Deleting…"`
— can never engage. The naming form (line 353) does the same: `submit(...)` then
`setNaming(null)`.

**Likely root cause.** One consumer defeating a shared primitive's contract. Every
other `ConfirmationDialog` consumer in the repository (`ProjectTemplateRecord`,
`ProjectSettingsTab`, `AreaSettingsTab`, `RestoreFromBackup`, `useRecordLifecycle`,
`GoalMeasurementPanel`, both offline panels) awaits its action.

**Evidence.** The local Playwright probe above; CI p08's failure
(`plan-smart-lists.spec.ts:179` — *"a saved view survives a reload, a rename and an
edit, and then deletes"*, expected 0, received 1, 14 polls).

**Existing test coverage.** `e2e/plan-smart-lists.spec.ts:121` exercises the whole
lifecycle — and is the test that caught it, by accident, because it navigates
immediately after confirming.

**Why existing tests missed it (until now).** The journey races the product in
exactly the way a user can, but on a fast runner the POST wins. It has been latent
since X-02.

**Recommended fix direction.** Make `submit` return the fetcher's promise (or track
`fetcher.state` and resolve on settle) and `await` it inside `onConfirm` / the naming
form's `onSubmit` before closing. That restores `busyLabel`, the inline error and the
retry the shared dialog already implements. The `e2e` test then needs no change.

**Regression tests required.** The probe above, as a spec: hold the POST, confirm,
navigate, assert the view is gone; plus an assertion that the dialog is still visible
immediately after confirm.

**Existing debt.** No entry. **DEBT-159** is the adjacent-but-different chip-removal
race and stays open on its own terms (confirmed still real — the chips are `<Link>`s
whose `href` is computed at render time).

---

### F-05 — "Created within" / "Updated within" compares an owner-local calendar day against a UTC instant — **P2**

| | |
| --- | --- |
| Module | Tasks collection + saved views; Views (cross-module) |
| Reproducible | Yes — deterministic |

**User impact.** For the **default** owner timezone (`Australia/Sydney`, UTC+10/+11),
`Created: Today` on `/tasks` silently omits everything captured before ~10 or 11 a.m.
local — up to half the working day. For a negative-offset owner it does the reverse
and includes several hours of *yesterday*. The same defect is in the Views module's
`Created` / `Updated` windows.

**Exact reproduction** (real D1):

```ts
// The owner is in Australia/Sydney. Their 2026-01-15 begins at 2026-01-14T13:00Z.
// A Task captured at 09:00 local is 2026-01-14T22:00Z — still "today" for them.
const w = world("2026-01-14T22:00:00.000Z");
await spine.createTask({ title: "Captured at nine this morning", parent: area });
await tasks.listWorkspaceTasks({
  view: "all", todayIso: "2026-01-15", filters: { createdWithin: "1d" },
});
```

**Expected.** `["Captured at nine this morning"]`.
**Actual.** `[]`.

**Code path.**
`app/platform/storage/d1/d1-task-repository.ts:2158–2171` —

```ts
// `created_at` is a full ISO timestamp; comparing against the window's start
// DAY (as a date-only prefix boundary) keeps the comparison index-friendly
// and free of any timezone conversion.
whereParts.push("e.created_at >= ?");
params.push(`${recencyWindowStart(todayIso, filterCreatedWithin)}T00:00:00.000Z`);
```

and the identical construction at
`app/platform/storage/d1/d1-cross-view-query-repository.ts:337, 343`.

**Likely root cause.** The comment states the bug as if it were the design: being
"free of any timezone conversion" is exactly what makes it wrong, because `todayIso`
is the OWNER's calendar day (`ownerCalendarIso(now, preferences.timezone)`) and
`created_at` is a UTC instant. The correct conversion already exists and is used
elsewhere — `ownerLocalToUtc` in `app/shared/datetime`, as
`analytics-context.ts:toWindow` and `reviewPeriodWindow` both do.

**Evidence.** The kernel probe above.

**Existing test coverage.** The recency filters are covered for *parsing*, *cursor
binding* and *SQL shape*, not for their boundary in a non-UTC zone.

**Why existing tests missed it.** Every recency test uses instants comfortably
inside the window; none places a record in the 10-hour band where the owner's day and
the UTC day disagree. `e2e/owner-timezone.spec.ts` exists but exercises Today, not
the collection filters.

**Recommended fix direction.** Convert the window start through `ownerLocalToUtc`
with the owner's timezone (already available on the loader's preferences) and bind
the resulting instant. Both call sites, one helper. Index use is unaffected — it is
still a bound instant compared with `>=`.

**Regression tests required.** A kernel case per direction (UTC+11 and UTC−7) with a
record inside the offset band, for both `createdWithin` and `updatedWithin`, on both
repositories.

**Related, and deliberately NOT a finding.**
`app/kernel/alignment/goal-alignment.ts:recentWindowStartIso` uses the same
construction but **documents it as an approximation on a 14-day supporting count that
cannot flip a classification**. That is an honest, recorded trade; the two above are
not.

---

### F-06 — Editing a Meeting counts as an "interaction" with every attendee — **P2**

| | |
| --- | --- |
| Module | People (relationship intelligence) |
| Reproducible | Yes — deterministic |

**User impact.** Two related wrongnesses in the People module's headline figures:

1. **"Total interactions" is inflated by autosaves.** One meeting, typed up in ten
   debounced autosaves, reports **"Total interactions: 11 · across 1 day"**.
2. **"Last interaction" is reset by record maintenance.** Fixing a typo in a
   six-month-old meeting's **title** moves `lastInteractionAt` from the meeting's own
   date to today, which flips the Person from `due_for_follow_up` / `out_of_touch`
   back to `recently_connected` and removes the follow-up signal.

**Exact reproduction** (real D1): one Person, one Meeting, one `link.related`; then
ten `meetings.update({ notesMarkdown })` calls 90 s apart →
`listPersonRelationshipFacts([person]).totalInteractions === 11`. Separately, one
`meetings.update({ title })` 180 days later →
`lastInteractionAt === 2026-06-30T00:00:00.000Z` instead of `2026-01-01`.

**Expected.** A meeting is one interaction. Record maintenance is not contact —
which is the module's own stated rule.

**Code path.** `app/kernel/relationships/person-relationship.ts:120`
(`INTERACTION_ACTIVITY_TYPES` includes `meeting.updated`) ·
`app/platform/storage/d1/d1-meeting-repository.ts` (`update` appends one
`meeting.updated` per changed save) ·
`app/modules/people/person-relationship-view.ts:74` (the "Total interactions" card).

**Likely root cause.** `INTERACTION_ACTIVITY_TYPES` reasons carefully about the
Person's OWN record — *"editing someone's phone number is not seeing them"*, and every
`person.*` and `entity_link.*` type is excluded for that reason — but treats every
LINKED record's `updated` event as contact. `meeting.updated` fires for a title
change, a time correction, an archive-adjacent edit and every debounced keystroke
batch in the agenda or notes editor.

The cadence arithmetic is protected (it reduces the sample to DISTINCT owner-calendar
days, so ten saves in one day are one day) — but `totalInteractions` is an exact
event count, and `lastInteractionAt` is an instant.

**Evidence.** The kernel probe above.

**Existing test coverage.** `test/kernel/person-relationship-facts.test.ts` asserts
*"a Person's own contact-card edits are not interactions"* — the one level the rule
was written for.

**Why existing tests missed it.** The test proves the exclusion the vocabulary was
designed around and never asks whether a LINKED record's maintenance event should be
excluded for the same reason.

**Recommended fix direction.** Decide the rule deliberately and write it down:
either drop `meeting.updated` (and `diary_entry.updated`) from the vocabulary and
keep `meeting.created` / `meeting.held` / `meeting.item_converted_to_task` as the
contact signals, or count interactions by DISTINCT owner-calendar day everywhere the
figure is shown, as the cadence already does. The first is closer to the module's
stated intent; the second is a smaller change and also fixes the count.

**Regression tests required.** "Ten saves of one meeting are one interaction";
"editing an old meeting's title does not move `lastInteractionAt`".

**Existing debt.** None.

---

### F-07 — A closed Review period's completion count changes when a completed Task is later deleted — **P2**

| | |
| --- | --- |
| Module | Reviews / Analytics (review-insights) |
| Reproducible | Yes — deterministic |

**User impact.** A weekly Review that said *"3 Tasks completed"* says *"2"* after the
owner tidies up. Analytics buckets move the same way. The Review is presented as a
record of a period.

**Exact reproduction.** Complete two Tasks inside a period; read
`countPeriodCompletions` → `tasksCompleted: 2`. Three weeks later `deleteTasks([a])`
(the bulk bar's Delete, reachable from `/tasks`). Read the same closed window →
`tasksCompleted: 1`.

**Expected.** Either the figure is fixed for a closed period, or the product says it
is not — the way the Analytics **overdue** note already does (*"Past overdue readings
… count only Tasks that still exist. Changing a due date, or deleting a Task, changes
its history here."*).

**Actual.** The figure moves, and both `analytics.ts` and REVIEW-03 state the
opposite: completions are *"counted distinct per record, so they are exact for any
past range"*, and that exactness is the stated reason REVIEW-03 does **not** snapshot
movement.

**Code path.**
`app/platform/storage/d1/d1-review-insight-repository.ts:197–199` — the completions
scan joins `entities … AND e.deleted_at IS NULL`, so a soft-deleted record leaves
every historical bucket. Same in `listPeriodContributions`.

**Likely root cause.** A reasonable per-query choice (don't show deleted records)
colliding with a documented guarantee made one layer up. Nobody owns the seam.

**Evidence.** The kernel probe above.

**Existing test coverage.** `test/kernel/review-insights.test.ts` covers "counts
exactly what completed inside the period", "counted once after complete → reopen →
complete", cross-workspace isolation — never a deletion after the fact.

**Recommended fix direction.** This is a product decision, and either answer is
defensible; what is not defensible is the current mismatch between the code and the
claim. Cheapest honest fix: state it, exactly as the overdue note does, and correct
the two comments. Stronger fix: count completions from the Activity stream without
the `deleted_at` join (the event is the fact; the record's later fate is a different
question) and let the CONTRIBUTION breakdown keep the join, since it needs a live
ancestry anyway.

**Regression tests required.** Whichever answer is taken, asserted directly.

**Existing debt.** None.

---

### F-08 — A Project holding a cancelled or Someday Task can never be archived — **P2**

| | |
| --- | --- |
| Module | Projects (settings / lifecycle) |
| Reproducible | Yes — deterministic, both cases |

**User impact.** DalyHub's documented way to remove a Task is **Cancel**
(ADR-053 §8: *"Task removal stays Cancel by explicit decision"*). A Project whose
leftover work was cancelled then refuses to archive, with
*"Complete or move the unfinished tasks before archiving this project."* The owner's
only remedies are to un-cancel and complete a task they deliberately did not do
(falsifying their own history), or to move it to another Project. A `Someday` Task
does the same thing.

**Exact reproduction.** Create Project + one Task; `updateTask(task, { status:
"cancelled" })`; `projectSettings.archive(project)` → `ProjectArchiveBlockedError`.
Repeat with `{ commitmentState: "someday" }` → same.

**Expected.** Cancelled and Someday work is not an unfinished commitment. The product
already agrees with that everywhere else: `listCarryOverTasks`, the overdue rule and
`countOverdueAtPeriodEnd` all exclude `cancelled` and `someday` explicitly, *"for the
reason recorded there: parked or dropped work is not an unfinished commitment."*

**Actual.** Blocked.

**Code path.** `app/platform/storage/d1/d1-project-settings-repository.ts:380`
(`#unfinishedDirectTaskExistsSql`) — the guard is `spine_records.completed_at IS NULL`
and nothing else.

**Likely root cause.** The archive guard predates the `cancelled` / `someday`
vocabulary being treated as "not outstanding" elsewhere, and was never reconciled
with it.

**Evidence.** The kernel probe above.

**Existing test coverage.** `e2e/accessibility.spec.ts` and `project-settings.spec.ts`
cover the blocked-archive alert; they use a genuinely open Task.

**Recommended fix direction.** Add the two predicates the rest of the product
already uses to `#unfinishedDirectTaskExistsSql`
(`COALESCE(td.status,'todo') <> 'cancelled'` and
`COALESCE(td.commitment_state,'active') <> 'someday'`), and reword the refusal to
name what actually blocks it.

**Regression tests required.** Archive succeeds with a cancelled child and with a
Someday child; still blocked with an open one.

**Existing debt.** None.

---

### F-09 — Checklist progress is missing on the one surface where the steps matter most, and the Project's task list is still a second Task row — **P2**

| | |
| --- | --- |
| Module | Projects · Tasks (TASKS-13 projection) |
| Reproducible | Yes — by inspection of the loader and the component |

**User impact.** The same Task shows *"2 of 5"* on `/tasks`, `/today` and `/plan`,
and shows nothing at all inside its own Project's Tasks tab — the surface an owner
works a Project from. The invariant the brief names (*"the same Task retains … checklist
progress wherever it is viewed"*) does not hold.

**Code path.** `app/modules/projects/routes/detail.tsx:177` reads
`listBlockedSummaries` but never `listChecklistProgress`;
`serializeProjectTask` carries `blocked` and not `checklist`;
`app/modules/projects/ProjectTasksTab.tsx` builds `Card` props by hand and does not
import the shared `TaskRow` at all — the only three importers are
`TasksWorkspace.tsx`, `PlanWorkspace.tsx` and `TodayScreen.tsx`.

**Likely root cause.** `TaskRowProjection` makes `checklist` and `blocked` optional
*"so a surface that does not project it pays nothing for it"*. That is a sound
performance contract and an unsound consistency one: it makes the absence invisible.
Underneath it, UIX-02 made the Project rows *"the SAME `Card` props Tasks builds"*,
which was true then; DS-04 subsequently replaced the Tasks card with `TaskRow` and
this tab did not follow. DEBT-143 closed the same fork for Today; this one is still
open and unrecorded.

**Recommended fix direction.** Two steps, in order: (1) read
`listChecklistProgress` for the Project's task page and stamp it, which is one
bounded aggregate and makes the figure correct today; (2) adopt the shared `TaskRow`
in `ProjectTasksTab`, which makes the class of defect unrepeatable. (2) is a UI
change and belongs in its own slice.

**Regression tests required.** A cross-surface assertion — one Task with a checklist,
asserted to show the same figure on `/tasks`, `/today`, `/plan` and its Project — of
the kind the brief calls "one Task means one Task".

**Existing debt.** **DEBT-161** covers the phone row deliberately hiding the figure
(measured, accepted). Nothing covers the Project tab, and nothing covers the
remaining `TaskRow` fork.

---

### F-10 — Notification settings, the notification ledger and calendar sources leave the export silently — **P2**

| | |
| --- | --- |
| Module | Export / Backup |
| Reproducible | Yes — by inspection |

**User impact.** A restored workspace comes back with notifications off, the digest
time and its zone gone, the per-source toggles gone and every subscribed calendar
gone — and the archive's own manifest does not say so. `manifest.json` carries an
`excluded` list precisely so *"the omission is explicit"*, and the docs promise
*"either is reported in `limitations` and in the manifest, never silently"*.

**What is missing, and why each one is a different judgement:**

| Table | In the snapshot? | Named in `EXPORT_EXCLUSIONS`? |
| --- | --- | --- |
| `notification_settings` | no | **no** |
| `notifications`, `notification_deliveries` | no | **no** |
| `calendar_sources`, `external_calendar_events`, `external_calendar_meeting_links` | no | **no** |
| `workspace_ai_preferences`, `ai_usage_requests` | no | documented, and recorded as **DEBT-94** |
| `capture_tokens`, `capture_rate_windows` | no | covered by "Credentials of any kind" |
| `offline_*_receipts`, `workspace_restore_*` | no | operational; arguably covered |

`notification_settings` genuinely holds a credential (`pushover_user_key`,
`pushover_app_token`) and `calendar_sources` holds a sealed feed URL, so excluding
the ROWS is defensible. Excluding them **without saying so** is not, and the
non-secret half (the digest time, the zone, the per-source toggles, a calendar's
name) is ordinary owner configuration of exactly the kind
`owner_app_preferences` and the saved views are already exported as.

**Code path.** `app/platform/export/manifest.ts:76` (`EXPORT_EXCLUSIONS`) ·
`app/kernel/export/workspace-snapshot.ts` (`SnapshotCollectionRowMap`) ·
`docs/development/EXPORT_AND_PORTABILITY.md` (no mention of notifications or
calendars anywhere).

**Recommended fix direction.** Minimum: three sentences in `EXPORT_EXCLUSIONS` and a
paragraph in `EXPORT_AND_PORTABILITY.md` naming what is left out and why, matching
the AI-platform precedent. Better: export the non-secret notification settings and
calendar-source names as `owner`-scoped configuration, with the two credential
columns and the sealed URL omitted by column rather than by table.

**Existing debt.** **DEBT-94** covers the AI half of this shape and explicitly notes
that *"configuration is not exported" is NOT the existing rule*. Nothing covers
notifications or calendars.

---

## 7. P3 findings

### F-11 — `reviews-guided` Journey 2 asserts over a value the Markdown editor legitimately holds twice for one frame — **P3** (test robustness)

CI p05's one real test failure:

```
reviews-guided.spec.ts:319  expect(getByText('Halfway through, then interrupted.')).toBeVisible()
strict mode violation: resolved to 2 elements
  1) <textarea class="dh-md-editor__fallback" aria-label="Overall reflection">…
  2) <div class="cm-line">…
```

`LiveMarkdownEditor` renders its no-JS `<textarea>` while `!editorReady` and the
CodeMirror container `hidden={!editorReady}` beside it. CodeMirror's DOM (and its
`.cm-line`) exists before the React state flush that removes the fallback, so for one
frame the value is in the document twice. On a saturated runner (this partition was
already 5 minutes over budget) the assertion lands inside that frame.

No data is at risk — the fallback's `onChange` feeds the same `onChange`, and
CodeMirror seeds from `value` — and the hidden container is out of the accessibility
tree. **Classification: harness defect (category 4), exposed by the p05 overrun.**
Fix by asserting the control rather than the text
(`getByRole("textbox", { name: "Overall reflection" })` → `toHaveValue(...)`), which
is what the same file does elsewhere.

**Disposition — FIXED by [HARDEN-06A](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md)
(2026-08-20), and the "one frame" reasoning above was tested rather than inherited.**
A fixture reproducing the two-element DOM and resolving it after 1 s, driven by this
repository's own Playwright 1.62.1, fails **immediately** with this finding's exact
message: Playwright does not retry a strict-mode violation, so the assertion never
reaches its own 5 s budget. The window therefore does not need to be wide to be
fatal, only to contain the FIRST evaluation — which confirms the classification
(harness defect, category 4) and shows the assertion was unsafe at any speed rather
than only on a saturated runner. The fix asserts the live surface
(`.dh-review-guide__prompt .cm-content` → `toContainText`) rather than
`toHaveValue` on the fallback, because the fallback is exactly the element that is
*gone* once the editor is ready; that is also the shape `notes-knowledge.spec.ts`,
`notes.spec.ts` and `forms.spec.ts` already use. Three further problems in the same
file came out of the fix: `waitForEditor` was page-wide and could be satisfied by a
different editor, and **Journey 5 carried the same unsafe assertion twice** — once on
the guide step and once on the Review record, where every open section mounts its own
editor. A regression assertion now pins the contract that made the ambiguity
possible: once the editor reports ready, the fallback `<textarea>` is gone. All six
journeys were then run three times over, green every time.

**A third instance of the same shape, found by the re-derived split.** Putting
`tasks-collection.spec.ts` and `today-task-convergence.spec.ts` in one partition for
the first time produced six failures from one cause on run `32333645709`:
`tasks-collection.spec.ts:760` compares Today's whole `main.innerText()`, which
opens with the shell's `role="status"` live region, and the two snapshots differed
by the line *"Online. Not stored offline yet."* and nothing else — after which the
test's restore of the owner's DEFAULT TASKS VIEW, written as its last line rather
than as an `afterEach`, never ran, and five `today-task-convergence` journeys that
navigate to a bare `/tasks` were reported as failures of their own code. Both halves
are fixed. The durable rule is worth naming beside F-11's: **a spec that mutates
owner-level state has to hand it back whatever happens to it**, and one real defect
reported as six is the same class of untruth as a test that never runs.

### F-12 — The Activity kernel permits a 101-bound-parameter statement — **P3** (latent)

`ActivityRepository`'s `MAX_ACTIVITY_PAGE_SIZE` is **100**, and
`D1ActivityRepository.#fetchSubjects` binds `workspaceId` plus one id per page row —
**101** at the maximum. Measured against real D1 in the Workers runtime:

```
101 bound parameters → D1_ERROR: too many SQL variables at offset 323: SQLITE_ERROR
100 bound parameters → ok
```

Not reachable from product code today: every caller passes 30
(`AREA_/ASSET_/GOAL_/HABIT_/MEETING_/NOTE_/PERSON_/PROJECT_/REVIEW_/TODAY_ACTIVITY_PAGE_SIZE`
and the Tasks `PAGE_SIZE`), and Settings passes 8. But the kernel's own validated
maximum produces a statement D1 refuses, which is the same trap TASKS-13 fell into at
100 checklist ids. Lower `MAX_ACTIVITY_PAGE_SIZE` to 90 or chunk `#fetchSubjects` the
way `d1-entity-repository.ts` (`GET_BY_IDS_CHUNK_SIZE = 90`) already does. Everything
else audited is correctly chunked (40–90) and every chunk constant cites the 100
ceiling.

### F-13 — Changing a Habit's cadence fails opaquely when the owner's calendar day moves backwards — **P3**

`D1HabitRepository.changeSchedule` amends the current version in place only when
`version.effectiveFrom === todayIso`; otherwise it closes the open version at
`todayIso − 1` and opens a new one at `todayIso`. If the owner's `todayIso` has moved
BACKWARDS since the last change — a westward timezone-preference change, or travel —
`effective_to < effective_from` and the write is refused by the schema's own
`habit_schedules_ordered` CHECK, surfacing as `HabitStorageError: A habit storage
error occurred.`

The database is doing its job: the chain cannot be corrupted, which is the important
half. The application half is missing: the owner gets an unexplained failure and
cannot change that Habit's cadence until their local date catches up. Reproduced
against real D1. Handle the case explicitly — amend in place when `todayIso` is not
after the current version's `effectiveFrom`.

### F-14 — The AI's weekly-review facts group by UTC day against owner-local period bounds — **P3**

`app/modules/ai/review-facts.ts:55, 59`:

```ts
const day = task.completedAt.toISOString().slice(0, 10);
return day >= periodStart && day <= periodEnd;
```

`periodStart` / `periodEnd` are the owner's calendar dates; `completedAt` is a UTC
instant. For the default Sydney owner the assistant can report a different
"tasks completed this week" from the Review it is describing, at both boundaries.
The same construction is in `app/platform/ai/deterministic-answers.ts:150` and
`app/platform/ai/evidence-retrieval.ts:67`. Same family as F-05, and the correct
helper (`ownerLocalToUtc` / `reviewPeriodWindow`) is already used by the Review's own
insight path.

### F-15 — Two load-bearing code comments are now false — **P3**

- `app/modules/today/day/week-strip.ts:21` — *"It is a constant here rather than a
  preference: **DalyHub has no first-day-of-week setting**, and inventing one to serve
  a strip would be the feature creep this pass is told to avoid."* DalyHub has had
  `firstDayOfWeek` since before PLAN-01, and three surfaces resolve their week through
  it. This is the justification DEBT-152 / DEBT-154 are about, and it now reads as a
  statement of fact rather than as a deferral.
- `e2e/helpers.ts:77` — *"Every task-bearing surface that has NOT adopted the row —
  **Today**, a Project's task list — still renders cards."* TODAY-TASK-01 adopted the
  shared row on Today; the Project's task list is the only one left (F-09).

Both confirm existing debt rather than adding new; both mislead the next reader about
what is decided versus what is owed.

---

## 8. Cross-module integrity findings

Each of the brief's invariants was tested directly.

| Invariant | Verdict |
| --- | --- |
| **One Task means one Task** | **Holds for title, parent, completion, priority, due date, planned date, recurrence and blocked state.** `blocked` is projected by every task-bearing surface (`/tasks`, `/today`, `/plan`, Project detail, Project tasks tab, the offline snapshot), and `taskDisplayState` is the single evaluator. **Fails for checklist progress** — F-09. |
| **One record identity** | **Holds.** `ENTITY_IDENTITY` + the shared subtype registry mean no subtype wears an entity glyph (asserted by a test), `EntityLink` carries its own icon, and `entityDestination` is the one destination helper. Search results resolve to canonical destinations; a Task opens the shared Drawer over `/tasks` by design. |
| **No phantom records** | **Holds, structurally.** A checklist item has no `entities` row, no spine record, no EntityLink, no Activity and no route. A Project template is an `entities` row with **no** `spine_records` row, so it is *absent* from rollups rather than filtered out of them, and it is deliberately excluded from `universal-links.ts` with the reason stated in the file. A Habit generates no Task. None of them can reach a Task statistic. |
| **No double writes** | **Holds** for successors (one authority, `planNextTaskOccurrence`), notifications (a UNIQUE dedupe key, inserted before any send), Habit check-ins (`(workspace, habit, date)` is the primary key), checklist clones and meeting items. **Fails for Activity** in the sense F-06 describes: one editing session produces many `meeting.updated` events, which is correct as history and wrong as an interaction count. |
| **Archive / delete integrity** | **Mostly holds** — archived Projects are structurally excluded from Open/Completed/All, archived records keep their relationships followable, deleted records leave search and counts, restore is guarded. **Two seams**: F-08 (cancelled/Someday blocks archive) and F-07 (deletion rewrites closed-period history). No orphan-record or FK-assumption failures were found; every child table uses a composite, type-constrained FK with `ON DELETE RESTRICT`. |

---

## 9. Tasks / Today / Planning findings

- **F-05** (P2) — the created/updated recency window, above.
- **F-09** (P2) — checklist progress absent on the Project tab, above.
- The **lost-update class** V2.3-GATE-01 fixed at `use-applied-params.ts` was
  re-examined. The fix is correct and the authority is genuinely single. **The same
  class survives in two other places**: the saved-view mutations (F-04, proven) and
  the filter-chip removals (**DEBT-159**, confirmed still real — `CollectionFilterChips`
  renders ordinary `<Link>`s whose `to` is computed at render time from the applied
  parameters, so two removals inside one revalidation restore one of them).
- Weekly Planning's own contract holds: `/plan` reads `planningWeekStart` /
  `addPlanningDays` (integer day arithmetic over noon-UTC-formatted labels, no
  timezone can move a label), every mutation leaves through the canonical Task
  posters, the week is the owner's `firstDayOfWeek` week, and the four header figures
  are pure arithmetic over data already read. DEBT-162/163/164 were re-read against
  the code and all three remain accurate.
- Today remains a projection: `listPlanningTasks` is the one read, the row is the
  shared `TaskRow`, and the schedule strip is a bounded view of the window already
  fetched. Its Monday hard-coding is DEBT-152/154 and still real (F-15).

---

## 10. Projects / Goals / Areas findings

- **F-08** (P2) — archive blocked by cancelled/Someday work.
- **F-09** (P2) — the Project tasks tab.
- **Goal mathematics are honest.** `goal-progress-evaluator.ts` is one formula over
  (baseline, current, target) with direction affecting wording only; it returns
  `null` rather than a plausible number in seven documented cases; nothing can be
  `NaN` or `Infinity`. Neither `app/kernel/goals` nor `app/kernel/alignment` contains
  a single reference to habits or checklist items — HABITS-01's promise that a Goal
  shows supporting Habits as *evidence* without touching its measured progress is
  structurally true, not merely asserted.
- **Project templates hold their line.** A template is an `entities` row with no
  spine record; a template task is a row with no entity id. Instantiation is one
  atomic batch with bounds enforced inside each write. Nothing about templates can
  reach a Project count, Goal progress, Today, Planning or a Review.
- Areas' counts and alignment read first-class records only.
- **DEBT-158** (a Goal measurement journey that has never run, because nothing in the
  seed is measurable) was re-checked and is still accurate.

---

## 11. Habits findings

- **F-13** (P3) — the backwards-calendar-day cadence change.
- Everything else held under attack. The schedule chain is contiguous and
  non-overlapping **and the database enforces it** (`habit_schedules_ordered`), which
  is why F-13 is a P3 error-handling defect rather than a P1 integrity one.
  `(workspace, habit, date)` as the primary key means two racing taps produce one
  completion by construction. A future date is refused; an archived Habit refuses new
  completions. `weekScheduleVersion`'s rule — a week's target comes from the version
  in force on `min(weekEnd, today)` — is stated once and applied everywhere, so
  lowering a target today cannot rewrite last month. The V2.3-GATE-01 partial-first-week
  rule is symmetric at the archiving end. The week comes from `planningWeekStart`,
  the same authority `/plan` and a weekly Review use.

---

## 12. Notes / Diary / Meetings / People findings

- **F-01** (P0) — Meeting agenda/notes data loss.
- **F-06** (P2) — meeting edits as Person interactions.
- **Notes are a strength, and the audit tried hard to break them.** Content is the
  exact Markdown source, byte-for-byte, never trimmed or normalised. The upsert's
  base-version precondition is folded into the same statement as the write, so it
  cannot be raced; a stale save is a typed conflict and a `409` carrying the newer
  text, never a `500` and never a false success. Every writer that omits the
  precondition was traced: the capture service and the AI proposal applier both
  **create** a note and write its first body, so there is nothing to be stale about.
  **No path was found that can lose Note text.**
- Diary grouping is correct: each entry stores a UTC instant plus the IANA zone
  captured at occurrence, and the timeline groups through an explicitly-zoned
  `Intl.DateTimeFormat` with no hidden UTC or machine-local default.
- People: contact-card edits are correctly excluded from interactions (every
  `person.*` and `entity_link.*` type). The failure is one level out (F-06).

---

## 13. Assets / Reviews / Analytics / Notifications findings

- **F-07** (P2) — closed-period completion counts move.
- **Analytics is otherwise trustworthy, and unusually so.** Every metric was traced
  `UI → loader → repository → SQL → source tables`. The evaluator refuses to invent:
  no basis is `no_basis`, a failed read is `unavailable`, a failed read can never
  produce the empty state, and there is no composite score. Levels and flows are
  different types so a backlog can never be summed across buckets. The query budget
  is eight grouped statements regardless of workspace size, and every generated
  fragment is an integer this code produced — every date and instant is bound.
  Checklist items, template rows and Habit check-ins **cannot** inflate a Task
  statistic, because none of them appears in `entities`+`spine_records` with a
  `task.completed` event.
- Notifications: the digest decision is a pure function over one reading of the
  owner's wall clock (so DST is a tested property, not a twice-yearly surprise), and
  duplication is prevented by a UNIQUE dedupe key whose insert commits **before** any
  send is attempted — the `alreadyRecorded` read is documented as an optimisation, not
  the guarantee. The inbox is explicitly a log with no resolved state; a notification
  whose target has since been deleted still links to it, which is deliberate
  (*"if the inbox and the rail disagree, the rail is right and the inbox is history"*).
- Assets, obligations and their attention rungs behaved correctly under inspection;
  `d1-asset-history-repository.ts` chunks its id lists and states its bounds.

---

## 14. Search / Navigation / Settings findings

Nothing new. Specifically checked and found sound:

- Every shipped module registers a real repository-backed search provider; the
  fixture provider that once mixed invented results with real ones is gone.
- Archived records are **included and labelled** in search rather than hidden;
  deleted records are excluded at the repository. Both are deliberate and documented.
- `project_template` is a search provider by decision and is absent from
  `universal-links.ts` by decision, each with its reason in the file.
- Settings: every preference is a real column with a compare-and-set `version`, and
  `e2e/settings.spec.ts` proves persistence, the landing-page fallback, the default
  Tasks view, the default Diary mode and a two-device merge. No setting was found
  that appears to save and does nothing, and none where the UI and the server
  disagree.
- The frame has one navigation authority; `PUBLIC_PATHS` is `/health` alone.

---

## 15. Offline / PWA findings

Nothing new; this is one of the strongest parts of the product.

The mutation queue's contract is field-focused rather than `updatedAt`-based, so an
offline priority change merges cleanly with a server-side title change. The three
outcomes (`applied` / `satisfied` / `conflict`) make replay safe to repeat: a retry
whose first attempt succeeded but whose response was lost finds the field already
carrying its intent and is a truthful no-op. Coalescing is conservative in four
named ways, and clause 3 (`attempts === 0`) is what keeps idempotency keys honest.
The `syncing` lease makes a tab closed mid-request recoverable. CI's
`pwa-offline-tasks.spec.ts` — a real outage, a reload with queued work, a recurring
completion producing exactly one successor, a genuine conflict decision, and the
whole surface at 320/375/390/430 — is green on this commit.

**DEBT-155** (habit check-in is online-only and can only say so after it fails) and
**DEBT-160** (only checklist COMPLETION is offline-capable) were re-read and both
remain accurate.

---

## 16. Data / D1 findings

- **F-12** (P3) — the 101-parameter latent statement; D1's ceiling measured at
  exactly 100.
- Everything else audited came back clean. Every child table uses a composite,
  type-constrained foreign key `(workspace_id, entity_id, entity_type) → entities`
  with `ON DELETE RESTRICT`, so a row cannot attach to the wrong type or to another
  workspace **at the database level**. Uniqueness is used where it is a guarantee
  (habit check-ins, notification dedupe keys, calendar feed fingerprints, meeting item
  ordinals) and deliberately **not** used where a legitimate transaction passes through
  a duplicate (checklist ordering — a stale reorder is refused with the current list
  rather than half applied). Every `IN (…)` list is bounded or chunked, each with the
  100-parameter ceiling cited. Cursors are bound to their full query scope and
  rejected rather than reinterpreted when they do not match. Cycle and bound
  enforcement for Task dependencies happens **inside** the insert, including a bounded
  recursive CTE.
- The two duplicate migration numbers (`0013`, `0039`) are recorded, grandfathered by
  exact filename as pairs, and re-checked on every PR; a third file at either number
  still fails. The header explains why renumbering after merge is the defect.

---

## 17. Security / workspace findings

**No findings.** This is the strongest area of the product.

- The mutation-provenance guard runs at the ONE request boundary, before any
  protected loader or action, so it covers every current and future mutation route
  with no per-route check. It requires an exact origin match (scheme + host + port),
  reads `Origin` and `Sec-Fetch-Site` together and treats disagreement as a rejection,
  and refuses on any ambiguity. Safe methods are an allowlist, so an unknown method
  is treated as mutating.
- `PUBLIC_PATHS` is `{"/health"}`, matched exactly. `/api/capture` is the one
  carve-out, POST-only, exact-match, and carries its own scoped bearer token.
- Every repository is workspace-bound at construction; a client-supplied workspace id
  is ignored on the export route (asserted). Cross-workspace and nonexistent ids are
  reported identically, disclosing nothing.
- Markdown renders through one sanitising pipeline with `allowDangerousHtml: false`;
  raw HTML is preserved in storage and can never become executable DOM.
- No credential reaches the export: no AI table is in the snapshot, and there is no
  provider credential in D1 to carry. (F-10 is about *documentation* of the
  omissions, not about leakage.)

---

## 18. Accessibility findings

**No new findings.** The gate is real and its waivers are honest.

`expectNoAxeViolations` runs WCAG 2.0/2.1/2.2 A + AA **plus** best-practice, and
four rules are globally disabled — `color-contrast`, `landmark-unique`,
`nested-interactive`, `aria-required-children` — each with a written reason and each
compensated elsewhere (contrast is proved deterministically over every generated
scheme in both appearances, including the dark rail's own `on-rail` and
`on-rail-muted` pairs; the other three are ADR-backed component decisions asserted by
unit tests). Exactly one per-scan waiver exists in the whole suite
(`label-title-only`, `tasks-daily-driver.spec.ts:432`) and it records the
context-dependence that motivated it. `region` is not disabled — the overlay layer
is added to axe's own matcher instead.

**Stated limitation:** because `color-contrast` is asserted at the token layer, a
combination the token pairs do not enumerate (arbitrary text over the rail; a
translucent state layer over an unusual surface) would not be caught. The token
coverage is unusually complete, so this is recorded as residual uncertainty (§29),
not as a finding.

---

## 19. Responsive / mobile findings

**No new findings.** `e2e/responsive.spec.ts` is a 465-test generated matrix over
320 / 375 / 390 / 430 / phone-landscape (844×390) / 768 / 1024 / 1280 / 1440 / 2560,
and it is green on this commit (p09 and p10, both success). The phone-landscape
viewport is the one that makes HEIGHT the binding dimension, and it is in the matrix.
Touch targets, the keyboard inset and the bottom-navigation inset are token-driven,
and TASKS-13's `target-size` violation was found and fixed by the gate itself rather
than by an author.

**DEBT-161** (no checklist figure on a phone row) and **DEBT-162** (the six-column
board needs 1440) were re-read against the code and both remain accurate and
measured.

---

## 20. Performance findings

**No new findings, and nothing speculative is reported.**

Every bounded read the audit traced is bounded by construction and says so: Analytics
is eight grouped statements regardless of range or workspace size; `/plan` costs a
fixed number of queries whatever the week holds; `/habits` costs two statements for a
page; checklist progress is one indexed aggregate per 80-id chunk, so a page of fifty
Tasks costs what a page of one does; the notification inbox reads its whole page's
deliveries in one statement. No N+1 was found in any path examined. One genuine
structural concern is already recorded and confirmed: **DEBT-151** — the shell
precache at 1,321 kB, 2.0× its V2.0.1 measurement — and **DEBT-172**, which notes the
budget bounds the worker and its manifest as one number.

---

## 21. Test-suite findings

Classified per the brief.

| Failure | Category |
| --- | --- |
| p08 · `plan-smart-lists.spec.ts:179` — the deleted view is still listed | **1 — real product defect** (F-04). The test races the product in exactly the way a user can. |
| p05 · partition did not complete, 33 tests never ran | **4 — harness defect** (F-03): a manifest with ten guessed durations, one of them 2.7× low. **Fixed by HARDEN-06A.** |
| p05 · `reviews-guided.spec.ts:319` — strict-mode violation | **4 — harness defect** (F-11): a text assertion over a one-frame editor handover, exposed by the overrun. **Fixed by HARDEN-06A**, which also measured that a strict-mode violation is never retried, so the assertion was unsafe at any speed. |

Audited properties of the suite itself:

- **No `.skip`, no `.fixme`, no `test.only`** anywhere in `e2e/`.
- `retries: 0`; `workers: 1`, and the reason is correctness (some specs mutate
  owner-level state), not conservatism.
- The screenshot/evidence specs are `testIgnore`d unless a capture variable is set,
  and `scripts/e2e-partitions.mjs` applies the same rule — so they are not silently
  counted as coverage.
- `e2e-partition-summary.mjs` distinguishes an **unexecuted** test from a
  **deliberately skipped** one and fails the job on the former; a missing
  `results.json` is also a failure. This is what turned F-03 from an invisible
  regression into a red job with an exact count, and it is the single best piece of
  test infrastructure in the repository.
- **Weaknesses found**, each already reflected in a finding: the export
  back-compatibility contract is tested by naming two collections rather than as an
  invariant (F-02); the concurrency contract is tested per module rather than as a
  product-wide rule (F-01); the recency filters are never tested at the boundary where
  the owner's day and the UTC day disagree (F-05); the interaction vocabulary is tested
  one level below where it breaks (F-06); the closed-period guarantee is never tested
  against a later deletion (F-07).

---

## 22. Existing Product Debt confirmed

Re-read against the code on this commit and still accurate:

| Debt | Confirmation |
| --- | --- |
| **DEBT-151** | Shell precache still over its V2.0.1 measurement. |
| **DEBT-152 / DEBT-154** | `week-strip.ts` still hard-codes Monday; `/plan`, `/habits` and a weekly Review all resolve `firstDayOfWeek`. The justifying comment is now false — F-15. |
| **DEBT-153** | A saved view still cannot express a specific date WINDOW. |
| **DEBT-155** | A habit check-in is still online-only. |
| **DEBT-156** | The Weekly Review still says nothing about habit consistency. |
| **DEBT-157** | **Now realised as an outage** — the un-refreshable durations are the direct cause of F-03. Should be re-rated P1. |
| **DEBT-158** | Still nothing measurable in the seed. |
| **DEBT-159** | Still real: `CollectionFilterChips` renders `<Link>`s whose `to` is computed at render time. |
| **DEBT-160 / DEBT-161** | Both still accurate as written and measured. |
| **DEBT-162 / DEBT-163 / DEBT-164** | All three still accurate; `toColumns`' weekend pairing does follow `firstDayOfWeek` and a Sunday-start week does yield seven groups. |
| **DEBT-165 … DEBT-172** | All still accurate (deliberate non-goals of PROJECT-02 and TASKS-12). |
| **DEBT-47** | Still open, and its unadopted half is now the mechanism of a **P0** — F-01. Should be re-rated. |

## 23. Existing Product Debt no longer accurate

- **DEBT-157** understates itself. It is written as *"the durations can only be
  refreshed from a FAILING run"* with the imbalance as evidence. The imbalance has
  since become a partition that does not finish and 33 tests that never run. The
  entry needs the new evidence and a P1 rating.
- **DEBT-47** is written entirely as *"an open editor does not adopt a change"*, with
  the visible symptom being that a captured note does not appear until reload. On the
  Meeting notes field the same unadopted contract now also allows one writer to
  destroy another's text (F-01). The entry needs the escalation AUDIT-08 made for
  Notes, applied to Meetings.

Nothing in the register was found to be **resolved but still open**.

## 24. New debt recommended

Only for what will genuinely be left outstanding after the repair sequence in §26 —
the rest become PRs, not entries. Numbering continues from **DEBT-173**.

| Proposed | Title | P |
| --- | --- | --- |
| **DEBT-173** | A whole-document autosaving field is not required to carry a base version — the contract is per-module, not product-wide | P2 |
| **DEBT-174** | Owner-local calendar days are compared against UTC instants in three AI read paths | P3 (F-14) |
| **DEBT-175** | A closed Review period's completion figures are recomputed, so deleting a completed record rewrites history | P2 (F-07, if the "state it" answer is taken rather than the "count from Activity" one) |
| **DEBT-176** | The Project record's Tasks tab is the last surface that does not render the shared `TaskRow` | P2 (F-09 part 2) |
| **DEBT-177** | Notification settings and calendar sources leave the export with no `limitations` entry | P3 (F-10, if only the documentation half is taken) |

Deliberately **not** proposed as debt, because they should simply be fixed: F-01,
F-02, F-03, F-04, F-05, F-08, F-12, F-13, F-15.

---

## 25. False alarms investigated and rejected

Recorded so they are not re-investigated.

1. **Duplicate migration numbers `0013` / `0039`.** Recorded, grandfathered by exact
   filename as pairs, and re-checked on every PR. Renumbering after merge is the
   defect, and the test's header says so.
2. **Checklist items or template rows inflating Task statistics.** Structurally
   impossible — neither has an `entities` row with a spine record, so neither can
   carry a `task.completed` event.
3. **Habit activity reaching Goal progress.** Neither `app/kernel/goals` nor
   `app/kernel/alignment` mentions habits at all.
4. **Project templates leaking into a link picker.** Deliberately absent from
   `universal-links.ts`, with the reason written at the omission.
5. **`goal-alignment.ts`'s UTC window.** The same construction as F-05, but
   documented as an approximation on a supporting count that cannot flip a
   classification. An honest recorded trade.
6. **Search hiding archived records.** Archived records are included and *labelled*;
   only deleted ones are excluded. Deliberate.
7. **AI proposals or capture overwriting an existing Note body.** Both **create** a
   note and write its first body; there is nothing to be stale about.
8. **`meeting_items` ordinal races.** `MAX(position)+1` is computed inside the insert,
   the UNIQUE index is the final boundary, and a losing batch rolls back entirely and
   retries a bounded number of times.
9. **Two racing Habit check-ins.** `(workspace, habit, date)` is the primary key.
10. **`countPeriodCompletions` double-counting a complete → reopen → complete Task.**
    `SELECT DISTINCT` on `(bucket, type, entity_id)`; already asserted by a test.
11. **`ConfirmationDialog` being generally fire-and-forget.** Only one of its nine
    consumers defeats the contract (F-04); the other eight await.
12. **Analytics reporting "+100%" from a base of zero.** `AnalyticsDelta` has a
    `no_basis` arm precisely to refuse it.

---

## 26. Recommended fix sequence

In this order, because each step makes the next one measurable.

1. **HARDEN-06A — make the gate tell the truth again** (F-03, F-11). Without it, no
   later step can be verified.
2. **HARDEN-06B — data integrity and authored content** (F-01, F-02). The two things
   an owner cannot get back.
3. **HARDEN-06C — dates, counts and lifecycle honesty** (F-05, F-07, F-08, F-14).
4. **HARDEN-06D — mutations that silently do not happen** (F-04, F-06, F-13, F-12).
5. **HARDEN-06E — projection completeness and the last row fork** (F-09, F-10, F-15,
   and the debt reconciliation).

---

## 27. Proposed PR slices

### HARDEN-06A — A finishing E2E gate — ☑ DELIVERED 2026-08-20

> Record: [`HARDEN_06A_FINISHING_E2E_GATE_2026_08.md`](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md).
> Delivered as scoped, plus three things reading the code turned up that the finding
> did not name: the same unsafe assertion twice more in `reviews-guided.spec.ts`, a
> `durationsFromReports` that double-counted a spec file appearing in two reports,
> and a hand-maintained `source` map that had decayed exactly as the durations had.
> The partition COUNT moved 10 → 12 — the derivation's only knob, and the smallest
> authority that gets the heaviest partition back inside a budget derived from
> `globalTimeout` rather than fitted to the split. `globalTimeout`, `workers` and the
> partition algorithm are untouched.

- **Defects:** F-03, F-11.
- **Why together:** both are about the suite reporting truthfully; the second is
  inside the partition the first is about, and fixing only one leaves the job red.
- **Files/systems:** `e2e/partitions.json`, `scripts/e2e-partitions.mjs`,
  `.github/workflows/ci.yml` (upload `results.json` from green partitions too),
  `e2e/reviews-guided.spec.ts`.
- **Migrations:** none.
- **Tests:** `e2e:partitions:check` gains an assertion that every spec file on disk has
  a measured duration; the re-derived manifest is the diff's own evidence.
- **Risk:** low. No product code changes.
- **Dependencies:** none. **Do first.**
- **Non-goals:** raising `globalTimeout`; changing `workers`; re-designing the split.

### HARDEN-06B — Authored content and recovery

- **Defects:** F-01 (P0), F-02 (P1).
- **Why together:** both are "the owner cannot get this back", both have an exact
  in-repository precedent to copy (the Notes compare-and-set; the
  optional-on-read list), and both are small.
- **Files/systems:** `app/kernel/meetings/*`, `app/platform/storage/d1/d1-meeting-repository.ts`,
  `app/modules/meetings/routes/mutate.tsx`, `app/modules/meetings/MeetingMarkdown.tsx`,
  `app/shared/forms/autosave.ts` (consumer only), `app/kernel/export/workspace-snapshot.ts`,
  `test/unit/export/snapshot-validation.test.ts`.
- **Migrations:** none.
- **Tests:** kernel concurrency pair + route `409` + a two-writer browser journey for
  Meetings; the delete-each-collection invariant for the snapshot.
- **Risk:** medium — it changes a save path an owner uses live. Mitigated by copying a
  shipped, tested shape verbatim.
- **Dependencies:** A.
- **Non-goals:** revision history; automatic prose merging; a CRDT; changing the
  snapshot schema version.

### HARDEN-06C — Dates, counts and lifecycle

- **Defects:** F-05, F-07, F-08, F-14.
- **Why together:** all four are one seam — an owner-local day used where an instant
  is required, or a vocabulary applied inconsistently between two modules — and all
  four are repository-level.
- **Files/systems:** `d1-task-repository.ts`, `d1-cross-view-query-repository.ts`,
  `d1-project-settings-repository.ts`, `d1-review-insight-repository.ts`,
  `app/modules/ai/review-facts.ts`, `app/platform/ai/*`, plus the two comments that
  currently assert the bug.
- **Migrations:** none.
- **Tests:** boundary cases in both offset directions for the recency windows; archive
  with a cancelled and a Someday child; the closed-period guarantee asserted directly.
- **Risk:** medium — F-07 needs a product decision before it is coded.
- **Dependencies:** A.
- **Non-goals:** a history table for due dates or spine links; changing what "overdue"
  means.

### HARDEN-06D — Mutations that silently do not happen

- **Defects:** F-04, F-06, F-12, F-13.
- **Why together:** each is an action the product accepts and then does not perform,
  or performs and then miscounts.
- **Files/systems:** `app/shared/saved-views/SavedViewSwitcher.tsx`,
  `app/kernel/relationships/person-relationship.ts`,
  `app/kernel/activity/activity-validation.ts` (or `d1-activity-repository.ts`),
  `app/platform/storage/d1/d1-habit-repository.ts`.
- **Migrations:** none.
- **Tests:** the held-POST delete probe as a spec; the two interaction-count
  assertions; a 100-id activity page against real D1; a backwards-day cadence change.
- **Risk:** low–medium. F-06 changes a displayed figure and needs the product decision
  recorded.
- **Dependencies:** A.
- **Non-goals:** rewriting the chip row as imperative writes (DEBT-159's own entry
  explains why that trade is worse).

### HARDEN-06E — Projection completeness and debt reconciliation

- **Defects:** F-09, F-10, F-15, plus the DEBT-47 / DEBT-157 re-ratings and the new
  entries in §24.
- **Files/systems:** `app/modules/projects/routes/detail.tsx`,
  `ProjectTasksTab.tsx`, `app/platform/export/manifest.ts`,
  `docs/development/EXPORT_AND_PORTABILITY.md`, `docs/product/PRODUCT_DEBT.md`,
  `app/modules/today/day/week-strip.ts`, `e2e/helpers.ts`.
- **Migrations:** none.
- **Tests:** the cross-surface checklist-figure assertion.
- **Risk:** low, except the `TaskRow` adoption, which is a real UI change and should
  be split out if it grows.
- **Dependencies:** A–D, so the register records what was actually fixed.
- **Non-goals:** redesigning the Project record; exporting credentials.

---

## 28. Gate results

Reproduced verbatim in §2. Summary: **all local gates green; CI red on `main` with two
failing partitions and 33 unexecuted tests.**

**Since HARDEN-06A (2026-08-20), stated as two separate results because they are
two separate results.** Across three twelve-partition runs (`32333645709`,
`32338241602`, `32340347468`), **36 of 36 partitions started, finished and executed
every test they collected — 5541 dispatched, 5541 executed, none unexecuted, none
reaching `globalTimeout`.** That is F-03 closed. But the gate is **not** reliably
green: runs `32338241602` and `32340347468` are the same executable tree, and the
first failed nothing while the second failed four unrelated tests in four
partitions. None of the four is F-03 or F-11; two are shared-workspace state
dependence (**DEBT-173**, raised by HARDEN-06A) and one is the ordinary
intermittency **DEBT-125** has named since August 11. On the green run the worst
partition sat at 76% of `globalTimeout`.
The 33 unexecuted tests are gone, `reviews-guided.spec.ts` is fixed, and a third
assertion of the same shape was found and fixed with it. **F-04** remains and is
deliberately untouched: it is a real product defect belonging to HARDEN-06D by the
sequence in §26. It failed p08 on `main`'s run and passed on both of HARDEN-06A's,
which is evidence for its classification as a race and **not** evidence that it is
fixed. Per-run evidence is in
[`HARDEN_06A_FINISHING_E2E_GATE_2026_08.md` §6](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md#6-ci-evidence).

---

## 29. Remaining uncertainty

Stated plainly, because an audit that does not is worth less.

1. **The full E2E gate was not run locally to completion.** The sandbox is ~7× CI
   wall-clock. The baseline used is CI run `32321840125`, which executed nine
   partitions to completion — but **33 tests in p05 have not run anywhere**, and this
   audit cannot say whether they pass. `today-keyboard.spec.ts` (10) and
   `ux-01-daily-driver.spec.ts` (10) are the ones that matter most.
2. **Rendered contrast is not verified.** Contrast is proved at the token layer over
   every generated scheme in both appearances, which is thorough, but a combination
   the pairs do not enumerate would not be caught (§18).
3. **Production state is unknown.** No Cloudflare credentials in this environment, so
   the applied migration set, the Worker's secrets and the running release were not
   verified. **DEBT-84** already says this and remains ◐.
4. **The nightly D1 dumps were not exercised.** F-02 concerns the owner's exported
   archive, not the raw SQL dumps; restoring a dump into D1 was not attempted and
   would need a real database.
5. **Multi-device concurrency was proved at the repository, not through two real
   browsers.** F-01 and F-06 are reproduced against real D1 in the Workers runtime
   through the production repositories; the browser-level journey is left to the fix PR.
6. **Real-scale data was not generated.** Performance conclusions rest on the query
   shapes and their stated bounds, not on a workspace with years of history. No
   speculative optimisation is recommended anywhere in this document.
7. **No timezone other than Australia/Sydney and America/Los_Angeles was exercised,
   and no real DST transition was driven end-to-end.** The DST-sensitive paths that
   were read (the digest evaluator, the habit check-in, `planning-week`) are all
   structured so DST is a property of a pure function, which is the right shape.

---

## 30. Release recommendation

**Do not release today. Do not begin V2.4 today.**

DalyHub is close — closer than the finding count suggests, because ten of the fifteen
findings are single-function fixes with a precedent already in the repository. But
three things must be true before it is a product you can hand someone and tell them
to trust it with their life:

1. **The gate has to finish.** A suite that cannot report is not evidence. 33 tests
   have never run on the current `main`.
2. **Meeting notes must stop being destroyable.** It is the one place in the product
   where a person's own words can vanish with no trace and no recovery — and the fix
   is a copy of one that already shipped twice.
3. **Restore must work on an archive an owner already has.** A recovery path that
   only accepts backups taken in the last two days is not a recovery path.

Everything else in this document can be scheduled.

### V2.4 decision

> **V2.4 should wait until the full hardening sequence (HARDEN-06A … HARDEN-06E) is
> complete.**

Not because the P2s are individually blocking — they are not — but because F-01,
F-02 and F-06 are all the same failure of process rather than of code: a correct fix
was made in one module and never became a rule the next module had to follow. Adding
a sixth surface that autosaves a document, a fourth that filters by a calendar day, or
a second that contributes to a relationship signal, on top of that, is how the next
audit finds six of each instead of one. The sequence in §26 is short, and finishing it
is what makes V2.4 safe to start.

---

## Related documents

- [`ROADMAP_V2_3.md`](../roadmap/ROADMAP_V2_3.md) — the closed V2.3 programme
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — the register this audit reconciles against
- [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) — ADR-001…ADR-107
- [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) · [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) — F-02, F-10
- [`HARDEN_06A_FINISHING_E2E_GATE_2026_08.md`](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md) — the F-03/F-11 repair and the re-derived split
- [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) — the E2E partition mechanism, F-03
- [`MEETINGS_MODULE.md`](../development/MEETINGS_MODULE.md) · [`NOTES_PERSISTENCE.md`](../development/NOTES_PERSISTENCE.md) — F-01 and the precedent it should copy
- [`PEOPLE_MODULE.md`](../development/PEOPLE_MODULE.md) · [`RELATIONSHIPS.md`](../development/RELATIONSHIPS.md) — F-06
