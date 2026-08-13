# HARDEN-03 — Close the reliability loop

**Date.** 2026-08-12. **Base.** `main` @ [`40038de`](https://github.com/acedaly/DalyHub-V2/commit/40038de0b12b2836d35d31ac52ffcbe966391246) (CAL-01 timezone/cross-day fix, #169).

## 1. Purpose

The CI reliability pass (#158), [HARDEN-01](HARDEN_01_RELEASE_RELIABILITY_2026_08.md) and
[HARDEN-02](HARDEN_02_RELEASE_TRUST_2026_08.md) each repaired a real part of DalyHub's
release reliability. This pass exists to answer the question they left open, with
evidence rather than confidence:

> Is `main` trustworthy again?

Concretely: resolve DEBT-126 and DEBT-127 properly, inspect the actual
post-HARDEN-02 CI evidence for DEBT-125, and close DEBT-125 **only** if its stated
closing condition is genuinely satisfied.

**It is not.** DEBT-125 remains open, for a specific and now-named reason. That is
recorded in §8 with the evidence, and it is the honest outcome rather than a
failure of this pass.

## 2. Starting state

| Entry | Status on arrival |
|---|---|
| DEBT-125 | ◐ P1 — every deterministic failure HARDEN-01/02 raised had been repaired; the browser-crash clause was waiting on runs |
| DEBT-126 | ☐ P2 — the Settings preferences journey "hangs on `networkidle`", cause unknown, timeout/retry fixes explicitly forbidden |
| DEBT-127 | ☐ P3 — a TASKS-11 timezone test fails for one hour of every UTC day |
| `main` CI | Red on **all seven** runs since HARDEN-02 merged (§5) |

## 3. DEBT-126 — diagnosis

### Reproduction

`e2e/settings.spec.ts:68` reproduces locally at `workers: 1`, `retries: 0`,
**3 of 6 runs** of the journey on its own. It failed at `settings.spec.ts:118`
(`gotoFixture(page, "/settings")`) — **not** at the Diary step the register
records, and not on the step CI reported.

### The recorded cause was the wrong one, and the way it moved is what gives it away

The entry says the journey "hangs on `networkidle`" after the Diary default-mode
step. Two measurements contradict that.

**First, the step moves.** CI put the failure on the Diary navigation
(`settings.spec.ts:132`); a local run put it on the Settings navigation
(`:118`); after an experimental change to the shared wait it moved again, to
`page.goto` on the same line. A failure that lands on a different step each time
is not a step that hangs.

**Second, and decisively — the wait is not stuck, and the journey does not fit.**
Run with `--timeout=180000` so nothing can expire, the journey **passes**, on the
unmodified `networkidle` gate, taking:

```
35.3 s   36.0 s   36.4 s   42.5 s     (4 consecutive runs, unmodified helper)
30.0 s   30.1 s   31.8 s   34.2 s     (4 consecutive runs, networkidle removed)
```

against a per-test budget of **30 s** (`playwright.config.ts` → `timeout: 30_000`).

So `networkidle` arrives. It was the wait **holding the clock** when the budget
expired, not a wait that never ends — and whichever call happened to be in
progress at that moment got the blame. That is why the step moved, why CI and a
local run disagreed about which navigation was at fault, and why "the next
`gotoFixture` never resolves its `waitForLoadState`" read as a hang.

**Root cause: the journey exceeded its own time budget.** One test proved five
independent preference contracts end to end — six full document loads of the
heaviest route in the product, three reloads and five autosaving combobox writes,
against the Vite dev server — in a 30-second budget it needed 35–42 seconds for.

### What was ruled out, with measurement

- **A stuck request.** Instrumenting the journey with `request`/`requestfinished`
  listeners: at the moment of failure 60 requests were open (103 on a second run),
  every one a `/app/**/*.ts(x)` Vite dev-module request, and the **oldest was
  146 ms old**. The stream was saturated and progressing, not blocked.
- **A route revalidation loop.** `grep -rn setInterval app/` returns nothing. The
  Diary workspace's `navigate` calls are all user-action-driven (a notification
  action, the Inspector key); none runs on mount.
- **The service worker intercepting every module.** It does not.
  `vite-plugins/sw-template.js` calls `respondWith` only for document navigations
  (`isDocumentNavigation`) and static assets (`isStaticAsset`); a dev-module
  request is left to the network untouched. The navigation handler,
  `serveNavigation`, is a plain network-first `await fetch(request)`.
- **The offline provider keeping the network alive.** `afterPageIdle` already
  defers all offline priming to `load` + an idle callback + a 1.5 s settle, and
  `page-idle.ts` documents that it was written for exactly this reason.

The service worker IS active and controlling by the time the failure lands
(`state: "activated"`, `controller: /sw.js`) — that is real, and it is part of why
the later navigations in the journey are the expensive ones. It is not, however,
what made the wait look like a hang.

### Fix

`e2e/settings.spec.ts`'s single journey is split into **four**, one per contract:

| Journey | Proves |
|---|---|
| opens from navigation and persists the owner's date & time preferences | Settings opens from the Primary nav; timezone, date display and first-day-of-week each survive a reload |
| honours the owner's default landing page, and falls back to Today when the stored one is not a destination | `/` resolves to the stored destination, and to Today when the stored value is not one |
| honours the owner's default Tasks view | `/tasks` opens in the stored view |
| honours the owner's default Diary mode, and an explicit mode still wins | `/diary` opens in the stored mode; `?mode=day` overrides it |

**Every assertion is kept, and none is weakened.** No timeout was raised, no retry
added, no `.skip`, no `.fixme`, no sleep, no broadened selector, and the shared
`waitForLoadState("networkidle")` gate in `e2e/helpers.ts` is **unchanged** — it
was measured, found not to be the cause, and left alone rather than changed on a
hunch. (It does cost this journey ~5 s of its ~40; that is worth knowing and is
not worth a suite-wide change to ~1,000 tests inside a reliability-closure PR.)

### Evidence

`e2e/settings.spec.ts` in full, `--repeat-each=3`, `workers: 1`, `retries: 0`:
**30 passed, 0 failed.** Per-journey durations across the three passes:

| Journey | Durations | Budget |
|---|---|---|
| date & time preferences | 18.2 s · 17.4 s · 15.8 s | 30 s |
| default landing page | 14.7 s · 16.4 s · 15.9 s | 30 s |
| default Tasks view | 11.6 s · 11.8 s · 11.7 s | 30 s |
| default Diary mode | 12.1 s · 14.2 s · 12.5 s | 30 s |

The worst of the four now uses 61% of its budget where the combined journey used
117–140% of it. The neighbouring Settings and SETTINGS-LABEL journeys in the same
file are untouched and pass on all three runs.

**DEBT-126: RESOLVED.**

## 4. DEBT-127 — diagnosis

### Reproduction

Deterministic, by pinning the clock rather than waiting for the hour. The capture
route resolves the owner's day from `new Date()` at request time
(`app/routes/api-capture.ts` → `captureOwnerDay`), and the Workers test pool
honours `vi.useFakeTimers({ toFake: ["Date"] })`, so the failing instant can be
named. At `2026-08-13T10:30:00.000Z`:

```
forward (Pacific/Kiritimati, UTC+14) = 2026-08-14
back    (Pacific/Midway,     UTC-11) = 2026-08-12
gap = 2 days      AssertionError: expected 172800000 to be 86400000
```

### Root cause

The behaviour under test is correct — the product resolves the anchor in the
owner's timezone. The **arithmetic of the assertion** was wrong: it asserted that
two owners 25 hours apart are *always exactly one calendar day* apart. They are
two days apart for the hour of every UTC day between 10:00 and 11:00, because
25 hours of spread cannot fit in a 24-hour day. That is ~4% of runs, at a time of
day nobody associates with the change being tested.

### Fix

The single test becomes a **table of seven pinned instants**, each stating the one
calendar date each zone is in — which has exactly one correct answer and no
dependence on when CI runs:

| Pinned instant (UTC) | Kiritimati | Midway | Why this row exists |
|---|---|---|---|
| `2026-08-13T09:59:59.999Z` | 2026-08-13 | 2026-08-12 | last instant before the two-day window opens |
| `2026-08-13T10:00:00.000Z` | 2026-08-14 | 2026-08-12 | the window opens |
| `2026-08-13T10:30:00.000Z` | 2026-08-14 | 2026-08-12 | **inside DEBT-127's window — where the old assertion failed** |
| `2026-08-13T11:00:00.000Z` | 2026-08-14 | 2026-08-13 | the window closes |
| `2026-08-12T23:59:59.999Z` | 2026-08-13 | 2026-08-12 | last instant of a UTC day |
| `2026-08-13T00:00:00.000Z` | 2026-08-13 | 2026-08-12 | UTC midnight — the machine's day changes and neither owner's does |
| `2026-08-13T14:00:00.000Z` | 2026-08-14 | 2026-08-13 | Kiritimati's own midnight, away from UTC's |

The assertion was **not** loosened. It is strictly stronger: the old test proved a
gap, the new one proves each owner's exact calendar date, so a product that
resolved both anchors from the machine clock now fails on the per-owner assertion
as well as on `not.toBe`. The neighbouring CAPTURE-01 journey — which derived its
expectation from `ownerDay("Australia/Sydney", new Date())` a few milliseconds
after the capture, the same class of race — is pinned at
`2026-08-13T14:30:00.000Z` (00:30 Sydney on the *following* Sydney day, so a
machine-clock anchor would write the wrong date and be caught) and asserts the
literal `2026-08-14`.

`grep -n "new Date()" test/kernel/task-capture-language.test.ts` now matches only
prose in comments: the file reads no wall clock at all.

### Evidence

`test/kernel/task-capture-language.test.ts`: **16 passed**, on three consecutive
runs (10 before, 16 after — the six added rows are the boundary cases). Full
kernel suite: **2,463 passed across 159 files**.

**DEBT-127: RESOLVED.**

## 5. DEBT-125 evidence — every `main` run since HARDEN-02

Every completed `main` run from HARDEN-02's merge to the tip, read from GitHub
Actions rather than from memory. **Static, Unit and Build were green on all
seven**; in every run the only failing jobs were E2E shards and the CI Gate that
aggregates them.

| Run | Commit | Started (UTC) | Result | Failing E2E shards |
|---|---|---|---|---|
| [`31531917741`](https://github.com/acedaly/DalyHub-V2/actions/runs/31531917741) | `2bb4b81` HARDEN-02 #163 | 08-11 20:14 | ❌ | **8**: 1 failed, 71 **did not run**, 116 passed, 25.0 m |
| [`31558733303`](https://github.com/acedaly/DalyHub-V2/actions/runs/31558733303) | `fbce125` TODAY-10 #164 | 08-12 03:01 | ❌ | **4**: 0 failed, 40 did not run, 150 passed · **8**: 0 failed, 74 did not run, 115 passed |
| [`31560988429`](https://github.com/acedaly/DalyHub-V2/actions/runs/31560988429) | `757417f` TASKS-11 #165 | 08-12 03:44 | ❌ | **1**: 1 failed, 189 passed (16.4 m, finished) · **4**: 2 failed, 43 did not run · **8**: 2 failed, 27 did not run |
| [`31567486731`](https://github.com/acedaly/DalyHub-V2/actions/runs/31567486731) | `2f05dee` PWA-12 #166 | 08-12 05:43 | ❌ | **4**: 0 failed, 28 did not run, 164 passed · **8**: 1 failed, 87 did not run, 102 passed |
| [`31578924324`](https://github.com/acedaly/DalyHub-V2/actions/runs/31578924324) | `48bd97f` MOBILE-01 #167 | 08-12 08:34 | ❌ | **4**: 1 failed, 46 did not run, 148 passed · **8**: 3 failed, 87 did not run, 103 passed |
| [`31590635607`](https://github.com/acedaly/DalyHub-V2/actions/runs/31590635607) | `71158e7` CAL-01 #168 | 08-12 11:10 | ❌ | **4**: 1 failed, 42 did not run · **5**: 1 failed, 196 passed (13.2 m, finished) · **8**: 1 failed, 87 did not run |
| [`31641975444`](https://github.com/acedaly/DalyHub-V2/actions/runs/31641975444) | `40038de` CAL-01 #169 **(tip)** | 08-12 21:19 | ❌ | **4**: 0 failed, 38 did not run, 160 passed · **5**: 1 failed, 196 passed (13.3 m, finished) · **8**: 3 failed, 80 did not run, 113 passed |

Every shard marked "did not run" reached the 25-minute `globalTimeout` and
recorded, verbatim:

```
Timed out waiting 1500s for the test suite to run
Timed out waiting 1500s for the teardown for test suite to run
```

which is also what the "2 errors were not a part of any test" line in each of
those shards refers to.

### The two things this table says

**1. Two shards cannot finish, and this is now the dominant cause of red `main`.**
Shards 4 and/or 8 hit the ceiling in **six of the seven runs**, leaving between
**27 and 118 tests per run that never executed at all**. On run `31558733303`
(TODAY-10) `main` was red with **no failing test whatsoever** — both red shards
simply ran out of time. A suite that cannot finish stops reporting, and a report
that stops is indistinguishable from a pass; that is the exact condition DEBT-125
exists to end, arriving by a different route.

It is not fixable by raising `globalTimeout` inside the current job budget.
Shard 8 completed 102–160 of its ~190 tests in 25.0 minutes across these runs;
extrapolated at the same rate it needs **31–46 minutes**, which is beyond the
job's own 40-minute `timeout-minutes` backstop. `playwright.config.ts` already
predicts the mechanism — `--shard` slices by test COUNT, not by cost, so adding a
spec file anywhere re-slices every shard and the worst one is "whatever the draw
happens to concentrate". This is raised as **DEBT-128**.

**2. Four deterministic failures remain on the tip, and none is HARDEN-03's.**
They are named, attributed to a module and given an ownership decision in §7 —
not root-caused, which is each owning feature's work and is deliberately not done
here. They are raised as **DEBT-129** rather than swept into this PR or left
inside DEBT-125 as unexplained.

### Deliberately not changed

`.github/workflows/ci.yml` is untouched. The evidence proves a real workflow
defect, but every lever that would answer it is either forbidden by this pass's
own terms (more shards) or demonstrably insufficient (a bigger `globalTimeout`).
Re-deriving the split from measured per-shard time is a deliberate design
decision with its own reasoning, and `playwright-report/results.json` already
carries the numbers it needs. It gets its own entry, not a guess inside a
reliability-closure PR.

## 6. Browser-crash verification

```
browser requested:              channel: "chromium"  (playwright.config.ts,
                                whenever no explicit executablePath is pinned —
                                and CI pins none)
browser actually launched:      chromium-<rev>/chrome-linux64/chrome
                                (full Chrome for Testing), NOT
                                chrome-headless-shell
old SIGSEGV signature observed
after the fix:                  NO
sample size / runs inspected:   7 `main` runs, 56 E2E shard jobs,
                                2026-08-11 20:14 → 2026-08-12 21:48 UTC
```

**How the launched binary is established.** Not from configuration alone. The
selection rule is read out of the *installed* `playwright-core@1.62.1`
(`lib/coreBundle.js:43104-43106`):

```js
if (options.channel)
  return options.channel;
return options.headless ? "chromium-headless-shell" : "chromium";
```

`if (options.channel)` precedes the headless fallback, so `channel: "chromium"`
resolves the `chromium` registry entry — `chromium-<rev>/chrome-linux64/chrome` —
rather than the shell. The CI install logs corroborate that both binaries are
present to choose between: run `31590635607`, shard 4, downloads
`chrome-linux64.zip` (Chrome for Testing 151.0.7922.34) *and*
`chrome-headless-shell-linux64.zip`.

**Stated as a limitation, because it is one:** CI never prints the path it
actually launched, so this is a sound chain (config → version-pinned selection
rule → both binaries installed) rather than a direct observation. A single log
line naming the resolved executable would make it decisive, and is the cheapest
remaining piece of evidence anyone could add.

**How the crash was searched for.** Across all seven runs' failed jobs, for
`SIGSEGV`, `SEGV_MAPERR`, `Received signal`, `chromium_headless_shell`,
`chrome-headless-shell`, `Target page, context or browser has been closed` and
`browser.newContext`. Zero hits outside the install-time download lines. Shard 4
of run `31590635607` was read end to end (846 lines) with the same result.

The crash's *consequence* signature is absent too, which matters more than the
string search: a segfault fails every subsequent test in the shard with
`browser.newContext: … has been closed` and leaves the rest unrun. The original
occurrence read `5 failed / 43 did not run`. Here the largest failure count in any
shard is **3**, and every "did not run" count is paired with the explicit
`Timed out waiting 1500s` line — a different mechanism, named in the log.

**HARDEN-02's restated falsifier did not fire.** No SIGSEGV recurred, with
`chrome-linux64/chrome` in the frames or otherwise. The browser fix is holding so
far. Seven runs is not yet the sustained evidence DEBT-125's crash clause asks
for, and it is not claimed to be.

## 7. Residual failures on the tip, classified and attributed

Each is a named test failing visibly in the gate. What follows is the
classification and ownership decision — **which module owns it and whether
HARDEN-03 does**. It is not a root-cause diagnosis of any of the four: that is the
owning feature's work, and guessing at it here is how a reliability pass turns
into a general debt sweep.

| Failing test | Runs seen | Module | HARDEN-03's? |
|---|---|---|---|
| `tasks-v22-daily-driver.spec.ts:158` — renames, prioritises, dates and re-files a task without opening a form | 4 of 7 (`2bb4b81`, `48bd97f`, `71158e7`, `40038de`) | Tasks — TASKS-05 inline editing | No |
| `today-focus.spec.ts:290` — bounds a large day, states the true total and routes to Tasks | 2 of 7 (`757417f`, `40038de`) | Today — TODAY-10 Focus panel | No |
| `today-focus.spec.ts:331` — keeps the title dominant and the panel accessible on a phone | 1 of 7 (`40038de`) | Today — TODAY-10 Focus panel | No |
| `pwa-offline-tasks.spec.ts:386` — a queued change survives a reload before it has been sent | 2 of 7 (`71158e7`, `40038de`) | Offline — PWA-12 mutation queue | No |

Earlier occurrences that are not on the tip and are recorded for completeness:
`notes.spec.ts:379`/`:421` (NOTES-05, runs `757417f` and `48bd97f`),
`tasks-collection.spec.ts:471` (TASKS-03, run `48bd97f`),
`mobile-shell.spec.ts:313` (MOBILE-01, run `71158e7`),
`ai-assistance.spec.ts:348` (AI-01, run `757417f`),
`settings.spec.ts:68` (runs `2f05dee` and `48bd97f` — **this is DEBT-126**, fixed
in §3).

None of these is the browser crash, and none is a hidden failure: each is a named
test failing visibly in the gate. They belong to the features that own them, and
sweeping four feature defects into a reliability-closure PR is the thing this pass
was told not to do. They are raised as **DEBT-129**, individually named so the
entry cannot become the bucket DEBT-125 was warned against becoming.

### This branch's own run finished every shard — and that is NOT evidence DEBT-128 is fixed

Run [`31675715619`](https://github.com/acedaly/DalyHub-V2/actions/runs/31675715619)
(this branch @ `acbad51`) had **all eight E2E shards complete**, with **no shard
reaching `globalTimeout` and no test reported "did not run"** — the first such run
anywhere in this investigation. Only one E2E test failed
(`pwa-offline-tasks.spec.ts:386`, DEBT-129 row 4), and shards 1, 2, 3, 4, 6, 7 and
8 were green.

It is recorded because it is a real measurement, and hedged because it proves less
than it looks like it proves. `playwright.config.ts` already names the trap:
`--shard` slices by test COUNT, so **adding a spec anywhere re-slices every
shard**, and "a green run says only that THIS draw fits". This branch adds three
tests (one Settings journey became four) and removes a journey that was consuming
30–42 s on shard 8 and failing there on two of the seven `main` runs — a failing
test burns its whole timeout. The boundaries moved and the draw happened to fit.

So: the split is still count-based and still unguarded, DEBT-128 stands unchanged,
and this run is **one favourable draw on a branch**, not the sustained evidence on
`main` that DEBT-125 asks for. What it does add is support for the DEBT-128
diagnosis itself — the suite CAN finish in 25 minutes when the heavy files are not
concentrated, which is consistent with a distribution problem and inconsistent
with the suite having simply outgrown its budget.

### One more, found by this PR's own CI, and fixed here

`test/unit/tasks/TasksQuickAdd.test.tsx:190` — *"NEVER discards entered text after
a network failure"* — failed on run
[`31675715619`](https://github.com/acedaly/DalyHub-V2/actions/runs/31675715619)
with `expected <body> to be <input>`: **1 failed, 5,267 passed**. It is the first
flake this programme has caught in the UNIT suite rather than the E2E one, and the
evidence identifying it is unusually clean — the immediately preceding commit
passed the very same step, and the diff between the two is **documentation only**.
Identical code, opposite result.

**Class: test defect, and the repository had already diagnosed it once.** The
component returns focus from an effect gated on the error state
(`TasksQuickAdd.tsx` — `useEffect(() => { if (error) inputRef.current?.focus(); }, [error])`),
while the test's `waitFor` resolves as soon as the alert EXISTS — the render that
sets `error`, one commit before that effect flushes. Asserting focus synchronously
there is a race the component always eventually wins. The sibling test forty lines
above (*"clears and REFOCUSES after a save"*) hit exactly this, was fixed by
awaiting the focus assertion, and carries a comment saying so; this was the same
defect's other half, left un-fixed. Both focus assertions in the file are now
awaited, and there are only two.

Fixed here rather than deferred because it is one line, it is test reliability
(this pass's remit rather than a feature's), the product behaviour is untouched
and provably correct, and the repository's own precedent already prescribed the
fix. Verified 3/3 locally on the file and against the full unit suite.

## 8. Remaining P1/P2 reliability debt

Open or in-progress entries that are P1, or P2 and materially about CI trust, test
reliability, production reliability, data integrity, security, workspace isolation
or offline capture integrity. P3 housekeeping is deliberately excluded.

| ID | Pri | Current state | Why it matters | Disposition |
|---|---|---|---|---|
| **DEBT-125** | P1 | ◐ open — deterministic half met, suite still cannot finish | `main`'s required check has not been a readable signal since HARDEN-02 | **next reliability item** — blocked on DEBT-128 |
| **DEBT-128** *(new)* | P1 | ☐ raised here | Two shards never finish, so 27–118 tests per run report nothing; this is now the dominant cause of red `main` | **next reliability item** — needs the split re-derived from measured per-shard time |
| **DEBT-129** *(new)* | P1 | ☐ raised here | Four named deterministic E2E failures on the tip, each owned by a feature | **feature-owned** — one diagnosis each, by the module that owns it |
| DEBT-76 | P2 | ☐ open — the `chrome-headless-shell` SIGSEGV | Superseded in practice by DEBT-125's HARDEN-02 fix; no recurrence in 56 shard jobs, but its closing condition ("ten consecutive green `main` runs") cannot be evaluated while DEBT-128 keeps `main` red | **next reliability item** — evaluate once `main` can finish |
| DEBT-70 | P2 | ☐ open — hydrated offline rendering is not covered by automation | The most user-visible offline behaviour rests on a manual checklist, not CI | **accept/defer** — needs a third Playwright server; not release-blocking |
| DEBT-71 | P2 | ☐ open — a replayed capture whose Worker died mid-creation cannot be resolved automatically | Offline capture integrity; never destructive, but hands a resolvable case to the owner | **needs product decision** — changes how three modules mint ids |
| DEBT-47 | P2 | ◐ open — an open autosave editor does not adopt a server-side change | Multi-writer data freshness; the contract exists, only the Note body has adopted it | **feature-owned** — the Meeting notes field passes `serverValue` |
| DEBT-89 | P2 | ☐ open — Review Inbox announces "Task completed" for a REFUSED completion | Announces an outcome that did not happen, to assistive technology | **fix now (next feature PR)** — the pure helper already exists in Reviews |
| DEBT-95 | P2 | ☐ open — `AGENTS.md` §6/§15 describe the colour system the product no longer has | The standards document is the thing new work is checked against | **feature-owned** — THEME-01's follow-up |

Not elevated: DEBT-01/02/07/08/31/34/44/51/57 are P2 architectural or presentation
convergence items with no bearing on release trust, and every P3 entry stays where
it is.

## 9. `PRODUCT_DEBT.md` truth pass

Narrow, over the entries the recent sequence touched. Nothing was reclassified to
make the register look cleaner, and no priority was changed.

| Entry | Verdict |
|---|---|
| DEBT-118 | ☑ accurate. TASKS-11 delivery is real: `test/unit/tasks/quick-capture-after-completion.test.ts`, `test/kernel/task-capture-language.test.ts` and `e2e/tasks-capture-language.spec.ts` all exist and pass. **No change.** |
| DEBT-119 | ☑ accurate. PWA-12 delivery is real: `e2e/pwa-offline-tasks.spec.ts` carries the completion, edit, recurrence-successor, both conflict-resolution and recovery journeys plus the phone-width matrix; ADR-090 and `PWA_AND_OFFLINE.md` §15 both exist. **No change.** |
| DEBT-125 | Updated with the seven-run evidence table, the browser verification and the two entries split out of it. **Stays ◐ open**, with the exact missing evidence named. |
| DEBT-126 | **Resolved**, with the recorded cause corrected — it was a budget overrun, not a hang. One factual error in the original entry is corrected in place rather than rewritten away: the CI run it cites (`31531917741` / `2bb4b81`) is red on a different test; this journey's actual `main` failures are runs `31567486731` and `31578924324`. |
| DEBT-127 | **Resolved.** The entry's own suspicion — "the behaviour under test is CORRECT, only the arithmetic of the second assertion is wrong" — was right, and is now proven at pinned instants rather than argued. |

One further correction worth stating plainly, because it is a correction to *this*
pass's own working: mid-diagnosis, the shared `networkidle` gate in
`e2e/helpers.ts` was changed on the strength of a 60-requests-in-flight reading,
and that reading was over-interpreted — it was a snapshot taken as the test budget
expired, not proof of a stall. The controlled experiment in §3 (the same journey,
unmodified helper, 180-second budget, four passes) falsified it. The change was
reverted and the helper is untouched in this PR.

## 10. Closure verdict

```
DEBT-125 REMAINS OPEN — `main` has not produced a single green E2E run in the
seven runs since HARDEN-02, and its closing condition ("a full Playwright run on
`main` is green with no spec excluded … sustained across enough runs that a green
one is not a lucky sample") is therefore unevaluated, not met. The specific
evidence still missing is one finishing run: in six of those seven, shards 4
and/or 8 reached `globalTimeout` with 27–118 tests never executed (DEBT-128), so
the suite has not reported its own result. The four deterministic failures on the
tip are separately diagnosed and owned (DEBT-129), not hidden.
```

What HARDEN-03 *did* settle, and what it did not:

- **Settled.** The browser fix reaches the browser and is holding: no SIGSEGV in
  56 shard jobs, and the launched binary is the full Chromium build (§6).
- **Settled.** DEBT-126 and DEBT-127 are resolved at root cause, with no timeout
  raised, no retry added, no test skipped and no assertion weakened.
- **Settled.** `main` is *not* broadly red for unrelated failures any more. Static,
  Unit and Build are green on all seven runs, and the E2E failures are four named
  tests — not the thirty-six DEBT-125 was raised against.
- **Not settled.** The suite cannot finish. Until it can, "required CI is green"
  remains a claim nobody can check, which is the whole of what DEBT-125 asks for.

**Can ordinary feature work resume without another generic hardening programme?**
Nearly. One bounded, well-specified piece of work stands between here and yes —
DEBT-128, re-deriving the shard split from measured per-shard time — and it is a
single decision with the measurements already in hand, not a programme. The
diffuse "the suite is red and nobody knows why" condition that produced HARDEN-01,
HARDEN-02 and this pass is gone: every remaining red path has a name, a module and
a closing condition.
