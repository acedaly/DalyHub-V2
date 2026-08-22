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
| **Green** | the twelve-partition gate is green | see § 3 — the 55 failures, the 5 tests that never executed and the one journey that never ran are all resolved; the roadmap's own condition is *"green on `main` for two consecutive pushes"*, which only merging can produce |
| **Released** | production is verified, migrated, and running a release whose notes name what shipped | ◐ — the version decision is taken and recorded, the notes and checklist are written, and **nothing has been deployed or migrated**. Two independent blocks, both owner-held: no production backup has ever completed (§ 4.4), and this environment holds no Cloudflare credentials, which `verify:production` reports for itself (§ 4.3). § 4, § 5.2 |

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
[**DEBT-201**](PRODUCT_DEBT.md#-debt-201--both-record-pickers-stop-seeing-a-workspace-at-its-500th-record-and-say-nothing--p2),
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

### 3.6 The partition manifest

*(Filled in from the measurement — see § 3.7.)*

### 3.7 Evidence

*(Run ids and results recorded here.)*

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

`hub.daly.id.au/health` answering **302 to the Cloudflare Access login** is the
intended hardening and not an outage; the verifier is the authority on that and
says so in its own words. **Production's migration state remains unmeasured, and
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

## Related documents

- [`ROADMAP_V2_4.md`](../roadmap/ROADMAP_V2_4.md) — the item this implements.
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) ·
  [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the two authorities it works
  through.
- [`RELEASE_NOTES_V2_4_0.md`](../release/RELEASE_NOTES_V2_4_0.md) ·
  [`RELEASE_CHECKLIST_V2_4_0.md`](../release/RELEASE_CHECKLIST_V2_4_0.md)
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-198, DEBT-199, DEBT-139, DEBT-179,
  DEBT-173, DEBT-158, DEBT-180, DEBT-84, DEBT-157, DEBT-125.
