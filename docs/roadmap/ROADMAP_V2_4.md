# ROADMAP_V2_4.md — V2.4, Follow-through

> The V2.4 product programme. V2.3 gave DalyHub the step it was missing between
> reflecting and doing — a week you commit to, routines you practise, and the
> Tasks vocabulary to express both. **V2.4 is about what happens next: nothing is
> finished until it lands and is accounted for.**
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1, [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md)
> holds V2.2 and [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) holds V2.3, which is **closed**.
> **This file is V2.4, whose planned product sequence is COMPLETE apart from
> V2.4-GATE-01's two owner-held halves — which stay recorded here, ☐, and are
> not moved.**
>
> **New work now goes in [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md)** — V2.5,
> "Steering", which makes the Goal layer decision-grade: `/goals` decides the
> question it answers and its counts become true (STEER-01), a Goal takes the
> owner's condition and can be re-filed without losing its history (STEER-02),
> every surface tells one Goal story including the weekly Review (STEER-03),
> signals name a next step or offer to create the missing structure (STEER-04),
> and Today offers this week's Review (STEER-05). Accepted as
> [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build;
> this tells you *what*. Status is updated in the PR that changes it. No time
> estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

---

## The theme: FOLLOW-THROUGH

> **V2.4 moves DalyHub from a system that records what you intended to a system
> that tells you what became of it — running in the owner's hands, recoverable,
> and honest about the week they actually had.**

Follow-through is one idea applied twice.

**The product's own.** Work that never reaches the owner is not delivered. The
repository's last recorded release is `2.0.1`, and the last production schema
state anyone wrote down is `0001`–`0025`, against a committed sequence that has
reached `0047`. Three programmes have landed since. The scheduled
disaster-recovery copy of the owner's entire life has never been produced. The twelve-partition test gate fails
on nine partitions, so a real regression would land invisibly among the expected
red. None of that is a feature question, and all of it is follow-through.

**The owner's.** DalyHub now asks for a commitment — *this Task, this day, this
week, this routine* — and then never mentions it again. `/plan` shows the week
ahead; Today shows the day; the Review reports what was completed. Nothing states
how much of what was planned actually happened on the day it was planned for, what
moved and how often, or what was never placed at all. A week that quietly failed
looks exactly like one that worked. And at the level where the product claims to
show whether daily action serves stated intention — the Goal — most Goals show
nothing at all.

V2.4 closes both, from data the system already stores.

---

## Where V2.3 left the product

V2.3 is complete. Every item in [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) is ☑ —
PLAN-01, SMART-01, HABITS-01, V2.3-GATE-01, TASKS-13, UX-02, PROJECT-02 and
TASKS-12 — and its own **NEXT** section says *"Nothing here. TASKS-12 was the
last item of the V2.3 theme"*, now with a pointer to this file. Two hardening passes landed on top of the closed theme
([HARDEN-06A](../product/HARDEN_06A_FINISHING_E2E_GATE_2026_08.md) and
[HARDEN-06B…06E](../product/DALYHUB_WHOLE_APP_REPAIR_2026_08.md)), and the
[whole-application audit](../product/DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md)
that prompted them records the condition for starting V2.4 — *"the full hardening
sequence complete"* — as **met on 2026-08-20**.

The broad design programme is closed too.
[DHDS-13](../design/DHDS_13_COMMERCIAL_QUALITY_GATE_2026_08.md), the
commercial-quality gate, scored the product **B — nearly commercial**, fixed four
P1 and eight P2 defects it found by *measuring* the running application, and ended
with an instruction rather than a plan:

> The broad design-convergence programme is closed. […] Future UI work is
> module-specific, feature-specific, bug-specific or accessibility-specific, tied
> to actual product work and justified by evidence. […] "The screenshots could
> look better" is not a mandate.

So V2.4 is not DHDS-14, and it is not another visual pass. What DHDS-13 *did*
leave is a short, named list of things it deliberately refused to decide inside a
quality gate, and this programme takes two of them because they are product
decisions rather than quality repairs — [§ The DHDS-13 findings, reconciled](#the-dhds-13-findings-reconciled).

---

## The governing product argument

[`AGENTS.md` §4](../../AGENTS.md#4-the-area--goal--project--task-model) states the
promise the spine exists to keep:

> **Everything rolls up.** Completing tasks advances projects; advancing projects
> moves goals; goals give areas momentum. **The rollup is how the system shows you
> whether your daily actions match your stated intentions.**

The rollup exists *structurally* — a Task knows its Project, a Project knows its
Goal, Goal progress is derived and never cached — but it is nowhere **stated over
time**. Four observations, each measured against the code on `main`, say the same
thing from different directions:

1. **The planning loop runs one way.** PLAN-01 reads a completed Review's written
   focus, so REVIEW → PLAN is wired. Nothing reads the other way. The Task's
   `scheduled_date` is the plan ([ADR-030](../decisions/ARCHITECTURE_DECISIONS.md),
   [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers)),
   and the Activity stream already records every movement of it —
   `task.planned`, `task.rescheduled`, `task.plan_cleared` — beside
   `task.completed`. Those four events are a complete account of a week that
   nothing in the product reads.
2. **The Goal layer is invisible unless a number is configured.** Today's
   `GoalProgressSection` renders **measurable Goals only**
   ([`TodayScreen.tsx`](../../app/modules/today/day/TodayScreen.tsx)); a workspace
   with Goals and no targets is told *"No measurable Goals yet"* every morning.
   [DEBT-158](../product/PRODUCT_DEBT.md#-debt-158--a-goal-measurement-journey-has-never-once-run-because-nothing-in-the-seed-is-measurable--p2--resolved-2026-08-23-v24-gate-01)
   measured the seed: `SELECT COUNT(*) FROM goal_details WHERE target_value IS NOT NULL`
   is **0**, against a workspace holding **six Goals**. For every one of them the
   top two levels of the spine contribute nothing to the daily surface.
3. **Where a Goal *does* have a project-only signal, the signal cannot move.**
   [DEBT-78](../product/PRODUCT_DEBT.md#-debt-78--goals-can-state-completion-but-not-trend--p3--resolved-2026-08-27-v24-follow-02):
   *"40% complete reads the same on a goal that gained two projects this month and
   one that has not moved since March — and* is it moving? *is the question a Goal
   exists to answer."*
4. **Routines report to nobody.** HABITS-01 built consistency figures and
   deliberately gave the Review nothing, recording the gap as
   [DEBT-156](../product/PRODUCT_DEBT.md#-debt-156--the-weekly-review-says-nothing-about-habit-consistency--p3)
   rather than shipping a half-considered number.

Against DalyHub's stated direction — *"information and progress that help the
owner make decisions rather than merely store records"* — that is the largest
coherent gap the product has. It is also the cheapest to close honestly, because
**every fact it needs is already written down**: the Activity stream is the
historical record ([ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model)),
REVIEW-03 already derives exact period facts from it and stores one versioned
insight snapshot, GOAL-02 already owns the one Goal formula, and HABITS-01 already
owns effective-dated expectations. V2.4 adds derivations and surfaces, not
authorities. That constraint is recorded as
[ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal).

### Why this and not the other candidates

Weighed against the evidence, and rejected as the *theme*:

- **Another visual/quality programme** — foreclosed by DHDS-13 §18. The two
  quality defects worth taking are taken here as a bounded gate, not as a phase.
- **Capture velocity** — DHDS-13 rates capture speed *"Below"* the reference bar.
  But TASKS-11 already shipped a deterministic parser covering priority, sector,
  commitment, flags, relative days, weekdays, explicit and ISO dates, and the
  whole recurrence vocabulary. What is actually missing is `#tag` and a time —
  and tags have no canonical model at all
  ([DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3),
  [DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3)),
  so this is a *tags* programme wearing a capture label. Real, smaller than it
  looks, and deferred with its reason.
- **Mobile / PWA** — MOBILE-01, PWA-12 and DHDS-13's phone matrix put mobile *at*
  the reference bar. The remaining phone debt is one P2 (taken below) and a set of
  P3 offline slices. Not a programme.
- **Cross-module AI intelligence** — the AI layer is a proposer by construction
  ([ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture)),
  and ROADMAP_V2's own AI-03 entry states the precondition: *"an AI summary over
  reflection data the product cannot yet derive itself would be unverifiable by
  the owner."* V2.4 is what makes that data exist. AI over it is a later
  programme, not this one.
- **Onboarding a sparse workspace** — the other DHDS-13 *"Below"*. Genuine, and
  partly *caused* by observation 2 above: a new owner meets zeroes because the
  surfaces that could speak without numbers do not. FOLLOW-02 removes one of those
  zeroes; a first-run programme is deferred whole.

---

## NOW

Four items. Two bounded gates, then the two features the gates exist to protect.

**Three of the four are delivered.** V2.4-GATE-02, FOLLOW-01 and FOLLOW-02 are
☑; V2.4-GATE-01 stays ☐ with GREEN delivered and RECOVERABLE and RELEASED
owner-blocked on secrets the repository cannot supply. With FOLLOW-02 shipped,
**the planned V2.4 product sequence is complete** apart from that gate's two
owner-held halves. What V2.5 should be is a decision, not a continuation —
**and that decision is now taken: [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md), the
Steering programme, accepted as
[ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question).**
It does not re-adopt this gate's owner-held halves; they remain here, and they
remain the standing preconditions for any future production release.

### ☐ V2.4-GATE-01 — Recoverable, green, released

**Not a feature. The pass that makes "daily driver" literally true before V2.4
adds anything to it.**

- **User problem.** The owner's entire life sits in a system whose scheduled
  disaster-recovery copy has never been produced, whose test gate fails on nine of
  twelve partitions so a real regression is indistinguishable from the standing
  red, and whose last recorded release is `2.0.1` — three programmes and roughly
  twenty migrations ago, on the only production schema state anyone has written
  down.
- **Outcome.** A backup exists and has been restored in a rehearsal; the
  twelve-partition gate is green on `main`; production is verified, migrated, and
  running a release whose notes name what shipped.
- **The evidence, measured on `main`.**
  - **The nightly backup has never run to completion.** `.github/workflows/production-backup.yml`
    fails at its own first guard — *"Refuse to run without an encryption key"* —
    because `BACKUP_ENCRYPTION_PASSPHRASE` is not set in the protected `production`
    GitHub environment. Runs **17, 18, 19 and 20** (2026-08-18 → 2026-08-21) all
    failed identically. The workflow is behaving **correctly**: it fails *before*
    reading the database, so no plaintext dump is ever created. The consequence is
    simply that no disaster-recovery copy exists. Raised as
    [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-scheduled-production-backup-has-never-produced-a-backup-because-the-encryption-key-is-not-configured--p1).
  - **The gate is red on `main`.** CI run [`32482182727`](https://github.com/acedaly/DalyHub-V2/actions/runs/32482182727)
    at `b31323c`: **Scope, Static, Unit and Build all green; nine of twelve E2E
    partitions failed** (p02–p10), p01/p11/p12 green, CI Gate failed. The named red
    set is [DEBT-179](../product/PRODUCT_DEBT.md#-debt-179--the-e2e-gate-is-red-on-main-19-tests-across-8-partitions-plus-a-network-dependent-unit-test--p2--resolved-2026-08-23-v24-gate-01)
    — whose dominant signature DHDS-13 **root-caused** (a completed row is filed
    into a closed `<details>`, so the re-assertion resolves to nothing), fixing
    three of nineteen and leaving sixteen unchecked against that mechanism —
    together with [DEBT-173](../product/PRODUCT_DEBT.md#-debt-173--e2e-specs-assert-against-the-shared-workspaces-accumulated-state-so-re-ordering-the-suite-changes-what-they-see--p2)
    (accumulated fixture state) and [DEBT-180](../product/PRODUCT_DEBT.md#-debt-180--the-row-reveal-contract-is-unclickable-by-automation-the-hidden-triggers-own-wrapper-wins-the-hit-test--p3--resolved-2026-08-23-v24-gate-01).
    [DEBT-158](../product/PRODUCT_DEBT.md#-debt-158--a-goal-measurement-journey-has-never-once-run-because-nothing-in-the-seed-is-measurable--p2--resolved-2026-08-23-v24-gate-01)
    is the same problem inverted: a journey that reports green by never executing.
  - **The release train stopped.** `package.json` is `2.0.1`; `docs/release/`
    holds notes for V2 and V2.0.1 and nothing since; `DEPLOYMENT.md`'s last
    recorded production schema — quoted by DEBT-84 and since deliberately removed
    from that document, because *"a repository cannot know what a database has
    applied"* — was `0001`–`0025`, and the committed sequence now runs to `0047`
    (47 numbers over 49 files: `0013` and `0039` are each used twice, the first of
    which is [DEBT-40](../product/PRODUCT_DEBT.md#-debt-40--two-migrations-share-the-number-0013--p3--resolved-2026-08-25));
    [DEBT-139](../product/PRODUCT_DEBT.md#-debt-139--migration-0042-has-not-been-applied-and-no-production-backup-has-been-taken--p1)
    records migration `0042` as unapplied to production with no pre-migration
    backup taken, and five more have landed behind it;
    [DEBT-84](../product/PRODUCT_DEBT.md#-debt-84--documentation-drift-production-state-theme-count-identity-status--p3--documentation-corrected-2026-08-11-production-still-unverified)
    is ◐ precisely because production state has never been stated with evidence.
    **The repository cannot know what production runs** — `pnpm run db:production:list`
    and `pnpm run verify:production` are the only honest answers, and both need
    credentials the owner holds.
- **Why it belongs in this programme.** Follow-through starts with the product's
  own. Everything the two features below claim is *measured by* that gate and
  *delivered to* that production; a programme about accounting for commitments
  cannot open on a system that cannot account for its own.
- **Major dependencies.** Cloudflare credentials and the `production` GitHub
  environment — **owner-held, and the repository cannot supply them**. The backup
  half is independent of the other two and should be done first, because it needs
  no green gate. DHDS-13's root-caused signature is the starting point for the
  sixteen.
- **Explicit non-goals.** No new test framework and no E2E split redesign beyond
  regenerating `e2e/partitions.json` from a real measurement. **No test skipped,
  disabled, quarantined, weakened or deleted to reach green, and no timeout
  raised.** No change to what DalyHub's Restore reads. No feature work. Not
  [DEBT-157](../product/PRODUCT_DEBT.md#-debt-157--the-e2e-partition-durations-can-only-be-refreshed-from-a-failing-run--p1-re-rated-2026-08-20-mechanism-closed-by-harden-06a-the-same-day-held-open-for-its-confirming-run)'s
  mechanism, which HARDEN-06A already closed and which this item simply confirms
  by producing a green run.
- **Schema / API changes.** **None.**
- **Canonical authorities that must not move.** `scripts/production-d1.mjs` and
  `scripts/production-backup.mjs` remain the one export/encrypt pipeline —
  `workflow_dispatch` and `schedule` take identical steps, and a manual run takes
  them too. The owner-initiated `DalyHubWorkspaceSnapshotV1` archive remains the
  **canonical DalyHub backup**; the D1 dump remains the *infrastructure* copy and
  is never executed through the application. `e2e/partitions.json` remains the one
  split authority.
- **One decision this item must take and record.** The release number. The
  programmes are named V2.1…V2.4 and the shipped code contains all of them, so a
  single release must either carry `2.4.0` with notes enumerating 2.1–2.3's
  content, or ship as a sequence. Pick one, state why in the release notes, and do
  not leave `package.json` disagreeing with `docs/release/`.
- **Measurable acceptance criteria.**
  1. A scheduled `Production D1 backup` run **completes successfully**, its own
     recovery proof passes, and the artefact decrypts with the off-GitHub key.
     `pnpm run backup:verify` and `pnpm run db:production:backup:list` both report
     a non-zero result.
  2. A **restore rehearsal is recorded**: the encrypted dump is decrypted,
     restored into a scratch D1, and the application boots and serves a record
     against it. Written up in [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md).
  3. The twelve-partition CI gate is **green on `main` for two consecutive
     pushes**, with every previously-red test passing against both a freshly
     seeded database and the accumulated state a full gate run produces — the
     closing condition DEBT-179 already states.
  4. `e2e/spine-workspaces.spec.ts`'s measurement journey **executes** (no
     `test.skip` path taken), owning its own measurable Goal in the manner of
     `e2e/habits-fixtures.ts`, and the specs sharing its partition are unaffected.
  5. `pnpm run db:production:list` reports **no pending migration**;
     `pnpm run verify:production` is run **with credentials** and its output is
     recorded in a release checklist under `docs/release/`.
  6. `package.json`, the release notes and the running release **agree**, and
     `docs/development/DEPLOYMENT.md` still states no migration number of its own.
- **Closes.** DEBT-198, DEBT-139, DEBT-179, DEBT-173, DEBT-158, DEBT-180.
  **Advances.** DEBT-84 (to ☑ if `verify:production` is recorded), DEBT-157,
  DEBT-125.
- **Progress, 2026-08-23 — GREEN is delivered; RECOVERABLE and RELEASED are
  owner-blocked. The item stays ☐.** Two of the three claims in its own title are
  not met, and a partial pass is not a tick. Implementation record:
  [`V2_4_GATE_01_RECOVERABLE_GREEN_RELEASED_2026_08.md`](../product/V2_4_GATE_01_RECOVERABLE_GREEN_RELEASED_2026_08.md).

  | # | Acceptance criterion | State |
  | --- | --- | --- |
  | 1 | A scheduled backup completes; `backup:verify` and `db:production:backup:list` non-zero | **NOT MET** — run 21 failed at the same guard as 10–20; `BACKUP_ENCRYPTION_PASSPHRASE` is still unset ([DEBT-198](../product/PRODUCT_DEBT.md)) |
  | 2 | A restore rehearsal is recorded | **MET for the mechanism** (PR #222, `BACKUP_AND_RESTORE.md` § 5.5) — against a scratch database with the committed schema, because no artefact of the owner's data exists to rehearse against |
  | 3 | Twelve-partition gate green on `main` for two consecutive pushes, fresh **and** accumulated | **ONE OF TWO on `main`** — the merge of #223 produced the first ([`32685626437`](https://github.com/acedaly/DalyHub-V2/actions/runs/32685626437) at `2f94279`, 17/17 jobs green); the second needs the next push to `main`. Fresh **and** accumulated were both met on the branch; see below |
  | 4 | `spine-workspaces.spec.ts`'s measurement journey executes, owning its own Goal | **MET** — [DEBT-158](../product/PRODUCT_DEBT.md) closed; verified as *executed* from the run's artefacts, not merely as passing |
  | 5 | `db:production:list` reports no pending migration; `verify:production` run with credentials | **NOT MET** — `wrangler whoami` reports not authenticated; the verifier's PARTIALLY VERIFIED output is recorded verbatim instead |
  | 6 | `package.json`, release notes and the running release agree; `DEPLOYMENT.md` states no migration number | **MET except "the running release"**, which cannot be read without credentials |

  **On criterion 3.** Two consecutive green pushes —
  [`32630251479`](https://github.com/acedaly/DalyHub-V2/actions/runs/32630251479)
  at `cf15d17` and
  [`32631318116`](https://github.com/acedaly/DalyHub-V2/actions/runs/32631318116)
  at `b55fe75`, 17/17 checks each, neither publishing a single failure artefact.
  An earlier green pair was superseded deliberately: it satisfied the letter of
  the criterion and the next run falsified its spirit, so the record rests on
  the pair that FOLLOWS the six diagnosed races rather than the one that preceded
  the last of them. The fullest single measurement remains run
  [`32605964327`](https://github.com/acedaly/DalyHub-V2/actions/runs/32605964327),
  green across all twelve partitions with **1911 tests collected, 1911 executed,
  0 failed, 0 flaky**, read from the partitions' own `e2e-results-*` artefacts. From **55 failures across 10 partitions plus 5 tests
  that never executed**, measured on `main` at `054b98f` — not the "19 tests
  across 8 partitions" DEBT-179 carried, which was three programmes stale. The
  non-goals held: nothing skipped, disabled, quarantined, weakened or deleted,
  no retry added, and one `test.setTimeout` raised on a spec measured at 38.2 s
  of real work under a 30 s default, stated with its measurement. `e2e/partitions.json`
  was regenerated from that green run and from nothing else — all 117 spec files
  now read `ci:32605964327`, `PARTITION_COUNT` unchanged at 12, heaviest
  partition 16.6 min against a 16.7 min derived ceiling.
  **The clause this does not satisfy is `main`.** A pull-request run is not a
  `main` run, and two consecutive green pushes on a branch are not two on `main`
  — which only merging can produce.
- **Also closed, from outside the "Closes" list.**
  [DEBT-196](../product/PRODUCT_DEBT.md) — Weekly Planning's phone tier — because
  two of the 55 failures were its assertions, both correct about the product,
  and GATE-01's own terms forbid weakening an assertion to reach green.
  **V2.4-GATE-02 should strike that criterion from its acceptance**; its other
  subjects were left untouched.
- **Also raised.** [DEBT-200](../product/PRODUCT_DEBT.md) (three more journeys
  that report green by never running) and [DEBT-201](../product/PRODUCT_DEBT.md)
  (both record pickers go blind at a workspace's 500th entity — found because
  three specs failed on a developer machine and in no CI run, and the difference
  turned out to be the database rather than the code).
- **Progress, 2026-08-24 — the operational pass ran, and stopped at its first
  safety boundary. The item stays ☐.** The sequence *backup → verify → migrate →
  deploy → verify* was attempted in order and got no further than its first step,
  because the prerequisite that step needs is still owner-held. Nothing was
  deployed, nothing was migrated, and no production data was read.

  | # | Criterion | Change since 2026-08-23 |
  | --- | --- | --- |
  | 1 | A backup completes; `backup:verify` and `db:production:backup:list` non-zero | **none** — `BACKUP_ENCRYPTION_PASSPHRASE` is still unset. Run **22** ([`32652803588`](https://github.com/acedaly/DalyHub-V2/actions/runs/32652803588), 2026-08-23T16:48Z) failed at the same guard as 10–21 |
  | 3 | Green on `main` for two consecutive pushes | **ADVANCED — one of the two now exists**, and it is the first complete gate run this item has ever had on `main` rather than on a branch |
  | 5 | `db:production:list` clean; `verify:production` run with credentials | **none** — still `PARTIALLY VERIFIED`; this environment holds no Cloudflare credentials |

  **The first `main` run, measured.** [`32685626437`](https://github.com/acedaly/DalyHub-V2/actions/runs/32685626437)
  at `2f94279`, `push` to `main`, **17 of 17 jobs `success`** — Scope, Static,
  Build, Unit, E2E p01…p12 and CI Gate. Every partition's *"Upload Playwright
  report"* and *"Upload Playwright traces & failure screenshots"* step is
  `skipped`, which is what a partition with no failure produces; the run's
  thirteen artefacts are the twelve `e2e-results-p01…p12` and the production
  build, and **not one failure artefact**. The second half of the criterion is
  the NEXT push to `main`: `ci.yml` triggers on `push: [main]` and
  `pull_request` and has no `workflow_dispatch`, so a second qualifying run
  cannot be dispatched — and adding a dispatch trigger to the gate in order to
  manufacture one would be the same category of move this item's non-goals
  forbid.

  **Why the sequence stopped where it did.** The boundary is criterion 1, and it
  is a hard block rather than a slow step: no production migration may be applied
  until a real backup exists ([DEBT-198](../product/PRODUCT_DEBT.md),
  [DEBT-139](../product/PRODUCT_DEBT.md)). Beyond it every remaining step is
  blocked a second time over — the environment has no `.production.env`, no
  `CLOUDFLARE_API_TOKEN`, and `wrangler whoami` reports not authenticated, so
  `db:production:list`, `deploy:production:preflight`, `db:production:apply`,
  `deploy:production` and the credentialed half of `verify:production` all refuse
  at their own guards. **DEBT-199's remote half was not attempted**, because
  probing it needs those same credentials plus a real decrypted artefact; no
  scratch D1 was created, and nothing was inferred about the remote import path.
  The guard was not weakened, no key was invented, and no non-canonical export
  path was improvised to make a checklist look finished. The one owner action
  that unblocks all of it is in
  [`BACKUP_AND_RESTORE.md` § "Setting it for the first time"](../development/BACKUP_AND_RESTORE.md).
- **Progress, 2026-08-24 (second operational pass) — production's schema state
  is MEASURED at last, criterion 3 went BACKWARDS, and the item stays ☐.** The
  same sequence was run again from an environment that had one thing the last
  one did not: a live, owner-authorised Cloudflare API connection — one whose
  credential is **write-capable**, and which this pass deliberately used
  **read-only**. It stopped at the same first boundary, but it no longer stopped
  *blind*.

  | # | Criterion | Change since the first pass |
  | --- | --- | --- |
  | 1 | A backup completes; `backup:verify` and `db:production:backup:list` non-zero | **none, and it could not even be TESTED.** The `production` environment's secrets cannot be read through this session, and `workflow_dispatch` returns **403 `Resource not accessible by integration`** — so the one empirical test was unavailable. The pass ran at ~09:20 UTC, before that day's 16:30 UTC schedule — and **run 23** ([`32754291594`](https://github.com/acedaly/DalyHub-V2/actions/runs/32754291594), 17:02Z) then failed at the same guard with the env line empty, so the question the pass left open is answered: **the secret is still not set**, 23 runs in |
  | 3 | Green on `main` for two consecutive pushes | **REGRESSED — the consecutive pair is broken.** Run [`32710624636`](https://github.com/acedaly/DalyHub-V2/actions/runs/32710624636) at `f2b504b` is **red**, so `main` now reads green (`2f94279`) then red. The count restarts |
  | 5 | `db:production:list` clean; `verify:production` run with credentials | **still NOT MET as written** — both still refuse at their own guards. But the underlying FACT is now measured: **zero pending migrations** |

  **The finding this pass exists for.** Production's `d1_migrations` ledger was
  read directly: **49 applied, `0001`–`0047`, an exact set match with the 49
  committed files — nothing pending, nothing orphaned**, `0047` applied
  2026-08-20 09:32:44, 52 tables. **[DEBT-139](../product/PRODUCT_DEBT.md)'s
  headline is false, and has been since 2026-08-16**, when `0042` was applied.
  It was read with a single read-only `SELECT` over an owner-authorised
  Cloudflare API connection — **not** `pnpm run db:production:list`, which still
  refuses, so **criterion 5 is not satisfied by it**; no user data was read.
  Recorded in
  [`RELEASE_CHECKLIST_V2_4_0.md` § 6](../release/RELEASE_CHECKLIST_V2_4_0.md).
  The consequence is the opposite of reassuring: **six migrations reached
  production with no disaster-recovery copy behind any of them**, which is
  [DEBT-198](../product/PRODUCT_DEBT.md)'s risk realised rather than avoided.
  `DEPLOYMENT.md` still states no migration number of its own.

  **Why criterion 3 went backwards, and why it is not the suite's fault.** Run
  `32710624636`'s **E2E p07 never started**: `actions/setup-node`'s corepack
  download of `pnpm-10.33.0.tgz` crashed 11 seconds in on a truncated response,
  so `Install dependencies` was skipped and Playwright never ran. The gate
  behaved **correctly** — `e2e-partition-summary.mjs` refused to read a missing
  `results.json` as an absence of failures. The **eleven partitions that did run
  executed 1766 tests with 0 failed, 0 flaky and 2 skipped**, and **no partition
  published a failure artefact**. Raised as
  [DEBT-204](../product/PRODUCT_DEBT.md), and deliberately **not fixed here**:
  it edits the machinery every job depends on, which is the wrong change to make
  inside a pass that touches nothing executable. The commit that lost the run
  changed **documentation only**.

  **What was NOT done, restated because this pass could have.** The Cloudflare
  connection could create a throwaway D1 and could read production. It was
  **not** used to export the database — that would have put an unencrypted copy
  of the owner's entire life in an ephemeral container through an unaudited
  path, trading the one canonical pipeline for a checklist tick. **No migration
  was applied** (none was pending). **Nothing was deployed** — the preflight
  refuses, naming five missing values, and none was fabricated. **No throwaway
  database was created**: [DEBT-199](../product/PRODUCT_DEBT.md)'s question is
  about `wrangler d1 execute --remote --file`, and the connection available here
  exposes a *query* API, which is a third code path that would have answered
  nothing. The guard was not weakened and no passphrase was invented.

---

- **Progress, 2026-08-25 — the [all-open-debt pass](../product/PRODUCT_DEBT_CLOSURE_2026_08.md) removed two things that stand between this item and criterion 3, and moved no criterion.** It is not a GATE-01 pass and claims none of its acceptance; what it did is repair two mechanisms whose failures had each already cost this item a run.
  - **A gate run lost to a package download cannot happen the same way again** ([DEBT-204](../product/PRODUCT_DEBT.md), ◐). Run `32710624636` — the candidate SECOND green push for criterion 3 — lost E2E p07 eleven seconds in, on a documentation-only commit, when corepack's fetch of `pnpm-10.33.0.tgz` was truncated mid-stream. pnpm is now materialised **before** `actions/setup-node`'s cache probe, with a bounded, loud retry; the ordering is the substance, since by then pnpm is on disk and that probe cannot reach the network at all. The entry stays ◐ because its own condition is a `main` run in which no job fails before `Install dependencies`, and only merging produces one.
  - **Three journeys that reported green by never running now execute** ([DEBT-200](../product/PRODUCT_DEBT.md), ◐), which is the same class of problem GATE-01 raised the entry for. One of the three had its cause recorded WRONG — the seed holds 119 active Tasks against a page size of 50; the blocker was a grouped view drawing no "Load more" at all — so a future agent would have built a fixture and changed nothing.
  - **Criterion 3 is unmoved and is still one `main` run short.** Nothing here was run on `main`, and nothing here claims to have been. Criteria 1, 2, 4 and 5 are untouched: no backup exists, no migration was applied, no production data was read, and `wrangler whoami` still reports not authenticated.

### ☑ V2.4-GATE-02 — Honest signals on a task row, and one day on a phone — **DELIVERED 2026-08-25**

**A bounded product decision DHDS-13 correctly refused to take inside a quality
gate, and the reason the product closed at B rather than A.**

- **User problem.** Three ways a row currently says something untrue about itself:
  1. In Weekly Planning's *"Still to place"* queue, every row draws **a selection
     checkbox and a completion checkbox eight pixels apart**, unlabelled as a pair.
     `task-signals.css` states the invariant this breaks in its own words —
     *"A row shows one of them at rest."* **Ticking the wrong one completes work
     the owner meant to schedule**, on the surface whose only purpose is
     scheduling ([DEBT-194](../product/PRODUCT_DEBT.md#-debt-194--the-plan-queue-draws-a-selection-control-and-a-completion-control-side-by-side-which-the-design-systems-own-invariant-forbids--p2--resolved-2026-08-25-v24-gate-02),
     and the same defect raised earlier at a lower severity as
     [DEBT-164](../product/PRODUCT_DEBT.md#-debt-164--a-planning-queue-row-carries-two-checkboxes--p3--resolved-2026-08-25-v24-gate-02-with-debt-194)).
  2. A **cancelled** Task with a passed due date paints that date in the overdue
     colour, beside its own *"Cancelled"* pill — the product telling the owner
     that work nobody is going to do is late, which is exactly the manufactured
     urgency [`AGENTS.md` §2.4](../../AGENTS.md#2-product-philosophy) rules out
     ([DEBT-197](../product/PRODUCT_DEBT.md#-debt-197--a-task-row-paints-a-cancelled-tasks-passed-due-date-in-the-overdue-colour--p3--resolved-2026-08-25-v24-gate-02)).
  3. Below the phone tier `/plan` draws **two days where its own tier says one**,
     so the day rail reports a selected day and the page shows two
     ([DEBT-196](../product/PRODUCT_DEBT.md#-debt-196--weekly-planning-draws-two-days-at-phone-width-where-its-own-tier-says-one--p2--resolved-2026-08-23-v24-gate-01);
     `plan-responsive.spec.ts` :100 and :194 already assert it and already fail).
- **Outcome.** A planning row shows one control at rest, like every other row in
  the product, with placement as an act the row states rather than a checkbox that
  competes with completion. One answer, product-wide, to *"is this date late?"*.
  One day on a phone, and it is the one the rail says is selected.
- **Why it belongs in this programme.** DHDS-13 §15 records why it left DEBT-194
  open: *"every available correction changes what the queue does […] a quality
  gate is the wrong place to decide how a flagship surface works."* A roadmap item
  is the right place. And FOLLOW-01 puts **more** weight on the Plan queue — it
  must not be built on a surface that can complete work by accident.
- **Major dependencies.** V2.4-GATE-01, so the fix's own assertions mean something
  on a gate that can fail honestly. Touches
  [DEBT-180](../product/PRODUCT_DEBT.md#-debt-180--the-row-reveal-contract-is-unclickable-by-automation-the-hidden-triggers-own-wrapper-wins-the-hit-test--p3--resolved-2026-08-23-v24-gate-01)
  if placement moves into the row's overflow, which GATE-01 will already have
  settled.
- **Explicit non-goals.** No Plan redesign, no new composition, no drag-and-drop
  (DHDS-11's six questions are unchanged, and a planning queue has no stored
  order). No new mutation authority on `/plan`. Not the six-columns-at-1280
  question ([DEBT-162](../product/PRODUCT_DEBT.md#-debt-162--the-six-column-planning-board-needs-a-1440px-viewport--p3)),
  not the Sunday-start wrap ([DEBT-163](../product/PRODUCT_DEBT.md#-debt-163--a-sunday-start-week-draws-seven-board-columns-and-wraps-the-seventh--p3)),
  and not the board's vertical proportion (DHDS-13 P3-5). No new colour and no new
  display state.
- **Schema / API changes.** **None.** Placement continues to leave through
  `POST /tasks/bulk` and `POST /tasks/:id`.
- **Canonical authorities that must not move.** `useTaskSurfaceActions` and the
  canonical Task posters remain the **only** mutation path — `/plan` has no action
  of its own and gains none. `task-signals.css`'s *"a row shows one of them at
  rest"* remains the invariant, and the fix satisfies it rather than amending it.
  The kernel's `open`-scope definition of commitment is the one answer to whether
  a Task is still owed; `InlineTaskDate` must not grow a second one.
- **Measurable acceptance criteria.**
  1. **No task row anywhere in the product renders a selection control and a
     completion control simultaneously at rest** — asserted over the rendered row
     on `/plan`, `/tasks`, `/today` and a Project's Tasks tab, not by inspection of
     one screen.
  2. Both acts — place on a day, complete — remain reachable **by keyboard and by
     screen reader**, with distinct accessible names, asserted;
     `plan-weekly-planning.spec.ts` still proves both.
  3. A **cancelled, completed or Someday/Maybe** Task with a passed due date draws
     its date in the ordinary metadata ramp on **every** surface that renders it —
     asserted by reading the **painted colour**, not the class name — while a live
     overdue Task is unchanged.
  4. `plan-responsive.spec.ts` :100 and :194 pass at **100% and 200% zoom**:
     exactly one day section below the phone tier, and it is the rail's selected
     day.
  5. MEASURED at 320 / 360 / 375 / 393 / 430 and at 1280 / 1440, in **both
     appearances**: no horizontal document overflow, and 44px hit areas under a
     coarse pointer. `axe` clean with no rule disabled.
- **Closes.** DEBT-194, DEBT-164, DEBT-196, DEBT-197.
- **DELIVERED 2026-08-25**, and it closed one more than it set out to. Record:
  [`V2_4_GATE_02_HONEST_TASK_SIGNALS_2026_08.md`](../product/V2_4_GATE_02_HONEST_TASK_SIGNALS_2026_08.md).

  **The decision, which is what this item was actually for.** A Task row draws
  **one** checkbox-like control, and which one it is depends on an explicit
  selection MODE: at rest it is completion, in the mode the selection control
  *replaces* it in the same box. That is not an invention — it is the grammar
  `/tasks` has used since TASKS-06, and the queue simply never had a mode (its
  state was a bare `Set<string>`, so it was permanently in one). The reducer moved
  to `app/shared/task-record/task-selection.ts` so both surfaces share one model
  rather than copying it; `/tasks` is byte-identical across the move. Entering is
  deliberate (a "Select tasks" button, or the product's existing touch hold);
  leaving is the same button, the bar's "Done", **Escape**, or a completed
  placement. Neither capability leaves the surface: at rest placement is in the
  row's overflow, one item per day of the week; in the mode completion is.

  **The semantic answer.** `isTaskStillOwed` / `isTaskOutOfCommitment` in the
  kernel, over the triple the `open` scope already excluded — completed, cancelled
  and Someday/Maybe, with waiting and on hold deliberately kept because blocked is
  not abandoned. Carried on the shared projection as `stillOwed`; `InlineTaskDate`
  is handed the ANSWER and never the facts, which is exactly what DEBT-197's entry
  said must not be got wrong. `taskUrgency`'s input widened to REQUIRE the
  commitment facts, so the type system found every consumer.

  **Acceptance, criterion by criterion.**
  1. **Met.** No task row anywhere renders both controls at rest — asserted over
     the rendered row on `/plan`, `/tasks`, `/today` and a Project's Tasks tab
     (the last over the `Card` anatomy, so the claim is about the product), at
     rest **and** in selection mode. MEASURED at nine widths in both appearances:
     `min = max = 1` in every pass.
  2. **Met.** Both acts by keyboard and by screen reader, with distinct names
     (`Complete <title>` vs `Select <title> to place on a day`) and never two at
     once. `plan-weekly-planning.spec.ts` still proves both.
  3. **Met.** A cancelled, completed or Someday/Maybe Task with a passed due date
     draws its date in the ordinary metadata ramp on every surface that renders
     it — asserted by reading the **painted colour** in both appearances, over
     fixtures the spec owns, on `/tasks` and a Project's Tasks tab. A live overdue
     Task is unchanged; so is an **on hold** one, which is the control case.
  4. **Met, and NOT re-taken.** DEBT-196's own entry asked this item to strike the
     criterion rather than re-litigate a closed measurement, and it did:
     `plan-responsive.spec.ts` was run on the starting `main` before any change
     (16/16, including both assertions at 100% and 200% zoom) and again after.
     Verified, not rebuilt.
  5. **Met.** MEASURED from the live DOM at 320/360/375/393/430 and
     820/900/1280/1440, in both appearances, at rest and in selection: no
     horizontal document overflow, hit areas at the coarse-pointer floor, no
     newly clipped signal, and the row's geometry **identical** across the mode
     change. `axe` clean with no rule disabled, including over the queue in the
     mode — a state no existing scan could see.

  **Also closed: [DEBT-193](../product/PRODUCT_DEBT.md#-debt-193--a-hugging-metadata-label-paints-4-narrower-than-its-own-content-so-a-phone-truncates-a-name-that-fits--p3--resolved-2026-08-25-v24-gate-02).**
  It was not in this item's acceptance and PR #226 assigned it here; it is closed
  because its recorded diagnosis turned out to be **wrong**. It is not an
  intrinsic-sizing quirk needing the hugging chain restructured: `task-list.css`
  has always declared `margin-inline: 0` on a cell's inline-edit trigger, and that
  rule lost the cascade to the shared `[data-presentation="meta"]` rule by one
  compound selector. Making the existing rule apply moved the entry's own numbers
  (94.7 → 98.7 against a 99px need) with no desktop regression.

  **Non-goals held.** No Plan redesign, no new composition, no drag-and-drop, no
  new mutation authority on `/plan`, no schema change, no new API, no new
  dependency, no new Task status, no new colour and no new display state.
  [DEBT-162](../product/PRODUCT_DEBT.md#-debt-162--the-six-column-planning-board-needs-a-1440px-viewport--p3)
  and [DEBT-163](../product/PRODUCT_DEBT.md#-debt-163--a-sunday-start-week-draws-seven-board-columns-and-wraps-the-seventh--p3)
  were re-read, re-verified as real, and stay deferred with their reasons.
  DEBT-128/DEBT-175 stay open: the semantic fix reached the Project tab through
  the shared date control and the shared urgency evaluator, so no third overdue
  implementation was created and the row convergence was not needed.

  **The full gate, and the three failures it produced.** Every repository check is
  green, and the complete product E2E suite was run in one sequential process
  because this changes core Task interaction: **1,924 passed, 3 failed, 1 skipped,
  in 3.7 hours** — with no skip, no quarantine and no weakened assertion. Two of
  the three are [DEBT-173](../product/PRODUCT_DEBT.md) (accumulated shared state),
  now measured at the scale of a whole run: **one pass leaks 217 records**, taking
  the workspace from the seed's 325 to 564 — past the horizon DEBT-201 was raised
  for, from a clean start, in one run. Wiped, reseeded, both green. The third was
  real and is fixed: a date fuse in the TASKS-12 recurrence journeys that had been
  **permanently** red since 2026-08-24, on a spec this branch does not otherwise
  touch. **1,927 of 1,927 green once the environment condition is removed.**

  **One thing this item spent that is worth naming.** The E2E gate is now at 191.3
  min of measured test time against a 16.7 min per-partition ceiling, and the new
  coverage did not fit until the spec was made genuinely cheaper (page loads and a
  duplicate axe scan removed — never an assertion). `PARTITION_COUNT` was not
  raised, because 13 is past the runner pool's measured ceiling. **The next item
  that adds E2E coverage will have to answer that question rather than shave
  seconds**, and `e2e/partitions.json` says so in as many words.

---

### ☑ FOLLOW-01 — Did the week hold? — **DELIVERED 2026-08-26**

**One derivation, two consumers: the week you committed to, and the week you had.**

- **User problem.** DalyHub asks the owner to commit to a week and never mentions
  it again. A Task planned for Wednesday and done on Saturday, a Task moved four
  times, and a Task that was never placed at all are all invisible after the fact —
  so a week that quietly failed looks exactly like one that worked, and the next
  week's plan is made with no memory of the last one. Routines are equally silent:
  the Weekly Review says nothing at all about habit consistency.
- **Outcome.** One shared, bounded derivation over the Activity stream, with two
  consumers. `/plan` states the current week's own position. The weekly Review's
  existing insight set gains an **exact** account of the period just past —
  planned, kept on the planned day, moved, cleared, never placed — beside habit
  consistency for the same period. Facts in words, with the records one link away.
  **No score.**
- **Why it belongs in this programme.** It is the missing return arrow of the loop
  V2.3 drew. `REVIEW → PLAN` exists; `EXECUTE → REVIEW` about the *plan* does not.
  Everything it needs is already written down: `task.planned`,
  `task.rescheduled`, `task.plan_cleared` and `task.completed` are existing kernel
  activity types with existing indexes, and REVIEW-03 already derives exact period
  facts from that stream.
- **Major dependencies.** V2.4-GATE-02 (the queue this leans on). REVIEW-03's
  insight surface and its versioned snapshot. HABITS-01's effective-dated
  schedules, which are what make an expectation sum across a version chain
  truthful — the reason DEBT-156 was deferred rather than shipped.
- **Explicit non-goals.** **No adherence score, no percentage-of-plan grade, no
  streak, no chain, no productivity number and no ranking of weeks against each
  other.** No AI. No automatic rescheduling, no "catch up" proposal, no
  notification. No new Analytics module and no new chart dependency. No time
  tracking, estimates or capacity. No calendar write-back. No new metric added
  merely to populate a panel — REVIEW-03's own rule, restated.
- **Schema / API changes.** **None expected.** The events exist and the Review
  already stores its one period artefact. If a bounded query genuinely cannot be
  written without a new column, that is a finding to record and put to a decision —
  **not a table to add quietly** ([ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)).
- **Canonical authorities that must not move.** The Task's `scheduled_date`
  remains **the plan** — there is no second planning record and no `plan_weeks`
  table. The Activity stream remains the historical record. REVIEW-03's insight
  snapshot remains the **only** stored period artefact. Habits' effective-dated
  schedule remains the expectation authority, and a Habit still generates no Task.
  The owner's calendar week (timezone + `firstDayOfWeek`) remains the one period
  definition, shared with Reviews.
- **Measurable acceptance criteria.**
  1. Against a **seeded week whose events are known**, every figure is exact:
     planned *N*, kept on the planned day *M*, moved *K* times, cleared *J*, never
     placed *L* — each asserted against the fixture, and each **drillable to the
     records behind it**.
  2. A Task planned for Wednesday and completed on Saturday is counted as
     **moved**, not as kept — asserted. A Task completed on its planned day after
     an earlier move is counted as kept *and* as having moved — the two are
     different questions and the wording says so.
  3. A week with **no plan at all** produces one honest sentence, never a
     zero-filled table. A period that is still running is never described as
     having failed to complete work it has not reached.
  4. HABITS-01's two unsayable sentences are **re-asserted on the new surface**:
     an unscheduled day is never described as a miss, and a future day is never
     described as incomplete.
  5. **Bounded by construction.** `/plan` gains **at most one** statement; the
     Review's period read stays inside its existing asserted query budget. Both
     carry a **flatness proof** — a fifteen-Task week costs what a three-Task week
     does — and every bound respects D1's **100 bound parameters per query**
     ceiling that TASKS-13 and UX-02 both found the hard way.
  6. Light and dark; 1440 / 1280 / 820 / 393 / 320; keyboard reach; accessible
     names on every control; no horizontal overflow at any width; `axe` clean in
     both appearances with no rule disabled. Any geometric claim is asserted by
     **reading the live box**, per DHDS-13's one rule.
- **Closes.** DEBT-156. **Narrows.** [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05).
- **DELIVERED 2026-08-26.** Record:
  [`V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md`](../product/V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md).

  **The starting state, reproduced on `main` at `d87315c`** against a week whose
  events were known. `/plan?week=-1` said *"7 planned"* about a week that had
  held **eight** committed Tasks: a Task done on its planned day and one done
  three days later were drawn identically; a Task moved Monday → Wednesday →
  Friday appeared on Friday as though it had always been there; and **four of
  nine outcomes were invisible entirely** — taken off the plan, moved out of the
  week, completed without a plan, and withdrawn the following Monday. The Review
  said nothing at all about the plan, and nothing about routines.

  **The derivation.** `app/kernel/activity-window/` — a named owner-local
  window, a bounded read over the append-only stream, and eight outcomes with
  the facts behind each: *done on the day planned · done later · done ahead ·
  still open (or still to come) · moved out · taken off the plan · no longer
  being done · done without being planned*, beside a **count** of reschedules
  that is never reduced to a boolean. Kept and moved are orthogonal, which is
  criterion 2 exactly: a Task moved on Tuesday and finished on its new Thursday
  is `kept` with `reschedules: 1`, and the words say both.

  **Causality is asserted, not assumed.** "Done later than planned" means the
  plan pointed at an earlier day AT THE MOMENT of completion, reconstructed
  forwards from events. A Task planned Monday, done Monday, and re-planned to
  Friday afterwards reads `kept`; an implementation judging against the Task's
  current date calls the same Task four days EARLY, and that is one of the four
  falsifiers run against the matrix.

  **Nothing was stored.** No table, no column, no index, no migration. The
  account is deliberately absent from REVIEW-03's snapshot, asserted by reading
  the stored row's text.

  **Acceptance, criterion by criterion.**
  1. **Met.** Every figure is exact against a seeded week whose events are known
     — planned, kept on the planned day, moved *K* times, cleared, never placed
     — proved at three levels, and each is drillable to the records behind it
     (every accounted Task is named with the dates its outcome was read from and
     linked to its record).
  2. **Met.** Planned Wednesday and completed Saturday is `completed_late`, not
     kept; completed on its planned day after an earlier move is `kept` **and**
     `reschedules: 1`, and the wording states both. Both are matrix rows.
  3. **Met.** A week with no plan produces ONE sentence and no disclosure at all
     — *"Nothing was planned for this week."*, or *"Nothing is planned for this
     week yet."* for a week that has not started. A running period counts
     `carriedAhead` separately from `carried`, so "still to come" can never be
     printed as "left unfinished".
  4. **Met.** HABITS-01's two unsayable sentences are structural rather than
     editorial: an unscheduled day contributes no expectation, and the window's
     upper bound is clamped to the owner's today.
  5. **Met.** `/plan` gains **one** statement (plus the disclosure grammar the
     Review-focus button beside it already uses). The window read is **exactly 2
     D1 statements**, asserted against real D1, with a flatness proof (a
     fifteen-Task week costs what a three-Task week does) and a bound-parameter
     assertion — the id set never crosses the process boundary, so both
     statements sit well inside D1's 100-parameter ceiling. The Review's budget
     moved 14 → **17** (and 19 in a workspace that practises a routine), stated
     and asserted rather than absorbed.
  6. **Met.** MEASURED from the live DOM at 320 / 393 / 1440, in both
     appearances, with the account OPEN — a state no existing scan could see. No
     horizontal overflow, 44px hit areas under a coarse pointer, `axe` clean with
     no rule disabled, on `/plan` and on the Review's Progress tab.

  **DEBT-156 closed.** The expectation sum across a version chain HABITS-01
  deferred turned out to **already exist** — `evaluateHabitConsistency` has always
  taken an arbitrary range and always summed the chain. What was missing was a
  caller, so one bounded read and one calm sentence closed it: *"2 of 3 scheduled
  check-ins. Across 1 routine. 1 scheduled day passed without one — days a
  routine did not ask for are not counted."* Two integers and their window, and
  **no percentage**, because a Review is the one surface where a ratio is a
  sentence away from a grade.

  **One information gap was found, and corrected at the cause.** TASKS-07's
  series move and skip shift an occurrence's planned day and recorded only the
  ANCHOR, so a due-anchored routine's plan moved with nothing in the stream
  saying it had. The event those paths already write now carries the pair it was
  missing, under the `changes.<field>` shape `entity.updated` has always used —
  no new event type, no schema change, no second planning authority. Reverting it
  makes the D1 test lose the Monday the occurrence was actually planned for.

  **The E2E budget question GATE-02 handed forward was answered with
  arithmetic, not with seconds.** The journey was sized first (6 tests over 11
  page loads → 4 over 8, page LOADS removed, never an assertion), MEASURED at
  43.2 s. Twelve partitions then derive a heaviest of 16.80 min against the 16.73
  min ceiling — and not by a rounding error, because the MEAN of the ten
  non-sliced partitions is already 1005.0 s. `PARTITION_COUNT` moved 12 → **13**
  (heaviest 15.31 min, 68% of `globalTimeout`); the ceiling was not touched. The
  cost is stated, and so is the better fix deliberately NOT taken:
  `responsive.spec.ts` strands **536 s — 8.9 minutes — of gate capacity** in two
  exclusive shards, which is why twelve looked exhausted, raised as
  [DEBT-205](../product/PRODUCT_DEBT.md) with its numbers.

  **Non-goals held.** No adherence score, no percentage of plan, no grade, no
  streak, no chain, no productivity number, no ranking of weeks. No AI, no
  automatic rescheduling, no "catch up" proposal, no notification. No Analytics
  module, no chart dependency. No time tracking, estimates or capacity. No
  calendar write-back. No new stored metric. GATE-02's row invariants are
  preserved rather than re-decided: the account adds no control to a Task row,
  no selection state, and no mutation path.

---

### ☑ FOLLOW-02 — Did the goals move? — **DELIVERED 2026-08-27**

**Every Goal states whether it moved — not only the ones carrying a number.**

- **User problem.** The Goal is the level at which DalyHub claims to show whether
  daily action serves stated intention, and for most Goals it shows nothing.
  Today's Goal progress panel renders **measurable Goals only**, so a workspace
  with Goals and no numeric targets reads *"No measurable Goals yet"* every
  morning — and the seeded workspace is exactly that shape. DHDS-13 counted
  **six Goals** in the workspace it audited; DEBT-158 measured the database the
  E2E gate drives and found `SELECT COUNT(*) FROM goal_details WHERE target_value
  IS NOT NULL` returning **0**. Where a Goal *does* have a project-contribution signal, that
  signal cannot move: *"40% of Projects complete"* reads the same on a Goal that
  gained two this month and one that has not moved since March.
- **Outcome.** Every Goal states whether it moved within a **named window**, in
  the same words on Today, the Goals collection and the Goal record, from **one**
  derivation. A measurable Goal keeps GOAL-02's arithmetic exactly as it is; a
  Goal without a target gains a truthful movement statement instead of a blank.
- **Why it belongs in this programme.** FOLLOW-01 answers *did the week hold?*;
  this answers *did it matter?*. They are the two halves of follow-through, and
  without this one the top two levels of the spine contribute nothing to the
  surface the owner opens every day. DEBT-78 has already prescribed the path and
  explicitly forbidden the shortcut: *"Do NOT add a snapshot table first — the
  Activity stream is already the historical record […] a bounded activity query
  over the goal's contributing project ids within the window gives the delta
  without any new write path or migration."*
- **Major dependencies.** FOLLOW-01, which builds the shared bounded-window
  derivation this reuses. GOAL-02's `evaluateGoalProgress` and AREA-03's
  `evaluateGoalAlignment`. V2.4-GATE-01, because a Goals change cannot claim
  end-to-end coverage while the measurement journey has never executed.
- **Explicit non-goals.** **No goal snapshot table.** No ring that empties, no
  streak, no score, no forecast beyond the pace GOAL-02 already computes and
  already refuses to fake. No AI goal coaching. **No Goal status vocabulary**
  ([DEBT-183](../product/PRODUCT_DEBT.md#-debt-183--a-goal-has-no-status-vocabulary-so-a-goals-condition-cannot-be-set--p3))
  and **no Goal→Area move**
  ([DEBT-184](../product/PRODUCT_DEBT.md#-debt-184--a-goals-area-cannot-be-changed-after-creation--p3)) —
  both are separate domain decisions and stay open. No change to the measurable
  Goal's one formula. No new entity type and no second Goal identity model.
- **Schema / API changes.** **None expected**, for the reason DEBT-78 states.
- **Canonical authorities that must not move.** `evaluateGoalProgress` remains the
  **one** place any Goal figure is computed — no route, component or repository
  computes its own. `~/shared/alignment` remains the one alignment derivation, so
  Today, the gallery and the record cannot disagree. `GoalRepository` stays
  **read-only**. `GoalDetailsRepository` remains the only mutation path for the
  Goal-owned fields. Project contribution stays derived and never cached.
- **Measurable acceptance criteria.**
  1. A Goal with **no target** states its movement in a named window with the
     count behind it, and **the identical sentence appears on Today, `/goals` and
     the Goal record** — asserted on all three, from one derivation.
  2. A Goal that has **not** moved says so in words. It is never given a `0%`, an
     empty ring, or a figure with no denominator.
  3. Today's Goal progress panel is **populated for a workspace whose Goals carry
     no target** — asserted against a seed with that shape, which is the shape the
     product's own seed already has.
  4. **No per-Goal query on the Today route.** The derivation is one bounded read
     for the whole set, with a flatness proof (six Goals cost what two do) and
     inside the 100-bound-parameter ceiling.
  5. A measurable Goal's existing figures are **unchanged** — GOAL-02's trio,
     chart, pace and its refusals to fake a number are untouched, asserted by the
     existing unit set passing without modification.
  6. Light and dark; the phone widths; keyboard; accessible names; `axe` clean
     with no rule disabled.
- **Closes.** DEBT-78. **Narrows.** [DEBT-120](../product/PRODUCT_DEBT.md#-debt-120--the-goals-gallery-is-ordered-by-alignment-not-by-outcome--p3).
  **Closes if the record adopts the shared section.**
  [DEBT-192](../product/PRODUCT_DEBT.md#-debt-192--a-goals-measurement-callbacks-are-declared-twice-on-the-record-and-on-the-workspace-pane--p3).
- **DELIVERED 2026-08-27.** Record:
  [`V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md`](../product/V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md).

  **The starting state, reproduced on `main` at `e1ba3e4`** against a week whose
  events were known, driving the real application. Today's Goal panel showed
  **two** Goals — both measurable — and said *"1 of 2 on track"*; **four of six
  Goals were absent entirely**, including the two that had genuinely moved that
  week and the two that had not. On `/goals`, a Goal that moved on Monday and a
  Goal whose last completion was four days before the week opened were drawn
  **identically**: `DalyHub V2 · No measurement`. And the Goal record's
  contribution evidence listed two Tasks, 24 August and 23 August, straddling
  the week boundary with nothing on the page distinguishing them — because
  ADR-040's window is an unbounded "most recent" against a fortnight rather than
  a named period. The gap was not a missing field; it was three surfaces
  answering a different question with no way for the owner to tell.

  **The derivation.** `app/kernel/alignment/goal-movement.ts` — the rules, pure
  and clock-free, re-exported through `~/shared/alignment` exactly where
  [ADR-110] decision 6 and DEBT-78 both said to put them — over one bounded read
  added to FOLLOW-01's own `ActivityWindowRepository`. **No second period
  machinery**: `ActivityWindow`, `ownerPeriodWindow` and the `future`/`running`/
  `closed` phase are consumed, not rebuilt, and there is no date helper inside
  Goals.

  **Movement is OUTCOME, and the refusals are the definition.** Five accepted
  events — a Task completed under a contributing Project, a contributing Project
  completed, a reading logged, a milestone completed, the Goal itself completed.
  Everything else is refused with a reason, and the most important refusal has
  its own real-D1 test: **renaming a Project is Activity and is not the Goal
  moving.** Also refused: creation (intent, not outcome), the whole planning
  vocabulary (FOLLOW-01's question), every `*.reopened` (an outcome being UNDONE
  is not forward movement), `goal.target_reached` (written by the same atomic
  write as the reading that caused it, so counting both counts one act twice),
  and `entity_link.created` for `project.advances_goal` (linking a Project
  changes what contributes, not what happened — and would credit a window with
  work finished outside it).

  **Nothing was stored.** No table, no column, no index, no migration, no schema
  or API change. Asserted rather than intended: a test counts the workspace's
  Activity rows before and after two movement reads and fails if the number
  moves.

  **Acceptance, criterion by criterion.**
  1. **Met.** A Goal with no target states its movement in a named window with
     the count behind it, and the identical sentence appears on Today, `/goals`
     (row and pane) and the Goal record — asserted from one stable machine key
     read on all three and compared as equal objects, rather than as three
     sentences that happen to match.
  2. **Met.** A Goal that has not moved says *"No movement yet this week."* and
     is never given a `0%`, an empty ring or a figure with no denominator —
     asserted, including the absence of any `progressbar` on an unmeasured tile.
  3. **Met.** Today's Goal panel is populated for a workspace whose Goals carry
     no target. The line that read *"No measurable Goals yet"* to a workspace
     holding six Goals is gone.
  4. **Met.** **No per-Goal query.** Exactly **two** D1 statements for a whole
     page, with a flatness proof in BOTH directions — six Goals cost what two
     do, and a Goal with twelve completions costs what one with a single
     completion does, because the aggregation happens in SQL. Bound parameters
     are `N + 1` and `N + 10`: 51 and 60 at a fifty-Goal page, against D1's
     ceiling of 100, because the id list is bound ONCE per statement through a
     `VALUES` CTE rather than three times.
  5. **Met.** GOAL-02's trio, chart, pace and refusals are untouched and its
     existing unit set passes without modification. The guarantee is structural:
     `GoalMovement` carries no status, no percentage, no target and no trend, so
     no surface can read a measurable answer off it — asserted by enumerating
     the result's own keys.
  6. **Met.** MEASURED from the live DOM at 320 / 393 / 1440 in both
     appearances, with the dark pass driven by the media query rather than the
     appearance cookie. No horizontal overflow at any width; the Goal's NAME
     paints at its full content width rather than being ellipsised to make room
     for the sentence; `axe` clean with no rule disabled. There is deliberately
     **no badge** — movement is a sentence, because a two-colour chip turns a
     bounded observation into the grade ADR-110 decision 4 refuses.

  **A ranking finding, corrected by measurement rather than by reasoning.** The
  first cut ranked a silent Goal alongside a measured Goal with nothing urgent to
  say, and knocked an on-track measurable Goal off Today entirely in favour of
  one reading *"No movement yet this week."*. The bucket was moved below every
  Goal that has a reading — and the split is exactly that, **a reading to lead
  with**, rather than whether the Goal is configured, because a configured Goal
  with nothing recorded has just as little of a figure to show. Goals with a
  reading keep exactly the order they had.

  **A review found a real defect, and the fix made the rule simpler.** The first
  cut kept GOAL-02's *"exclude a measurable Goal with no reading"* rule beside
  the new one for unmeasured Goals — so a workspace whose Goals were **all**
  measurable-but-unstarted produced an empty panel and was told *"No open Goals
  yet. Add a Goal…"*, when what it needed was to record a first measurement. It
  was also untrue that such a Goal has nothing to report: a contributing Project
  completing genuinely moves it. Two rules became ONE — **a Goal appears when it
  has a reading or when the caller asked for movement** — which is also what
  makes the empty state honest, because Today always asks. The regression test
  fails against the previous rule.

  **Two denominators, and neither borrows the other's set.** Today's note now
  reads *"1 of 2 on track · 4 of 4 moved this week"*: "on track" can only be
  asked of a measurable Goal, "moved" can be asked of every Goal on the panel.
  The `Goals on track` stat card was narrowed the same way — it said *"of N
  measurable goals"* about a set that now contains unmeasured ones.

  **DEBT-78 closed on its own words**, and the two adjacent entries were decided
  rather than collected. **DEBT-120** is NARROWED and stays open: FOLLOW-02
  settles that movement is an ATTENTION signal — so it strengthens the alignment
  reading of `/goals` rather than converting the surface — and does not settle
  whether GOAL-02's measurement status should govern the order, which still needs
  the second ranking expression and cursor scope the entry names. **DEBT-192**
  stays open because FOLLOW-02 adds no measurement callback to either Goal
  surface, so the campsite rule has nothing to clean; migrating the record onto
  `GoalMeasurementSection` would be a Goals refactor inside a movement item,
  which is the bundling that entry records DHDS-11 declining.

  **The E2E budget question FOLLOW-01 handed forward was answered by fitting,
  not by moving the gate.** The journey is 2 tests over 5 page loads (every
  other width and appearance a resize or an `emulateMedia` in place, one axe scan
  per appearance rather than one per width), MEASURED at **18.7 s**.
  `PARTITION_COUNT` is UNCHANGED at 13 and the ceiling was not touched: heaviest
  15.3 min against 16.7 min, `worst/mean` 1.04. **DEBT-205 is left alone
  deliberately** — 536 s is still stranded, FOLLOW-02 did not need it, and
  recovering it edits machinery every job depends on.

  **Non-goals held.** No snapshot table, no trend cache, no momentum score, no
  adherence score, no streak, no chain, no grade, no ranking of Goals against
  one another, no percentage in any movement statement (asserted over rendered
  output). No forecast beyond GOAL-02's. No AI, no goal coaching, no automatic
  intervention, no notification rule. No Analytics module, no chart dependency —
  **no new dependency at all**. No Goal status vocabulary (DEBT-183) and no
  Goal → Area move (DEBT-184), both re-read and left open. No new entity type,
  no second Goal identity model, no change to the one measurable formula.

---

## Why this sequence

- **V2.4-GATE-01 first, and its backup half first of all.** Two of the three
  halves are prerequisites for everything else — a claim measured by a red gate is
  not a measurement, and a release cannot be cut from a branch whose gate cannot
  report. The backup half is a prerequisite for *nothing* and is still first,
  because it is a P1 data-safety gap that costs one repository secret and one
  rehearsal, and there is no version of "wait for the feature programme" that is
  defensible for it.
- **V2.4-GATE-02 before FOLLOW-01.** FOLLOW-01 puts more weight on the Plan queue
  and gives its rows more to say. Building that on a row where a mis-click
  completes work would multiply the defect rather than isolate it — and DHDS-13
  already named this as the reason the product is a B.
- **FOLLOW-01 before FOLLOW-02.** Two reasons, and the first is structural.
  FOLLOW-01 builds the bounded window-over-Activity derivation that FOLLOW-02
  consumes for project-contribution movement; doing FOLLOW-02 first means either
  building that derivation twice or building it inside the Goals module, where it
  does not belong. The second is diagnostic: knowing whether the week held is what
  tells the owner whether a stalled Goal is a planning problem or a goal problem.
  Answering *did it matter?* before *did I do what I said?* inverts the question.
- **Both features after both gates.** A programme about accounting for commitments
  that ships onto an unreleased, unbacked, red-gated product would be making
  exactly the mistake it is trying to fix.

---

## LATER — real, evidenced, and deliberately not V2.4

Recorded so none is mistaken for an oversight. Each is a separate product
decision with a named home.

| Deferred | Evidence | Why not now |
|---|---|---|
| **Search's empty query offers nothing to open** | [DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01) (P2); DHDS-13 §4 P2-8 | Needs a recency source the search path does not have, with its own storage, scoping and privacy questions (Diary and People are excluded from external context for a reason). It belongs to a retrieval/velocity programme with tags and capture, not to follow-through. **Stated plainly: while this is open, the product does not claim an A on DHDS-13's own scale.** |
| **Tags, and the capture grammar that would use them** | [DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3), [DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3); DHDS-13 §13 rates capture speed *"Below"* | A canonical tag model is the real work; `#tag` in the parser is its consequence. One coherent programme, later. |
| **A first-run / sparse-workspace experience** | DHDS-13 §13 (*"Below"*), §4 P3-6 (Analytics opens on four zeroes) | FOLLOW-02 removes one of the zeroes an empty workspace meets. The rest is a programme of its own. |
| **A hugging metadata label truncates a name that fits** | [DEBT-193](../product/PRODUCT_DEBT.md#-debt-193--a-hugging-metadata-label-paints-4-narrower-than-its-own-content-so-a-phone-truncates-a-name-that-fits--p3--resolved-2026-08-25-v24-gate-02) (P3) | Six candidate fixes moved the number by zero; the correction is a cell restructure, which is not a proportionate risk for one or two characters. |
| **The offline slice: habit check-in, template create, dependency edit, relationship and order changes** | [DEBT-155](../product/PRODUCT_DEBT.md#-debt-155--a-habit-check-in-is-online-only-and-the-surface-can-only-say-so-after-it-fails--p3), [DEBT-167](../product/PRODUCT_DEBT.md#-debt-167--creating-a-project-from-a-template-requires-connectivity--p3), [DEBT-170](../product/PRODUCT_DEBT.md#-debt-170--adding-or-removing-a-dependency-requires-connectivity--p3), [DEBT-190](../product/PRODUCT_DEBT.md#-debt-190--the-offline-slice-does-not-cover-relationship-or-order-changes--p3) | Each is a widening of PWA-12's queue and they belong together, judged as one decision about what the offline contract covers. |
| **Plan's board proportions** | [DEBT-162](../product/PRODUCT_DEBT.md#-debt-162--the-six-column-planning-board-needs-a-1440px-viewport--p3), [DEBT-163](../product/PRODUCT_DEBT.md#-debt-163--a-sunday-start-week-draws-seven-board-columns-and-wraps-the-seventh--p3), DHDS-13 §4 P3-5 | Composition questions, each needing its own measurement. None costs the owner information. |

### Standing non-goals, carried forward unchanged

V2.3's list still stands and is not re-litigated here: subtasks · AI automatic
weekly planning · automatic time blocking · calendar write-back · Gantt charts and
dependency timelines · automatic date shifting · critical path · a dependency
notification programme · resource capacity planning · estimates and time tracking ·
shared or team planning · public or shared smart lists · a smart-list marketplace ·
a new calendar module · a month grid or week timetable.

And the architectural ones, which V2.4 may not reopen without its own ADR:

- **No second Task authority.** Every mutation leaves through the canonical
  posters.
- **No second filter DSL.** SMART-01's declarative vocabulary has two consumers
  and will not grow a third model.
- **No new relationship model.** EntityLinks are the authority
  ([ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks),
  [ADR-106](../decisions/ARCHITECTURE_DECISIONS.md#adr-106-a-task-dependency-is-a-directed-entitylink-not-a-second-join-model--derived-blocked-state-and-cycle--bound-enforcement-inside-the-write)).
- **No second representation of a concept** because a new panel wants one.
- **No module-local design primitive** where the shared one already owns the
  behaviour; generic components live in [`app/shared/ui/`](../../app/shared/ui/index.ts)
  and carry no product rules.
- **No new runtime component or design library**, and no DHDS-14. DHDS built
  DalyHub-native primitives rather than trading one framework dependency for
  another, and that is not undone to keep a programme going.
- **No broad rewrite of working architecture for aesthetic reasons.**

---

## Dependencies

```
V2.4-GATE-01  ──►  V2.4-GATE-02  ──►  FOLLOW-01  ──►  FOLLOW-02
  (backup half has no predecessor and goes first)
      ☐              ☑ 2026-08-25   ☑ 2026-08-26        ☐
   owner-blocked
```

**V2.4-GATE-02 ran BEFORE V2.4-GATE-01 finished, deliberately and with the
dependency's own reasoning intact.** That dependency exists so the fix's
assertions mean something on a gate that can fail honestly — and GATE-01 already
delivered that half: the E2E gate went green on run
[`32605964327`](https://github.com/acedaly/DalyHub-V2/actions/runs/32605964327)
and DEBT-179 is closed. What keeps GATE-01 open is **DEBT-198 and DEBT-139**, the
production backup and the migration state, both blocked on an owner-held secret
and Cloudflare credentials this repository does not have. Waiting on those would
have blocked the whole programme on an action no agent can take. **GATE-01 remains
☐ and explicitly deferred; nothing in GATE-02 claims any part of it.**

External to the repository, and therefore the one real scheduling risk:
**V2.4-GATE-01 needs Cloudflare credentials, the `production` GitHub environment's
secrets, and the off-GitHub recovery key.** All three are owner-held. An agent
without them can prepare and document every step, run the local half, and must
report `SKIPPED` rather than a pass for anything it cannot reach — which is what
`pnpm run verify:production` already does by construction.

Internal: FOLLOW-02 consumes FOLLOW-01's derivation; both consume REVIEW-03's
insight surface, GOAL-02's evaluator, HABITS-01's schedules and the Activity
stream. None of those is modified — they are read.

**That derivation now exists** (`app/kernel/activity-window/`), and FOLLOW-02
inherited all four rather than rebuilding them — `readGoalMovementFacts` is a
method on `ActivityWindowRepository`, `goalMovementWindow` resolves the owner's
week through `ownerPeriodWindow`, the phase decides the tense, and the word
discipline is asserted over rendered text. The four: the `ActivityWindow` type and
`ownerPeriodWindow`, which are the ONE period definition three consumers already
share; `ActivityWindowRepository`, which is where a bounded Activity query over a
named window belongs, so DEBT-78's *"bounded activity query over the goal's
contributing project ids within the window"* is a method on it rather than a
Goals-module query; the phase rule, so a Goal is never described as having failed
to move in a period that has not happened; and the word discipline — counts with
printed denominators, absence rendering less, no percentage — enforced by tests
that read rendered text.

---

## The acceptance boundary

Every item in this programme carries DHDS-13's one durable rule, which outlived
the phase that produced it:

> **A visual claim about a rendered surface is proven by a measurement of that
> surface, not by looking at it.** Where a change asserts a geometry — a target, a
> gutter, a floor, a truncation, a reserved column — the assertion belongs in a
> test that reads the live box, at every width the claim covers.

And V2.4 adds its counterpart for the facts it puts on screen:

> **A numerical claim about the owner's history is proven against a fixture whose
> events are known, not against whatever the workspace happens to hold.** Where a
> surface states a count, the test writes the events that produce it and asserts
> the exact number — because a figure derived from accumulated state is a figure
> nobody can check.

Concretely, where applicable, every item is accepted against:

- **real seeded data**, not a synthetic fixture, for anything claiming a
  composition;
- **light and dark**, with dark driven by the media query rather than the
  appearance cookie — DHDS-13 §9's method note exists because that mistake
  produced a complete set of "dark" frames that were entirely light;
- **desktop, tablet and phone**, and the 320 / 360 / 375 / 393 / 430 phone widths
  where the claim is a phone claim;
- **keyboard reach, visible focus, logical order, and an accessible name on every
  control**;
- **overflow and truncation** checked by measurement, not by screenshot;
- **reduced motion** where motion is involved;
- **bounded queries with a flatness proof, and no N+1**;
- **deterministic tests** — no test skipped, weakened, quarantined or deleted, and
  no timeout raised, to make a phase look green;
- **actual geometry wherever the claim is geometric**.

A behavioural defect is never closed on a screenshot.

---

## The DHDS-13 findings, reconciled

DHDS-13 raised five entries (DEBT-193…197) and deliberately left three findings
open in its own §15. Each has a disposition here, and none is closed by
assertion. Two further entries are in the table because DHDS-13's own record is
what made them actionable: DEBT-164, which it superseded without saying so, and
DEBT-179, whose dominant signature it root-caused.

| Finding | Severity | Disposition in V2.4 |
|---|---|---|
| **DEBT-194** — the Plan queue's two adjacent checkboxes | P2 | **Taken** — V2.4-GATE-02. The product decision DHDS-13 refused to make inside a quality gate. |
| **DEBT-164** — the same defect, raised earlier by UX-02 at P3 | P3 | **Superseded by DEBT-194**, which states it at the correct severity with the trust consequence named. Both close together under V2.4-GATE-02; the entry is kept, not deleted, so its cross-references still resolve. |
| **DEBT-196** — Weekly Planning draws two days at phone width | P2 | **Taken** — V2.4-GATE-02. Pre-existing, already asserted twice and already failing. |
| **DEBT-197** — a cancelled Task's passed date painted overdue | P3 | **Taken** — V2.4-GATE-02. It is a product-semantics decision about what `--overdue` means, and "the row's signals are honest" is exactly this item. |
| **DEBT-195** — Search's empty query offers nothing | P2 | **Kept open, and deferred with its reason** — [LATER](#later--real-evidenced-and-deliberately-not-v24). It needs a recency source that does not exist, and it is the reason this programme does not claim an A. |
| **DEBT-193** — a hugging metadata label truncates a name that fits | P3 | **Closed by V2.4-GATE-02 (2026-08-25)**, and this disposition was wrong on the facts rather than on the judgement. Six candidate fixes moved the number by zero because none of them was the cause: `task-list.css` already declared the rule that fixes it and lost the cascade to the shared `meta` rule by one compound selector. No cell restructure was needed. |
| **DEBT-179** — the E2E gate is red on `main` | P2 | **Taken** — V2.4-GATE-01. DHDS-13 root-caused the dominant signature and fixed three of nineteen; the remaining sixteen are this item's starting point. |

**The DHDS-13 findings are inputs to this roadmap, not the roadmap.** Three
became one bounded gate item; two are deferred with their reasons; one is
superseded rather than deleted; and one seeded a gate that is about the test gate
rather than about design. **No DHDS phase is resurrected, no numbered DHDS item is
created, and no finding became a roadmap item merely because it existed.**

---

## Related documents

- [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md) — the successor programme, where new work goes
- [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) — the closed V2.3 programme this succeeds
- [`DHDS_13_COMMERCIAL_QUALITY_GATE_2026_08.md`](../design/DHDS_13_COMMERCIAL_QUALITY_GATE_2026_08.md) — the commercial-quality gate, its B verdict, its open findings and the measurement rule this programme inherits
- [`DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md`](../product/DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md) · [`DALYHUB_WHOLE_APP_REPAIR_2026_08.md`](../product/DALYHUB_WHOLE_APP_REPAIR_2026_08.md) — the audit that set the precondition for starting V2.4, and the repair that met it
- [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) — the decision this programme is built on
- [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers) — Weekly Planning is a projection, not a record
- [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks) — a Habit is a behaviour, and there are no manufactured streaks
- [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model) — the shared Activity model this programme derives from
- [`REVIEWS_MODULE.md`](../development/REVIEWS_MODULE.md) — REVIEW-03's insight derivation, its snapshot and its query budget
- [`GOALS_MODULE.md`](../development/GOALS_MODULE.md) — Goal ownership, contribution and measurement
- [`HABITS_MODULE.md`](../development/HABITS_MODULE.md) — effective-dated schedules and the expectation sum DEBT-156 needs
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) · [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the two authorities V2.4-GATE-01 works through
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — the product handbook this theme is derived from
