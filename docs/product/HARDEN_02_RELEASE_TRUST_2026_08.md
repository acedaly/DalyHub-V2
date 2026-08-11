# HARDEN-02 — release trust and the residual defects

> **What this is.** The record of the second hardening pass, taken after
> [HARDEN-01](HARDEN_01_RELEASE_RELIABILITY_2026_08.md) and after the two feature
> changes that landed on top of it (CAPTURE-01, THEME-01). It contains no
> feature and no redesign. Its whole purpose is that a green DalyHub CI run means
> the product is green, that the residual defects are fixed or honestly
> classified, and that the repository's high-authority documents say what is
> true.
>
> **Baseline commit.** `b806246794407f2c4693f140af96380cf66703a0`
> (`main`, "THEME-01: five generated colour schemes over one design system (#162)").
>
> **Date.** 2026-08-11.

---

## 1. Baseline — what was actually true before anything was changed

CI run [`31488073976`](https://github.com/acedaly/DalyHub-V2/actions/runs/31488073976)
is the authoritative baseline: a push build of the starting commit itself. Every
layer was also re-run locally at the same commit before a line was edited.

| Layer | Command | CI | Local |
| --- | --- | --- | --- |
| Formatting | `pnpm run format:check` | **RED** | **RED** |
| Lint | `pnpm run lint` | not reached | green |
| Types | `pnpm run typecheck` | not reached | green |
| Generated scheme | `pnpm run scheme:check` | not reached | green |
| Icons | `pnpm run icons:check` | not reached | green |
| Unit & component | `pnpm run test:unit` | **RED** — 1 of 5065 | **RED** — 1 of 5065 |
| Kernel (Workers runtime + real local D1) | `pnpm run test:kernel` | not reached | green — 153 files, 2340 tests |
| Production build | `pnpm run build` | green | green |
| Cloudflare deploy dry-run | `wrangler deploy --dry-run` | green | — |
| E2E | `playwright test` (8 shards) | **RED** — shards 1, 4, 8 | see §3 |

So HARDEN-01 left the pipeline with one red layer and `main` now had four. **The
three new ones are all the same kind of defect: two pull requests each took the
next free number, and the merge could not stop them.** `PRODUCT_DEBT.md`'s own
numbering rule names the pattern exactly — "two branches open at once will both
reach for the next free number, and the file cannot stop them — only the merge
can."

### 1.1 The baseline failures, classified

| # | Failing check | Class | What it actually was |
| --- | --- | --- | --- |
| 1 | `format:check` — `CHANGELOG.md` | **PRODUCT/REPO DEFECT** (merge artefact) | CAPTURE-01's and THEME-01's release sections merged with no blank line between them |
| 2 | `test:unit` — `migration-numbering` | **PRODUCT DEFECT** (merge artefact) | `0039_add_owner_color_scheme_preference.sql` **and** `0039_create_capture_credentials.sql` both claimed `0039` |
| 3 | (silent) two `ADR-088`s | **DOCUMENTATION DEFECT** (merge artefact) | THEME-01 and CAPTURE-01 both accepted "ADR-088". Nothing checks ADR numbers, so this was not red anywhere |
| 4 | E2E shard 1 — `ai-assistance.spec.ts:235`, `:825` | **HARNESS / BROWSER FAILURE** | Both failed `browser.newContext: Target page, context or browser has been closed` after a `SIGSEGV`. Neither is a product or test defect — see §2 |
| 5 | E2E shard 4 — `mobile-capture-journeys:207` | **STALE TEST** | §3A |
| 6 | E2E shard 4 — `people-diary-context:144` | **PRODUCT DEFECT** | §3B — and HARDEN-01's "stale test" reading was wrong |
| 7 | E2E shard 4 — `people-diary-context:196` | **PRODUCT DEFECT** | §3C — the one that took the longest to see |
| 8 | E2E shard 8 — `settings.spec.ts:261` | **STALE TEST** | §3D |
| 9 | E2E shard 8 — `tasks-collection.spec.ts:514` | **STALE TEST** | §3E |
| 10 | E2E shard 8 — `tasks-collection.spec.ts:340` | **UNDETERMINED** | Failed in CI, passes locally at `workers: 1`, `retries: 0`, repeatedly. Kept in the gate; see §6 |
| 11 | E2E (shard 4/8, unrun) — `project-settings.spec.ts:213` | **STALE TEST** | §3F |

Points 8, 9 and 11 matter for a second reason: **they are not new.** They are
tests that had not RUN on `main` for several commits, because shards 4 and 8
reached `globalTimeout` with 44 and 65 tests never started. A suite that cannot
finish does not merely fail late — it stops reporting, and the report it stops
producing is indistinguishable from a pass.

### 1.2 The three merge collisions, and what was done about each

**`CHANGELOG.md`** — reformatted. One blank line.

**Migration `0039`** — CAPTURE-01 merged first (11:44) and keeps the number;
THEME-01's became **`0040_add_owner_color_scheme_preference.sql`**, with its four
references (a unit test's expected filename, `DESIGN_SYSTEM.md`,
`ROADMAP_V2_2.md`, ADR text) updated with it. This is the rule the numbering test
states in its own failure message — "claim the next free number at PR-open time,
and renumber before merge if another PR took it. Never rename a migration that
has already been applied" — and the second clause is satisfied because neither
migration can have been applied anywhere but a local database: both merged on the
day of this pass, and applying migrations to production is an explicit operator
command that HARDEN-01 recorded as not performed. **Before deploying, confirm it
with `pnpm run db:production:list`**, which is the only thing that can answer it.

**ADR-088** — the same rule, the same tie-break: CAPTURE-01 landed first and
keeps `ADR-088`; THEME-01's became **`ADR-089`**, with every cross-reference
updated. One broken link was found while doing it — the ADR pointed its roadmap
item at `ROADMAP_V2.md`, where the anchor does not exist, instead of
`ROADMAP_V2_2.md` — and is fixed.

> **A second ADR collision exists and is NOT renumbered: there are two
> `ADR-082`s** (the nonce-based CSP, and the one saved-view system). That pair
> predates this pass by many commits and has fifteen references between them,
> each already distinguished by its anchor. `PRODUCT_DEBT.md`'s rule covers this
> case explicitly — "renumber while it is cheap; record the collision when it is
> not" — so it is recorded here and in the ADR document rather than rewritten.

---

## 2. The Chromium crash: HARDEN-01's fix never reached the launch

### The falsifier, and why it did not fire

HARDEN-01 diagnosed DEBT-125's intermittent `browser.newContext: Target page,
context or browser has been closed` as a **SIGSEGV inside
`chrome-headless-shell`**, changed CI from `playwright install --only-shell
chromium` to `playwright install --with-deps chromium`, and wrote the falsifier
down: *if the crash recurs on the full build, this is not the cause and the change
should be reverted with that recorded.*

**The crash recurred at the baseline commit** — run `31488073976`, shard 1:

```
[pid=4944][err] Received signal 11 SEGV_MAPERR 0000000001b0
[pid=4944][err] #0 0x556f2a831413 (/home/runner/.cache/ms-playwright/
    chromium_headless_shell-1234/chrome-headless-shell-linux64/
    chrome-headless-shell+0x4265412)
...
[pid=4944] <process did exit: exitCode=null, signal=SIGSEGV>
```

**Read the path.** Every frame is inside
`chromium_headless_shell-1234/…/chrome-headless-shell`. The falsifier requires
the crash to recur *on the full build*; this run was not on the full build. **The
hypothesis was never tested, because the change never reached the thing that
chooses the binary.**

### Why an install cannot decide it

`playwright install chromium` installs **two** binaries, and the choice is made
at LAUNCH. From `playwright-core@1.62.1`:

```js
getExecutableName(options) {
  if (options.channel && registry.isChromiumAlias(options.channel)) return "chromium";
  if (options.channel === "chromium-tip-of-tree") …
  if (options.channel) return options.channel;
  return options.headless ? "chromium-headless-shell" : "chromium";   // ← here
}
```

MEASURED, by launching each way in this environment on the same Playwright
version CI uses and reading `/proc/<pid>/exe` of the process that actually
started:

| Launch | Binary that ran |
| --- | --- |
| `chromium.launch({ headless: true })` | `…/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell` |
| `chromium.launch({ headless: true, channel: "chromium" })` | `…/chromium-1234/chrome-linux64/chrome` (version `151.0.7922.34`) |

That is the whole mechanism, verified rather than reasoned about — which is the
half HARDEN-01 was missing.

That is also why the crash has never reproduced locally: this repository's
`playwright.config.ts` pins `executablePath` to the managed sandbox's
`/opt/pw-browsers/chromium`, which **is** the full build. The binary was the one
uncontrolled difference between the two environments, exactly as HARDEN-01 said —
and CI kept running the crashing one.

### The change

`playwright.config.ts` now sets **`channel: "chromium"`** on the chromium
project, in the branch that applies when no explicit `executablePath` is pinned.
CI's install already fetches the full build, so nothing else changes.

**Retries stay `0`. No browser recycling was added. The shard count stays 8.**
None of those would have found this, and two of them would have hidden it.

**The falsifier, restated so it can actually fire:** if the SIGSEGV recurs with
`chrome-linux64/chrome` in the frames, the binary is not the cause and DEBT-125
reopens with that evidence.

---

## 3. The residual failures, one at a time

### A. `mobile-capture-journeys.spec.ts` — "clears Task context when switching to unsupported Task capture"

**Class: STALE TEST.** The helper waited 30 seconds for a `POST /tasks/new` that
no click had triggered: it clicked a button named **"Create task"**, and UIX-01
moved the Task panel's primary action into the sheet header — `Cancel · New task
· Save`. No such button has existed since. The helper now uses the sheet's own
`capture-save` test id.

**What was NOT changed:** the `POST /tasks/new` wait stays. It is not an
incidental transport detail — `TaskCapturePanel` and ADR-060 both state that a
capture terminates in the module's canonical creation route, and asserting it is
the point. The call site already asserts the user-visible outcome on top of it.

### B. `people-diary-context.spec.ts:144` — "an existing Diary entry gains and loses a Person"

**Class: PRODUCT DEFECT.** HARDEN-01 recorded this as a stale test — a phone
journey reaching for a desktop control UIX-05 hides. That reading was
understandable and wrong, and the difference is one comment in the source:

> *"Search stays visible at every width (see `people.css`), because a search box
> behind a button is a search box nobody uses."* — `PeopleCollection.tsx`,
> written by UIX-05

UIX-05 gave People the shared phone control sheet, and supplying `mobileControls`
turns on the shared rule that hides the WHOLE desktop filter bar below 48rem
(`collection-layout.css`) — **with the search box inside it.** So the rule the
module states about itself was inert from the moment it was written, and a phone
user lost the ability to find a Person by name in the People list. The
`flex-basis: 100%` rule still sitting in `people.css`'s phone block is the
vestige of the behaviour that was intended.

Assets, which states the identical rule, keeps its search because it composes
`persistentControls` instead. People states the rule and did not.

**Fix:** the filters band is restored at phone width carrying **only** the search;
the catch-up toggle and the sort stay in the sheet, where the phone composition
put them, so nothing is offered twice and the desktop composition is untouched.
The test now passes unchanged — which is the strongest evidence available that it
was describing the product correctly all along.

### C. `people-diary-context.spec.ts:196` — "the full-form hand-off keeps the Person context"

**Class: PRODUCT DEFECT.** On a phone, pressing **"More note options"** in the
capture sheet did nothing at all.

The diagnosis went through two wrong answers before the right one, and both are
worth recording because each looked conclusive:

1. *The sheet is still animating in.* Measured mid-animation, the link's box was
   at y=940 in an 844px viewport and `elementFromPoint` at its centre returned
   `null`. Waiting for the animations moved the link into view — **and the click
   still did nothing.**
2. *Something is intercepting the press.* The hit test resolved to
   `A.dh-capture-handoff`, no ancestor was `inert`, and every `pointer-events`
   in the chain was `auto`.

The instrument that answered it was a pair of listeners around the press:

```
DBG down target= dh-capture-handoff  rect= 562
DBG up   target= dh-field            rect= 680
DBG doc click target= dh-sheet__body
```

**`pointerdown` fired on the link; `pointerup` did not, because the link had
moved 118px in between.** A `click` is only produced when both land on the same
element, so no click was ever dispatched — not to React, and not to the browser's
own link handling.

**The cause.** Pressing the link moves focus to it, which blurs the panel's title
field, which DS-06 validates on blur — and the resulting `FormErrorSummary`
("There is 1 problem to fix", the list, the "go to the first problem" control) is
inserted at the TOP of the form, above everything. ~118px, on `pointerdown`, in a
sheet that cannot scroll.

**Two fixes, each correct on its own terms:**

- **`useForm` — a blur error is the FIELD's message.** Blur-produced errors now
  live in their own map: the field shows its own error inline, and the form-level
  summary renders only after a failed explicit submit. That is what
  `FormErrorSummary`'s own contract has always said ("After a failed explicit
  submit, users need one place that names what went wrong"), and it is the
  accessible reading too — an assertive live region belongs to an attempt the
  user made, not to leaving a field. **No validation rule, moment or message
  changed**, and all 182 shared-form unit tests pass unchanged.
- **`CaptureSheet` — the hand-off does not take focus.** `onMouseDown` is
  prevented on the link, so pressing it cannot blur the field behind it. Leaving
  for the module's fuller form is not abandoning the title — it is going
  somewhere to write one — so flagging the field on the way out was a false alarm
  as well as a stolen tap. Keyboard activation is untouched.

Regression coverage: `test/unit/forms/form-host.test.tsx` asserts that a blur
error appears exactly once (on the field, not in a summary), that a submit
attempt is what promotes it to the summary, and that fixing the value clears it.
The journey itself is the end-to-end proof.

### D. `settings.spec.ts:261` — "is accessible and responsive from 320px through wide desktop"

**Class: STALE TEST.** It asserted the section rail's "General" link was visible
at 390px **while a section was open**. UIX-05 deliberately made the phone two
screens — the list of sections, then one section with a way back — and
`data-chosen` is resolved on the server so the first byte is the right screen. The
rail is `display: none` in the chosen state by design, so the assertion could only
pass on a phone that had stopped being one.

**Repaired to the invariant UIX-05 introduced:** at 390px the chosen section is on
screen, "← All settings" is present and returns to the list, and every
destination — General included — is one tap away again.

### E. `tasks-collection.spec.ts:514` — "plans from the list and Today reflects it immediately"

**Class: STALE TEST**, with a weak assertion behind it.

It cleared a plan through the row's inline "Planned date" field. UIX-06 removed
the whole `low` metadata tier (planned date, sector, delegate) from the LIST
presentation — `display: none` in `tasks.css`, with the reasoning stated beside
it and the path named in the same breath: the row's overflow → "Priority, dates
and repeat…", which is also the path a touch device has always used. The control
is still in the DOM, so the old locator resolved and then spent its whole timeout
on an element no user can see.

**Repaired on the path the product kept** — and strengthened. The old test's
closing assertion ("the row no longer says *Scheduled today*") could not fail,
because no row says it any more; and its "Today shows it" step is satisfied by a
task that was never planned, because Today lists unplanned work too. Both halves
are now asserted against the canonical `today` system view — the same rule Today
reads — so the plan landing and the plan clearing are both real claims.

### F. `project-settings.spec.ts:213` — the Today-integration journey

**Class: STALE TEST**, and the most interesting of the six, because the product
rules make the journey as written **impossible**:

- Today's rail lists only projects with OPEN WORK (`rankContinueProjects` filters
  `openCount > 0` — "continue working on a project with nothing left to do is not
  a suggestion"), a rule added by the Today redesign **after** this journey was
  written;
- archiving is REFUSED while any unfinished task remains directly under the
  project (the Archive dialog says so in as many words).

So no project can satisfy both halves, and the seeded `pr-today` — deliberately
task-free so it can be archived — could never appear in the rail. HARDEN-01's
guess (crowded out of a three-slot rail) was the wrong mechanism for the right
symptom.

**Repaired as two journeys, and neither claim was dropped:**

- **Visibility**, over a new fixture (`pr-today-work`, Planned, one open task):
  Planned → Active (appears, reads "· Active") → On hold (disappears) → Active
  (returns), all through real SPA navigation and browser history.
- **Archive/restore**, over the task-free `pr-today`: the workflow status survives
  the round trip, the Archived collection reaches it, and Today is asserted
  ABSENT throughout — for the documented reason, which is what stops the sibling
  journey's presence assertion from being read as "Active ⇒ on Today".

The visibility journey first does real work on the project (completing and
reopening its task through the row's own control), because the rail ranks on
`lastMeaningfulActivityAt` from the Activity stream and a workflow-status change
is deliberately not one of the meaningful types. A freshly seeded project has no
activity at all and sorts last; the honest fixture for "the project I am working
on" is one that has just been worked on.

**A documentation defect fell out of this.** `TODAY_DASHBOARD.md` states that "an
Active project that was archived reappears in Today after restore + revalidation
with no second manual status change". Given the archive rule, that state is
unreachable: a project that can be archived has no open work, so it does not
reappear in the rail until it has some. Corrected in place.

---

## 4. Documentation corrected

Only high-authority, current-state documents were touched. Dated records
(changelogs, ADRs, audit documents) were left as history.

| Document | What was false | What it says now |
| --- | --- | --- |
| `README.md` | "Backup and restore is deliberately **not** in V2 … restore is targeted at V2.1" — two paragraphs above its own "backup and restore … delivered" | The banner points at the current roadmaps; the capability list states what ships |
| `README.md` | "An **AI** layer … is **not** built, and `/ai` says so" | The proposal layer is described as what it is, in the same terms as Help |
| `README.md` | "Tasks … with an **Eisenhower Matrix** and Time Sectors" | V2.2 removed the Matrix (ADR-085). The Tasks description is the daily driver that replaced it |
| `README.md` | "most modules are built … export, recovery and platform capabilities are the work that remains", then a paragraph listing all of them as shipped | One list of current capability, including capture-from-phone and the five colour schemes |
| `README.md` | `pnpm test` "Unit/component tests"; `test:e2e` "Chromium smoke test"; `pnpm dev` "foundation page" | What each command actually runs |
| Help → *Appearance and Settings* | "DalyHub has one light appearance and one dark one" with no mention of schemes | Names the five schemes and states that appearance and scheme are independent |
| Help → *Not here yet* | "Choosing a colour scheme. … There is no palette to pick from and no theme to build" — denying a feature that shipped the same day | Removed. The remaining entries are still true |
| `SETUP_AND_CI.md` | "CI installs the Chromium **headless shell** explicitly (`--only-shell`)" — reversed by HARDEN-01 and missed | The full build, why the LAUNCH is what decides it, and the falsifier |
| `TODAY_DASHBOARD.md` | An archived-then-restored Active project "reappears in Today" | The two rules that make that unreachable, and what actually happens |
| `ROADMAP_V2_2.md` | DS-17 listed twice — once unchecked, once delivered | One entry, delivered |
| `ARCHITECTURE_DECISIONS.md` | Two `ADR-088`s; THEME-01's ADR linked to a roadmap anchor that does not exist | `ADR-089` for THEME-01, correct link, and the older `ADR-082` collision recorded |

**Not touched, deliberately:** `AGENTS.md` §6 and §15 still describe the colour
system as one generated pair with no theme feature. That is
[DEBT-95](PRODUCT_DEBT.md), whose closing condition is *"a dedicated PR amending
`AGENTS.md`, per the file's own closing rule"*. Folding a constitutional
amendment into a hardening pass is exactly what that condition exists to prevent.

---

## 5. What was deliberately NOT done

- **No skips, no `fixme`, no retries.** `retries: 0` is unchanged. Nothing was
  made green by hiding it.
- **No selector widening and no generic-visibility substitutions.** Every
  repaired assertion asserts an outcome at least as specific as the one it
  replaced, and three of them are stronger (§3E, §3F).
- **No test deleted.** The two obsolete assertions (§3D, §3E) were replaced by
  the surviving invariant, not removed.
- **No redesign.** The two UI changes are a CSS rule that restores a control the
  module's own documentation says should be there, and a `preventDefault` on one
  link.
- **No new feature, no new CI job, no new shard, no screenshot capture added.**
- **No production contact.** Nothing here deploys, migrates, writes a secret or
  reads production data.

---

## 6. What remains

### 6.0 One more stale assertion, found by running the whole suite in one process

`projects.spec.ts:193` asserted the subtitle read `/\d+ projects loaded/`. UIX-06
gave every collection ONE count line through `collectionCountLabel`, whose first
rule is that the noun is CAPITALISED because these are the product's own nouns —
"50 **P**rojects loaded". The assertion had been failing ever since, and **nobody
could see it**: this spec is in the tests shards 4 and 8 never started before
`globalTimeout`. It is the same class as §3D and §3E, found the same way, and it
is repaired against the shared helper's stated rule.

Two other failures in that run were artefacts of the run itself, and are recorded
because the distinction matters for anyone repeating this:

- `project-health.spec.ts:31`/`:97` — the at-risk fixture's overdue task had been
  completed by an earlier spec in the same process. The suite is designed to be
  SHARDED, with each shard seeding a fresh local D1 at server start; running all
  115 spec files in one process against one database is not that, and it leaks
  state between files that never share a shard in CI.
- `pwa-offline.spec.ts:255`/`:288` — a `pnpm run build` was running concurrently
  and replaced `build/` under the production-mode preview server the assertions
  fetch from. Self-inflicted, and a reminder that the E2E servers own `build/`
  for the duration of a run.

All five pass on a fresh server with nothing else running (45/45 across the three
spec files).

### 6.1 `tasks-collection.spec.ts:340` — CI-only, undiagnosed

The saved-views journey failed in CI at the baseline (a 90-second timeout waiting
for the "Save as new view" menu item) and **passes locally at `workers: 1`,
`retries: 0`** on every attempt. It is kept in the gate, failing and visible if it
fails again. It is not called flaky: it is undiagnosed, and the distinction is
that the next occurrence must produce evidence rather than a shrug.

### 6.2 DEBT-125's closing condition is not met by this pass alone

A cause was identified with evidence and the fix now actually reaches the browser
that runs — but an intermittent CI-only crash is only shown to be gone by runs
that do not have it. That needs runs, and runs accumulate after a merge, not
before it.

### 6.3 The shard split still has not been re-derived from a green run

Unchanged from HARDEN-01 §8.3, and for the same reason: the measurement needs a
green run. It is now unblocked in a way it was not before, because shards 4 and 8
no longer burn their budget on failures that time out.

### 6.4 Production is documented, not verified

Unchanged from HARDEN-01 §7. `DEBT-84` stays `◐`. The owner action is one
command:

```bash
pnpm run verify:production
```

It reports `VERIFIED`, `PARTIALLY VERIFIED` or `NOT VERIFIED`, mutates nothing,
prints no secret value, and reports `SKIPPED` — never a pass — for anything it
cannot reach. **Read `pnpm run db:production:list` before deploying this
revision**, because of the migration renumber in §1.2.
