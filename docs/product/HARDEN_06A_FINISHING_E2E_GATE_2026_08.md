# HARDEN-06A — A finishing E2E gate

**Base SHA:** `05e077e` (`Audit: the whole-application bug search and product-integrity audit (2026-08-20) (#203)`)
**Findings closed:** [F-03](DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md#f-03--main-is-red-and-33-e2e-tests-have-never-executed-on-the-merge-commit--p1) (P1) and [F-11](DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md#f-11--reviews-guided-journey-2-asserts-over-a-value-the-markdown-editor-legitimately-holds-twice-for-one-frame--p3-test-robustness) (P3), the first slice of the [§26 repair sequence](DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md#26-recommended-fix-sequence).
**No product code was changed.** The diff is the partition tooling, the manifest it
generates, the CI workflow's evidence collection, one E2E spec's assertions, and the
documentation for all four.

This document exists so that six months from now it is possible to know **why** the
split has twelve partitions and where each of its 111 measurements came from. It is
not a narrative of the work.

---

## 1. What "the gate is not telling the truth" actually meant

`main` at the base SHA was red, and the red was not a product failure. On CI run
[`32321840125`](https://github.com/acedaly/DalyHub-V2/actions/runs/32321840125),
partition **p05 hit Playwright's 25-minute `globalTimeout`** with

```
245 collected · 212 executed · 33 NEVER EXECUTED · 1 failed
```

Nothing at all could be concluded about `tasks-dependencies` (3),
`tasks-optimistic` (4), `today-keyboard` (10), `ux-01-daily-driver` (10) or
`visual-system` (6). Per the repository's own rule: *a suite that cannot finish stops
reporting, and a report that stops is indistinguishable from a pass.*

### 1.1 F-03 — reproduced from the run's own artefacts, not from the audit's prose

The audit's diagnosis was re-derived here from `e2e-report-p05` (artifact
`9390527305`) and `e2e-report-p08` (`9390350145`), which were downloaded and parsed
rather than read about. The manifest was **wrong in both directions**, which is why
the imbalance had gone unnoticed:

| Spec file | Manifest said | Run 32321840125 measured | |
| --- | ---: | ---: | --- |
| `tasks-dependencies.spec.ts` | *(no entry — sized at the 120 s guess)* | **323.7 s** | 2.7× |
| `accessibility.spec.ts` | 446.3 s | **516.3 s** | +16% |
| `tasks-v22-daily-driver.spec.ts` | 297.7 s | **192.6 s** | −35% |
| `pwa-offline-tasks.spec.ts` | 201.4 s | **111.1 s** | −45% |

p05's thirteen spec files were budgeted **19.4 min** and actually cost **22.9 min of
measured test time** — before any wall-clock overhead. It could not have finished.

**Ten of the 111 spec files had no measurement at all**, and no test count either, so
the manifest did not know how many tests it was dispatching: its own estimate summed
to 1595 against the suite's real ~1754. Confirmed on this commit, independently of
the audit:

```
habits · identity · notifications · plan-responsive · plan-smart-lists
plan-weekly-planning · spine-workspaces · tasks-dependencies
today-task-convergence · ux-02-plan-habits
```

**Root cause, one sentence.** The durations could only ever be refreshed from a
partition that FAILED — `results.json` lived inside `playwright-report/`, which the
workflow uploaded only `if: always() && steps.e2e.outcome != 'success'` — so guesses
accumulated across four merges with nothing able to correct them, and nothing
refused to merge a manifest that was still guessing. That is
[DEBT-157](PRODUCT_DEBT.md) reaching the outcome it predicted.

### 1.2 F-11 — reproduced, and the "one frame" claim tested rather than assumed

p05's one real test failure:

```
reviews-guided.spec.ts:319  expect(getByText('Halfway through, then interrupted.')).toBeVisible()
strict mode violation: resolved to 2 elements
  1) <textarea class="dh-md-editor__fallback" aria-label="Overall reflection">…
  2) <div class="cm-line">…
```

`LiveMarkdownEditor` renders the no-JS `<textarea>` while `!editorReady` and mounts
CodeMirror into the `hidden` container beside it. `new EditorView({ parent })`
inserts CodeMirror's DOM — `.cm-line`, carrying the document text — **synchronously**,
and `setEditorReady(true)` only lands on the next React commit. Between the two the
value is in the document twice. Both facts are deliberate and correct: the fallback
keeps the note editable with no JavaScript, and the `hidden` container keeps
CodeMirror out of the accessibility tree until it is the writing surface.

The audit called the window "one frame" and inferred that a saturated runner had
landed the assertion inside it. That inference was **tested here rather than
believed**, because it decides whether this is a test defect or a product one. A
fixture that reproduces the two-element DOM and resolves it after 1 s, driven by the
repository's own Playwright 1.62.1:

```
Error: expect(locator).toBeVisible() failed
Locator: getByText('Halfway through, then interrupted.')
Error: strict mode violation: … resolved to 2 elements
Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Halfway through, then interrupted.')
```

— byte-for-byte the message CI produced, and produced **immediately**: Playwright
does not retry a strict-mode violation, so the assertion never reached its own 5 s
budget. The window therefore does not have to be wide to be fatal; it only has to
contain the *first* evaluation.

**Classification: harness defect (category 4).** No data is at risk, no product
behaviour is wrong, and the assertion was unsafe at any speed — the p05 overrun only
decided *when* it would be caught.

---

## 2. What was changed

### 2.1 Every gate spec file must carry a real measurement

`pnpm run e2e:partitions:check` now fails while any spec file on disk has no
measured **duration**, no measured **test count**, or no recorded **provenance**.
The question is asked over `listSpecFiles()` — the same canonical discovery the gate
itself partitions on — so there is no second list to keep in step, and a spec file
cannot be measured-by-omission.

`DEFAULT_SPEC_SECONDS` still exists and is unchanged at 120 s. It is what keeps a
brand-new spec file IN the gate between the commit that adds it and the run that
measures it; what it may no longer do is survive that run silently. The distinction
is now the tests' own: *"keeps a NEW, unmeasured spec file in the gate rather than
losing it"* and *"still fails after the newcomer has been GIVEN a partition on the
guess"* both pass, and they are the two halves of the invariant.

### 2.2 The partition budget is derived, and checked where CI can see it

The budget assertion used to live only in the unit test, as a flat *"worst partition
under 20 minutes"* — which the p05 that could not finish satisfied, at 19.4 min. It
is now derived from the ceiling it is supposed to protect:

```
MAX_PARTITION_SECONDS = globalTimeout × 0.75 ÷ 1.12  =  1004 s  (16.7 min)
```

- **`globalTimeout` = 25 min**, unchanged, and cross-checked against
  `playwright.config.ts`'s own source by a unit test so the copy cannot drift.
- **÷ 1.12** — the MEASURED wall-clock cost of a second of test time. First
  estimated at 1.109 from p08 of run `32321840125`, the one partition of that
  run that completed; then confirmed across **all twelve** partitions of run
  `32333645709`, which spent 195.0 min of Playwright wall clock on 175.1 min of
  measured tests — **1.114 overall, 1.094–1.131 per partition**. 1.12 is the
  mean, rounded up; the spread above it is carried by the utilisation margin
  rather than by inflating this number.
- **× 0.75** — the ~70%-of-ceiling target every split since HARDEN-04 has been tuned
  to (see [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) → *Partition budget*).

A partition at the ceiling is predicted to finish in 18.7 min, leaving **6.3 min of
`globalTimeout` unspent** for measurement drift and runner-to-runner variance. Both
are real and both were measured: run `32321840125` showed the same spec files
costing up to 35% more on one runner generation than another, and run
`32333645709` measured 175.1 min of test time against a manifest that said 165.4 —
**6% of drift inside a single run**.

### 2.3 Ten partitions became twelve

Not to make a failing run fit. With every spec file finally measured the suite is
**175.1 min** of test time, and ten partitions cannot hold that inside the budget
above: `responsive.spec.ts` is one generated matrix file, so `--shard` is the only
way to divide it and it consumes two partitions at 11.8 min each, leaving the other
eight carrying 19.0 min apiece. Derived at each count against run `32333645709`'s
measurements:

| Partitions | Heaviest | Predicted wall clock | % of `globalTimeout` | |
| ---: | ---: | ---: | ---: | --- |
| 10 | 19.0 min | 21.3 min | 85% | over `MAX_PARTITION_SECONDS` |
| 11 | 16.9 min | 18.9 min | 76% | over it too, by 0.2 min |
| **12** | **15.2 min** | **17.0 min** | **68%** | **chosen** |
| 13 | 13.8 min | 15.5 min | 62% | past the pool's twelve-job ceiling |

Twelve is the **first** count that satisfies the ceiling, and it puts the heaviest
partition back at the ~70%-of-ceiling target. `PARTITION_COUNT` is the only knob the
derivation exposes and the documented lever for exactly this; the algorithm, the
manifest schema and the whole-spec-file model are untouched.

Twelve is also the runner pool's own measured ceiling (run `31445526789` queued six
of eighteen jobs for 5.5–7.0 min), so it was worth checking rather than assuming.
Run `32333645709` settled it: **all twelve E2E jobs started within one second of
each other** (04:56:21–04:56:22) and none queued. A queued job would cost wall clock
only — it has not started, so it spends none of its `globalTimeout`.

### 2.4 Timing evidence now leaves every partition

`playwright-report/results.json` uploads as `e2e-results-<partition>` on **every**
partition, green or red. It is a few hundred KB against the report's several MB, so
one per partition costs less than a single report and can be kept unconditionally;
the multi-megabyte report and traces keep their failure-only condition.

That one step carries `continue-on-error: true`, deliberately and only there, and
the decision is explicit: it runs on green partitions, so a transient
artifact-service failure would otherwise turn a passing product gate red. **Evidence
collection is best-effort; the product gate is not.** A partition that produced no
`results.json` at all is still a hard failure, in `scripts/e2e-partition-summary.mjs`
where it belongs, and is unaffected by whether the upload succeeded.

### 2.5 Two correctness fixes inside the tooling

Both were found while re-deriving, and both are small:

- **`durationsFromReports` summed per FILE across reports**, so a spec file appearing
  in two reports was counted twice. It accumulates per TEST now, which is the only
  way to get both real cases right: the two shard reports of `responsive.spec.ts`
  hold different tests and must ADD UP, while the same tests seen twice must
  REPLACE. Pinned by three unit tests.
- **The `source` map was maintained by hand** and had decayed exactly as the
  durations had — no entry for the ten unmeasured files, and several files still
  labelled `local/1.13` that CI had since measured directly. `generate` writes it now
  (`--from <results.json> --as <label>`) and `check` requires it.

### 2.6 F-11, and its two siblings in the same file

The assertion now names the live writing surface instead of asking the page for
text:

```ts
await waitForEditor(page);
await expect(promptEditorText(page)).toContainText("Halfway through, then interrupted.");
```

That is unambiguous *and stronger*: it says the owner's text came back into the
editor they will keep writing in, not merely that the string exists somewhere on the
page. It is also the shape this repository already uses everywhere else
(`notes-knowledge.spec.ts`, `notes.spec.ts`, `forms.spec.ts`).

Three further changes came out of reading the file rather than only the finding:

- `waitForEditor` was `page.locator('[data-editor-ready="true"]').first()` — satisfied
  by whichever editor mounts first, which is not necessarily the one the next line
  asserts over. It is scoped to the step's own prompt editor now.
- **Journey 5 carried the same unsafe assertion twice**, unfixed by the audit because
  neither had failed yet: once on the guide's Reflect step (identical shape) and once
  on the Review RECORD, where every open section mounts its own `LiveMarkdownEditor`
  — the same ambiguity multiplied by the section count. Both now assert a named
  surface.
- A **regression assertion** was added where the failure was: once the editor
  reports ready, `.dh-md-editor__fallback` must be gone. The handover is a
  replacement, not an overlap; if the product ever left both in place this fails with
  the cause named, instead of returning as an intermittent strict-mode violation in
  whichever assertion happens to look at the text next.

Journey 1's two `getByText` assertions were checked and deliberately left alone: they
run against a **completed** Review, which renders `<pre>` and mounts no editor.

### 2.7 `tasks-collection`'s default-view journey — the same shape, found by the run

The re-derived split put `tasks-collection.spec.ts` and `today-task-convergence.spec.ts`
in one partition for the first time, and CI run `32333645709` immediately produced
six failures from one cause. Both halves of it are the F-11 shape again — an
assertion that was unsafe regardless of timing, and a cleanup that only ran on
success — and both are fixed here. The full chain is in §6.3; the short version:

- the comparison now excludes the shell's `role="status"` live region **and
  nothing else**, so it still asserts everything the claim is about;
- the restore of the owner's default Tasks view is an `afterEach`, not a last
  line, so a failure or a timeout can no longer leak workspace-level state into
  the next spec.

---

## 3. The split, before and after

Estimates are measured test time; neither figure includes per-partition setup.

| | Before (`main` @ `05e077e`) | After |
| --- | --- | --- |
| Partitions | 10 | **12** |
| Spec files | 111 | 111 |
| Spec files with a real measurement | **101** | **111** |
| Spec files with a measured test count | 100 | **111** |
| Spec files with a recorded source | 101 | **111** |
| Total measured test time | 174.2 min *(16 of them guessed)* | **175.1 min** |
| Mean partition | 17.4 min | **14.6 min** |
| Heaviest | **19.5 min** | **15.2 min** |
| Lightest | 9.5 min | 11.8 min |
| Spread (heaviest − lightest) | 10.0 min | **3.4 min** |
| worst/mean | 1.12 | **1.04** |
| Heaviest as % of `globalTimeout` (predicted wall clock) | **87%** | **68%** |
| Heaviest against `MAX_PARTITION_SECONDS` (16.7 min) | over by 2.8 min | **1.5 min inside** |

<!-- prettier-ignore -->
| Before | | | After | | |
| --- | ---: | --- | --- | ---: | --- |
| p01 | 19.5 min | 14 specs | p01 | 15.2 min | 10 specs |
| p02 | 19.4 min | 14 specs | p02 | 15.2 min | 11 specs |
| p03 | 19.4 min | 14 specs | p03 | 15.2 min | 11 specs |
| p04 | 19.4 min | 14 specs | p04 | 15.2 min | 11 specs |
| p05 | 19.4 min | 13 specs | p05 | 15.2 min | 11 specs |
| p06 | 19.4 min | 14 specs | p06 | 15.2 min | 11 specs |
| p07 | 19.3 min | 14 specs | p07 | 15.1 min | 11 specs |
| p08 | 19.3 min | 13 specs | p08 | 15.1 min | 12 specs |
| p09 | 9.5 min | `responsive` 1/2 | p09 | 15.1 min | 11 specs |
| p10 | 9.5 min | `responsive` 2/2 | p10 | 15.1 min | 11 specs |
| | | | p11 | 11.8 min | `responsive` 1/2 |
| | | | p12 | 11.8 min | `responsive` 2/2 |

**No partition is close to the ceiling.** The heaviest is 15.2 min of measured test
time — a predicted 17.0 min of wall clock, **8.0 min inside** the 25-minute
`globalTimeout`, and 1.5 min inside `MAX_PARTITION_SECONDS` itself. The worst
partition ACTUALLY observed on run `32333645709` took 18.6 min, which is 74% of the
ceiling and still over six minutes clear of it.

The two `responsive` slices remain the split's one inefficiency — at 11.8 min each
they sit 2.8 min under the mean, and that unused capacity is what the other ten
partitions absorb. It is much smaller than it was (the file's own measurement rose
from 1141.7 s to 1416.6 s, so its slices are closer to a full partition), it is a
property of `--shard` being the only way to divide one generated matrix file, it is
not a defect, and it is **not** addressed here — HARDEN-06A is not a redesign of the
partition strategy.

## 4. Where each measurement came from

`e2e/partitions.json` records this per file in `source`, written by `generate` and
required by `check`. As committed, that map holds **one value for all 111 files**:

```
ci:32333645709   111 spec files
```

Every measurement in the manifest comes from **one CI run, the twelve-partition
gate on this branch** — the first time that has been true of this file. No local,
normalised or extrapolated figure survives in it. That is the refresh
[DEBT-157](PRODUCT_DEBT.md) was raised to make possible: all twelve partitions
published an `e2e-results-<partition>` artifact, eleven of them green, and
`generate --from` was re-run over the complete set.

Getting there took two passes, and the first one is worth recording because it is
the only way a run that could not finish becomes a run that can:

1. **Interim.** The ten unmeasured spec files were measured locally and divided by
   each run's own measured local/CI ratio (1.184, 0.974, 1.000 — every local run
   included calibration spec files whose CI seconds were known from run
   `32321840125`), and 22 more came from that run's p05 and p08 reports. Enough to
   size a split that finishes.
2. **Authoritative.** That split finished — twelve partitions, 1847 tests, none
   unexecuted — and published twelve `results.json`. The manifest was then
   re-derived from those, which is what is committed.

What the corrected measurements actually said:

| Spec file | Was | Now | |
| --- | ---: | ---: | --- |
| `tasks-dependencies.spec.ts` | *(guess 120 s)* | **326.7 s** | 2.7× the guess — p05's overrun on its own |
| `responsive.spec.ts` | 1141.7 s / 465 tests | **1416.6 s / 519 tests** | +24%, and 54 more tests than the manifest knew of |
| `project-templates.spec.ts` | 312 s | 204.6 s | −34%, a stale `local/1.13` estimate |
| `pwa-offline-tasks.spec.ts` | 201.4 s | 160.1 s | −21% |
| `tasks-v22-daily-driver.spec.ts` | 297.7 s | 265.3 s | −11% |
| `accessibility.spec.ts` | 446.3 s | 404.9 s | −9% |
| `habits.spec.ts` | *(guess 120 s)* | 134.4 s | |
| the other eight guesses | *(guess 120 s)* | 50.6–104.8 s | all cheaper than the guess |

The manifest was wrong in **both** directions, and that is why the imbalance
survived four merges: the files it over-estimated hid the ones it under-estimated,
so the total looked stable while the distribution did not. Its test estimate was
1595 against a real 1847 — it did not know about 252 of the tests it was
dispatching.

## 5. Verification

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | ok |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` | pass |
| `pnpm run scheme:check` | pass |
| `pnpm run icons:check` | pass |
| `pnpm run e2e:partitions:check` | pass — *111 spec files across 12 partitions, heaviest 14.7 min* |
| `pnpm run test:unit` | pass |
| `pnpm run test:kernel` | pass |
| `pnpm run build` | pass |

Targeted E2E, on this sandbox against the production build:

- **`reviews-guided.spec.ts` × 3** — the F-11 fix, run repeatedly to establish it is
  deterministic rather than merely passing once.
- **171 tests across the ten re-measured spec files and eight calibration files**,
  and **43 + 61 more** in the two calibration runs — every one of them green, which
  is what makes the measurements usable as well as the specs.
- The Playwright strict-mode fixture in §1.2, which is what turned F-11's "one
  frame" from an inference into a measurement.

A complete local `pnpm run e2e:gate` was **not** run and is not claimed: twelve
partitions in sequence is ~175 min of tests plus setup on one machine. The
authoritative twelve-partition result is CI's own, recorded in §6, and it is read
there partition by partition rather than by the green tick.

---

## 6. CI evidence

**Run [`32333645709`](https://github.com/acedaly/DalyHub-V2/actions/runs/32333645709)**
(`bf38e35`), the twelve-partition gate, read partition by partition rather than by
the green tick.

### 6.1 Did every intended test run?

**Yes.** Counted out of the twelve `results.json`, not out of the job summaries:

| | |
| --- | ---: |
| Tests collected | **1847** |
| Tests executed | **1847** |
| Passed | 1837 |
| Failed | 6 |
| Deliberately skipped (a `test.skip` the suite meant) | 4 |
| **Left unexecuted** | **0** |

Against `main`'s 33 unexecuted tests in one partition, that is the finding closed.
Every partition started, every partition finished, and none reached
`globalTimeout`.

| Partition | Collected | Executed | Never ran | Budget | Elapsed | % of ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| p01 | 118 | 118 | 0 | 14.7 min | 17.8 min | 71% |
| p02 | 173 | 173 | 0 | 14.7 min | 17.0 min | 68% |
| p03 | 108 | 108 | 0 | 14.7 min | 17.1 min | 68% |
| p04 | 117 | 117 | 0 | 14.6 min | 16.5 min | 66% |
| p05 | 138 | 138 | 0 | 14.6 min | 15.4 min | 62% |
| p06 | 202 | 202 | 0 | 14.6 min | 14.3 min | 57% |
| p07 | 117 | 117 | 0 | 14.6 min | 16.1 min | 64% |
| p08 | 102 | 102 | 0 | 14.6 min | 17.6 min | 70% |
| p09 | 122 | 122 | 0 | 14.6 min | 18.0 min | 72% |
| p10 | 131 | 131 | 0 | 14.6 min | **18.6 min** | **74%** |
| p11 | 260 | 260 | 0 | 9.5 min | 13.7 min | 55% |
| p12 | 259 | 259 | 0 | 9.5 min | 12.9 min | 52% |

The worst partition spent **74%** of the ceiling, with 6.4 minutes unspent. The
budgets in that table are the ones the run was dispatched with; the manifest was
re-derived from the run afterwards, which is why they no longer match the split in
§3.

### 6.2 Did the mechanisms work?

- **Twelve `e2e-results-p*` artifacts published, eleven of them from GREEN
  partitions.** That is the DEBT-157 mechanism doing the thing it was raised for,
  and it is what made §4's authoritative refresh possible without waiting for an
  outage.
- **The overhead factor was confirmed, not assumed.** 195.0 min of wall clock over
  175.1 min of tests: 1.114 overall, 1.094–1.131 per partition, against the 1.12
  the ceiling is derived from.
- **Twelve partitions do not contend.** All twelve E2E jobs started within one
  second of each other; none queued.
- **The manifest was 6% adrift within a single run** (175.1 min measured against
  the 165.4 min committed). Not a defect — it is what the utilisation margin is
  for — but it is the number that says why the margin has to be a quarter of the
  ceiling rather than a rounding allowance.

### 6.3 The six failures, and the third finding

All six were **one root cause**, in p02, and the cascade is itself the finding:

1. `tasks-collection.spec.ts:760` compares Today's `main.innerText()` before and
   after choosing a default Tasks view. `main` opens with `ConnectionStatus`'s
   `role="status"` live region, whose text settles asynchronously; the two
   snapshots differed by the line **"Online. Not stored offline yet."** and by
   nothing else. The claim the test makes was never in question.
2. The restore — *"so the preference does not leak into another spec"* — was the
   **last line** of the test, so the failure above skipped it and left `Waiting`
   as the owner's default Tasks view. That is workspace-level state.
3. Five `today-task-convergence` journeys then navigated to a bare `/tasks`, which
   honours that default, found a filtered collection with no row of their own, and
   were reported as failures of their own code. (The one assertion in that file
   that passes an explicit `?system=…` passed.)

Same family as F-11 — an assertion that was unsafe regardless of timing, plus a
cleanup that only ran on success — and surfaced because the re-derived split put
the two files in one partition for the first time. Both halves are fixed: the
comparison excludes the live region and nothing else, and the restore is an
`afterEach`, which runs on a failure and on a timeout alike. **A spec that mutates
owner-level state has to hand it back whatever happens to it**, and that is the
durable lesson, not the one assertion.

Worth stating plainly: one real defect being reported as six, five of them in an
innocent file, is the same class of problem as 33 tests never running. A gate that
misattributes is not telling the truth either.

### 6.4 What is still red, deliberately

`plan-smart-lists.spec.ts:121` — **F-04**, the deleted saved view that is still
listed — passed on this run and failed on `main`'s. It is a race in product code
(the delete is fire-and-forget and the dialog closes as if it succeeded), it is a
**real product defect** rather than a harness one, and the audit assigns it to
**HARDEN-06D**. Fixing it here would be exactly the saved-view mutation work this
slice is not. It is named rather than quietly carried, and its intermittency is
itself evidence for the audit's classification.

## 7. Scope discipline

**In:** E2E timing and partition correctness, partition validation, the F-11
regression fix, CI timing evidence, and the tests and documentation those need.

**Deliberately out**, and each already has a home:

- **F-04** — the deleted saved view is still listed (`plan-smart-lists.spec.ts:121`).
  It is p08's failure on run `32321840125` and it is a **real product defect**, not a
  harness one: the delete is fire-and-forget and the dialog closes as if it
  succeeded. It belongs to **HARDEN-06D** ([§26](DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md#26-recommended-fix-sequence)),
  and fixing it here would be exactly the saved-view mutation work this slice is not.
  It is named in the PR rather than quietly carried.
- Everything else in the audit's F-01, F-02, F-05…F-15.
- The `responsive` slicing inefficiency described in §3 — a partition-strategy
  question, and HARDEN-06A is explicitly not a redesign.
- **DEBT-158's never-executing Goal measurement journey.** Run `32333645709`'s
  four deliberate skips include it, exactly as the entry says. It needs a fixture
  change with a blast radius across partitions, which is not a change to make in
  the pass that is trying to establish the twelve are green.
- **A new observation against [DEBT-159](PRODUCT_DEBT.md), recorded there rather
  than fixed here.** `tasks-collection.spec.ts:298` — which removes exactly ONE
  filter chip — fails 4/4 from a freshly seeded local D1 on this sandbox, landing
  on `/tasks?group=due_state` with neither filter left, and passes on CI. The
  entry claims a removal made immediately after applying a filter is already
  correct; on a slow enough machine it is not. HARDEN-06A touched only the
  `Today integration` block of that file — the failing test's code path is
  byte-identical to `main` — and filter behaviour is outside this slice.

`globalTimeout` was not raised. `workers` was not raised. No retry was added. No
test was skipped, quarantined, `fixme`d, split to game a timing calculation, or
made less strict; every assertion this PR touched — F-11's, its two siblings in the
same file, and `tasks-collection`'s default-view comparison — became *more* specific
than it was, and one new regression assertion was added that did not exist before.

The count of deliberate `test.skip`s in the suite is unchanged at four, and none of
them is new.
