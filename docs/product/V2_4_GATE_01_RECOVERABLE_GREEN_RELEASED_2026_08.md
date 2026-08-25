# V2.4-GATE-01 — Recoverable, green, released

**The pass that makes "daily driver" literally true before V2.4 adds anything to
it.** Implements
[V2.4-GATE-01](../roadmap/ROADMAP_V2_4.md#-v24-gate-01--recoverable-green-released).

> This is not feature development. Its whole purpose is to establish a
> trustworthy floor: a disaster-recovery copy that has actually been restored, a
> test gate whose red means something, and a release whose notes name what
> shipped.
>
> **It does not reach that floor in full, and says so.** Everything the
> repository can do is done; what remains is one owner-held secret and one set of
> owner-held credentials, named exactly, with the commands, in § 5 — not
> softened, and not counted as done. The roadmap item stays **☐**.

---

## 1. The three claims, and where each one actually stands

| | Claim | State |
|---|---|---|
| **Recoverable** | a backup exists and has been restored in a rehearsal | ◐ — the pipeline is fixed, hardened and now proves a **restore** on every run, and the mechanism has been rehearsed end to end. **No artefact of the owner's data exists yet**, because `BACKUP_ENCRYPTION_PASSPHRASE` is not set. § 2, § 5.1 |
| **Green** | the twelve-partition gate is green | ◐ — see § 3: the 55 failures, the 5 tests that never executed and the one journey that never ran are all resolved. The roadmap's own condition is *"green on `main` for two consecutive pushes"*; the merge produced the **first** (§ 7.1) — and the NEXT push to `main` was **red**, so the pair is broken and the count restarts (§ 8.4). Not one test failed: a partition died in `actions/setup-node` before Playwright started ([DEBT-204](PRODUCT_DEBT.md)) |
| **Released** | production is verified, migrated, and running a release whose notes name what shipped | ◐ — the version decision is taken and recorded, the notes and checklist are written, and **nothing has been deployed**. **Nothing needed migrating**: production is now measured at 49 of 49 committed migrations applied, nothing pending (§ 8.2) — which also means `0042`–`0047` reached production with no backup behind them. Two independent blocks, both owner-held: no production backup has ever completed (§ 4.4), and this environment holds no Cloudflare credentials, which `verify:production` reports for itself (§ 4.3). § 4, § 5.2 |

---

## 2. Recoverable

### 2.1 The audit

The complete path was traced: GitHub Actions → the `Production D1 backup`
workflow → `scripts/production-d1.mjs` (the D1 export) →
`scripts/production-backup.mjs` (validate, encrypt, prove) → the retained
artefact. Four of the five things the audit had to confirm were already true and
are unchanged:

- ✅ **One export/encryption authority.** `production-d1.mjs` and
  `production-backup.mjs`, and nothing else. No second pipeline was created.
- ✅ **Scheduled and manual runs are identical.** One job, one `runs-on:`, no
  trigger-conditional steps — asserted, not inspected.
- ✅ **Plaintext cannot survive a failed run** — and now cannot survive a
  *cancelled* one either (§ 2.2).
- ✅ **Secrets cannot reach a log or an artefact.** The passphrase is never an
  `argv` value, never interpolated into a shell string, `set -x` is absent, and
  the metadata writer refuses any field whose name looks like a credential.

The fifth — *"backup verification actually proves the produced payload is
recoverable rather than merely proving a file exists"* — was **not** true, in two
independent ways, and that is where the work went.

### 2.2 Seven defects, each with a test that fails without the fix

| # | Defect | Fix |
|---|---|---|
| 1 | **The metadata published a recovery it had never performed.** `recoveryVerified: true` was a constant in the writer. It had no way to know whether `verify` had run, and would have gone on asserting it through any edit that dropped or reordered that step. | `verify` writes a **receipt** carrying the digests it actually computed; `metadata` refuses to write the file unless the receipt's ciphertext digest matches the artifact in front of it. `recoveryProof` additionally states which proof ran — `decrypt` or `decrypt+restore`. |
| 2 | **The pipeline proved decryption and called it recovery.** `verify` answers *"do the bytes come back?"*; `validate` is deliberately a shape check rather than a SQL parser. Nothing asked whether a database would load the result. | New `rehearse` command — § 2.3. |
| 3 | **The upload guard was a deny-list** (`*.sql`, `*.json`, `*.zip`), so a plaintext dump written as `dump.txt`, `dump.bak` or with no extension walked into a thirty-day artifact. | An allow-list of the two files the artifact may contain, plus a refusal of any subdirectory the pipeline never creates. |
| 4 | **A whitespace-only passphrase passed the guard.** `-z` accepts one, and GnuPG would encrypt the owner's entire life under it perfectly happily. | ≥ 32 non-whitespace characters required. The length is compared and never printed. |
| 5 | **A cancelled job left the plaintext behind.** `trap cleanup EXIT` does not run when the step is signalled, which is what a `timeout-minutes` overrun or a pressed Cancel does — the one case where the database sits in plaintext on a runner nobody is watching. | `trap cleanup EXIT INT TERM`. |
| 6 | **The backup job carried its own copy of the toolchain setup**, the exact copy-paste `.github/actions/setup` exists to prevent — the backup pipeline could quietly end up on a different Node from the one it is tested on. | `uses: ./.github/actions/setup`. |
| 7 | **The AUDIT-11 test fixture was a dump no database would load.** Every table declared as `(id TEXT NOT NULL PRIMARY KEY)`, with four values inserted into it. It satisfied `validate` — a shape check — and nothing had ever tried to restore it. | A loadable fixture. `rehearse` found this on its first run, which is the argument for `rehearse` in one line. |

### 2.3 `rehearse` — what "recoverable" now means

```
node scripts/production-backup.mjs rehearse --encrypted <artifact> \
  --passphrase-file <key> [--receipt <file>] [--into <file>]
```

It starts where a real recovery starts — the encrypted artifact and the key — and
finishes with rows read out of a database built from it:

1. decrypt;
2. re-validate the decrypted dump structurally, so the rehearsal is a complete
   proof on its own, runnable months later against a downloaded artifact;
3. **execute the SQL** into a throwaway SQLite database;
4. assert all twelve required kernel and sensitive-module tables are present;
5. assert the database is **not empty** — a schema-only export passes every check
   above it and would restore a life containing nothing;
6. `PRAGMA foreign_key_check` over the finished result.

Row **counts** are printed; row content never is. `node:sqlite` is Node's own
standard library, so this adds no dependency and no licensing question, and D1 is
SQLite — a dump SQLite will not load is a dump D1 will not load either.

It is not the *"one-click production restore"* `BACKUP_AND_RESTORE.md` § 5
refuses, and cannot become one: it speaks to no network, holds no Cloudflare
credential, and takes no argument that could name a real database. That is a
stronger guarantee than a warning in a docstring.

The workflow runs it on **every** backup, after `verify` and before anything is
uploaded.

### 2.4 The rehearsal, and the defect it found

Performed against a scratch, non-production D1. Full transcript in
[`BACKUP_AND_RESTORE.md` § 5.5](../development/BACKUP_AND_RESTORE.md).

**The finding: the documented restore command does not work, and never did.**

`BACKUP_AND_RESTORE.md` § 5.2 step 5 and § 5.3 step 4 told an operator to restore
a dump with `wrangler d1 execute <db> --file=dump.sql`. Measured against a real
`wrangler d1 export` of a database carrying the full committed schema (49
migration files, head `0047`) and the repository's seed, it fails on the first
`INSERT INTO entity_links`:

```
foreign key mismatch - "entity_links" referencing "entities"
```

**Mechanism, isolated.** A D1 export writes each table's DDL followed immediately
by its rows and puts every `CREATE [UNIQUE] INDEX` at the **end** of the file.
`entity_links` carries composite foreign keys — `REFERENCES entities
(workspace_id, id)` — whose parent key is unique only because of
`entities_workspace_id_key`, an index the dump does not create for another ~2,700
lines. `foreign key mismatch` is a **schema** error rather than a constraint
violation, so the `PRAGMA defer_foreign_keys=TRUE` the export itself emits on
line 1 does not defer it, and `PRAGMA foreign_keys=OFF` inside the file is
ignored because D1 does not take that pragma from user SQL.

| Restore attempt | Result |
| --- | --- |
| `wrangler d1 execute … --local --file=dump.sql` | **fails** — `foreign key mismatch` |
| the same with `PRAGMA foreign_keys=OFF;` prepended | **fails** identically |
| the same wrapped in `BEGIN; … COMMIT;` | **fails** identically |
| loaded with enforcement off, then `PRAGMA foreign_key_check` | **succeeds**, 0 violations |

The fourth row is what `rehearse` does, and it is the stronger question anyway:
*is the restored database intact?* rather than *was every intermediate state?*

**What is not known.** The **remote** path (`wrangler d1 execute --remote --file`)
goes through Cloudflare's D1 import endpoint rather than executing statements
locally, and may well be unaffected — Cloudflare designs export and import as a
pair. This environment has no Cloudflare credentials and therefore no evidence
either way, and a recovery document is the last place to record a guess. Raised
as [DEBT-199](PRODUCT_DEBT.md) with the exact one-command probe that settles it,
against a throwaway database and never production.

§ 5.0a of the recovery document now carries the measurement, the working command,
and the warning beside the `--remote` instruction rather than in place of it.

---

## 3. Green

> **The starting inventory was MEASURED, not inherited.** DEBT-179's *"19 tests
> across 8 partitions"* describes a tree three programmes old. The set below is
> what the canonical CI path actually reports on `main` today, read from the
> run's own `e2e-results-*` artefacts rather than from a log.

### 3.1 The failure set on `main` @ `054b98f`

CI run [`32571105218`](https://github.com/acedaly/DalyHub-V2/actions/runs/32571105218):

| | |
| --- | --- |
| Scope, Static, **Unit**, Build | **green** — `test:unit` and `test:kernel` both pass, so § 2's module-load fix held |
| E2E | **ten of twelve partitions red** — p01–p10; p11 and p12 green |
| Failing tests | **55** |
| Tests that **never executed** | **5** — p03 and p04 each ran the full 25 minutes of Playwright's `globalTimeout` |
| Conditional `test.skip` branches taken | **4** |

Per partition, and this is the number the manifest is measured against:

| | p01 | p02 | p03 | p04 | p05 | p06 | p07 | p08 | p09 | p10 | p11 | p12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| failed | 5 | 1 | 9 | 9 | 4 | 8 | 5 | 7 | 1 | 6 | 0 | 0 |
| never ran | 0 | 0 | **3** | **2** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| elapsed (min) | 20.1 | 20.0 | **25.0** | **25.0** | 20.0 | 21.9 | 20.1 | 12.2 | 18.3 | 18.3 | 13.8 | 13.0 |

Every partition ran past the manifest's own 16.1-minute budget, and two ran out
of time altogether. That is § 3.6.

### 3.2 One explanation for every failure

| Family | n | Class | Reproduces alone? | Mechanism |
| --- | --- | --- | --- | --- |
| The picker's listbox | ~19 | stale assertion | **yes** | DHDS-09 portalled floating surfaces into the overlay layer, so a `SelectField` / `EntityLinkPicker` listbox is no longer a DOM descendant of the Drawer, dialog or form holding the field. A container-scoped `getByRole("option")` resolves to nothing, however long it waits. |
| Completion re-assertion | 6 | stale assertion | **yes** | DHDS-13's signature, product-wide. Today files a completed row under the plan's `Completed · n` disclosure, which renders CLOSED — so `check()` re-resolves onto nothing and retries to timeout. |
| Row-reveal deadlock | 2 | **product** (DEBT-180) | **yes** | the affordance was inert while concealed and its identically-sized wrapper was not, so the wrapper swallowed the click and did nothing with it. |
| Phone Plan draws two days | 2 | **product** (DEBT-196) | **on a weekend** | selection was published on the weekend COLUMN, which holds two days. It failed on two days of every week, which is why it read as intermittent. |
| Record panel double edge | 1 | **product** | **yes** | `premium.css` (#206) restated the card family's border and radius after `record-layout.css` had deliberately removed them. |
| Nested filter outranks its tabs | 1 | **product** | **yes** | the M3-INT fix named `--dh-text-label-size` because `.record-tab` was label-sized; the token has since drifted to 13px against the strip's 12.5px. |
| The `Now` promotion | 1 | stale assertion | **yes** | TODAY-12 promotes the oldest open overdue Task out of its band into the `Now` position, so the spec's row was never in `Overdue`. |
| Retired surfaces, drifted locators | 5 | stale assertion | **yes** | Today's capture card (removed by TODAY-12), its two named disclosures, an INSET accent rule read as depth, a card chased from `/projects` to `/goals` to `/areas`, and a strict-mode collision the Project record's own inline rows introduced. |
| Journey budget | 1 | budget | **yes** | `assets.spec.ts`'s lifecycle journey measures **38.2 s** of genuine work against the 30 s default. |
| A journey that never ran | 1 | fixture ownership (DEBT-158) | **yes** | nothing in the seed is measurable, so the guard exited every time. |

**Not one failure was accumulated-state-only.** DEBT-173's signature — a spec
whose result depends on which specs preceded it — did not appear in this set at
all; the entry's own two named instances (`iphone-daily-driver.spec.ts:185`,
`tasks-journey.spec.ts:379`) are green here in isolation and in the full
sequential gate, which is the evidence § 3.5 records.

### 3.3 The product defects, fixed at their authority

**DEBT-180 — the row reveal.** The decision the entry asked for, taken once and
recorded in `motion.css` beside the rule it changes. It was taken TWICE, and the
first answer was wrong; both are recorded, because the second is only defensible
against the first.

The measurement is not in dispute: `.dh-overflow-menu` is `position: relative`,
`display: inline-flex` and EXACTLY the same 32×32 box as its trigger, and it
keeps `pointer-events: auto`. `elementsFromPoint` at the trigger's own centre
returned the wrapper, then `.dh-taskrow__actions`, then the row — the trigger
never appeared. So rule 4 was only ever HALF enforced: the affordance was inert
and its wrapper was not, and that rectangle swallowed every click at rest without
doing anything with it, which is the hidden hit area rule 4 forbids, one element
up.

**The first answer — drop `pointer-events: none` so the affordance catches its
own clicks — was rejected on review, correctly.** The measurement it rests on is
true of the overflow trigger and does not generalise: `.dh-action-reveal` also
sits directly on a navigation `<Link>` (`ScheduleList`) and on drag handles
(`TaskDragging`, `TaskChecklistSection`, `GoalMeasurementPanel`), none of which
have such a wrapper. On a hybrid device — one matching `(hover: hover)` because
a mouse is attached, driven by a finger that never hovers — a tap on apparently
empty row space would then navigate or begin a drag with nothing drawn to say
so. A contract rule is not worth trading for a test's convenience.

**The answer that shipped** restores rule 4 on the affordance and extends it to
the box that was defeating it: `[data-dh-action-context="true"]
.dh-overflow-menu:has(> .dh-action-reveal)` is transparent to the pointer while
its child is, so a click in that space reaches the ROW — which the rule has
always promised and had never delivered. It is scoped to an action context,
because the same overflow menu on a record header conceals nothing and must stay
clickable.

Automation reaches the affordance the way a person does, through one shared
`revealRowActions()` helper (`e2e/helpers.ts`) that engages the row first — a
shared interaction contract rather than a hover copied per spec, and no
`force: true` anywhere, which would assert a control is reachable while proving
the opposite. `motion.spec.ts` proves rule 4 in BOTH directions from the real
hit test rather than from a computed style (the half that was already right): at
rest neither the trigger nor its wrapper takes the click and the row does; focus
alone reveals the affordance with no pointer involved; and once the row is
engaged the trigger wins its own hit test and its menu opens.
`plan-weekly-planning.spec.ts:233` passes on the shared helper.

The card's action rail (`card.css`, UIQ-002) keeps its `pointer-events: none`,
deliberately and for the same reason: that rail is an OVERLAY which does not hold
its geometry at rest, so there the rule is load-bearing in the stronger sense —
it is the only thing stopping an unseen "Complete" from taking a click meant for
the title beneath it — and the two specs that hover first say so.

**DEBT-196 — one day on a phone.** `PlanDaySection` publishes `data-selected`
and the phone tier hides the day that is not selected. The column rule is
unchanged, because a merged weekend column must still be RENDERED when either
of its days is chosen. Taken ahead of V2.4-GATE-02 for one reason, stated
plainly: `plan-responsive.spec.ts:100` and `:194` assert the product's own tier
promise, the gate cannot be green while they fail, and the roadmap forbids
weakening them. DEBT-194 and DEBT-197 are untouched.

**The record panel's doubled top edge.** `premium.css` restated the family's
border and radius on `.record-tabs__panel` after `record-layout.css` had removed
the top edge and squared the top corners — so a second hairline sat directly
under the strip's own. The join is restated after it, rather than the family
rule being narrowed, so the panel still follows the card family when that
changes.

**A nested filter louder than its tabs.** Sized from the record tab's own token,
so the two move together and cannot drift a third time.

### 3.4 Stale tests corrected, and fixture ownership

The correction is always the same shape: assert the OUTCOME the product
produces, never the projection it used to.

- **`comboboxOption()` / `comboboxListbox()`** (`e2e/helpers.ts`) resolve a
  listbox through `aria-controls`. This is a **stronger** scope than the
  container it replaces: the container only proved the option shared an ancestor
  with the field; this proves the option is in the listbox **that combobox
  owns** — the relationship the WAI-ARIA pattern is built on and the one a
  screen reader follows. It is presentation-agnostic, so the anchored listbox and
  the phone Sheet are the same call.
- **`openCompletedGroup()`** files the assertion where Today files the row, and
  opens the disclosure by CLICKING ITS SUMMARY, so the completion is proved
  reachable rather than merely present. Nothing was changed to keep completed
  Tasks visible for Playwright's benefit.
- **`openTodayWeeklySummary()`** does the same for the `Last 7 days`
  disclosure, whose closed contents return `""` from `innerText` and resolve to
  nothing by role.
- **DEBT-158** — `spine-workspaces.spec.ts` owns a measurable Goal through
  `goal-fixtures.ts`, the fixture § 2's pass wrote and left unwired. There is no
  skip branch left, and the journey asserts, in order: the Goal exists and the
  collection row carries **no** progressbar yet (a measurable Goal with no
  readings is *"not measured yet"*, which `goal-measurement.spec.ts` states in
  as many words); the starting value; that logging a reading changes the trio;
  that the RENDERED progress moves with it; that a reload preserves it; and that
  the collection row now carries the progressbar it did not have at step 1.
- One **budget correction**, named as one rather than smuggled in:
  `assets.spec.ts`'s lifecycle journey is given 120 s against a measured 38.2 s
  of work. Nothing hangs, nothing is retried, every assertion is unchanged, and
  the precedent is `goals.spec.ts`'s own `setTimeout(120_000)`.
- One **racing unit assertion**: `collection-controls-live-apply.test.tsx` read
  the chips synchronously after a `findBy` that resolved immediately, so both
  assertions raced the router's settle and one run in three reported a defect
  that is not there. Both move inside one `waitFor`, unchanged.

### 3.5 The gate under two states

The acceptance asks for the suite under a **fresh** workspace and under an
**accumulated** one, because a suite that only passes when run a test at a time
is not a green suite — it is a green rehearsal.

#### The three failures that only a developer machine could produce

Running the repaired specs locally surfaced three that had failed in **no** CI
run at all:

| Spec | Symptom |
| --- | --- |
| `notes-knowledge.spec.ts:536` | `getByRole("option", { name: /Notes e2e note record-link-target-…/ })` never appears |
| `notes-knowledge.spec.ts:584` | the same option, timing out on `click` |
| `dhds-11-drag-reorder.spec.ts:481` | the many-buckets drag never resolves its destination |

The tempting reading is "local flake, ignore it". The measurement says
something else, and it is worth stating because it is the exact shape of the
mistake this whole item exists to stop.

**The variable was the DATABASE, not the code.** The local D1 had accumulated
**622 active entities** across repeated gate rehearsals — 491 of them Tasks. A
wipe and reseed put it at **325**, and all three passed first time
(19.8 s / 20.5 s / 24.2 s). Both halves of that are counted, not asserted:

```
active entities, accumulated local D1 : 622   (task 491, project 86, goal 20, …)
active entities, freshly seeded       : 325   (task 212, project 83, area 11, …)
```

For the two `notes-knowledge` journeys the mechanism is exact, and it is a real
product defect rather than a test artefact.
[`searchLinkTargets`](../../app/platform/entity-links/entity-link-picker-service.ts)
scans **at most five pages of 100** and
[`D1EntityRepository.list`](../../app/platform/storage/d1/d1-entity-repository.ts)
orders `created_at ASC` — so the picker only ever sees a workspace's **500
oldest** entities. At 622 a note created seconds ago is past the horizon, and
the picker reports it as nonexistent. That is
[**DEBT-201**](PRODUCT_DEBT.md#-debt-201--both-record-pickers-stop-seeing-a-workspace-at-its-500th-record-and-say-nothing--p2--resolved-2026-08-23-v24-gate-01),
raised rather than fixed: the seam documents the bound as DS-08's to remove, and
replacing a search architecture is not what *"make main green and release
2.4.0"* means. The third is the same cause without the sharp edge — that test's
own comment describes *"ninety-odd Tasks"* and the local page was carrying 491,
so the pointer loop's hit test and re-render ran past the step timeout.

So the honest classification is **environment dependence**, on a database
mutated by many *separate* gate runs — which is not the accumulated state the
acceptance means. That state is one complete partition sequence, and it is
measured below. The distinction matters: had these been waved off as flake, a
genuine P2 would have gone unrecorded.

#### The last three on CI, and one race that was NOT a product defect

Run [`32602831529`](https://github.com/acedaly/DalyHub-V2/actions/runs/32602831529)
at `047a5ca` — 55 failures down to **3**, nine of twelve partitions green, and
`Static`, `Scope`, `Unit` and `Build` all green.

| Partition | Test | Cause |
| --- | --- | --- |
| p02 | `habits.spec.ts:199` | the weekday dependence in § 3.4 — the run landed on the owner's Sunday |
| p05 | `identity.spec.ts:124` | a save the test never waited for |
| p07 | `tasks-collection.spec.ts:298` | a precondition the test asserted downstream of the thing that needed it |

**`identity.spec.ts:124`** — `AreaSettingsTab` commits an identity with `void
onSetIdentity(next)` and the picker's dialog closes on the same tick, so
`toBeHidden()` on the dialog proves nothing about the write. The journey then
navigated to `/areas` immediately, which can abandon the request in flight. The
trigger's label is rendered from the **loader's** value rather than from a
draft, so waiting for it to read "Fuchsia" is an outcome assertion: the write
landed and the route re-read it. The first journey in the same file already did
exactly this; this one had skipped it. Both the choose and the revert now wait,
and the revert's wait is load-bearing twice over — the assertion after it is
that the slot is *not* fuchsia, which an abandoned save would satisfy by
accident.

**`tasks-collection.spec.ts:298`** — the committed URL was
`/tasks?group=due_state`, with **both** filters gone: the exact signature
`use-applied-params.ts` documents. So the first suspicion was that
V2.3-GATE-01's fix had a residual window.

The first attempt to prove it **failed to**, and the honest thing is to record
what that cost. A unit test drove both choices in one synchronous block and
passed against the unfixed code, so the suspicion was written up as disproved
and the test rewritten as a race in the spec: the journey was made to assert its
own precondition before clicking a chip, and the product was left alone. The
next CI run (`32604491454`, p07) then failed one assertion further on, which is
what sent this back for a real measurement instead of a plausible one.

**Run it in a browser and it reproduces every time.** Against the dev server,
`tasks-collection.spec.ts:298` writes precisely what the hook's own docstring
predicts:

```
choose Priority = P1    → GET /tasks.data?group=due_state&priority=p1
choose Due = Overdue    → GET /tasks.data?group=due_state&due=overdue
final URL                 /tasks?group=due_state&due=overdue
```

`priority=p1` is gone. That is a **lost update in shipped code**, not a test
artefact, and V2.3-GATE-01 did not close it — it closed one half of it.

The mechanism is the half nothing was looking at. `useAppliedParams` computes
`applied` **during render**, and `record` writes a **ref** precisely so that it
does *not* re-render (its own comment explains why, and the reasoning is sound).
React Router does not dispatch `loading` synchronously either. So between a
choice and the render that reflects it there is a window in which *nothing has
re-rendered* — and `commit`/`write` were composing over the `searchParams` they
had closed over at the last render. A second choice landing in that window ran a
handler still holding the pre-first-choice parameters, and deleted the first.
The pending write was sitting in the ref the whole time; no render had happened
to go and read it.

The existing regression test could never have caught this: it **holds the first
`.data` response**, which guarantees the router is already reporting `loading`
and a render has already handed the controls the pending write. It only ever
exercised the covered half.

**The fix, at the authority.** `useAppliedParams` now also returns
`current()` — the same precedence (a remembered write outranks the committed
parameters until a render retires it), asked at **event time** rather than
render time — and `write`/`commit` compose over that instead of over a captured
value. Nothing else about the composition changes, and `applied` still drives
everything on screen.

Two tests, both measured:

- The unit test now puts **both clicks inside one `act`**, so no render is
  flushed between them. It **fails without the fix and passes with it**;
  `fireEvent` cannot reproduce the window at all, because it flushes a render
  per event — which is exactly why the first attempt reported a clean bill.
- `tasks-collection.spec.ts:298` keeps the precondition assertion added in that
  first attempt. It was right for its own reason ("two **applied** filters" is
  the test's own title and it had been assuming it), and it is what turned a
  silent wrong answer into a failure that named its own cause.

The lesson worth keeping is the one about method rather than about filters: a
unit test that passes is only evidence if it can fail. This one could not, and
it was briefly allowed to stand as proof that working code was working.

### 3.6 The partition manifest

Regenerated **after** correctness, from measurement, and from nothing else.

Green run [`32605964327`](https://github.com/acedaly/DalyHub-V2/actions/runs/32605964327)
published an `e2e-results-<partition>` artefact from **all twelve** partitions.
That is the first time every spec file could be measured from a run that was
*fully green* — every earlier refresh, HARDEN-06A's included, had to take at
least one number from a partition that failed, which is the whole of what
[DEBT-157](PRODUCT_DEBT.md) was raised about. `generate --from` was run over the
complete set of twelve:

```
12 partitions · 190.4 min of measured test time · mean 15.9 min
  p01 … p10   16.5–16.6 min   10–12 specs
  p11, p12    12.3 min each   responsive.spec.ts --shard=1/2, 2/2
  worst/mean 1.05
```

- **All 117 spec files now read `source: ci:32605964327`.** The six that still
  carried a local or phase-local figure — `local:harden-06b`, `local:dhds-09`,
  `local/dhds-11`, `local/dhds-13`, `dhds-10`, and `motion.spec.ts`'s prose
  source — are gone. No local, normalised or extrapolated number survives.
- **`PARTITION_COUNT` is unchanged at 12, and the ceiling was not raised.** The
  heaviest partition measures **16.6 min against the 16.7 min** that
  `MAX_PARTITION_SECONDS` derives from `globalTimeout`. Raising the ceiling to
  fit is the one answer HARDEN-04 removed from the table; it was not needed and
  was not taken. Nor was any partition hand-tuned — the split is the script's.
- No E2E architecture was rewritten. The manifest is data.

### 3.7 Evidence

| Run | SHA | Result |
| --- | --- | --- |
| [`32602831529`](https://github.com/acedaly/DalyHub-V2/actions/runs/32602831529) | `047a5ca` | 3 failures (p02, p05, p07) — from 55 |
| [`32604491454`](https://github.com/acedaly/DalyHub-V2/actions/runs/32604491454) | `7f8cbea` | 1 failure (p07) — the one a passing unit test had wrongly cleared |
| [`32605964327`](https://github.com/acedaly/DalyHub-V2/actions/runs/32605964327) | `42afd5f` | **GREEN** — twelve of twelve partitions, Scope, Static, Unit, Build, CI Gate |
| [`32607890703`](https://github.com/acedaly/DalyHub-V2/actions/runs/32607890703) | `d924b1e` | 1 failure (p02) — `task-drawer.spec.ts:111`, on the first run of the re-derived split |
| [`32609242926`](https://github.com/acedaly/DalyHub-V2/actions/runs/32609242926) | `47bf5be` | **GREEN** — twelve of twelve, on the re-derived split |
| [`32610240298`](https://github.com/acedaly/DalyHub-V2/actions/runs/32610240298) | `317c934` | 1 failure (p02) — `tasks-collection.spec.ts:298`, clicking across an open popover |
| [`32611293999`](https://github.com/acedaly/DalyHub-V2/actions/runs/32611293999) | `8e574e0` | **GREEN** — twelve of twelve |
| [`32612296143`](https://github.com/acedaly/DalyHub-V2/actions/runs/32612296143) | `ae84193` | **GREEN** — twelve of twelve, all 17 checks |

Counted from the partitions' own `e2e-results-*` artefacts rather than from a
log line, because a log line is what this item exists to stop trusting:

```
p01 235   p02 127   p03 119   p04 135   p05  92+1s   p06 185
p07 128   p08 109+1s p09 145  p10 117+1s p11 260    p12 259

TOTAL   1911 collected · 1911 executed · 0 failed · 0 flaky · 3 skipped
```

The three `skipped` are exactly the three conditional guards
[DEBT-200](PRODUCT_DEBT.md) records — `tasks-optimistic.spec.ts:205`,
`ux-02-plan-habits.spec.ts:322`, `interaction-consistency.spec.ts:84` —
pre-existing, unchanged, and named. DEBT-158's journey is **not** among them: it
executes. A green test that quietly avoids its scenario is indistinguishable
from a real one in a summary line and distinguishable in the artefact, which is
why the artefact is what is read here.

**None of the forbidden moves was used.** No test skipped, disabled,
quarantined or deleted; no `test.fixme`; no expected-failure wrapper; no retry
added; no assertion weakened. One `test.setTimeout` was raised — `assets.spec.ts:65`,
on a spec measured at 38.2 s of real work under a 30 s default — and it is
stated in § 3.4 with the measurement beside it rather than folded in quietly.
One `test.skip()` was **removed**, so the suite executes more than it did.

**What this evidence does NOT establish.** The acceptance says *"green on `main`
for two consecutive pushes"*. These are pull-request runs. Two consecutive green
runs on this branch are the strongest thing a branch can produce, and the clause
that remains — `main` — is one only merging can satisfy. It is not claimed here.

#### B. Accumulated state — and the defect only this could find

The complete twelve-partition sequence, run locally against ONE dev server and
ONE database, each partition inheriting everything the partitions before it
created. This is the state CI structurally cannot produce: every CI partition
gets a fresh container and a fresh D1, so no CI partition ever accumulates past
its own dozen spec files.

**The first attempt failed, and it found the most valuable defect of this pass.**
At partition **p09** the workspace held **558 active entities**, and five
journeys failed together — every one on a `getByRole("option", …)` for a record
created seconds earlier:

| Spec | The record it could not see |
| --- | --- |
| `goals-alignment.spec.ts:28` | `Alignment e2e …` in the parent listbox |
| `notes-knowledge.spec.ts:536` | its own record-link target |
| `notes-knowledge.spec.ts:584` | its own rename target |
| `people-relationship.spec.ts:119` | a note it had just written |
| `people-relationship.spec.ts:241` | the same, in the accessibility sweep |

One mechanism, five failures:
[DEBT-201](PRODUCT_DEBT.md). `searchLinkTargets` scanned five pages of 100 with
`list` ordered `(createdAt, id)` **ASC**, so both pickers only ever saw a
workspace's 500 **oldest** entities. Past that count a brand-new record was
invisible, and an unreachable record was presented exactly like a nonexistent
one. The entry had rated this a "many rehearsals" artefact; it is not — **one**
gate run crosses the threshold, which means an owner does too.

Fixed at the seam: the search now consults `listRecentByType` — newest-first,
bounded, and documented in the kernel as existing precisely because *"`list`'s
ascending cursor pagination cannot cheaply surface the newest records"* — for
each type the caller names, before the ascending scan it already did. A kernel
test seeds 520 filler rows with ascending timestamps and **fails without the fix,
passes with it**.

**Re-run on the fixed tree, all five pass in the same partition at the same
position, with the workspace at 546 active entities — past the same horizon:**

| Spec | Before | After |
| --- | --- | --- |
| `goals-alignment.spec.ts:28` | ✘ 31.0 s timeout | ✓ 25.2 s |
| `notes-knowledge.spec.ts:536` | ✘ option not found | ✓ 20.4 s |
| `notes-knowledge.spec.ts:584` | ✘ 2.6 min timeout | ✓ 25.6 s |
| `people-relationship.spec.ts:119` | ✘ option not found | ✓ 29.0 s |
| `people-relationship.spec.ts:241` | ✘ option not found | ✓ 31.6 s |

This is the clause of the acceptance criterion earning its keep. Twelve green CI
partitions said nothing about it, twice over, because the shape of CI's
parallelism hides it by construction.

##### The completed run: 11 of 12 partitions green

```
p01…p09, p11, p12   pass
p10                 FAIL — 4 tests
total   1907 passed · 4 failed · 0 skipped by a test · 0 NEVER EXECUTED
```

All four were in one partition and all four are now understood.

**Three were [DEBT-173](PRODUCT_DEBT.md), at last** — the first genuine instances
of it found anywhere in this pass. `identity.spec.ts` (p01) mutates the shared
seeded Area `a-dh`; `entity-icons.spec.ts` (p10) uses that same Area as its
`AREA_WITHOUT_ICON` and asserts it carries no icon key. Nine partitions apart,
one record, two beliefs — `Received "heart"`, `Received "Wellbeing, Emerald"`.
Fixed by that entry's own prescription: the **mutator** cleans up, through the
picker's "Use the defaults" control, which had no coverage of its own and so
gains a test in the bargain. All 7 `entity-icons` journeys then pass.

**The fourth failed for time rather than truth.**
`tasks-dependencies.spec.ts:500` makes six navigations, four of them to a Task
collection, and that collection is as large as the workspace is. Against the
database a full sequence leaves behind — 559 active entities, 429 Tasks — it does
**41.1 s** of real work under a 30 s default. Given 120 s it passes, on the same
tree, same database, same assertions. Raised with the measurement stated, on the
`assets.spec.ts:65` precedent; nothing weakened, and a real regression still
fails, only later.

##### And re-running the file found a fifth, which nothing else could

Fixing the Area let `identity.spec.ts` be re-run, and `:268` then failed:
`Expected "Automatic" / Received "Reading, Rose"`. It asserts a Goal reads
"Automatic" **before** choosing, then chooses Rose + Reading on a Goal it picks
BY POSITION and never puts back. Pristine database: passes. Second run against
the same one: fails. DEBT-173's shape turned inward — a spec whose own
precondition its own previous run destroys.

The repair matters more than the defect. **Clearing at the end would not have
fixed it**, because a test that fails at that assertion never reaches its own
cleanup and stays dirty for good. So the journey now ESTABLISHES its precondition
rather than assuming it — it heals whatever the last run left, then asserts.
Verified by running the file three times in a row against one database: 9, 9, 9
passed.

The gate had never seen it, because the gate starts from a wiped database. That
is exactly the kind of luck this item exists to stop depending on, and it is only
visible to someone who runs the same suite twice without resetting between.

#### The re-derived split found one more, and it is the best kind of finding

Run [`32607890703`](https://github.com/acedaly/DalyHub-V2/actions/runs/32607890703)
at `d924b1e` — the first run of the regenerated manifest, on a commit that
changes **documentation and the manifest and nothing else** — failed one test:
`task-drawer.spec.ts:111`, in p02.

`task-drawer.spec.ts` moved from p06 to p02 in the re-derivation, so the
immediate suspicion was [DEBT-173](PRODUCT_DEBT.md) at last producing its own
closing experiment: a spec changing its result because the split moved, with no
product change. **It is not that, and the check that ruled it out was cheap** —
the local gate happened to be running the same new split, reached the same spec
in the same partition after the same predecessors, and **passed**. Same order,
same accumulated database, different answer. So the variable was not the split.

**What it actually is, from the request body rather than from the DOM.** The
POST that the Save issued carried:

```
name="description"
Draft the **proposal** document.
```

— the **seeded** text, not the typed text. So the save succeeded honestly, the
success toast was honest, and the value written was the one already there. The
assertion that failed was the only thing in the test capable of noticing.

`LiveMarkdownEditor` server-renders a `<textarea>` and replaces it with
CodeMirror initialised from its `value` **prop**, so anything typed into the
fallback in that window is discarded. This is not a discovery: `forms.spec.ts`
says it in as many words, the component publishes `data-editor-ready` precisely
so a caller can wait, and **four specs already wait on it**. `task-drawer.spec.ts`
never did — it had simply won the race on every previous run, and a different
partition is a different machine, a different warm-up and a different set of
predecessors.

So the classification is **a stale test**, not accumulated state and not the
split: a spec that does not honour a shared contract the repository already
documents. `waitForEditorReady()` is now in `e2e/helpers.ts` — the default for
the next spec that types into an editor, with the four existing waits left alone
because each has a stated reason (a 90 s cold-compile allowance, a scope that
must not match a sibling prompt, a code-split-chunk rationale, a label-taking
signature). All three of `task-drawer`'s edit journeys now wait, including the
one asserting a discarded edit is **not** kept — which a lost keystroke would
have satisfied for entirely the wrong reason.

The residual product question — whether the handoff should carry the fallback's
in-flight text rather than the `value` prop — is real, is owned by a shared
editor used across the product, and is **not** GATE-01's to answer. Raised as
[DEBT-202](PRODUCT_DEBT.md).

**Run [`32609242926`](https://github.com/acedaly/DalyHub-V2/actions/runs/32609242926)
at `47bf5be` is green** on the re-derived split, twelve partitions of twelve.

#### On "two consecutive green pushes", counted honestly

The count is **not** three greens out of five runs. It is: `42afd5f` green,
`d924b1e` **red**, `47bf5be` green. A red run in the middle resets the sequence,
and it should — the clause exists so that one lucky sample cannot be presented
as stability. What stands at this commit is **one** green run since the last red
one, and the second is what the next push has to produce.

That the intervening red was a stale test rather than a regression does not earn
it a pass. Runs 720, 721 and 723 each found something real that the run before
had not, which is the argument for the clause rather than against it.

#### And run 725 made the point again

[`32610240298`](https://github.com/acedaly/DalyHub-V2/actions/runs/32610240298)
at `317c934` — again a **documentation-only** commit — failed
`tasks-collection.spec.ts:298` in p02, with the same signature run 721 had shown
and which the `current()` fix had not addressed because it was never the cause of
*that* half.

From the trace: the chip click produced **no navigation whatsoever** — no third
`.data` request, the URL unchanged. The journey clicks the chip with the controls
**popover still open**, and `AnchoredSurface` dismisses on a capture-phase
`pointerdown` and returns focus to the trigger, so the page can move between
`pointerdown` and `pointerup` and the `click` never reaches the link. The sibling
journey that removes a chip with nothing open (`:159`) has always passed.

The helper made this easy to get wrong: `commit()` clicks Apply on a phone, which
closes the sheet, and is a **no-op** on a pointer viewport, which leaves the
popover open. So one journey was reaching across an open floating surface at one
width and a closed one at the other — not one journey at two widths, and not what
a person does. `dismiss()` joins the shared surface contract, Escape closes both,
and `:298` puts the controls away before touching the chips. Every other
`commit()` caller was checked: all of them only *assert* afterwards, so none had
the same gap.

The trace also confirms, directly, [DEBT-159](PRODUCT_DEBT.md)'s central claim —
at the click the page URL carried both filters while the chip's `href` still read
`/tasks?group=due_state`, composed before the second filter existed. That entry
stays open, and now has an observation rather than an inference behind it.

Run [`32611293999`](https://github.com/acedaly/DalyHub-V2/actions/runs/32611293999)
at `8e574e0` is green, twelve of twelve.

#### What three documentation-only red runs actually demonstrated

Runs 723 and 725 both failed on commits that changed **no executable code at
all**, and both failures were real: a spec typing into a Markdown editor before
it had enhanced, and a spec clicking through an open floating surface. Neither
was accumulated state; neither was the split; neither was flake.

That is worth stating plainly, because it is the strongest available answer to
*"is this gate green, or is it merely green today?"* Six runs of substantially
the same tree found three distinct latent races, each with a mechanism, each
fixed at a shared contract rather than in the spec that happened to trip on it —
`revealRowActions`, `waitForEditorReady`, `dismiss`. A suite that surfaces three
real races under repetition is a suite that is being measured properly; one that
went green and stayed green on the first attempt would have told us less.

It also means the honest reading of "green" here is narrow: **the gate is green
on this tree, twice consecutively, having been red three times in between for
reasons each of which is now understood and fixed.** The clause asking for two
consecutive green pushes exists to force exactly that distinction, and it earned
its place on this branch.

#### Two consecutive green pushes — and why that is not the same as stable

`8e574e0` ([`32611293999`](https://github.com/acedaly/DalyHub-V2/actions/runs/32611293999))
and `ae84193` ([`32612296143`](https://github.com/acedaly/DalyHub-V2/actions/runs/32612296143))
are both green, twelve partitions of twelve, verified structurally as well as by
conclusion: each published twelve `e2e-results-<partition>` artefacts and **no**
`e2e-report-*` or `e2e-traces-*` artefact at all. Those upload only on failure,
so their absence is independent evidence that no partition had one.

**That satisfies the letter of the criterion, and the very next run falsified its
spirit.** `4a844cf` ([`32613259476`](https://github.com/acedaly/DalyHub-V2/actions/runs/32613259476))
— documentation only — went red on a **fourth** latent race, in
`color-scheme.spec.ts:242`. So the green pair had not established stability; it
had established that two samples were not enough to find what a third would.
`038206c` ([`32614341978`](https://github.com/acedaly/DalyHub-V2/actions/runs/32614341978))
is green again on the fix.

This is recorded rather than smoothed over, because the smoothing is the failure
mode: a reader who sees "two consecutive green pushes ✓" and stops has learned
something less true than a reader who sees the whole sequence.

#### The rate is itself a finding

The whole run history on substantially one tree:

```
720 ✗3   721 ✗1   722 ✓   723 ✗1   724 ✓   725 ✗1   726 ✓   727 ✓
728 ✗1   729 ✓    730 (cancelled)   731 ✓   732 (cancelled)
733 ✗1   734 ✗1   735 ✓
```

Roughly **one previously-unseen latent race per two runs**, and every one had a
real mechanism, reproduced from evidence, and was fixed at a shared contract
rather than quarantined.

**Four of the six share one root cause, and naming it is the useful part: an
assertion that a state left over from EARLIER already satisfies.**

| Journey | What it waited for | Why that was already true |
| --- | --- | --- |
| `identity.spec.ts:124` | the dialog to be hidden | it hides on the same tick the save is *fired*, not when it lands |
| `task-drawer.spec.ts:111` | nothing | it typed into a fallback the editor then replaced, and the save reported success |
| `color-scheme.spec.ts:242` | `data-color-scheme` matching `/.+/` | the PREVIOUS scheme's slug matches it |
| `meetings-concurrency.spec.ts:282` | the text "Saved" | the PREVIOUS save left it on screen |

Each had passed for a long time by winning a race. None was flake. Each fix now
waits on a transition the product actually publishes — `data-editor-ready`, the
specific slug, `Saving…` → `Saved` — rather than on a state it happens to be in.
The other two were a concealed affordance automation could not reach
(`revealRowActions`) and a click across an open floating surface (`dismiss`).

That is what [DEBT-203](PRODUCT_DEBT.md) is really recording. Not "the suite is
flaky" — **the suite contains assertions that cannot fail at the moment they
run.** A suite of that kind reports green and means less than it appears to, and
the only way to find them is to keep running it.

#### Where it finished

Run [`32630251479`](https://github.com/acedaly/DalyHub-V2/actions/runs/32630251479)
at `cf15d17` is **green** — all 17 checks, twelve `e2e-results-*` artefacts
published and **no** `e2e-report-*` or `e2e-traces-*` at all.

And the one thing § 3.7 said it could not explain resolved itself honestly: p04's
`socket hang up` **did not recur** in run `32629099619`, which published p04
results with no failure evidence. That was the re-run this document said the next
push would be. It stays recorded as one occurrence with no mechanism, because
that is what it was.

#### The acceptance criterion, re-established

| Push | SHA | Run | Result |
| --- | --- | --- | --- |
| 1 | `cf15d17` | [`32630251479`](https://github.com/acedaly/DalyHub-V2/actions/runs/32630251479) | GREEN — 17/17 checks, no failure artefacts |
| 2 | `b55fe75` | [`32631318116`](https://github.com/acedaly/DalyHub-V2/actions/runs/32631318116) | GREEN — 17/17 checks |

**This pair, not the earlier one.** `8e574e0`/`ae84193` also satisfied the letter
of the criterion and the next run falsified its spirit, so they are not what this
document rests on. These two follow six diagnosed races, the last of which was
found by the run immediately before them — which is the strongest form of the
claim a branch can make: *green after the thing that kept making it not green was
understood*, rather than green because nothing looked.

It is still green **on a branch**. The criterion says `main`, and that clause
only merging can produce.

So the honest characterisation of this gate is: **green is a probabilistic
statement about this suite, not an absolute one.** Nothing here is red for an
unexplained reason, no test was skipped, weakened or quarantined to get there,
and four real defects in the suite's own discipline were removed on the way. But
a twelfth run finding a fifth race would surprise nobody who read this section,
and pretending otherwise would be the same class of claim this item exists to
retire. Recorded as [DEBT-203](PRODUCT_DEBT.md).

The criterion also says `main`. That clause only merging can produce; § 5.4
states it rather than blurring it.

#### One failure this document does NOT claim to have explained

Run [`32627346569`](https://github.com/acedaly/DalyHub-V2/actions/runs/32627346569)
at `618e552` failed one test in p04 — `ai-assistance.spec.ts:434`, *"apply
refuses a Task carrying an impossible date"* — with:

```
apiRequestContext.post: socket hang up
  → POST http://localhost:4173/ai/apply
```

That is **transport level**, not an assertion: the dev server dropped the
connection rather than answering. The obvious worry is the serious one — a
malformed date (`2026-02-30`) taking the server down instead of being refused —
so it was checked rather than assumed. It does **not** reproduce: three
consecutive local runs against the same tree pass in ~9.5 s each, the server
refusing the date exactly as the test requires, and the same test passed in six
consecutive green CI runs (722, 724, 726, 727, 729, 731).

**What is honest to say is therefore narrow: one occurrence, transport level, no
mechanism established.** Not "flake" — this document has spent its whole length
refusing that word without a mechanism, and it is not going to spend its last
section granting itself an exception.

Re-running that job would settle it, and this environment cannot: the API
returns `403 Resource not accessible by integration`. Nor is the test made
"robust" here, because the only way to absorb a socket hang up is a retry, and a
retry is precisely what would hide a genuine crash if this turns out to be one.
So it is recorded, and the next run of this branch is the re-run.

---

### 3.8 The validation suite, at the final commit

Every command the item names, run on the tree this record describes:

| Command | Result |
| --- | --- |
| `format:check` | PASS |
| `lint` | PASS |
| `typecheck` | PASS |
| `scheme:check` | PASS |
| `icons:check` | PASS |
| `dhds:check` | PASS |
| `e2e:partitions:check` | PASS — 117 spec files across 12 partitions, heaviest 16.6 min |
| `build` | PASS |
| `test:unit` | **6400** passed, 451 files |
| `test:kernel` | **2850** passed, 178 files |

The kernel count is one higher than the 2849 this branch started from: the
addition is [DEBT-201](PRODUCT_DEBT.md)'s regression test, which fails without
its fix.

---

## 4. Released

### 4.1 The version decision

**`2.4.0`, one consolidated release.** Reasoning in
[`RELEASE_CHECKLIST_V2_4_0.md` § 2](../release/RELEASE_CHECKLIST_V2_4_0.md); in
one line: `2.1.0`, `2.2.0` and `2.3.0` were never built, never deployed and never
ran, the artefact is byte-identical for all four, so three of the four numbers
would identify nothing — and a version number's whole job is to answer *"which
build is live?"*.

`package.json`, `app/lib/version.ts` and `docs/release/` agree, held by
`test/unit/about/package-version.test.ts`. `APP_RELEASE_NAME` stays `"V2"`: its
own docstring says it is a release name and not a milestone name, and the shipped
product is still DalyHub V2. `DEPLOYMENT.md` still states no migration number of
its own.

### 4.2 What was produced

- [`RELEASE_NOTES_V2_4_0.md`](../release/RELEASE_NOTES_V2_4_0.md) — written for
  the person using DalyHub, stating plainly that this release incorporates the
  previously unreleased V2.1, V2.2 and V2.3 programmes, and naming the major
  product changes rather than dumping commit history.
- [`RELEASE_CHECKLIST_V2_4_0.md`](../release/RELEASE_CHECKLIST_V2_4_0.md) — the
  evidence, the recorded `verify:production` output, and the owner's deployment
  sequence in order, backup state first.

### 4.3 What was NOT done, and why

Nothing was deployed, no migration was applied, and production state is still
unknown. `pnpm run verify:production` was run again at this commit and reports
**PARTIALLY VERIFIED** with five `SKIPPED` checks — its own honest answer to
having no credentials — recorded verbatim in the checklist:

```
  [SKIPPED] Configuration — none of the production configuration is supplied in this environment
             not supplied: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID,
             PRODUCTION_DEFAULT_WORKSPACE_ID, PRODUCTION_ACCESS_TEAM_DOMAIN,
             PRODUCTION_ACCESS_AUD, PRODUCTION_OWNER_EMAIL
  [SKIPPED] Worker deployment  — Wrangler is not authenticated
  [SKIPPED] Worker secrets     — Wrangler is not authenticated
  [SKIPPED] D1 migrations      — could not read the production migration state
  [SKIPPED] Application health — https://hub.daly.id.au/health answered 302 —
             Cloudflare Access protecting the hostname, which is the intended
             configuration. The RUNNING release is therefore NOT confirmed.
```

`hub.daly.id.au/health` answering **302 to the Cloudflare Access login** shows
the Access layer is configured on the hostname and answering — the intended
hardening. It shows nothing about the origin: Access terminates an
unauthenticated request at the edge, before it is proxied, so the same 302 comes
back whether the Worker behind it is healthy, broken or absent. The verifier is
the authority, and it marks Application health `[SKIPPED]` rather than passing
it. (**This sentence read "and not an outage" until § 7.4 corrected it** — a
probe that never reaches the origin cannot rule an outage out.) **Production's migration state remains unmeasured, and
this document does not guess at it** — the whole point of DEBT-84 is that a
repository cannot know what a database has applied.

### 4.4 The backup prerequisite is still unmet, and it is now a HARD block

This is not the same statement § 2 makes about the pipeline. The pipeline is
fixed; what has never happened is a run of it that produced anything.

MEASURED on the repository's own Actions history: `Production D1 backup` run
**21** — 2026-08-22T16:45:50Z, five hours AFTER the pipeline hardening merged —
failed at the same guard as runs 10 through 20 before it:

```
##[error]BACKUP_ENCRYPTION_PASSPHRASE is not set in the production environment.
         Refusing to export production data that cannot be encrypted.
```

The workflow is behaving correctly, and that is the point (DEBT-198). The
consequence is that **no disaster-recovery copy of the owner's data exists**, so
the roadmap's own sequencing applies without exception: migrations are not
applied to production before a backup exists, and nothing here weakens or
bypasses that guard to make a checklist look finished.

---

## 5. What remains, exactly

### 5.1 One owner action for Recoverable

Set `BACKUP_ENCRYPTION_PASSPHRASE` as an **environment** secret on the protected
`production` GitHub environment. Generation command, storage obligation, manual
dispatch, expected log lines and the two independent proofs to run afterwards are
in [`BACKUP_AND_RESTORE.md` § "Setting it for the first time"](../development/BACKUP_AND_RESTORE.md).
It is a single documented action, not an investigation.

### 5.2 Owner credentials for Released

The ordered sequence — backup, verify recovery, inspect migrations, preflight,
apply only pending committed migrations, deploy, verify, confirm health through
Access, record the evidence — is in
[`RELEASE_CHECKLIST_V2_4_0.md` § 6](../release/RELEASE_CHECKLIST_V2_4_0.md), with
the migration-discipline refusals stated beside it.

### 5.3 One measurement nobody here can make

[DEBT-199](PRODUCT_DEBT.md)'s remote half — § 2.4. It needs one command run
against real Cloudflare, against a NEW throwaway database and never production.
It is not closed from the local rehearsal, because the local executor and the
remote import endpoint are different code paths and a recovery document is the
last place to record a guess.

### 5.4 The one acceptance condition only MERGING can produce

The roadmap asks for the twelve-partition gate to be *"green on `main` for two
consecutive pushes"*. A branch cannot produce that: `main`'s gate runs on a push
to `main`. What this pass can and does produce is the gate green on this branch,
against both states § 3.5 records, with the run ids named. The second half is
the first two pushes to `main` after the merge, and the item stays **☐** until
they are green.

**The first of the two now exists — see § 7.1.** The merge of #223 produced
[`32685626437`](https://github.com/acedaly/DalyHub-V2/actions/runs/32685626437)
at `2f94279`, 17 of 17 jobs green. One remains.

---

## 6. Scope discipline

Not done, deliberately, and none of it was started:

- **V2.4-GATE-02, FOLLOW-01 and FOLLOW-02.** Untouched.
- **The Plan dual-checkbox and semantic-overdue defects** (DEBT-194, DEBT-197).
  They belong to V2.4-GATE-02, neither blocks a GATE-01 assertion, and neither
  is touched.
- **DEBT-196 — the one-day-phone defect — WAS taken, and the reason is stated
  rather than implied.** It also belongs to V2.4-GATE-02, and unlike its two
  siblings it *does* block a GATE-01 assertion: `plan-responsive.spec.ts:100`
  and `:194` assert the product's own tier promise, they fail on two days of
  every week, and the roadmap forbids reaching green by weakening a test. The
  fix is one data attribute and one phone-tier rule, and it decides nothing
  GATE-02 has to decide about how the Plan queue works.
- **No schema or API change.** None was needed.
- **No new design phase, no new domain concept, no unrelated UI work.**
- **No E2E partition redesign.** § 3 records whether the manifest was
  regenerated and on what measurement.

---

## 7. The operational pass, 2026-08-24 — where it got to, and where it stopped

A second session took the operational half: produce a real encrypted production
backup, verify it, inspect and apply production migrations, deploy `2.4.0`,
verify production, and close the item if — and only if — the evidence supported
all three words. **It stopped at the first of those steps**, which is the
outcome the evidence supports. Nothing was deployed, nothing was migrated, no
production data was read, and the item stays **☐**.

### 7.1 What advanced: the gate is green on `main`

| | |
| --- | --- |
| Run | [`32685626437`](https://github.com/acedaly/DalyHub-V2/actions/runs/32685626437) |
| Commit | `2f94279` — the #223 merge commit |
| Trigger | `push` to `main` |
| Result | **17 of 17 jobs `success`** — Scope, Static, Build, Unit, E2E p01…p12, CI Gate |
| Failure artefacts | **none.** Thirteen artefacts: `e2e-results-p01`…`p12` and `production-build`. Every partition's *"Upload Playwright report"* and *"Upload Playwright traces & failure screenshots"* step is `skipped` — those steps are `if: failure()`, so `skipped` on all twelve is the per-partition proof that nothing failed |

This is the first complete gate run this item has ever had on `main` rather than
on a branch, and it is **one of the two** criterion 3 asks for. The second is
the next push to `main`. It cannot be dispatched: `ci.yml` declares
`push: [main]` and `pull_request` and **no `workflow_dispatch`**, so there is no
way to ask for another `main` run without landing a commit — and adding a
dispatch trigger to the gate so that a criterion could be satisfied without a
push is precisely the kind of move § 6 exists to refuse.

### 7.2 What did not move, and the boundary that held

The sequence is *backup → verify → migrate → deploy → verify*, and each arrow is
a safety boundary. It stopped at the first.

| Step | Result |
| --- | --- |
| Real production backup | **not produced.** `BACKUP_ENCRYPTION_PASSPHRASE` is still unset in the protected `production` environment. Run **22** ([`32652803588`](https://github.com/acedaly/DalyHub-V2/actions/runs/32652803588), 2026-08-23T16:48:06Z, `054b98f`) failed at step 4, *"Refuse to run without an encryption key"*, with the export, upload-guard and upload steps all `skipped` — identical to runs 10–21 |
| Backup recovery proof | **not attempted** — no artefact to decrypt, and no off-GitHub key to decrypt it with |
| DEBT-199's remote half | **not attempted** — it needs credentials *and* a real decrypted artefact. **No scratch D1 was created**, and nothing was inferred about the remote import path |
| Production migration state | **still unmeasured.** `db:production:list` → `CLOUDFLARE_D1_DATABASE_ID is not set` |
| Preflight / apply / deploy | **not run** — each refuses at its own guard |
| `verify:production` | **`PARTIALLY VERIFIED`**, unchanged from § 4.3: Configuration, Worker deployment, Worker secrets, D1 migrations and Application health all `[SKIPPED]` |
| `https://hub.daly.id.au/health` | **302 → Cloudflare Access login**, consistently. This establishes that **the Access layer answers**; it does not reach the origin, so it neither confirms nor rules out an application problem, and it identifies no release. See § 7.4 |

**Why the secret could not be set from there either.** The session had no
`~/.dalyhub-v2-production.env` and no `.production.env`, no `CLOUDFLARE_API_TOKEN`,
`wrangler whoami` reporting not authenticated, no `gh` CLI, and no
secrets-management API — so the `production` environment could not be
configured. Nor could a generated key have been *kept*: no password manager or
other persistent store outside GitHub was available, and § "The recovery key"
requires the off-GitHub copy to exist **before** the secret is set. A key whose
only copy lives inside the system it protects is not a recovery key, so
generating one would have produced the appearance of recoverability rather than
recoverability.

**What was deliberately not done.** The guard was not weakened, bypassed or made
conditional. No passphrase was invented. No export path was improvised around
`production-d1.mjs` / `production-backup.mjs` — a Cloudflare API
connection was reachable and could see the production Worker and D1, and using
it to dump or migrate production would have replaced the one audited pipeline
with an unaudited one to make a checklist look finished. No migration was
applied to production, and no D1 history was touched.

### 7.4 A correction this pass made to its own evidence, and to two documents

Review of this PR flagged that the health observation was being read as more
than it can carry, and the finding was correct.

**The error.** A 302 from `hub.daly.id.au/health` was recorded as *"not an
outage"*. Cloudflare Access terminates an unauthenticated request **at the edge,
before it is proxied to the origin** — so that redirect is returned identically
whether the Worker behind it is healthy, misconfigured or absent. The
observation supports one claim (the Access layer is configured and answering)
and cannot support the other (the application is up). Asserting the second from
the first is a false green, which is precisely the class of signal this whole
item exists to remove — DEBT-84 is open because *"a repository cannot know what
a database has applied"*, and the same discipline applies to what a probe can
know about an origin it never reached.

**Where it was fixed.** In § 4.3 above and in
[`RELEASE_CHECKLIST_V2_4_0.md` § 6](../release/RELEASE_CHECKLIST_V2_4_0.md) —
including its step-8 runbook comment — as well as in this pass's own § 7.2 row.
Two of the four were inherited rather than introduced here; they were corrected
rather than left standing beside a corrected one, because a release checklist
that says both things is worse than one that says the wrong thing once.

**What is unchanged.** An unauthenticated non-200 from that hostname is still
**not** a source-code failure, and CI still must never probe it — the reason
`ci.yml` says so is unaffected. The correction narrows what the redirect proves;
it does not turn it into evidence of a problem.

### 7.3 What this leaves

Exactly what § 5 already said, minus half of § 5.4: **one owner action**
(§ 5.1), **one set of owner credentials** (§ 5.2), and **one more push to
`main`** (§ 5.4). The repository side is complete and this pass added nothing to
it — no source file was changed, because none needed changing.

## 8. The second operational pass, 2026-08-24 — production measured, and a green `main` run lost to a package download

The sequence was run in order a second time. It reached the same boundary and
stopped there again — but this pass could see production, so for the first time
the boundary is described from evidence rather than from the absence of it.

### 8.1 What this pass could do that the last one could not

An **owner-authorised Cloudflare API connection** was reachable. It could list
Workers, D1 databases and R2 buckets, and it could issue SQL. That is the
difference, and everything below follows from it.

**Its credential is WRITE-CAPABLE, and saying so is the point of an operational
provenance record.** It could create and delete D1 databases, and the SQL channel
takes writes as readily as reads. **This pass used it read-only** — two `SELECT`s
and nothing else — and that was a *decision*, not a boundary the credential
enforced. § 8.5 is the list of what that decision cost. A future reader asking
*"could this pass have altered production?"* deserves the answer **yes, and it
did not**, rather than an assurance that quietly rests on a capability the
credential never had.

What it could **not** do is anything canonical: `wrangler whoami` still reports
**not authenticated**, there is still no `.production.env` and no
`CLOUDFLARE_API_TOKEN`, so `db:production:list`, `db:production:apply`,
`deploy:production:preflight`, `deploy:production` and the credentialed half of
`verify:production` all still refuse at their own guards. So the connection is
not a substitute for the pipeline — it bypasses it. **It was used as an
observation instrument because that is what it was chosen to be**, which is the
distinction § 8.5 turns on.

### 8.2 Production's migration state, measured

**The first direct reading of production's schema state since 2026-07-18.**

| | |
| --- | --- |
| Applied | **49** — `0001_create_entities.sql` … `0047_task_recurrence_advanced.sql` |
| Committed | **49** files in [`migrations/`](../../migrations) |
| Pending | **none** |
| Orphaned | **none** |
| History condition | **coherent** — exact set match, both directions |
| `0042_add_entity_identity_colour.sql` | applied **2026-08-16 08:37:08** |
| Most recent | `0047`, **2026-08-20 09:32:44** |
| Tables | 52 |

**Provenance, which is the caveat.** One read-only
`SELECT id, name, applied_at FROM d1_migrations ORDER BY id`, plus one `COUNT(*)`
over `sqlite_master`. **No user data was read.** This is the same ledger
`db:production:list` reads, so it is a measurement rather than an inference from
filenames — but it is **not the canonical command**, and § 3's acceptance
criterion 5 names the canonical command. **Criterion 5 is therefore still not
met**, and the reading does not pretend otherwise.

**What it means.** [DEBT-139](PRODUCT_DEBT.md)'s headline — *"migration 0042 has
not been applied"* — is **false, and has been since 2026-08-16**. That is not
good news. The risk the item's own step order exists to prevent was not avoided;
**it was taken six times, unobserved**: `0042`–`0047` all reached production
between 2026-08-16 and 2026-08-20 with **no disaster-recovery copy behind any of
them**, because [DEBT-198](PRODUCT_DEBT.md) was unresolved throughout and still
is. § 4.4's *"hard block"* framing survives intact — it just turns out the block
was never actually holding.

### 8.3 What is still unknown about production

The Worker's **secret names**, the **deployment identity** of what is live, and
**which release is running**. `dalyhub-v2-production` exists;
`hub.daly.id.au/health` answers **302 to the Cloudflare Access login**, and
Access terminates at the edge before the origin, so that redirect identifies no
release and establishes nothing about the Worker behind it — the correction
§ 7.4 made, unchanged. **`2.4.0` is not claimed to be live.** BACKUP-01's
`dalyhub-v2-backup` Worker and its private `dalyhub-v2-backups` R2 bucket exist;
`backup:verify` and `db:production:backup:list` still cannot be run, so what the
bucket contains is unknown.

### 8.4 Criterion 3 went backwards

Run [`32710624636`](https://github.com/acedaly/DalyHub-V2/actions/runs/32710624636)
at `f2b504b`, the push that merged #224, is **red** — so `main` now reads green
(`2f94279`) then red, and the *"two consecutive green pushes"* count **restarts**.

**It is not the suite.** **E2E p07 never started.** `actions/setup-node`'s
corepack download of `pnpm-10.33.0.tgz` crashed **11 seconds in**:

```
! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.33.0.tgz
AssertionError [ERR_ASSERTION]: assert(!this.paused)
  at Parser.finish (node:internal/deps/undici/undici:6165:9)
```

`Install dependencies` was `skipped` and Playwright never ran, so no
`results.json` existed — and `scripts/e2e-partition-summary.mjs` **refused to
read that absence as an absence of failures**, which is the gate working exactly
as designed.

**Measured from the run's own artefacts.** Eleven `e2e-results-*` artefacts
(p07 published none), **no `e2e-report-*` or `e2e-traces-*` artefact from any
partition**, and across the eleven that ran:

| | p01 | p02 | p03 | p04 | p05 | p06 | p08 | p09 | p10 | p11 | p12 | total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| passed | 127 | 128 | 230 | 144 | 152 | 117 | 113 | 124 | 112 | 260 | 259 | **1766** |
| failed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| flaky | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| skipped | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | **2** |
| minutes | 16.5 | 12.2 | 15.5 | 17.4 | 18.4 | 12.9 | 18.5 | 19.2 | 16.0 | 13.9 | 13.2 | — |

The two skips are [DEBT-200](PRODUCT_DEBT.md) records; its third lives in p07 and
did not run. The commit that lost the run changed **documentation only**.

Raised as [DEBT-204](PRODUCT_DEBT.md) and **deliberately not fixed here** — it
edits `.github/actions/setup`, which every job depends on, and this pass changes
nothing executable. One `rerun-failed-jobs` would very likely turn the run green;
this session's GitHub access is read-only for Actions (**403**), so it could not.

### 8.5 What was not done, and why each refusal held

| Temptation | Refused because |
| --- | --- |
| Export production through the Cloudflare connection to satisfy criterion 1 | It would write an **unencrypted copy of the owner's entire life** into an ephemeral container through an **unaudited** path, retiring the one canonical pipeline (`production-d1.mjs` / `production-backup.mjs`) for a checklist tick |
| Generate and set `BACKUP_ENCRYPTION_PASSPHRASE` | Unreachable anyway (403 / blocked API) — and § 7.2's conclusion stands: the off-GitHub copy must exist **first**, and this environment has nowhere to put one |
| Create the DEBT-199 scratch database | Its question is about `wrangler d1 execute --remote --file`. The connection here exposes a **query** API — a third code path — so the probe would have answered nothing and left a stray database behind |
| Fabricate the five missing preflight values | Two of them (`PRODUCTION_ACCESS_TEAM_DOMAIN`, `PRODUCTION_ACCESS_AUD`) are Access configuration, and a deploy is the last place to guess |
| Apply migrations | **None were pending.** `db:production:apply` was not run because there was nothing for it to do |

No D1 history was touched, nothing was marked applied by hand, no migration file
was edited, and production was neither reset nor reseeded.

### 8.6 What this leaves

Unchanged from § 5, with one clause harder and one easier:

- **§ 5.1 — one owner action.** `BACKUP_ENCRYPTION_PASSPHRASE`, with a copy off
  GitHub first. Now the **only** thing standing between the repository and
  `Recoverable`, and the migration finding raised its stakes.
  **Confirmed still unset the same evening.** This pass could not read the secret
  and could not dispatch the workflow, so § 8.5 recorded the question as open.
  The nightly schedule closed it: **run 23** ([`32754291594`](https://github.com/acedaly/DalyHub-V2/actions/runs/32754291594),
  2026-08-24T17:02Z at `f2b504b`) failed at the same guard, with
  `BACKUP_ENCRYPTION_PASSPHRASE:` printing **empty** — an unset secret, not a
  rejected one. **23 consecutive failures**, and the job has still never reached
  the database.
- **§ 5.2 — owner credentials.** Still needed for criterion 5 as written, for
  the deploy, and for the running release. The *schema* half of the question they
  were needed for is now answered.
- **§ 5.4 — two green `main` pushes.** **Harder than it was**: the pair is
  broken and the count restarts. [DEBT-204](PRODUCT_DEBT.md) is the reason, and
  fixing it is the cheapest way to stop paying this cost per push.

**The gate stays ☐.** Of *recoverable, green, released*: **recoverable** is
unmet and now demonstrably overdue, **green** regressed to one-then-red, and
**released** was never reached. One of three would not have been a tick; none of
three plainly is not.

## Related documents

- [`ROADMAP_V2_4.md`](../roadmap/ROADMAP_V2_4.md) — the item this implements.
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) ·
  [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the two authorities it works
  through.
- [`RELEASE_NOTES_V2_4_0.md`](../release/RELEASE_NOTES_V2_4_0.md) ·
  [`RELEASE_CHECKLIST_V2_4_0.md`](../release/RELEASE_CHECKLIST_V2_4_0.md)
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-198, DEBT-199, DEBT-139, DEBT-179,
  DEBT-173, DEBT-158, DEBT-180, DEBT-84, DEBT-157, DEBT-125.
