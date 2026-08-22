# V2.4-GATE-01 — Recoverable, green, released

**The pass that makes "daily driver" literally true before V2.4 adds anything to
it.** Implements
[V2.4-GATE-01](../roadmap/ROADMAP_V2_4.md#-v24-gate-01--recoverable-green-released).

> This is not feature development. Its whole purpose is to establish a
> trustworthy floor: a disaster-recovery copy that has actually been restored, a
> test gate whose red means something, and a release whose notes name what
> shipped.
>
> **It does not reach that floor in full, and says so.** Two of the three thirds
> are complete in the repository and blocked on one owner-held secret and one set
> of owner-held credentials; the third is blocked on a defect the roadmap assigns
> to the NEXT item. All three are named exactly, with the commands and the
> decision each needs, in § 5 — not softened, and not counted as done.

---

## 1. The three claims, and where each one actually stands

| | Claim | State |
|---|---|---|
| **Recoverable** | a backup exists and has been restored in a rehearsal | ◐ — the pipeline is fixed, hardened and now proves a **restore** on every run, and the mechanism has been rehearsed end to end. **No artefact of the owner's data exists yet**, because `BACKUP_ENCRYPTION_PASSPHRASE` is not set. § 2, § 5.1 |
| **Green** | the twelve-partition gate is green | see § 3 |
| **Released** | production is verified, migrated, and running a release whose notes name what shipped | ◐ — the version decision is taken and recorded, the notes and checklist are written, and **nothing has been deployed**: this environment holds no Cloudflare credentials, which `verify:production` reports for itself. § 4, § 5.2 |

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

### 3.1 The baseline, measured rather than inherited

The roadmap hands this item [DEBT-179](PRODUCT_DEBT.md#-debt-179--the-e2e-gate-is-red-on-main-19-tests-across-8-partitions-plus-a-network-dependent-unit-test--p2)'s
count — *nineteen tests across eight partitions* — and DHDS-13's root cause for
the signature that dominates it. **Neither was used as the answer.** The gate was
run first, complete and unchanged, from `main` at `e1aa282`: twelve partitions,
each against a freshly seeded database in its own server lifetime, which is what
CI does.

| | |
|---|---|
| Partitions green | **3 of 12** (p09, p11, p12) |
| Tests failing | **55** |
| Tests skipped | 4 |
| Elapsed | 229.5 min |

**The headline is that the inherited number was less than half the truth, and
named the wrong mechanism.** DEBT-179 describes one dominant signature — a
`check()` that clicks and then cannot find its checkbox. That signature is real
and accounts for **three** tests. The mechanism that accounts for **thirty-eight**
is [DHDS-09](../design/DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md)'s
portal, and nobody had classified it, because **a gate that is already red is
where a regression goes to hide**. That is the argument for B1's rule — use the
current state, not a stale count — stated as a measurement rather than as advice.

### 3.2 Every failure, classified

No failure was fixed before it was explained. Each row is a MECHANISM, not a
symptom, and each was confirmed against the failing call log or the running
browser before anything was edited.

| Mechanism | Tests | Nature |
|---|---|---|
| The picker's listbox is **portalled** onto `<body>` ([DHDS-09](../design/DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md)) and the spec scopes its option lookup to the anchor | 38 | test debt |
| `check()` re-resolves its selector after the node is **disconnected** — § 3.3 | 3 | test debt |
| A projection the spec **predates** (TODAY-12 moved the row) | 2 | test debt |
| A **stale proxy** assertion for a decision the design system took and recorded | 2 | test debt |
| A surface the product **deliberately retired** (TODAY-12 § 6) | 1 | test debt |
| **Strict-mode ambiguity** a shipped change created ([DHDS-10](../design/DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md)'s second `Priority:` trigger) | 1 | test debt |
| A locator that **drifted** onto a newer sibling (DHDS-10's revealed carets) | 1 | test debt |
| A **live region asked for by position** rather than by name | 1 | test debt |
| A subject that **moved presentation** (the Areas gallery stopped being the default) | 1 | test debt |
| **Genuine product defects** | **3** | fixed — § 3.4, § 3.5 |
| **[DEBT-196](PRODUCT_DEBT.md#-debt-196--weekly-planning-draws-two-days-at-phone-width-where-its-own-tier-says-one--p2) — V2.4-GATE-02's, not this item's** | **2** | real defect, **out of scope** — § 3.8 |
| | **55** | |

Four tests were **skipped** rather than failed, and every one was examined,
because a green test that never executes its scenario is a failure of the gate
and [DEBT-158](PRODUCT_DEBT.md#-debt-158--a-goal-measurement-journey-has-never-once-run-because-nothing-in-the-seed-is-measurable--p2)
is what that rule was written from. Two are now fixed and two are reported:

| Skipped test | Verdict |
|---|---|
| `spine-workspaces.spec.ts:263` | **Fixed** — DEBT-158; the journey owns its measurable Goal (§ 3.6). |
| `interaction-consistency.spec.ts:84` | **Fixed** — dead coverage. Its guard was `if (count === 0) test.skip()` on `/design/forms`, and the count was ALWAYS zero: that gallery's only disabled control is a `TextField`, and its one disabled BUTTON is the submit, disabled solely while submitting. Re-pointed at `/design/primitives`, which states the disabled button at rest, and the guard is gone so a gallery that stops drawing one fails loudly. |
| `tasks-optimistic.spec.ts:205` | **Reported, not fixed** — skips when the seeded workspace holds a single page of active tasks, which it does. Executing it needs a page's worth of tasks; creating them per run would be exactly the accumulated-state contamination DEBT-173 is about, so the honest fix is a page-size seam the product does not have. Raised as [DEBT-200](PRODUCT_DEBT.md). |
| `ux-02-plan-habits.spec.ts:322` | **Reported, not fixed** — skips when the workspace holds no completed weekly Review for the prior period. A fixture is the right answer and it is a Review-flow fixture, not a Plan one. Raised as [DEBT-200](PRODUCT_DEBT.md). |

**Nothing was skipped, quarantined, deleted or given a longer timeout, and no
assertion was loosened without the old one being shown to be wrong.** Where an
assertion changed, the replacement is stated in the spec beside the reason, and
in every case it is a stricter claim than the one it replaces — the three worth
naming:

- **`comboboxOption`** follows the combobox's own `aria-controls` to the listbox
  it controls. The query it replaces was *"an option somewhere inside this
  dialog"*; the new one is *"an option inside the one listbox this control
  publishes"*. `assets-ownership.spec.ts` is the proof: its old lookup was
  drawer-scoped precisely to avoid a native `<select>` behind it with identical
  option labels, and `aria-controls` serves that original intent better, because
  a `<select>`'s options can never be the listbox a combobox names.
- **`todayCompletedRow`** opens the `Completed · n` disclosure **by clicking its
  summary**, the owner's own way in, so a completion is proved *reachable* rather
  than merely present in the DOM.
- **`iphone-daily-driver.spec.ts`'s** sheet assertion moved from *"the last row's
  bottom is above the fold"* to *"the sheet is bounded by the viewport and every
  row can be scrolled to"*. The old one contradicted `floating.css`'s own stated
  contract — *"the row keeps its height and the surface scrolls past it"* — and
  measured **853.85 against an 845 limit** on a menu one item longer than the run
  before.

### 3.3 The `check()` mechanism, corrected

DEBT-179's dominant signature is worth stating precisely, because the obvious
reading of it is wrong and this pass proved it wrong rather than assuming it.

`ElementHandle._setChecked` (playwright-core 1.62.1) clicks and then verifies
against the element **handle** it acted on. DalyHub's completion control renames
itself from `Complete <title>` to `Reopen <title>` the moment it is used, and the
first theory was that the rename alone defeats the re-assertion. **It does not.**
`tasks-collection.spec.ts` completes a task on `/tasks?system=all` with `.check()`
and passes, with the same rename — a renamed element is still the same node.

What defeats it is **disconnection**: `isChecked` then throws
`throwElementIsNotAttached()`, the throw propagates to the locator retry wrapper,
and the wrapper **re-resolves the selector** — which now finds nothing. On Today
that is exactly what happens, because `TodayScreen` files the completed row into
a `<details>` that renders closed. The corrected mechanism is recorded on the
helper itself, and the correction is why only three tests carry this cause rather
than every `.check()` in the suite.

### 3.4 Three genuine product defects, found inside the standing red

Each was predicted from the source, then confirmed by the baseline's own failure
message — which is the order that distinguishes a diagnosis from a guess.

1. **A doubled tab-panel boundary.** `premium.css` re-declared the `border` and
   `border-radius` **shorthands** for `.record-tabs__panel` after
   `record-layout.css` had removed the panel's top edge and top corners to join
   it to its tab strip. Same specificity; `app.css` imports premium later, so
   premium won and the panel drew a second top edge under the strip — the
   doubled boundary M3-INT exists to prevent. Caught by
   `non-diary-audit.spec.ts:33`, which had been reporting it correctly from
   inside DEBT-179's undifferentiated red set the whole time.
2. **An inverted type hierarchy.** UIX-02's rule is that a record's filter rail
   is subordinate to the tab strip above it. The rail was drawn at
   `--dh-text-label-size` (13px) under a strip at `--dh-text-meta-size`
   (12.5px) — subordinate by rule, one type step LARGER in fact. Fixed on the
   **record-scoped** rail alone (`.dh-record-toolbar .dh-viewtabs__tab`, which
   `view-tabs.css` already existed to override), deliberately not by re-typing
   every `ViewTabs` in the product, which would have been exactly the unrelated
   UI work this gate forbids itself.
3. **The row-reveal contract's wrapper won the hit test** —
   [DEBT-180](PRODUCT_DEBT.md#-debt-180--the-row-reveal-contract-is-unclickable-by-automation-the-hidden-triggers-own-wrapper-wins-the-hit-test--p3), § 3.5.

### 3.5 DEBT-180, answered by probing the browser rather than by reading CSS

B4 asks whether the reveal defect is a product pointer defect, automation using
the wrong target, or both. **It is both**, and each half was settled by asking
the live DOM rather than by reasoning about stylesheets.

- **At rest**, the trigger carried `opacity: 0; pointer-events: none` while its
  WRAPPER stayed `opacity: 1; pointer-events: auto`. The hit stack at the
  trigger's own centre read `DIV.dh-overflow-menu → SPAN.dh-taskrow__actions →
  LI.dh-taskrow`: the invisible affordance's own container was absorbing the
  click. The reveal contract's consumer rule says the class goes on *"the
  trailing action container"*, and the wrapper IS that container — so the class
  moved there, and `OverflowMenu` gained the `className` prop that makes putting
  it there possible.

  **`motion.css` had been written for the container all along**, which is the
  strongest evidence that `TaskRow` was the outlier rather than the contract:
  two of the reveal's own selectors — `.dh-action-reveal:focus-within` and
  `.dh-action-reveal:has([aria-expanded="true"])` — only mean anything on an
  element that CONTAINS the control. On the trigger they were dead.
- **All four pointer modes are covered, and three of them by construction.** The
  concealment lives inside `@media (hover: hover)`, so a **coarse pointer or
  touch** device draws the affordance outright and always has; **keyboard** is
  `:focus-within` on the container, which now has a container to be within;
  **forced colours** override the whole thing to visible. Only the fine-pointer
  path needed the fix, and Playwright's ordinary semantics work on it once the
  row is hovered.
- **On hover and on focus**, the trigger resolves and both the keyboard and the
  pointer path work unchanged. So the automation half is that the specs must
  hover first, as a person does. **`force: true` was not used**, and it would
  have hidden the product half entirely.
- A third finding fell out of the same probe: `motion.spec.ts`'s `.first()` had
  drifted onto a non-focusable `<svg>` caret. The bearers probe printed the three
  candidates — `svg, svg, BUTTON.dh-overflow-menu__trigger` — which is a
  diagnosis no amount of reading would have produced.

### 3.6 DEBT-158 and DEBT-173

- **DEBT-158** — the Goal measurement journey now **executes**. `e2e/goal-fixtures.ts`
  creates its own measurable Goal through the real UI, asserts against it, and
  cleans up after itself in the manner of `e2e/habits-fixtures.ts`. The global
  seed is untouched, so the specs sharing its partition are unaffected — which is
  the half of acceptance criterion 4 that a seed change would have broken.
- **DEBT-173** — the programme's own acceptance boundary is the rule these two
  fixes are held to: *"a numerical claim about the owner's history is proven
  against a fixture whose events are known, not against whatever the workspace
  happens to hold — because a figure derived from accumulated state is a figure
  nobody can check"* ([ROADMAP_V2_4](../roadmap/ROADMAP_V2_4.md#the-acceptance-boundary)).

  **Neither of the two instances the entry names appears in the fresh baseline
  above, and that is the point of them.** They are failures a
  spec produces only when enough other specs have run before it, which is why the
  55 do not include them and why criterion 3 asks for both a freshly seeded
  database and accumulated state. Both are fixed at the mechanism, by giving each
  spec ownership of what it asserts rather than by re-ordering the suite:
  - `tasks-journey.spec.ts` now reads its priority bands **filtered to its own
    seeded Project** (`pr-tasksjourney`). A priority band is bounded, so an
    unfiltered band shares its slots with the seed's 80-task collection plus
    everything earlier specs created — which is how a task correctly filed under
    Priority 1 read as absent on one run of a tree that had passed on the run
    before.
  - `iphone-daily-driver.spec.ts` no longer depends on how many actions the
    collection's first row happens to offer (§ 3.2). The spec's stated invariant
    — that it mutates nothing, so it can run beside the mutating journeys — is
    preserved: the fix removes the dependency rather than adding a fixture.

### 3.7 Partition truth — measured, and deliberately not regenerated

B7 asks for `e2e/partitions.json` to be regenerated **only if measurement proves
it stale**. It does not, and the file's own rules are what settle it:

```
E2E partitions OK — 117 spec files across 12 partitions, heaviest 16.1 min.
12 partitions · 183.4 min of measured test time · mean 15.3 min · worst/mean 1.05
```

Every one of the 117 spec files carries a real duration, a test count and a
source; `check` fails while any is sized by the `defaultSpecSeconds` guess, and
it passes. The split is balanced to within 5% of its own mean. Nothing is stale.

**And it could not honestly be regenerated from here even if it were.** The
manifest states its own rule in `why` and `measuredFrom`: durations come from a
CI run's `e2e-results-*` artefacts, *"nothing here is normalised or extrapolated
either way"*, and a LOCAL figure is admissible only for a spec file that has no
CI measurement yet — twice, each time stated in the file rather than smuggled in.
This sandbox is slower than the CI runner and a failing test burns its whole
timeout, so the baseline's 14.8–26.4 min per partition measures the breakage and
the machine, not the split. **The refresh belongs to the next CI gate run**,
which is exactly the mechanism [HARDEN-06A](HARDEN_06A_FINISHING_E2E_GATE_2026_08.md)
closed [DEBT-157](PRODUCT_DEBT.md#-debt-157--the-e2e-partition-durations-can-only-be-refreshed-from-a-failing-run--p1-re-rated-2026-08-20-mechanism-closed-by-harden-06a-the-same-day-held-open-for-its-confirming-run)'s
mechanism for: green partitions publish their artefacts too.

### 3.8 What is NOT green, and why it is not this item's to fix

Two tests remain red after everything above: `plan-responsive.spec.ts:100` and
`:194`. Both are
[DEBT-196](PRODUCT_DEBT.md#-debt-196--weekly-planning-draws-two-days-at-phone-width-where-its-own-tier-says-one--p2)
— Weekly Planning draws Saturday **and** Sunday below the phone tier, at 100% and
at 200% zoom, where its own tier says one day. It is a real product defect,
reproduced in the browser by DHDS-13 and pre-existing on `main`.

**[ROADMAP_V2_4](../roadmap/ROADMAP_V2_4.md) assigns it explicitly to
V2.4-GATE-02**, whose acceptance criterion 4 is those two line numbers passing
and whose "Closes" line names DEBT-196. GATE-01's brief forbids beginning
GATE-02. So the fix was not taken, and the tests were left **red, named and
visible** — not skipped, not quarantined, not weakened.

**This is a genuine conflict inside the roadmap, and it is recorded rather than
resolved by crossing the line.** GATE-01's acceptance criterion 3 asks for a
green twelve-partition gate; criterion 3 cannot hold while DEBT-196 is open, and
DEBT-196 is GATE-02's. Either GATE-02's phone-tier fix moves into GATE-01, or
GATE-01's criterion 3 is met the moment GATE-02 lands. **That is the owner's
call, not this pass's**, and it is why the roadmap entry is not being ticked.

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
unknown. `pnpm run verify:production` was run at this commit and reports five
`SKIPPED` checks — its own honest answer to having no credentials — recorded
verbatim in the checklist. One thing it *did* establish: `hub.daly.id.au/health`
answers **302 to the Cloudflare Access login**, which is the intended hardening
and not an outage.

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

[DEBT-199](PRODUCT_DEBT.md)'s remote half — § 2.4.

### 5.4 One decision the owner has to take about the roadmap itself

**GATE-01's acceptance criterion 3 cannot be met while DEBT-196 is open, and
DEBT-196 belongs to GATE-02.** Two E2E tests are red for it and this pass left
them red on purpose (§ 3.8). Either the phone-tier fix moves into GATE-01, or
criterion 3 is understood to be met the moment GATE-02 lands. **The roadmap entry
is not being ticked until one of those is chosen.**

---

## 6. Scope discipline

Not done, deliberately, and none of it was started:

- **V2.4-GATE-02, FOLLOW-01 and FOLLOW-02.** Untouched.
- **The Plan dual-checkbox and semantic-overdue defects** (DEBT-194, DEBT-197).
  They belong to V2.4-GATE-02 and neither blocked a GATE-01 test.
- **The one-day-phone defect** (DEBT-196). It DOES block two GATE-01 tests, and
  it was still not taken, because the condition for taking it is conjunctive:
  blocking a GATE-01 test **and** the roadmap putting the responsibility here.
  The roadmap puts it in GATE-02 explicitly — its acceptance criterion 4 is
  those two line numbers, and its "Closes" line names DEBT-196. Fixing it would
  have been beginning GATE-02. Reported instead: § 3.8, § 5.4.
- **No schema or API change.** None was needed. The three product changes are a
  CSS border declaration, a CSS type size, and moving one class name from a
  button to the container the contract's own selectors were already written for.
- **No new design phase, no new domain concept, no unrelated UI work.** The
  inverted type hierarchy was fixed on the record-scoped rail alone rather than
  on every `ViewTabs` in the product, for exactly this reason.
- **No E2E partition redesign, and no regeneration either** — the manifest was
  measured and found sound. § 3.7.

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
