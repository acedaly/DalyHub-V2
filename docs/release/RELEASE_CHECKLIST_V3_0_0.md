# DalyHub V3.0.0 — Release Checklist & Runbook

**Version `3.0.0` · Release name "V3" · PREPARED 2026-09-15 · RELEASE CANDIDATE 2026-09-15 · NOT DEPLOYED**

> The evidence behind every V3.0.0 claim, and the exact sequence for deploying
> it. Nothing is marked ✅ without a reference to a measurement. Where something
> is an owner action that has not happened, it is marked ⏳ rather than claimed.
>
> Legend: ✅ verified · ⚠️ verified with a stated limitation · ⏳ owner action
> still required · ⛔ blocking, not yet satisfied · ⏭️ out of scope.
>
> Follows the shape of [`RELEASE_CHECKLIST_V2_4_0.md`](RELEASE_CHECKLIST_V2_4_0.md),
> which remains the authority on the production sequence itself — §6 there is not
> restated here, because nothing about it changed and a second copy would be a
> second thing to keep true.

---

## 0. Release gate

This release was prepared deliberately ahead of being cut. The three conditions
below are the ones the preparing change could not satisfy from a branch.

| # | Condition | State |
| :-- | :--- | :--- |
| 1 | The frontend foundation work (V3-CSS-01, the cascade layer architecture) is **merged to `main`** | ✅ merged in [#297](https://github.com/acedaly/DalyHub-V2/pull/297), `main` @ `4f49c169` |
| 2 | The E2E gate restructure (V3-E2E-01, the PR/nightly tiers) is **merged to `main`** | ✅ merged in the same change; verified below |
| 3 | **`main` is green** after both — full CI, including every E2E partition | ⏳ CI run [`34955877627`](https://github.com/acedaly/DalyHub-V2/actions/runs/34955877627) at `4f49c169` is IN FLIGHT as this is written; §2.6 carries the result and this row is not ✅ until it does |

**The fourth, non-blocking condition is NOT met.** The nightly suite
(`.github/workflows/nightly.yml`) has still never run — see §2.5. It is
`workflow_dispatch`-able and the release session attempted exactly that; GitHub
answered **`403 Resource not accessible by integration`**, the same class of
limit recorded in [`RELEASE_CHECKLIST_V2_4_0.md` §6](RELEASE_CHECKLIST_V2_4_0.md)
for `workflow_dispatch` and `rerun-failed-jobs`. It is owner action and it is
stated as a known limitation in the notes rather than quietly dropped.

### The merged foundation, verified on `main`

| Claim | Read from `main` @ `4f49c169` |
| :--- | :--- |
| Cascade ownership model exists and is documented | [`docs/architecture/CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md) |
| Its contract is held by a test, not by a document | [`e2e/css-cascade-ownership.spec.ts`](../../e2e/css-cascade-ownership.spec.ts) |
| PR-tier configuration exists | `e2e/partitions.json` → `tiers.nightly`, 18 partitions in the CI matrix |
| Nightly workflow exists | [`.github/workflows/nightly.yml`](../../.github/workflows/nightly.yml), `schedule` + `workflow_dispatch` |
| Tier invariants pass | `pnpm run e2e:partitions:check` ✅; `node scripts/e2e-partitions.mjs nightly-specs` → exactly `accessibility-matrix`, `responsive-desktop`, `responsive-phone`; `test/unit/ci/e2e-tiers.test.ts` green in the unit run below |

---

## 1. Scope

V3.0.0 ships **no new product concept added by the release preparation itself**,
and the frontend programmes it exists to release changed no schema. It is not,
however, a schema-free release — see §1.1, which corrects what the prepared draft
of this document said.

What it ships is the accumulated frontend of two programmes that were complete on
`main` and had never been released:

- **UNTITLED-01 … 19** — every module rebuilt on Untitled UI React Pro, and an
  audit closing the one competing generic system it found.
- **V3-CSS-01** — the CSS cascade ownership model, and
- **V3-E2E-01** — the two-tier E2E gate, which is a change to CI rather than to
  the product, and is listed because it changes what "green" means.

…plus everything else that landed on `main` between `2.4.0`'s deployment and this
commit, which is the Finance, Life Admin/Obligations, Attachments and Ask DalyHub
work enumerated in [`CHANGELOG.md`](../../CHANGELOG.md) under `3.0.0`.

### 1.1 The migration claim, corrected

⛔ **The prepared draft of this checklist said "no schema change… nothing in this
release runs a migration". That is FALSE at release granularity, and it is the
one release defect this pass found.**

It was true of the diff it was written against — `#297` touches no file under
[`migrations/`](../../migrations), and neither did the Untitled passes. It is not
true of the release, because a release is measured against **what is running in
production**, not against the commit before it.

Measured from the repository:

| | |
| :-- | :-- |
| Committed migrations at `4f49c169` | **57 files**, head `0055_ai_assisted_features.sql` |
| Last direct observation of production's ledger | **49 applied, head `0047`**, read 2026-08-24 ([`RELEASE_CHECKLIST_V2_4_0.md` §6](RELEASE_CHECKLIST_V2_4_0.md)) |
| Last recorded production deployment | **2026-08-30T05:56:35Z**, deployment `cf596658-d648-4a58-a521-09cf6c0e279f`, with `verify:production` reporting *"production has no unapplied migrations"* |
| Added to `main` after that deployment | `0050_create_obligations` (2026-09-06), `0051_obligation_notifications` (2026-09-06), `0052_create_attachments` (2026-09-06), `0053_create_finance` (2026-09-07), `0054_ai_grounded_features` (2026-09-08), `0055_ai_assisted_features` (2026-09-09) |

Those six are the tables Finance, Life Admin, Attachments and Ask DalyHub are
built on — modules this release's own CHANGELOG describes as new. A deploy that
skipped them would ship a Worker whose code expects tables the database does not
have.

`0048_goal_condition` and `0049_create_tag_vocabulary` sit between the two
observations and this document does **not** guess whether they are applied.
**Production's own ledger decides**, and `pnpm run db:production:list` is what
reads it.

**Consequence for the production sequence.** Step 5 of
[`RELEASE_CHECKLIST_V2_4_0.md` §6](RELEASE_CHECKLIST_V2_4_0.md) —
`pnpm run db:production:apply` — is **required** for this release, not ceremony,
and steps 1–2 (a verified encrypted backup before any migration) are therefore
hard preconditions rather than advisable ones. The six migrations create tables;
they do not alter or drop existing ones, so the failure mode being guarded
against is a partially-applied deploy rather than data loss — which does not make
the backup optional.

### Why the major number, and why not `2.5.0`

`2.5.0` would claim additions that are backwards compatible. The data is
backwards compatible. The frontend is a replacement: almost every surface is a
different implementation, and V3-CSS-01 changed which stylesheet wins on a
migrated control across the whole product. A minor number would understate that
to the one person it matters to — whoever has to answer "what changed?" after a
regression.

---

## 2. The evidence

### 2.1 The cascade change was measured, not reviewed

✅ **Before/after computed styles, 170 surfaces.** 32 routes × up to 5 widths × 2
appearances, 38 paint and layout properties on every rendered element, 66,681
elements.

✅ **The harness was calibrated against its own noise before it was trusted.**
Keying on DOM position reported 1.69% of elements as changed with the stylesheet
UNTOUCHED (content reorders between runs). Re-keyed on the `(tag, className)`
signature, the noise floor is 0.23% — two items, both genuine interaction-state
variance. A diff harness whose noise was never measured is not evidence.

✅ **Result: 55 of 13,609 class signatures changed (0.40%), on 5 of 170
surfaces.** Four of the five are dev-only `/design/*` galleries. The one product
surface with any change is `/diary`, whose controls were then inspected directly
and render correctly.

✅ **Every remaining change is a blanket `base.css` rule no longer overriding a
component's own declaration by an accident of specificity** — which is the defect
the work exists to remove. Enumerated in
[`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md).

✅ **Unlayered CSS: 600,640 bytes → 3,776 bytes.** 2,932 unlayered style rules →
0, read from the CSSOM of a live page. The 3,776 remaining bytes are Tailwind
`@property` and `@keyframes` blocks, neither of which is a cascade participant.

✅ **Three regressions were found by that measurement and fixed before this
document was written**, each by correcting a layer assignment rather than by
out-specifying it: the Shared Card's entity accent edge, the combobox's trailing
padding, and Today's Next-action row. No `!important` was added; the count stands
at 15, unchanged.

⚠️ **Screenshots of all 21 named product surfaces** at 1440/light and 393/dark
were captured and reviewed alongside the diff. A sample was inspected in detail
rather than all 42, because the computed-style diff over 66,681 elements is the
stronger instrument for this class of change and the screenshots exist to catch
what its property list omits.

### 2.2 Colour, appearance and scheme are unchanged

✅ `pnpm run scheme:check`, `pnpm run dhds:check` and
`pnpm run untitled:theme:check` pass on `main` @ `4f49c169` — the generated
scheme, the token audit and the generated Untitled theme are all as committed.

✅ The `dh-tokens` layer is placed **after** `theme` deliberately, so where the
two colour vocabularies collide DalyHub's value — the one the product has always
rendered — still wins. Five schemes × two appearances, unchanged.

⏭️ **Deciding between the two colour engines is out of scope for this release**
and is stated as a known limitation in the notes rather than quietly carried.

### 2.3 The test gate

✅ **The cascade contract is held by a test, not by this document.**
[`e2e/css-cascade-ownership.spec.ts`](../../e2e/css-cascade-ownership.spec.ts) —
a browser probe proving Untitled wins a contested property, and a CSSOM walk
proving no rule sits outside a layer. **Both fail on `main` @ 77f8b55 and pass
after the change**, which is the order a regression test has to be written in.

✅ **222 tests passed** across the new and changed E2E specs, measured locally
during the preparing change.

⏳ **CI is running this commit now.** §0 condition 3 is answered by run
[`34955877627`](https://github.com/acedaly/DalyHub-V2/actions/runs/34955877627);
the per-job evidence is in §2.6, and nothing is tagged or deployed until it is
green.

### 2.4 What the E2E restructure did to the gate

Measured on CI run `34914152099` (`main` @ 77f8b55, green): 18 partitions,
**303.6 runner-minutes**, mean 16.9 min, slowest 20.4 min, queueing negligible
(0.7 min total). The gate is the critical path of a 21m40s pipeline.

| | Before | After |
| :-- | --: | --: |
| Gated spec files | 142 | 141 |
| Gated tests | 2,178 | ~1,540 |
| Gated measured minutes | 279.3 | ~240 |
| Nightly tier | — | 3 files |

⚠️ **The honest finding is that the gate's cost is NOT concentrated.** Three
files were 31.5% of its tests and 14.7% of its minutes; the remaining 139 are a
flat tail of genuine product journeys, and cutting further would have meant
removing correctness coverage, which the brief forbids and which would have been
the wrong trade anyway. The saving claimed here is the saving that was there.

✅ **No contract left the PR gate.** Measured before the split: 93 of the gate's
other spec files run axe over 75 distinct routes, and 108 assert
no-horizontal-overflow over 94 distinct routes. The PR gate additionally keeps a
representative accessibility scan in both appearances, **every** open-overlay
accessibility scan, the responsive boundary widths over the daily-driver
surfaces, and the overlays at 320. Static `jsx-a11y` lint is untouched and runs
on every push.

✅ **The nightly tier gained coverage it never had.** `/tasks`, `/inbox` and
`/upcoming` — the three densest grids in the product — were missing from the
responsive sweep's route list entirely, an omission the file itself records as
"the other half of why the regression was invisible". They are in it now.

### 2.5 The nightly suite — still never run

⛔ **The nightly workflow has never executed, and this release ships without it.**

| | |
| :-- | :-- |
| Runs of `nightly.yml` to date | **0** (`list_workflow_runs` → `total_count: 0`) |
| Attempted from the release session | `workflow_dispatch` against `main` |
| Result | **`403 Resource not accessible by integration`** |
| Scheduled | `0 16 * * *`, so the first scheduled run lands the evening of the cut |

**This is the single largest gap in this release's evidence and it is not talked
around.** The exhaustive accessibility and responsive matrices moved into that
workflow in this same programme, so the first release after the move is exactly
the one that should have seen them pass. What DID run is the PR gate, which
keeps a representative accessibility scan in both appearances, every
open-overlay scan, and the responsive boundary widths over the daily-driver
surfaces — a thinner net, not an absent one.

⏳ **Owner action, one command:**

```sh
gh workflow run nightly.yml --ref main
gh run list --workflow=nightly.yml
gh run watch <RUN_ID>
```

All three jobs — `accessibility-matrix`, `responsive-desktop`, `responsive-phone`
— must be green. A failure there is triaged, not ignored: a genuine
visual/accessibility/responsive defect is a reason to hold the deployment, and a
stale assertion is a narrowly-scoped fix and a re-run.

### 2.6 `main` CI at the release commit

Run [`34955877627`](https://github.com/acedaly/DalyHub-V2/actions/runs/34955877627),
event `push`, `main` @ `4f49c169ffaba0f6429cbe59d64f654011c136ab`, attempt 1. A
`push`-event run on `main` itself, not a PR-branch run.

| Job | Result |
| :-- | :--- |
| Scope | ✅ success — not a pull request, so the path filter is not consulted and everything runs |
| Static | ✅ success — format, ESLint, TypeScript, scheme, partitions, fixture dates, doc links, icons |
| Build | ✅ success — production build, Cloudflare config validated, artifact uploaded |
| Unit | ⏳ in flight |
| E2E p01 … p18 | ⏳ in flight — 18 partitions dispatched |
| CI Gate | ⏳ |

**This table is updated from the run itself before the release PR is opened**, and
the release does not proceed on a run that is cancelled, that leaves a partition
unexecuted, or that publishes a failure artefact.

### 2.7 Local release gates, at the release commit

Run in the release session against `4f49c169`, after `pnpm install --frozen-lockfile`:

| Gate | Result |
| :-- | :--- |
| `pnpm run format:check` | ✅ |
| `pnpm run lint` | ✅ |
| `pnpm run typecheck` | ✅ |
| `pnpm run build` | ✅ |
| `pnpm run scheme:check` | ✅ |
| `pnpm run dhds:check` | ✅ |
| `pnpm run untitled:theme:check` | ✅ |
| `pnpm run icons:check` | ✅ |
| `pnpm run docs:links:check` | ✅ |
| `pnpm run e2e:partitions:check` | ✅ |
| `pnpm run e2e:fixture-dates:check` | ✅ |
| `pnpm run test:unit` | ✅ **541 files, 7,767 tests passed**, 0 failed |
| `pnpm run test:kernel` | ✅ **229 files, 3,613 tests passed**, 0 failed — Workers runtime with real D1 |
| `pnpm run restore:rehearsal` | ✅ **2 files, 28 tests passed**, 0 failed — see §3 |

---

## 3. Recoverable — the backup and restore halves

⏭️ **The backup pipeline itself is unchanged by this release.** V3.0.0 touches no
export format and no backup path. The evidence and the rehearsal procedure in
[`RELEASE_CHECKLIST_V2_4_0.md` §3–4](RELEASE_CHECKLIST_V2_4_0.md) stand as
written.

✅ **The whole-product restore rehearsal passed at this commit.**
`pnpm run restore:rehearsal` — `test/kernel/whole-product-rehearsal.test.ts` and
`test/kernel/workspace-data-map.test.ts`: one synthetic workspace covering every
durable domain, a truth manifest of derived owner-facing values at a frozen owner
day, export, destroy every row through the registry-derived purge plan and every
object in R2, prove it is gone, restore, recompute the manifest and compare.

**2 files, 28 tests, all passed, 0 failed** (26.6s). What is compared is not row
counts: account balances derived again from the restored rows, month totals per
currency, a transfer still excluded from spending, an obligation still settled by
the transaction that settled it, a Goal's measurement series, a Review's
persisted insight snapshot, a saved Report re-executed, the completion history
Insight draws, and the AI FactBlock built from all of it — plus the proof that
every table in the schema is classified for recovery.

⚠️ **It proves the mechanism, not the artifact.** It runs against the repository's
own synthetic workspace in the Workers test runtime, not against production's
data. §1.1 changes what that means for this release: six migrations will be
applied to production, so the pre-migration backup in
[`RELEASE_CHECKLIST_V2_4_0.md` §6 step 1–2](RELEASE_CHECKLIST_V2_4_0.md) is a
hard precondition and `pnpm run backup:verify` /
`pnpm run db:production:backup:list` must report a real, non-zero, verified
object before `db:production:apply` is run.

---

## 4. The production sequence

⏭️ **See [`RELEASE_CHECKLIST_V2_4_0.md` §6](RELEASE_CHECKLIST_V2_4_0.md).**
Nothing about the sequence changed. Restating it here would create a second copy
to keep true, and a release runbook that disagrees with itself is worse than one
that points somewhere.

⏳ **No step of it has been performed for this release.** Nothing has been backed
up, migrated or deployed. The release session held **no Cloudflare credentials**
— no `.production.env`, no `CLOUDFLARE_API_TOKEN`, `wrangler whoami` reporting
not authenticated — so every `pnpm run` production command refuses at its own
guard, including `deploy:production:preflight`. Nothing was invented to get past
one, and no attempt was made to bypass Cloudflare Access.

**§1.1 changes step 5 from a no-op to a requirement.** Do not skip it, and do not
run it before steps 1–2 have produced a verified backup.

---

## 5. Version authority

✅ One constant, three consumers, one test. Verified by reading the files at
`4f49c169`:

| Where | Value |
| :-- | :-- |
| `app/lib/version.ts` → `APP_VERSION` | `3.0.0` |
| `app/lib/version.ts` → `APP_RELEASE_NAME` | `V3` |
| `package.json` → `version` | `3.0.0` |

✅ `test/unit/about/package-version.test.ts` fails if the two drift, and passed in
the §2.7 unit run.
✅ About, `/health`, `/offline`, Settings and every export archive read the
constant through `buildInfo()` or `APP_VERSION`; **no file copies a version
string** — `grep` for `3.0.0` across `app/` and `workers/` returns only
`app/lib/version.ts` and its own docstring.

---

## 6. What is still owed after this release

Carried forward deliberately, each with a named next action in
[`UNTITLED_UI_MIGRATION.md`](../design/UNTITLED_UI_MIGRATION.md#named-maintenance-debt):

1. The eight `dh-legacy` stylesheets — 1,966 lines, all now proven to change
   nothing on screen, awaiting deletion.
2. `forms.css`'s paint/geometry split.
3. `md-state-layer`'s 34 usages.
4. The two colour engines.
5. `assisted-ai.spec.ts`'s wrangler-startup cost, and the 183 `d1Execute` call
   sites behind it — roughly 9.5 minutes of process spawn across the gate, before
   any SQL runs. The largest single remaining lever on E2E cost, and a separate
   piece of work.
6. The Finance collection heading's missing gutter (pre-existing).

---

## 7. Owner actions outstanding before `v3.0.0` is live

In order. None of these can be performed without credentials the release session
did not hold, and none was faked.

| # | Action | Why it is here |
| :-- | :--- | :--- |
| 1 | `gh workflow run nightly.yml --ref main`, then confirm all three jobs green | §2.5 — `workflow_dispatch` returned `403` to the session |
| 2 | `pnpm run db:production:list` — **record the output** | §1.1 — production's ledger is the only authority on which of `0048`–`0055` are pending |
| 3 | Establish and verify an encrypted backup ([§6 steps 1–2](RELEASE_CHECKLIST_V2_4_0.md)) | §1.1 — this release applies migrations, so this is a precondition |
| 4 | `pnpm run deploy:production:preflight` and `deploy:production:release-check` | §4 — refuses without credentials |
| 5 | `pnpm run db:production:apply` | §1.1 — **required for this release** |
| 6 | `pnpm run deploy:production` from the exact tagged commit | §4 |
| 7 | `pnpm run verify:production`, then sign in and read `/about` | confirms `3.0.0` / `V3` is what is actually running |
| 8 | Record the results back into this file | §8 |

---

## 8. Release record — to be completed on deployment

| | |
| :-- | :--- |
| Release commit (`main` after the release PR) | ⏳ |
| Annotated tag `v3.0.0` | ⏳ — must be created on the exact release commit, and never moved |
| GitHub Release | ⏳ |
| Pre-deploy backup identifier | ⏳ |
| Migrations applied | ⏳ — expect at least `0050`–`0055`; §1.1 |
| Deployment timestamp | ⏳ |
| `/health` reports | ⏳ — must read `3.0.0` |
| Nightly suite run | ⏳ — §2.5 |

---

## Related documents

- [`RELEASE_NOTES_V3_0_0.md`](RELEASE_NOTES_V3_0_0.md) — written for the owner.
- [`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md)
- [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) — the two E2E tiers.
- [`RELEASE_CHECKLIST_V2_4_0.md`](RELEASE_CHECKLIST_V2_4_0.md) — the production
  sequence, and the backup/restore evidence this release does not repeat.
