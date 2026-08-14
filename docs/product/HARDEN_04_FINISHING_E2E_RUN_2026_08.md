# HARDEN-04 — A finishing, readable E2E run

**Date.** 2026-08-13. **Base.** `main` @ [`0b586eb`](https://github.com/acedaly/DalyHub-V2/commit/0b586eb89b54e4b737f49c2023d9f69d5aa6d0df) (BACKUP-02 #172).

## 1. Purpose

[HARDEN-03](HARDEN_03_CLOSE_RELIABILITY_LOOP_2026_08.md) left exactly one thing
standing between DalyHub and ordinary feature work: **the E2E gate cannot finish,
so neither a green nor a red result means what it appears to mean.** This pass
does two bounded pieces of work and stops.

1. Re-derive the split from **measured execution time** (DEBT-128).
2. Diagnose the **four** named residual failures, individually (DEBT-129).

Then re-evaluate DEBT-125 against the result, and leave DEBT-76 answerable rather
than answered.

## 2. Before

### 2.1 The split, and what it actually did

`.github/workflows/ci.yml` ran `playwright test --shard=n/8`. Playwright divides
by test **COUNT**. MEASURED from the `list` reporter's per-test durations in the
job logs of three `main`-class runs:

| Run | Commit | Shard time (min), 1→8 | Never run |
|---|---|---|---|
| [`31675715619`](https://github.com/acedaly/DalyHub-V2/actions/runs/31675715619) | HARDEN-03 branch | 15.1 · 18.2 · 14.3 · 17.1 · 12.1 · 8.4 · 10.9 · 18.2 | 0 |
| [`31690164253`](https://github.com/acedaly/DalyHub-V2/actions/runs/31690164253) | `20410c5` | 14.8 · 22.1 · 14.2 · **22.4** · 11.3 · 8.5 · 9.9 · **22.9** | **111** |
| [`31697528360`](https://github.com/acedaly/DalyHub-V2/actions/runs/31697528360) | `0b586eb` **tip** | 12.7 · 22.0 · 14.8 · **22.2** · 11.2 · 7.9 · 10.2 · **22.7** | **132** |

- **Imbalance ratio (max/mean): 1.45–1.47**, and the two worst shards were not
  slow because they were unlucky — they were doing three times the work per test.
  Shard 6 ran **198 tests in 7.9 minutes**; shard 8 ran **109 in 22.7** and left
  87 unstarted. Same count, 2.9× the cost.
- **The suite is not equal, and never was.** Per spec file, measured:
  `responsive.spec.ts` 465 tests / 19.0 min (2.5 s a test), `tasks-journey.spec.ts`
  6 tests / 5.3 min (**53 s** a test), `csrf.spec.ts` 2 tests / 3.1 s (1.6 s).
  A count-based slicer cannot see any of that.
- **Setup cost per shard, measured from job timestamps:** 0.8 min to checkout,
  install the toolchain, download the build artifact and install the browser, plus
  1.5 min from the start of the run step to the first test (both web servers,
  migrations, seed). **2.3 min per shard that buys no coverage.**
- **Runner concurrency, measured:** all eight shards started within **0.1 min** of
  each other on all three runs. Eight is not contended. (Run `31445526789`, at
  eighteen shards, had six jobs queued 5.5–7.0 min — the ~12-job ceiling
  HARDEN-01 recorded still stands.)

### 2.2 What never ran

The same **114 tests in 18 spec files** — the alphabetical tail, from
`projects.spec.ts` to `waiting.spec.ts` — executed in **none** of the three runs
above. That set includes `today-focus.spec.ts`, which owns two of the four
DEBT-129 failures: they were invisible on the tip not because they were fixed but
because the shard holding them ran out of time before reaching them.

### 2.3 State of the relevant debt

| Entry | On arrival |
|---|---|
| DEBT-125 | ◐ P1 — deterministic half met; the suite still cannot finish, so the closing condition is unevaluable |
| DEBT-128 | ☐ P1 — the count-based slicer concentrates the heaviest specs |
| DEBT-129 | ☐ P1 — four named deterministic failures, each owned by a feature |
| DEBT-76 | ☐ P2 — "ten consecutive green `main` runs", uncountable while `main` cannot finish |

## 3. Decision — a time-balanced partition of whole spec files

### 3.1 What was built

- **[`e2e/partitions.json`](../../e2e/partitions.json)** — generated and
  committed. It carries the measured seconds and test count of every spec file,
  and the partition each belongs to.
- **[`scripts/e2e-partitions.mjs`](../../scripts/e2e-partitions.mjs)** — derives
  the split (pure function of those durations and the spec files on disk),
  `check`s the manifest, prints it, and emits the Playwright arguments and the
  workflow's matrix.
- **[`scripts/e2e-partition-summary.mjs`](../../scripts/e2e-partition-summary.mjs)**
  — the end-of-job answer to "what actually happened?", and the thing that makes
  an unfinished partition impossible to read as a pass.
- **[`scripts/e2e-gate.mjs`](../../scripts/e2e-gate.mjs)** (`pnpm run e2e:gate`) —
  runs every partition locally, in sequence, the way CI runs them.

The algorithm is longest-processing-time greedy packing over **whole spec files**,
which is four lines of code and re-derivable by hand. A file heavier than one
partition's share gets its own partitions and is divided between them by
Playwright's `--shard` **applied to that one file** — today only
`responsive.spec.ts`, a generated `path × viewport` matrix of 465 near-identical
tests, where a test's count genuinely is its cost.

### 3.2 Why ten partitions

| Constraint | Evidence | Consequence |
|---|---|---|
| Runner pool saturates past ~12 concurrent jobs | run `31445526789`: 6 of 18 shards queued 5.5–7.0 min | ≤ 12 |
| Each partition costs 2.3 min of setup that buys nothing | measured above | as few as the ceiling allows |
| No partition may approach `globalTimeout` (25 min, unchanged) | shard 8 at 22.7 min lost 87 tests | worst ≤ ~16 min |
| Browser lifetime is a sizing variable | HARDEN-01: `browser.newContext … closed` at a POSITION (~185 tests in), 3 of 4 sampled runs | shorter than the old ~24 min / ~190 tests |

Ten satisfies all four: **145 min of measured test time, mean 14.5, worst 15.6,
worst/mean 1.09**, ~160 tests and ~14 min of browser lifetime per partition, and
all ten start in one wave. Twelve would shave ~2 minutes of wall-clock and sit on
the runner-pool boundary; eight leaves the heaviest partition at ~18 min with
`responsive.spec.ts` unsplittable beneath it. Neither is worth the certainty ten
buys.

### 3.3 Why raising `globalTimeout` was rejected

It is arithmetically impossible, not merely inelegant. Shard 8 completed 102–160
of ~190 tests in its full 25 minutes; at that rate the whole slice needs **31–46
minutes**, past the job's own 40-minute `timeout-minutes`. A bigger Playwright
ceiling would move the failure from Playwright — which writes its report, traces
and `results.json` — to GitHub, which cancels the job and destroys them. The
ceiling is **unchanged at 25 minutes** and is now a backstop rather than a budget.

### 3.4 Alternatives considered

- **More shards, same slicer.** Rejected: it does not fix concentration (the
  heaviest file lands wherever it lands), and past ~12 jobs it buys no wall-clock.
- **Raising `workers` above 1.** Rejected on the repository's own evidence:
  `owner-timezone.spec.ts` mutates the owner's timezone and `appearance.spec.ts`
  resets the stored appearance, both global persisted state. Whole-file
  partitioning *strengthens* isolation instead — a file's tests, and the fixtures
  they share, now always run together.
- **Splitting `responsive.spec.ts` into several files.** Rejected: reorganising
  tests to suit a scheduler is the tail wagging the dog, and `--shard` inside one
  uniform generated matrix is exactly the case count-based slicing is correct for.
- **A dynamic/learning scheduler, or a hosted test-splitting service.** Rejected:
  the brief asks for something boring, deterministic and reviewable in a diff.

### 3.5 Keeping it honest as the suite grows

`pnpm run e2e:partitions:check` runs in **Static**, and fails when the manifest is
not what the committed durations derive — which is what happens the moment a spec
file is added, removed or renamed. A new file is sized pessimistically (120 s)
until a run measures it. So a spec file cannot silently be left out of the gate,
which is the failure mode a hand-maintained group list would have introduced.

## 4. The four residual failures

Each was diagnosed from the **CI trace and page snapshot of the run that failed**,
downloaded from the Actions artifacts, rather than from the error message alone.
None of the four reproduces locally, and none of them is flaky in the sense of
"sometimes the browser is slow": each has a mechanism, and each mechanism is
sensitive to how much data the shared development workspace holds by the time the
test runs — which is why CI sees them and a local run does not.

### 4.1 `tasks-v22-daily-driver.spec.ts:158` — TASKS-05

**Symptom.** `locator.click` on the filing project's `menuitemradio` burns the
whole 30-second test budget: *"locator resolved to … element was detached from
the DOM, retrying"*. Seen on 4 of 7 `main` runs, and again on the tip
(`31697528360`).

**Classification: D — timing/synchronisation defect in the test.**

**Root cause.** The step before sets the row's due date to today. The row paints
"Today" immediately from the client's optimistic patch map, but its GROUP is the
server's: `applyTaskPatchesToGrouping` deliberately leaves the bucket alone —
*"An optimistic presentation may re-render a row; it may not restate an
authoritative figure … the bucket a patched row sits in is corrected by the
revalidation"* (`task-optimistic.ts`, ADR-086). The test asserted the paint and
then opened a menu on the row. From the trace of run `31697528360` (shard 8):

| t (s) | Event |
|---|---|
| 1055.0 | due date saved · `POST /tasks/bulk` |
| 1055.8 | "Project or Area" clicked · menu opens (`aria-expanded="true"`, `id="_r_2_-menu"`) — row is under the **"No date"** section |
| 1056.1 | click on the option begins |
| 1056.6 | row is under the **"Today"** section, ids now `_r_j_`/`_r_k_`/`_r_l_`, trigger `aria-expanded="false"` |

New React `useId` values across the move: the row was **re-created** in its new
group, taking the open menu with it. The click then retried against a detached
option until the budget expired.

**Repair.** The test now waits for the row to be in the group the server put it
in before opening the next inline editor — a deterministic application state, not
a sleep. No timeout raised, no selector widened.

**Proof.** The wait asserts the documented regroup, which nothing asserted
before; the spec passes locally (12/12) and the step is now ordered after the
revalidation rather than racing it.

### 4.2 `today-focus.spec.ts:290` — TODAY-10

**Symptom.** `expect(dayRows.count()).toBeLessThanOrEqual(8)` → **received 9**.

**Classification: B — the test asserts a rule the product does not have.**

**Root cause.** `FOCUS_TODAY_SHOWN = 8` bounds the **open** rows. Completions are
always drawn, after them, by explicit design: *"a row the owner just ticked must
not vanish … so the bound is applied to the open rows alone, and every task
completed today is drawn after them"* (`day-view.ts` → `boundBand`). The test
counted every row, so it passed only while nothing in the shared development
workspace happened to be completed today, and read nine — eight open plus one
completion another journey left on the day — as soon as something was.

**Repair.** Count OPEN rows against the bound, which is what the bound means, and
additionally assert the other half of the rule the failure exposed: within every
band, open work comes first and completions after it.

**Proof.** Strictly more coverage than before (the placement rule was previously
unasserted), and no longer dependent on what other journeys left behind.

### 4.3 `today-focus.spec.ts:331` — TODAY-10

**Symptom.** `expect(new Set(rows.map(r => r.height)).size).toBe(1)` → **received
2**. Reproduced locally once the shared workspace was populated the way a CI shard
populates it.

**Classification: B — the assertion contradicts the panel's own design.**

**Root cause, MEASURED at 320px:**

| Row | `getBoundingClientRect().height` | `border-block-start-width` |
|---|---|---|
| first row of a band | **61px** | 0px |
| every row after it | **62px** | **1px** |

`.dh-day-row + .dh-day-row { border-block-start: … }` — the deliberate hairline
*between* rows (`today.css`). Every non-first row in a band is exactly 1px taller,
by design, so "every row is the same height" can only hold when every band
contains exactly one row. Every title was a single line in every case; the rhythm
the assertion exists to protect was never broken.

**Repair.** Assert the rule itself: each row's title occupies exactly **one line
box** (the nowrap/ellipsis contract), and every row's own box — height minus its
own hairline — is identical. The 44px target floor and the title-dominance
assertion are untouched.

**Proof.** The wrapped-title and grown-row regressions the original assertion was
protecting against are now caught *directly* rather than inferred from a
neighbour's height; the test passes at 320/375/390/430 against a populated
workspace, which the original did not.

### 4.4 `pwa-offline-tasks.spec.ts:386` — PWA-12

**Symptom.** `waitForDrained` — a 45-second poll for an empty queue — expires
with one change still queued.

**Classification: D — timing/synchronisation defect in the test.**

**Root cause.** From the trace of run `31641975444` (shard 5):

| t (s) | Event |
|---|---|
| 103.8 | this page's offline priming completes (`GET /offline/snapshot` 200) and starts a replay pass |
| 103.9 | the test calls `unroute` and `reload` |
| 104.0 | `POST /tasks/pwa12-durable` — **no response**: the navigation killed the request in flight |
| 104.6→109 | the fresh page loads and primes; **no further attempt in 45 s** |

A replay marks its record `syncing` **before** it sends, and that claim is leased
for **two minutes**: *"an attempt older than the two-minute lease is treated as
abandoned, returned to `pending`"* (`PWA_AND_OFFLINE.md` §6.2,
`OFFLINE_MUTATION_LEASE_MS`). Neither an automatic pass nor Retry touches a
`syncing` record before then. The test had reloaded through its own replay and
then waited 45 seconds for a 120-second lease. **The product did exactly what it
is documented to do**, and the lease is what makes an interrupted attempt
recoverable rather than lost.

**Repair.** Wait for the queue to be at rest — no record `syncing` — before each
reload. That removes the interruption rather than waiting it out, and it reads
deterministic application state from the same store the product reads. The
45-second budget is unchanged; the lease is unchanged; the product is untouched.

**Proof.** The spec passes locally (11/11 before and after — it never failed
here), and the race the trace documents can no longer be entered.

### 4.5 What none of them were

None is the DEBT-125 browser crash: no `SIGSEGV`, no `SEGV_MAPERR`, no
`browser.newContext: … has been closed` cluster in any of the runs read for this
pass. None was repaired by a retry, a longer timeout, a broader selector or a
skip; the four repairs are two deterministic waits and two assertions corrected
against the product's own documented rules. Two of the four are in
`today-focus.spec.ts`, which the old split had not executed on `main` in any of
the three runs measured in §2 — they were failing invisibly, which is precisely
the condition DEBT-128 describes.

## 5. After

### 5.1 The partition

```
10 partitions · 145.1 min of measured test time · mean 14.5 min · worst/mean 1.09
```

| Partition | Spec files | Slice | Budget (min) | Tests collected | Executed | Never run | Job (min) | Test span (min) |
|---|---|---|---|---|---|---|---|---|
| `p01` | 12 | — | 15.6 | 245 | 245 | **0** | 17.5 | 15.3 |
| `p02` | 13 | — | 15.5 | 161 | 161 | **0** | 17.7 | 15.4 |
| `p03` | 13 | — | 15.5 | 90 | 90 | **0** | 16.5 | 14.3 |
| `p04` | 12 | — | 15.5 | 114 | 114 | **0** | 18.7 | 16.4 |
| `p05` | 12 | — | 15.5 | 150 | 150 | **0** | 16.0 | 13.9 |
| `p06` | 12 | — | 15.5 | 114 | 114 | **0** | 17.4 | 15.0 |
| `p07` | 12 | — | 15.5 | 100 | 100 | **0** | 17.7 | 14.9 |
| `p08` | 12 | — | 15.5 | 144 | 144 | **0** | 18.4 | 15.8 |
| `p09` | 1 | 1/2 | 9.5 | 233 | 233 | **0** | 12.1 | 9.8 |
| `p10` | 1 | 2/2 | 9.5 | 232 | 232 | **0** | 11.8 | 9.4 |
| | **99** | | **145.1** | **1583** | **1583** | **0** | worst **18.7** | worst **16.4** |

MEASURED on CI run
[`31748745557`](https://github.com/acedaly/DalyHub-V2/actions/runs/31748745557) —
the first run of this mechanism, and the first run in this whole investigation in
which **every partition completed and not one test was left unexecuted**. 1,583
collected, 1,583 executed: the complete intended suite.

- **Worst test span 16.4 min against the unchanged 25-minute `globalTimeout`** —
  66% of it, with 8.6 minutes of headroom. Worst JOB 18.7 min against the
  40-minute backstop.
- **The estimates held.** Predicted worst 15.6 min, actual test span 16.4 —
  ~5–10% above, uniformly, because the estimate counts test time and the span
  also carries Playwright's own per-file and per-test overhead. Worst/mean on
  actual spans is **1.18** (against 1.45–1.47 before).
- **Setup measured again, and unchanged: 2.1–2.7 min per partition** — the cost
  that bounds the partition count from below.
- **All ten started within 3 seconds of each other.** Ten concurrent jobs is not
  contended, which is what the ≤12 bound predicted.
- Locally, `pnpm run e2e:gate p10` ran the same slice in **9.4 min against its
  9.5-minute budget** — the mechanism is identical in both places.


### 5.2 Verification

**Repository gates**, all green locally on this branch:

```
pnpm run format:check   pass
pnpm run lint           pass
pnpm run typecheck      pass
pnpm run test:unit      394 files, 5,459 tests, 0 failed
pnpm run test:kernel    162 files, 2,531 tests, 0 failed
pnpm run build          pass
```

New unit coverage: `test/unit/ci/e2e-partitions.test.ts` — every spec file on
disk belongs to exactly one partition, the manifest is what the committed
durations derive, the derivation is deterministic under input reordering, a
brand-new spec file cannot be lost, and the runner-pool/budget bounds hold.

**The four DEBT-129 specs**, locally at `--workers=1`, `retries: 0`:
`today-focus.spec.ts` + `tasks-v22-daily-driver.spec.ts` +
`pwa-offline-tasks.spec.ts` — **30 passed**.

### What the finishing suite immediately caught

Two failures that had nothing to do with this change, and both are the point of
it — a suite that finishes reports things a suite that stops cannot.

- **`goal-measurement.spec.ts` completed a task it did not own.** It ticked
  `.dh-day-row__check` **first** on Today — the top of the OVERDUE band, which in
  the shared development workspace is the seeded "Submit the abstract". That
  takes the "Conference talk" Project off at-risk permanently, and
  `project-health.spec.ts:31` exists to assert that Project IS at risk. The two
  never shared a runner under the count-based split; under a partition of whole
  spec files they do. **Class: fixture/isolation defect.** It now creates and
  completes its own task, which also removes an `if (count)` guard that could
  have made the journey assert nothing and a 500 ms sleep that stood in for a
  signal.
- **`project-activity.spec.ts:252` was one second from failing on `main`.** Ten
  viewports — each a navigation, a tab click and an overflow poll — in one
  30-second budget: **29.0 s** on run `31690164253`, 31.0 s here. **Class: the
  test exceeds its own budget**, which is DEBT-126's shape exactly, and the
  repair is the one HARDEN-03 established for it — split the journey, keep every
  assertion. All ten widths are still asserted, each with its own budget. No
  timeout was raised.

### 5.3 Debt

| Entry | Verdict |
|---|---|
| **DEBT-128** | **RESOLVED.** The split is derived from measured per-spec-file time, the manifest is generated and `Static`-checked, and the first run of it left **0 tests unexecuted** across all ten partitions. Its closing condition also asks for three consecutive clean `main` runs; that half is now *countable* — every partition states whether it completed — and accrues after merge. |
| **DEBT-129** | **RESOLVED.** All four diagnosed to a class from CI traces, repaired at the real cause, and each verified. None was a product defect; three of the four repairs assert more than they did before. |
| **DEBT-125** | **STILL OPEN, deliberately.** Its closing condition is a full green run on `main` with no shard reaching `globalTimeout`, *sustained across enough runs that a green one is not a lucky sample*. This branch is not `main`, and one run is not "sustained". What has changed is that the condition is now **evaluable**: the suite finishes, every partition says whether it completed, and an unexecuted test cannot pass as a skip. The crash clause also remains satisfied — no `SIGSEGV`, no `SEGV_MAPERR`, no `browser.newContext: … has been closed` cluster in any of the runs read for this pass, now including a complete 1,583-test run. Narrowed to exactly one missing thing: **runs on `main`**. |
| **DEBT-76** | **UNCHANGED, and now answerable.** Its criterion — ten consecutive green `main` runs — is preserved exactly. HARDEN-04 did not manufacture, simulate or reinterpret a single one of them; it repaired the instrument that makes them countable. Before this, a "green" `main` run could contain 118 tests that never ran, so counting them would have been counting nothing. |

**The distinction this pass is careful about:** HARDEN-04 repairs the measuring
instrument. It does not invent measurements. DEBT-125 and DEBT-76 both close on
evidence from `main`, and that evidence starts accruing when this merges.

## 6. Scope discipline

No HARDEN-05 is proposed, and nothing was fixed that did not block this pass. The
E2E gate can finish, its result can be read, and the four named failures are
diagnosed and repaired at their real causes. That was the whole brief.
