# DalyHub V3.0.0 — Release Checklist & Runbook

**Version `3.0.0` · Release name "V3" · PREPARED 2026-09-15 · NOT RELEASED**

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

## 0. Release gate — DO NOT CUT UNTIL ALL THREE ARE ✅

This release is prepared deliberately ahead of being cut. The three conditions
below are the ones the preparing change could not satisfy from a branch, and no
tag may be pushed while any is unmet.

| # | Condition | State |
| :-- | :--- | :--- |
| 1 | The frontend foundation work (V3-CSS-01, the cascade layer architecture) is **merged to `main`** | ⛔ on a branch at the time of writing |
| 2 | The E2E gate restructure (V3-E2E-01, the PR/nightly tiers) is **merged to `main`** | ⛔ on a branch at the time of writing |
| 3 | **`main` is green** after both — full CI, including every E2E partition | ⛔ not yet run on `main` |

A fourth condition is not blocking but is strongly advised: **one green run of
the nightly suite** (`.github/workflows/nightly.yml`, dispatchable on demand)
against the merged `main`. The exhaustive accessibility and responsive matrices
moved there in this same programme, so the first release after that move is
exactly the wrong one to cut without having seen them pass once.

---

## 1. Scope

V3.0.0 ships **no new product concept, no new module and no schema change.** The
committed migration sequence at this commit is the one that was already there;
nothing in this release runs a migration.

What it ships is the accumulated frontend of two programmes that were complete on
`main` and had never been released:

- **UNTITLED-01 … 19** — every module rebuilt on Untitled UI React Pro, and an
  audit closing the one competing generic system it found.
- **V3-CSS-01** — the CSS cascade ownership model, and
- **V3-E2E-01** — the two-tier E2E gate, which is a change to CI rather than to
  the product, and is listed because it changes what "green" means.

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
`pnpm run untitled:theme:check` pass — the generated scheme, the token audit and
the generated Untitled theme are all as committed.

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

✅ **222 tests passed** across the new and changed E2E specs, measured locally.

⏳ **CI has not run this branch.** Every measurement in this section was taken in
the development sandbox. §0 condition 3 exists for exactly this reason.

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

⏳ **The nightly workflow has never run.** It is scheduled and dispatchable;
neither has happened.

---

## 3. Recoverable — the backup and restore halves

⏭️ **Unchanged by this release and not re-verified here.** V3.0.0 touches no
schema, no migration, no export format and no backup path. The evidence and the
rehearsal procedure in
[`RELEASE_CHECKLIST_V2_4_0.md` §3–4](RELEASE_CHECKLIST_V2_4_0.md) stand as
written.

⏳ **The owner should still run `pnpm run restore:rehearsal` before cutting**,
because "nothing changed" is a claim about the diff and the rehearsal is a claim
about the database.

---

## 4. The production sequence

⏭️ **See [`RELEASE_CHECKLIST_V2_4_0.md` §6](RELEASE_CHECKLIST_V2_4_0.md).**
Nothing about the sequence changed. Restating it here would create a second copy
to keep true, and a release runbook that disagrees with itself is worse than one
that points somewhere.

⏳ **No step of it has been performed for this release.** Nothing has been backed
up, migrated or deployed, and no environment that prepared this release held
Cloudflare credentials — which `pnpm run verify:production` reports for itself
rather than being told.

---

## 5. Version authority

✅ One constant, three consumers, one test.

| Where | Value |
| :-- | :-- |
| `app/lib/version.ts` → `APP_VERSION` | `3.0.0` |
| `app/lib/version.ts` → `APP_RELEASE_NAME` | `V3` |
| `package.json` → `version` | `3.0.0` |

✅ `test/unit/about/package-version.test.ts` fails if the two drift.
✅ About, `/health` and every export archive read the constant; nothing copies it.

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

## Related documents

- [`RELEASE_NOTES_V3_0_0.md`](RELEASE_NOTES_V3_0_0.md) — written for the owner.
- [`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md)
- [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) — the two E2E tiers.
- [`RELEASE_CHECKLIST_V2_4_0.md`](RELEASE_CHECKLIST_V2_4_0.md) — the production
  sequence, and the backup/restore evidence this release does not repeat.
