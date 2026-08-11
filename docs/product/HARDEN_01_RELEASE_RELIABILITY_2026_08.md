# HARDEN-01 — CI reliability, accessibility cleanup, production truth

> **What this is.** The record of the hardening pass taken between the end of the
> UIX-01…UIX-06 redesign programme and the start of the next substantial UI
> project. It is not a feature, and deliberately contains none: its whole purpose
> is that `main`'s gate means something, that the known accessibility defects are
> gone, and that the production documentation says what is true.
>
> **Baseline commit.** `3579100817e3e9d13389be5e9dae0a9b4359ef77`
> (`main`, "Add RSS sampling tool for e2e browser memory diagnostics (#159)").
>
> **Date.** 2026-08-11.

---

## 1. Baseline — what was actually true before anything was changed

Every layer of the repository's verification contract was run against the
starting commit, locally and in CI, before a line was edited. CI run
[`31473135291`](https://github.com/acedaly/DalyHub-V2/actions/runs/31473135291)
is the authoritative baseline: it is a push build of the starting commit itself.

| Layer | Command | Result |
| --- | --- | --- |
| Formatting | `pnpm run format:check` | **green** |
| Lint | `pnpm run lint` | **green** |
| Types | `pnpm run typecheck` | **green** |
| Generated scheme | `pnpm run scheme:check` | **green** |
| Icons | `pnpm run icons:check` | **green** (CI) |
| Unit & component | `pnpm run test:unit` | **green** — 369 files, 4720 tests |
| Kernel (Workers runtime + real local D1) | `pnpm run test:kernel` | **green** — 151 files, 2278 tests |
| Production build | `pnpm run build` | **green** |
| Cloudflare deploy dry-run | `wrangler deploy --dry-run` | **green** |
| E2E | `playwright test` (8 shards, CI) | **RED** — see below |

So the pipeline had exactly one red layer, and it was the browser one. That
matters for the classification below: nothing here is a product defect that unit
or kernel coverage could have caught.

### Baseline E2E failures, classified

Four of eight shards were red. Shard 3's 25 failures were classified completely
and are the ones this pass repaired; shards 2, 4 and 8 were also red, and **4 and
8 reached Playwright's 25-minute `globalTimeout` with tests never run**, so the
baseline run does not represent full coverage of the suite.

Shard 3, `main` @ `3579100` — 162 passed, 1 skipped, **25 failed**:

| Spec | Failing | Class | What it actually was |
| --- | --- | --- | --- |
| `global-capture.spec.ts` | 22 | **B — stale test** | `button.dh-fab` not found. UIX-01 retired the floating action button outright; the whole "larger windows" block asserts a component that does not exist |
| `inline-editor-overlay.spec.ts` | 1 | **A — product defect** | The Due date editor would not open. Diagnosed below; it is a real defect and a user hits it with a mouse |
| `linked-items.spec.ts` | 2 | **C — test implementation defect** | UIX-04's Notes rail lists every note as a link, so unscoped `getByRole("link", { name: title })` was asking the rail a question about a relationship |

DEBT-125's own table listed the same three specs at the same counts, plus eleven
more spec files it had not diagnosed. Those live in shards 2, 4 and 8 — see §2
for why their budget could not be read from this run, and the verification run
for what remains.

### The one real product defect, because it is the reason this classification matters

`inline-editor-overlay.spec.ts` › *"Due date exposes the whole date interface and
clears"* failed with "the editor should open and stay open". Reproduced locally
and measured from the DOM at 1280 CSS px:

```
.dh-card__metadata   x 768 → 1208
.dh-card__actions    x 1164 → 1200   (position: absolute, z-index: raised, on hover)
due-date button      x 1133 → 1216
elementFromPoint(due centre) → <button aria-label="More actions for …">
```

The row's hover action rail sits **on top of** the Due date chip, so the chip's
own centre resolves to the overflow trigger. **A mouse user cannot open the last
inline editor on a task row at all** — hovering to reach it is what summons the
thing that covers it.

`card.css` has reserved the rail's band since UIQ-002 for exactly this reason,
and states the reservation on `.dh-card__support`. UIX-06 made `__support`
`display: contents` in a task row so the metadata track could be sized once — and
a padding on a box that generates none does nothing. The reservation has been
inert ever since. `tasks.css` already records this precise trap at its 46rem
container query ("a `flex` on a box that generates none is inert"); the same
sweep missed this rule.

**This is why "don't treat every red test as the same problem" is the rule.**
Twenty-two of shard 3's failures were a test asserting a deleted component; one
was the product being broken for anyone using a mouse; two were a test asking the
wrong element. Retrying, or broadening a selector, would have buried the middle
one.

---

## 2. DEBT-125 — the shard-1 browser-process death

### The question, restated

DEBT-125 records a `browser.newContext: Target page, context or browser has been
closed` that lands at a POSITION rather than on a test — always shard 1, always
~185 tests into one long-lived browser, always inside `ai-assistance.spec.ts`'s
responsive/phone-matrix block, on a different victim each time. #159 built
`scripts/measure-e2e-browser-rss.mjs` to test the one hypothesis that shape
suggests: **the process is running out of something at about that point.**

### Question 1 — is it memory exhaustion in Chromium? No.

MEASURED: a full local shard 1 (`--shard=1/8`, the exact slice), 189 tests,
19.3 minutes, 579 samples at 2-second intervals.

| Window (s) | Mean tree RSS | Max tree RSS | Mean largest process | Max processes |
| --- | --- | --- | --- | --- |
| 0–120 | 1258 MB | 1633 MB | 470 MB | 12 |
| 240–360 | 1355 MB | 1626 MB | 468 MB | 12 |
| 480–600 | 1367 MB | 1598 MB | 472 MB | 12 |
| 720–840 | 1133 MB | 1517 MB | 481 MB | 12 |
| 960–1080 | 1266 MB | 1533 MB | 483 MB | 12 |
| 1080–1200 | 1285 MB | 1493 MB | 478 MB | 11 |

Linear trend over the whole run:

- **Chromium tree RSS: −5.5 MB per minute.** Not rising. The mean in the last
  two-minute window is within 3% of the first, and the peak is reached in the
  second window, not the last.
- **Largest single process: +0.7 MB per minute** — about 14 MB of drift across
  nineteen minutes, against a process that sits at ~475 MB throughout.

**Nothing accumulates.** Contexts are being released and pages are being closed;
there is no leak to find. And the run itself was **green** — 189 passed, 0 failed
— including the three tests DEBT-125 has seen die (*"Ask DalyHub passes axe in
dark mode"*, and two of the phone-matrix overflow checks), all of which passed at
their usual position.

That is not, on its own, proof the failure is gone: shard 1 was also green in CI
on this same commit (run `31473135291`), as it was on `31458924652`. A green
shard 1 is one sample on the lucky side of a line, which is exactly the trap this
entry warns about. What the RSS curve does prove is the **mechanism**: whatever
closes that browser, it is not Chromium growing until it runs out.

### Question 2 — if not the browser, where IS the pressure?

**Not answered, and the tool that was supposed to answer it could not.** The
sampler measured Chromium alone, which is precisely the cohort the measurement
above has now exonerated. DEBT-125 asks whether the pressure is the browser tree,
a single renderer, the Node test runner or the Cloudflare worker process; one
column cannot tell them apart.

HARDEN-01 fixed the tool rather than guessing the answer. It now samples three
cohorts — Chromium, Node, `workerd` — plus the system's own `MemAvailable`, which
is the number a kernel out-of-memory decision is actually made against, and it
**scopes every cohort to the spawned run's process tree**. That scoping is the
part that makes it evidence: without it the cohorts sweep the whole machine, so a
second checkout, an editor's language server or an unrelated dev server is
attributed to the shard, and a curve meant to answer "what is this run
consuming?" answers "what is this computer running?" instead. An early
unscoped reading suggested the harness was larger than the browser; it is not
quoted here, because it was a measurement of a machine rather than of a run.

What is safe to say from the scoped instrument is that `MemAvailable` never fell
below ~12 GB of 16 on any sample, so nothing in this environment was near a
ceiling of any kind.

Question 3 then made the question moot: the failure is not pressure anywhere. It
is a crash. The widened sampler is kept because it is now a correct instrument
and the next intermittent failure deserves one, not because the answer still
depends on it.

### Question 3 — what causes it, then? A SIGSEGV in `chrome-headless-shell`.

The answer did not come from a benchmark. It came from reading the CI log of the
occurrence itself. Run
[`31479232198`](https://github.com/acedaly/DalyHub-V2/actions/runs/31479232198),
shard 4, verbatim:

```
[pid=11376][err] Received signal 11 SEGV_MAPERR 0000000001b0
[pid=11376][err] #0 0x55e65208c413 (/home/runner/.cache/ms-playwright/
    chromium_headless_shell-1234/chrome-headless-shell-linux64/
    chrome-headless-shell+0x4265412)
...
  5 failed
  43 did not run
  139 passed (25.0m)
  2 errors were not a part of any test, see above for details
```

Read it in order: the browser **segfaults**, every subsequent test fails
`browser.newContext: Target page, context or browser has been closed`, and the
shard then walks into `globalTimeout` with 43 tests never run. That is the exact
DEBT-125 signature, and it is now attributable: **the browser process is not
killed, it crashes.** Signal 11 with a near-null fault address is a null
dereference inside the binary, not an out-of-memory decision — the kernel's OOM
killer sends SIGKILL and writes a different record entirely. The flat RSS curve
above and this crash are the same finding from two directions.

The binary that crashed is `chrome-headless-shell`, and that matters, because it
is not the binary anything here was diagnosed on:

| | Local diagnosis | CI before HARDEN-01 |
| --- | --- | --- |
| Install | `playwright install chromium` (full) | `--only-shell chromium` |
| Binary | `chromium-<rev>/chrome-linux/chrome` | `chromium_headless_shell-<rev>/chrome-headless-shell` |
| Full shard 1 | no crash | crashes at a position |
| ~220 tests of a whole-suite run | no crash | — |

**The binary was the one uncontrolled difference between the environment where
this reproduces and the environment where it never has.** #158 switched to
`--only-shell` on sound reasoning — this suite is headless, records no video and
generates no PDFs, so the full download is unused weight — but the headless shell
is a *separate build*, not a subset, and it is the one that faults.

So `.github/workflows/ci.yml` now installs the full Chromium build. It costs
~30s of download per shard. The comment on that step quotes the crash and states
the falsifier plainly: **if the crash recurs on the full build, this is not the
cause and the change should be reverted with that recorded.**

### What else was done, and what was deliberately not

1. **The deterministic failures were fixed** (§1), including one that was a real
   product defect. That matters for this entry specifically: with 25 fewer tests
   burning a full timeout, the shard budget stops being contaminated and the
   split can finally be re-derived from a green run — which is the closing
   condition DEBT-125 set for itself.
2. **Retries stayed at 0.** A retry would have hidden this. The position property
   is what made the log worth reading in the first place, and a retried run
   averages it away.
3. **No browser recycling was added.** Restarting Chromium every N tests would
   have made the symptom disappear without the segfault ever being found, which
   is the outcome the brief names as forbidden.
4. **The sampler was widened and scoped** so the next occurrence — if there is
   one — produces evidence about the right processes rather than only about the
   browser.
5. **DEBT-125 is NARROWED, not closed.** A cause is now identified with evidence
   and a fix is applied, but a fix for an intermittent CI-only crash is a
   hypothesis until enough runs have gone by without it. Closing it needs those
   runs, and they have not happened yet.

---

## 3. CI state

### What #158 built, and whether it survived

It survived, and HARDEN-01 changed nothing structural. The audit was a real one —
the question was whether a pipeline cut from 23 statuses to six had given up
something it needed — and the answer on the evidence is no:

| | Before #158 | After #158 | After HARDEN-01 |
| --- | --- | --- | --- |
| Statuses on a run | 23 | 6 | 6 |
| Playwright shards | 18 | 8 | 8 |
| Retries | 0 | 0 | **0** |
| Screenshot capture in an ordinary run | ~190 skipped stubs, distributed into the shard split | ignored entirely unless opted in | unchanged |
| Artifacts on a GREEN run | none | none | none |
| Cloudflare deploy dry-run | absent | a step of `Build` | unchanged |
| Required check | `CI Gate` | `CI Gate` | **`CI Gate`** |

**No check name changed, so no branch-protection rule needs updating.** That was
a deliberate constraint rather than a lucky outcome: a green PR whose newly
renamed check is no longer required by branch protection is not an improvement,
and `CI Gate` exists precisely so the internal structure can move without the
rule moving with it.

The one CI-adjacent thing HARDEN-01 did change is `scripts/measure-e2e-browser-rss.mjs`
— see §2 — and `docs/development/SETUP_AND_CI.md`, which still described the
14-way matrix, a separate kernel job, a 15-minute `globalTimeout`, artifact names
that no longer exist and a `main` concurrency rule #158 had deliberately
reversed. That document was as stale as the specs were.

### Is eight shards still right?

Yes, and the evidence says so twice over. MEASURED on the baseline run
`31473135291`:

| shard | test time | outcome |
| --- | --- | --- |
| 1/8 | 15m32 | passed |
| 2/8 | 21m24 | failed |
| 3/8 | 16m22 | failed |
| 4/8 | **25m01** | failed — reached `globalTimeout`, tests never run |
| 5/8 | 8m54 | passed |
| 6/8 | 8m38 | passed |
| 7/8 | 11m51 | passed |
| 8/8 | **25m02** | failed — reached `globalTimeout`, tests never run |

- **All eight shards started within twenty seconds of each other**, and none
  queued. That is the constraint #158 re-split against, and it is satisfied:
  splitting finer would add a full setup per slice and shorten nothing.
- **The 132 minutes of test time this measures is inflated by the breakage, not
  by the suite.** A failing test burns its whole timeout, and this run carried
  every deterministic failure below. Shards 4 and 8 reaching the ceiling with
  tests unrun is a real coverage gap, and it is the reason the split must be
  re-derived from a GREEN run rather than from this one.

**So the shard count was left alone.** Changing it on a measurement this
contaminated would have been optimising because HARDEN-01 existed, which is
exactly what the brief forbids.

There is a second reason not to have re-split on this run, and it only became
visible later: **shard 4 did not run long, it crashed early and then burned the
clock.** §2 quotes the segfault. A shard whose browser dies at test 139 and
reports `25m01` has not measured 25 minutes of work — it has measured a crash
followed by 43 tests that never started. Re-deriving a split from that number
would have encoded the crash into the shard geometry.

### What the repair actually moved

MEASURED on run
[`31479232198`](https://github.com/acedaly/DalyHub-V2/actions/runs/31479232198),
the same suite after §1's repairs, against the baseline `31473135291`:

| | Baseline `31473135291` | After repairs `31479232198` |
| --- | --- | --- |
| Shard 3 failures | 25 | **4** |
| Shard 4 | failed — `globalTimeout`, tests unrun | still failed — the segfault, 43 unrun |
| Statuses | 6 | 6 |
| Retries | 0 | 0 |

Shard composition shifted between the two runs (19 tests were deleted, so the
1/8th boundaries moved), which is why the honest comparison is total failures
rather than a per-shard diff. The remaining four are listed in §8 with their
diagnoses; they are the ones DEBT-125 raised and never diagnosed, and they stay
in the gate.

### Retries

Still `0`, in `playwright.config.ts`, unchanged. Nothing here was made green by
retrying it, and the property that made the remaining browser failure
diagnosable — that it repeats by position — is intact.

---

## 4. The 200%-zoom / narrow-width overflow

### What the residual turned out to be

The brief describes a known residual on `/today` after #158: an effective CSS
viewport of ~195px, ~14px of scrollable horizontal overflow, and no obvious
element extending past the viewport.

**It does not reproduce at the HARDEN-01 baseline.** Measured directly against
`main` @ `3579100`, at 195x422 with mobile emulation, on `/today`:

```
documentElement.scrollWidth  195
documentElement.clientWidth  195
overflow                       0
```

A DOM sweep for every element whose border box passes the viewport's right edge
returns none. The suite agrees: `mobile-shell.spec.ts` › *"stays usable at 200%
zoom"* passes at that commit. The two WCAG 1.4.10 reflow defects #158 measured
and fixed appear to have been the whole of it, and the residual was recorded
before the last of those fixes landed. **No overflow fix was needed, and none was
invented** — in particular no `overflow-x: hidden` was added anywhere, which
would have hidden the symptom and made content unreachable.

### What HARDEN-01 changed instead: the check itself

A reflow check on one route is a check on one route. The shell is shared, this
pass changed part of it (the Tasks row's trailing band, §1), and a shell change
can move an overflow from the page that is checked to one that is not. So the
195px case now runs across the core routes rather than `/today` alone:

| Route | `scrollWidth <= clientWidth` at 195px | Navigation reachable |
| --- | --- | --- |
| `/today` | ✅ | ✅ |
| `/tasks` | ✅ | ✅ |
| `/projects` | ✅ | ✅ |
| `/goals` | ✅ | ✅ |
| `/notes` | ✅ | ✅ |
| `/settings` | ✅ | ✅ |

And the usability half is asserted rather than assumed, because "no overflow" is
trivially satisfiable by hiding things: the phone navigation bar must still be
visible and its Capture control still hittable.

**One honest measurement came out of that.** At 195px the five bottom-bar
destinations get 39px of width each — the arithmetic of the viewport, not a
defect. The bar keeps its 44px HEIGHT, which is the axis a thumb travels on, and
39x44 clears WCAG 2.2 AA's target-size minimum (SC 2.5.8, 24x24) comfortably.
The test therefore asserts **24x24 on both axes plus 44 on the height**, not
DalyHub's 44x44 design floor: no arrangement of five labelled destinations meets
44px of width at 195px, and the only way to "pass" a 44x44 assertion there would
be to redesign the bottom bar — which is a requirement the specification does not
make and a redesign this pass is not.

---

## 5. DS-17 — select clear-control names

**The defect.** `SelectField`'s clear button was `aria-label="Clear selection"`
and `SelectSheetControl`'s said the same in visible text, so the Task quick-edit
panel — three populated selects — had three buttons with one accessible name
between them. `InlineSelectField` alone named its clear command after its field,
so the product had two answers to one question. Recorded as
[DEBT-112](PRODUCT_DEBT.md), now closed.

**Why it had not been fixed.** The obvious fix was implemented and reverted once
already, on the grounds that naming a clear button after its field makes the
field's own label a substring of the button's ("Priority" inside "Clear
priority"), and Playwright's `getByLabel` matches substrings — so the change
looked like a suite-wide migration from `getByLabel` to `getByRole`.

**The estimate was an order of magnitude out, and this time it was measured
rather than estimated again.** **Five** call sites needed changing — not a
suite-wide migration — and, instructively, **none of them was a select**. They
were the inline DATE popovers, because DS-17 renamed `InlineDateField`'s clear
command as well: "Clear due date" contains "Due date", so a
`getByLabel("Due date")` scoped to the `Edit due date` dialog resolves to the
input *and* the button. Each became `getByRole("textbox", { name })`, which is
the direction the register already pointed at and which cannot match a button.

The check that mattered turned out not to be the one the original analysis ran.
"Which `getByLabel` strings are also a SELECT's label?" gives three candidates
("Date", "Due date", "When") and all three operate date fields — which is exactly
why this looked safe. The question that finds the five is "which are the label of
**any** field whose clear control was renamed?". CI found them; a static
cross-reference did not.

**The fix.** One shared helper, `clearControlLabel(label)` in
[`app/shared/forms/clear-label.ts`](../../app/shared/forms/clear-label.ts),
consumed by three primitives:

| Primitive | Where the name goes | Visible text |
| --- | --- | --- |
| `SelectField` | the icon button's `aria-label` | unchanged (a `×` glyph) |
| `SelectSheetControl` | the sheet row's visible text | "Clear due date" |
| `InlineDateField` | the button's `aria-label` | unchanged — still "Clear" |

The name is DERIVED from the field's own label rather than passed in as a prop,
so a new select cannot forget to supply one — which is the failure mode a prop
would have reintroduced the first time a call site omitted it.

`InlineDateField` keeps the visible word "Clear" deliberately: it lives in a
popover already titled "Edit due date", so repeating the field in the button's
own text would be noise, while a screen-reader user reaching the button may not
have the dialog title in earshot. WCAG 2.5.3 holds — the visible label is a
prefix of the accessible name — so speech-input users can still say "click
Clear".

**What did NOT change:** unset semantics, the ability to replace a selection
without clearing it first, and every other behaviour of a select. DS-17 was a
naming defect and is fixed as one.

**Coverage.** `test/unit/forms/select-field.test.tsx` renders two populated
selects on one surface and asserts two differently-named clear controls, that
clearing one leaves the other alone, that an empty field offers none, and that
nothing is left saying "Clear selection". `test/unit/tasks/TaskQuickEditPanel.test.tsx`
now asks by name, unscoped — it previously had to reach for the field's DOM
wrapper to say which of three it meant, and the disappearance of that scoping is
the closing condition made executable.

---

## 6. AUDIT-FIX-05 — the documentation truth pass

Full detail in [`ROADMAP_V2_1.md` → AUDIT-FIX-05](../roadmap/ROADMAP_V2_1.md#-audit-fix-05--documentation-truth-pass-p2p3--delivered-2026-08-11)
and [DEBT-84](PRODUCT_DEBT.md). The contradictions found, and what each turned
out to be:

| Contradiction | What it actually was |
| --- | --- |
| `DEPLOYMENT.md` states the migration head three times: `0027` in the prose, `0035` in the ordered procedure, `0001`–`0025` in "Current status" — while `migrations/` holds `0038` | **A repository stating something only a database can know.** No number is stated now; `pnpm run db:production:list` is the answer, and the document says so |
| Every document, the audit's §19 checklist and the deploy script assert `/health` is public and that an Access redirect from it is a misconfiguration | **False, and load-bearing.** See below — this one was a defect, not drift |
| Help: "There is no AI in DalyHub yet", one topic below Help's own "AI assistance" section | Shipped in AI-01/AI-02/AI-04 and never revisited |
| Help: "Building your own theme. You can choose from the five" | There has been no theme feature since M3-01 (ADR-074) — one generated light/dark pair |
| Help: DalyHub "does not keep copies for you or take one on a schedule" | The production-backup workflow takes a nightly encrypted copy. The honest version distinguishes that disaster-recovery dump from a restore point reachable in-app |
| README "Status": export, backup/restore, search, saved views, mobile, PWA and AI listed as planned or in progress | All shipped |
| `ROADMAP_V2.md` closure log: AUDIT-IDENTITY-01 "carried forward as outstanding" | Fixed by IDENT-01 on 2026-08-04. Dated and corrected in place rather than rewritten — the paragraph was accurate at the closure it belongs to |

### The `/health` finding, because it is not documentation drift

Measured on 2026-08-11 from an unauthenticated network:

```
$ curl -sS -o /dev/null -w "%{http_code} %{redirect_url}" https://hub.daly.id.au/health
302 https://<team>.cloudflareaccess.com/cdn-cgi/access/login/hub.daly.id.au?...
```

Cloudflare Access protects the **whole hostname** — which is exactly the origin
hardening `DEPLOYMENT.md` spends a section enforcing, and which is why
`*.workers.dev` and Preview URLs are disabled. There is therefore no
unauthenticated path to `/health` either.

`scripts/deploy-production.mjs` refused a 3xx on the stated grounds that
"`/health` is public by design, so a Cloudflare Access redirect means the
endpoint is misconfigured". **Under that rule every successful production
deployment would have ended in a failed health assertion**, and the deploy would
have exited non-zero with the Worker live and correct. The rule had never been
run against this deployment.

The fix distinguishes three states instead of two, because there are three:

- the application answered and reports this release — the only observation that
  proves WHICH build is live;
- **Access answered** — the intended configuration, the Worker was not asked, and
  the running release is **NOT verified** by that probe;
- anything else — a real failure, still non-zero.

An Access **service token** (`PRODUCTION_ACCESS_SERVICE_TOKEN_ID` / `_SECRET`)
makes the payload assertable through Access rather than around it, and
`PRODUCTION_HEALTH_REQUIRE_PUBLIC=1` restores the strict rule for a deployment
that genuinely exposes the endpoint.

### One new command

`pnpm run verify:production` (`scripts/verify-production.mjs`). It exists because
the §19 checklist was four commands from three documents whose outputs nobody
read the same way twice. It checks configuration presence, the Worker's most
recent deployment, the secret NAMES set on it, the D1 migration state and the
`/health` response class — and it **never** deploys, migrates, writes a secret,
prints a secret value or bypasses Access. Every Wrangler command it issues is a
`list`, and a unit test asserts that rather than trusting it. A check it cannot
run reports `SKIPPED`, never a pass.

---

## 7. Production verification

## NOT VERIFIED — owner/environment action still required

Stated plainly, because the whole point of §6 is that this repository stops
claiming things it cannot know.

**What WAS observed, and is therefore true:**

- `GET https://hub.daly.id.au/health` answers `302` to the Cloudflare Access
  login from an unauthenticated network (2026-08-11). Access is protecting the
  hostname, which is the intended configuration.

**What was NOT observed, and is therefore unknown:**

- which release the running Worker reports;
- which migrations the production D1 database has applied;
- which secret names are set on the Worker;
- when the Worker was last deployed, and from which commit.

The implementation environment holds no Cloudflare credentials, so none of these
could be checked, and **none of them is asserted anywhere in this pull request**.
No production data was created, edited or deleted; no deployment was performed;
no migration was applied.

**The owner action, in one command:**

```bash
export CLOUDFLARE_API_TOKEN=***          # or `wrangler login`
export CLOUDFLARE_ACCOUNT_ID=***
export CLOUDFLARE_D1_DATABASE_ID=<the provisioned remote D1 UUID>
export PRODUCTION_DEFAULT_WORKSPACE_ID=<uuid>
export PRODUCTION_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
export PRODUCTION_ACCESS_AUD=<aud>
export PRODUCTION_OWNER_EMAIL=<owner>

pnpm run verify:production
```

It prints one line per check and one verdict — `VERIFIED`, `PARTIALLY VERIFIED`
or `NOT VERIFIED` — and mutates nothing. Then, because no unauthenticated
command can do it, sign in through Access and read **/about**: it shows the
version and the deployed commit, which is the authoritative answer to "which
build is live".

**If production is running an older commit than `main`, that is expected and not
a defect of this pass.** HARDEN-01 deploys nothing. What it changes is that the
same checklist is now repeatable against whatever revision is live, and that a
future deploy's health assertion will no longer fail on a correct deployment.

---

## 8. Remaining debt

Four things are left. None is hidden, none is excluded from the gate, and each
one names what would close it.

### 8.1 Four deterministic E2E failures remain, all of them pre-existing

They are **kept in the gate**, failing and visible. No `.skip`, no `.fixme`, no
retry, no removal from a shard. Each was reproduced locally at `workers: 1`,
`retries: 0`, and each was diagnosed far enough to say what it is:

| Failing test | Diagnosis | Class |
| --- | --- | --- |
| `mobile-capture-journeys.spec.ts:207` — *clears Task context when switching to unsupported Task capture* | `page.waitForResponse` never settles within 30s on the context switch. The awaited request is not made — the switch is handled client-side | needs re-diagnosis against the current capture flow |
| `people-diary-context.spec.ts:144` — *journey 2, an existing Diary entry gains and loses a Person* | `getByPlaceholder(/Search name/)` resolves but is not visible. The test sets a PHONE viewport; UIX-05 CSS-hides the desktop `filterBar` in favour of `mobileControls`, so the element it finds is the hidden one | **B — stale test** |
| `people-diary-context.spec.ts:196` — *journey 3, the full-form hand-off keeps the Person context* | after `capture-full-form` the test expects `/notes?…drawer=new-note`; the app stays on `/person/<id>`. Either the hand-off regressed or it moved | **A or B — undetermined, and that is the point** |
| `project-settings.spec.ts:213` — *Planned → Active → On hold → Active → Archive → Restore, reflected live on Today* | `pr-today` is absent from the "Continue working" rail. `rankContinueProjects` filters `openCount > 0`, sorts by `lastMeaningfulActivityAt` (from the Activity stream, deliberately **not** `updated_at`) and slices to `CONTINUE_MAX = 3`; a fixture workspace with three more recently-active Projects crowds it out | **C — test implementation defect**, most likely |

**Proof they predate HARDEN-01.** Every one appears in DEBT-125's original table
as raised by #158, at the same counts, under "not yet diagnosed":
`people-diary-context.spec.ts | 2`, and `mobile-capture-journeys` ·
`project-settings` at `1 each`. That table was written before this branch existed.
Nothing in this pass touches capture routing, the People/Diary surfaces or
`rankContinueProjects`.

They were not fixed here for a stated reason rather than an unstated one: three of
the four are genuine product questions — *should* the capture hand-off navigate,
*should* a Project the user just touched appear on Today — and answering them is
product work, not hardening. Guessing at them to make a gate green is the failure
mode this whole pass exists to end.

**Closing condition:** each is diagnosed to a class and either fixed or converted
into a test that asserts what the product now does, with the product decision
recorded.

### 8.2 DEBT-125 is narrowed, not closed

A cause is identified with evidence (§2: SIGSEGV in `chrome-headless-shell`) and
a fix is applied (the full Chromium build). That is a hypothesis with a good log
behind it, not a closed case: an intermittent CI-only crash is only shown to be
gone by runs that do not have it.

**Closing condition:** a full Playwright run on `main` is green with no spec
excluded, no `.skip`/`.fixme`, no retry raised and no shard reaching
`globalTimeout` — sustained across enough runs that a green one is not a lucky
sample — **or** the crash recurs on the full build, in which case the CI change is
reverted and that result recorded, because it falsifies the diagnosis.

### 8.3 The shard split still has not been re-derived from a green run

Eight was **kept** (§3), and the reasoning is that the only per-shard budget
available is contaminated: shards 4 and 8 reached `globalTimeout` with tests
never run, and a failing test burns its whole timeout. That measurement is
unblocked by §1 and §2 but has not been taken, because it needs the green run
8.2 also needs.

**Closing condition:** per-shard times measured on a green run, and the split
either re-derived from them or explicitly kept with those numbers cited.

### 8.4 Production is documented, not verified

§7 says `NOT VERIFIED` and means it. `DEBT-84` is now `◐` — **documentation
corrected, production still unverified** — and the distinction is the one the
brief asked for: this pass fixed what the repository *claims*, and changed
nothing about what anybody *knows* about the running Worker.

**Closing condition:** an owner runs `pnpm run verify:production` with real
credentials and records the verdict, and reads `/about` through Access for the
live commit.

### Not remaining debt, recorded so it is not re-opened

- **The 200% zoom residual** (§4) did not reproduce at the baseline and no fix was
  invented for it. The check was widened to six routes so a future shell change
  cannot re-introduce it unseen.
- **DS-17 / DEBT-112** is `☑` (§5). Nothing about it is deferred.
- **Question 2 of DEBT-125** — *where is the pressure, if not the browser* — is
  moot rather than open. There is no pressure; there is a crash. The sampler was
  fixed anyway, because a broken instrument in the repository is worse than no
  instrument.
