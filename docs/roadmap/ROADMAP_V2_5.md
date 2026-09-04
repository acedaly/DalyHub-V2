# ROADMAP_V2_5.md — V2.5, Steering

> The V2.5 product programme. V2.4 moved DalyHub from a system that records what
> you intended to a system that tells you what became of it — the week has an
> account, and every Goal states whether it moved. **V2.5 is about what the owner
> can DO with that: the Goal layer stops being a report the owner reads and
> becomes a surface the owner steers from.**
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1, [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md)
> holds V2.2, [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) holds V2.3 (**closed**) and
> [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) holds V2.4, whose planned product sequence
> is **complete apart from V2.4-GATE-01's two owner-held halves** — which stay
> recorded there and are **not re-adopted here**.
> **This file is V2.5, and it is COMPLETE. Its last item,
> [STEER-05](#-steer-05--the-weeks-door--delivered-2026-08-28), is ☑ delivered —
> it was finished here rather than moved, re-scoped or absorbed.**
>
> **New work now goes in [`ROADMAP_V2_6.md`](ROADMAP_V2_6.md)** — V2.6,
> "Retrieval & capture velocity", which takes the theme this file deferred whole
> as the presumptive V2.6 and confirms it against its competitor: Search answers
> an empty query with recent records (FIND-01, the P2), tags gain one workspace
> vocabulary (FIND-02), Tasks gain tags and one filter dimension (FIND-03), and
> `#tag` joins the capture grammar (FIND-04). **STEER-05 was delivered before
> FIND-01 starts**, which it now has been. Accepted as
> [ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build;
> this tells you *what*. Status is updated in the PR that changes it. No time
> estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

> **Status, 2026-08-28.** STEER-01 and STEER-02 are ☑ **delivered**, together,
> in one PR — the surface decision and the owner capability that lands on it.
> **STEER-03 and STEER-04 are ☑ delivered**, together, in one PR — the shared
> Goal story and the action layer that lands on it. **STEER-05 is ☑ delivered** —
> Today offers this week's Review. **The planned V2.5 product sequence is now
> complete**, and
> [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05)
> is closed on the half that was still open.
>
> The V2.6 decision was taken while STEER-05 was still in review, and it
> re-verified against `main` that the Today → Review door had not shipped — which
> was true when it looked. It is true no longer, and the successor programme it
> defined, [`ROADMAP_V2_6.md`](ROADMAP_V2_6.md), is where new work goes; its
> FIND-01 was gated on this item and is now unblocked.

---

## The theme: STEERING

> **V2.5 makes the Goal layer decision-grade. The derived answers exist and are
> honest; what is missing is everything the owner does next — a collection whose
> order and counts answer the question the screen actually asks, one Goal story
> on every surface that tells it, the owner's own judgement beside the machine's,
> a Goal that can be re-filed without destroying its history, a named next step
> where a signal points, and a door to the weekly ritual on the surface the owner
> opens every day.**

[`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) states the purpose in
one line: DalyHub exists *"to turn scattered activity into a system you can
actually steer."* V2.4 finished the instrumentation. V2.5 is the steering.

---

## Where V2.4 left the product

Three of V2.4's four items are ☑ — V2.4-GATE-02 (2026-08-25), FOLLOW-01
(2026-08-26) and FOLLOW-02 (2026-08-27). Its own record states the closing
position: *"the planned V2.4 product sequence is complete"* apart from
**V2.4-GATE-01**, which stays **☐ in [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md)** with
GREEN delivered and RECOVERABLE and RELEASED owner-blocked.

What that means concretely for V2.5's starting position:

- **The gate is green and honest.** Thirteen E2E partitions, green on `main`,
  with a regenerated split authority and the measurement journeys genuinely
  executing (DEBT-158, DEBT-200 closed). V2.5 items are measured by a gate that
  can fail honestly — the precondition V2.4 built.
- **The release train runs again.** `package.json`, the release notes and the
  checklist agree on `2.4.0`; production's migration ledger was **measured** at
  `0001`–`0047` applied, nothing pending.
- **Two owner actions remain the standing preconditions for any future release,
  and V2.5 does not restate them as items.** The `BACKUP_ENCRYPTION_PASSPHRASE`
  secret (DEBT-198 — 23 scheduled runs have refused at the guard, correctly) and
  Cloudflare credentials for `verify:production` and the pre-migration backup
  (DEBT-139). Both live in V2.4-GATE-01, both are owner-held, and **no V2.5 item
  may apply a production migration until the backup half is real.** STEER-02 is
  this programme's only migration, and it inherits that constraint explicitly.
- **The derived layer is complete.** A Goal now carries three derived answers —
  alignment (ADR-040), measurable progress (GOAL-02), movement (FOLLOW-02) — and
  the week has an exact account (FOLLOW-01), all under
  [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)'s
  rule: derived from the Activity stream, never stored, no score.

FOLLOW-02's record ends: *"What V2.5 should be is a decision, not a
continuation, and it is deliberately not started here."* This file is that
decision.

---

## The audit this programme is built on

The Goal experience was audited end to end on `main` at `0610c92` (FOLLOW-02
merged) — Today, `/goals`, the Goal record, the rollup, measurable and
unmeasured Goals, mobile, and every surface that tells a Goal's story. Eight
findings, each measured against code rather than remembered from documentation.
The six that are product defects are raised as **DEBT-206…DEBT-211** in
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md); the audit's facts are restated
in each item below.

1. **The derivation layer is healthy and needs nothing added.** Three derived
   answers per Goal, each pure, each bounded (movement is two D1 statements for
   a page of fifty Goals, flat in Goals and in events), each refusing to fake a
   number. Today's panel ranks with printed denominators
   (`app/shared/goal-progress/goal-summary-load.ts`), the record's chart draws
   the target in its domain and a dotted required-path projection, and the
   check-in is one press from a Today tile. **V2.5 adds no new derivation and no
   new measurement machinery.**
2. **`/goals` is a master–detail workspace whose order answers a question the
   screen stopped asking.** REDESIGN-04 replaced the card gallery with the
   `mockup3.png` workspace — deliberately, against the reference standard — but
   the collection is still ordered by ADR-040's *alignment* rank
   (neglected first; `app/modules/goals/routes/index.tsx`) underneath
   *measurement* lenses (All / On track / Needs attention / Completed) whose
   filter runs client-side over the loaded page and whose counts describe the
   page while reading as workspace facts. That is
   [DEBT-120](../product/PRODUCT_DEBT.md#-debt-120--the-goals-gallery-is-ordered-by-alignment-not-by-outcome--p3--resolved-2026-08-28-v25-steer-01)'s
   open half and [DEBT-121](../product/PRODUCT_DEBT.md#-debt-121--status-view-counts-describe-the-loaded-page-not-the-workspace--p3--resolved-2026-08-28-v25-steer-01)'s
   trust cost, exactly as written.
3. **Three surfaces tell three different progress stories about one Goal.**
   Today and `/goals` lead with the measurement; the record's summary band draws
   *Project contribution*; and the Area record's Goals tab draws a **third**
   figure no other surface has — the Task roll-up (`taskCompleted / taskTotal`,
   `app/modules/areas/AreaOverview.tsx`) — as that card's progress bar, with no
   alignment, no movement and no measurement anywhere on it (**DEBT-206**).
4. **The weekly Review reads less about a Goal than Today does.** The guided
   Review's Goals step shows alignment and contributing-Project counts only
   (`app/modules/reviews/guided/ReviewGuideSteps.tsx`) — no measurement status,
   no movement, no target date. The ritual that exists to check *"daily action
   still matches stated goals"* is blind to the two newest signals (**DEBT-209**).
5. **The Goal surfaces are pure reporting.** Every derived string is
   descriptive by design — and there is no way to act on one. No owner-set
   condition exists (DEBT-183), so a deliberately-resting Goal now reads *"No
   movement yet this week."* indistinguishably from a neglected one, and the
   owner cannot answer back. A mis-filed Goal cannot be re-filed (DEBT-184). A
   Goal signal names no next step, and a Goal with no structure offers no way to
   create any — `GoalProjectChips` only re-parents an *existing* Project, and
   the Projects tab's empty state offers nothing (**DEBT-210**; Today's project
   cards have carried the same gap as
   [DEBT-77](../product/PRODUCT_DEBT.md#-debt-77--a-project-card-cannot-say-what-the-next-action-is--p3--resolved-2026-08-28-v25-steer-04)
   since POLISH-02).
6. **The collection route does dead work and the module carries stale prose.**
   `/goals` loads a sparkline series, the definition of done and five alignment
   evidence rows on every page and renders none of them — reads left behind when
   REDESIGN-04 deleted the gallery card (**DEBT-207**). The same Goal wears two
   identity marks on one screen (the row resolves the Goal's own icon first, the
   pane resolves only the Area's — **DEBT-208**). The module's own prose has
   drifted from the shipped surface in five recorded places (**DEBT-211**).
7. **The loop's front door is missing.** Today still offers no *"Start / continue
   this week's Review"* — the remaining, Today-side half of
   [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05)
   (P2), untouched by FOLLOW-01 on purpose.
8. **Mobile and accessibility are not the gap.** AREA-04 proved the Goal
   surfaces on a real phone; the `/goals` workspace folds to two screens with
   both in the DOM; no Goal surface hides data at any width. DHDS-13's phone
   matrix stands. Nothing in this programme is a mobile rescue.

---

## The governing product argument

[`AGENTS.md` §4](../../AGENTS.md#4-the-area--goal--project--task-model) states the
promise the spine exists to keep:

> **Everything rolls up.** Completing tasks advances projects; advancing projects
> moves goals; goals give areas momentum. **The rollup is how the system shows you
> whether your daily actions match your stated intentions.**

V2.4 made that sentence true over time: the rollup now *speaks* — the week has an
exact account, and every Goal states whether it moved, honestly, with no score.
The audit above says what is missing now, and it is not another signal. **The
Goal layer describes and cannot be steered:**

- its collection answers a question the screen stopped asking, beneath counts
  that are quietly wrong for the question they appear to answer (finding 2);
- the same Goal tells three different stories depending on where the owner meets
  it, and the weekly ritual hears the least of anyone (findings 3–4);
- the owner can state nothing the machine has not already derived, cannot
  re-file a Goal without destroying its history, and cannot get from any signal
  to a next step without leaving to research one (finding 5);
- and the one ritual where the signals are read together has no door on the
  daily surface (finding 7).

Against the product's stated direction — *"information and progress that help
the owner make decisions rather than merely store records"* — that is the
largest coherent gap the product has, and it sits exactly where FOLLOW-02 just
finished working, on data and vocabulary that already exist. Four of the five
items below need **no schema change at all**; the fifth needs one additive
nullable column. V2.5 adds decisions and doors, not machinery.

### The working hypothesis, tested

The hypothesis this programme was asked to test: *V2.5 should focus on
Goals / Outcomes, because FOLLOW-02 has just made Goal movement visible and
GOAL-02 already provides measurable progress.*

**Confirmed in substance, refined in shape.** What the audit rules out is a
Goals programme of *more measurement machinery* — the model, arithmetic, chart,
pace, statuses and movement all exist, are shared, and refuse dishonest numbers;
finding 1 says there is nothing of that kind left to build. What the audit
confirms is the other half of the hypothesis: the Goal layer is where the
product's promise, the owner's stated priorities and the open debt all point,
and its remaining gaps are **decision-grade** gaps — order, truth of counts, one
story, owner judgement, structure mobility, next steps, the ritual's door. So
the theme is **Steering** rather than "more Goals": every item is about what the
owner decides or does from the Goal layer, and two items reach onto Today
because Today is where Goal signals become decisions. Had the audit found the
layer coherent and actionable, the strongest programme would have been the
retrieval-and-capture-velocity theme below — that comparison is recorded, not
implied.

### Why this and not the other candidates

Weighed against the evidence, and rejected as the *theme*:

- **Retrieval & capture velocity (tags + capture grammar + search recency)** —
  the strongest competitor, and the presumptive V2.6. The evidence is real:
  [DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01)
  (P2) carries the register's own sentence — *"while this is open, the product
  does not claim an A on DHDS-13's own scale"* — and DHDS-13 §13 rates capture
  speed *"Below"* the reference bar, with
  [DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3--resolved-2026-08-29-v26-find-02)/[DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3--resolved-2026-08-29-v26-find-03)
  naming the missing tag model underneath both. It loses to Steering on three
  grounds. It is a **new-data-model programme** (tags as a kernel decision)
  whose payoff is speed, while the Goal layer currently *says something untrue*
  (DEBT-121) and cannot be acted on — trust and capability before velocity. Its
  pieces belong together as one coherent theme (V2.4's recorded reason for
  deferring it whole), so it cannot lend V2.5 its P2 without being absorbed
  piecemeal. And the owner's stated V2.5 priorities name the Goal layer four
  ways and retrieval none. Deferred **whole**, again, with this reason.
- **Onboarding / a sparse workspace** — DHDS-13's other *"Below"*. Real for a
  commercial product; weak for this one, which is one owner's populated daily
  driver. FOLLOW-02 already removed the worst first-run zero (Today's Goal
  panel no longer says *"No measurable Goals yet"* to a workspace full of
  Goals). Deferred whole, unchanged from V2.4.
- **Offline / PWA widening** — a set of P3 slices (DEBT-155, 160, 161, 167,
  170, 190) that V2.4 correctly judged *"belong together, judged as one
  decision about what the offline contract covers."* No new evidence has
  arrived since. Deferred whole.
- **AI over the follow-through data** — newly *unblocked*, and still not taken.
  ROADMAP_V2's own AI-03 precondition — *"an AI summary over reflection data
  the product cannot yet derive itself would be unverifiable by the owner"* —
  is **met by V2.4**: the week account, Goal movement and habit consistency now
  exist as owner-verifiable derivations. But no live provider call has ever
  been made from this repository (the key is owner-held, the same class of
  block as GATE-01's halves), DEBT-91's fact-block gap is P3, and the owner's
  direction for this programme is explicit that AI is not to be smuggled in.
  Recorded as unblocked; deferred with its reason.
- **Analytics / stronger reporting** — the owner's own word for it is
  *"later"*. Analytics, REVIEW-03's insights, FOLLOW-01's week account and
  FOLLOW-02's movement already report honestly; what the reporting loop is
  actually missing today is not another chart but its **door** (finding 7) and
  its **blind step** (finding 4) — both taken below as bounded items. The rest
  of a reporting programme waits.
- **Remaining task/project workflow gaps** — DEBT-128 + DEBT-175 (the one-Task-
  anatomy pair, P2), DEBT-137 (a Project cannot say what it is, P2), DEBT-165
  (template dates, P2) are each real and each bounded, and together they are a
  grab-bag, not a theme — taking them as V2.5 would be exactly the *"feature
  accumulation"* the product direction rules out. Each is named in
  [LATER](#later--real-evidenced-and-deliberately-not-v25) with its
  disposition.
- **Another visual/quality programme** — foreclosed by DHDS-13 §18, which V2.4
  already restated: future UI work is module-specific and evidence-tied. Every
  UI change in this programme is tied to a named product problem on a named
  surface. There is no DHDS-14 and no broad polish pass here.

The programme is accepted as
[ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question),
which fixes the constraints every item below inherits: an owner-set fact and a
derived fact are never merged into one signal; there is one next-action rule in
the product; every surface that tells a Goal's story tells it through the shared
vocabulary; a collection's order answers a recorded question, computed in SQL
before pagination; and no composite Goal score exists.

---

## NOW

Five items. One surface decision, two owner capabilities, one action layer, one
door — sequenced so each lands on the one before it.

### ☑ STEER-01 — What `/goals` answers — **delivered 2026-08-28**

**The collection decides its question, and every figure on it becomes true.**

- **User problem.** `/goals` is ordered by ADR-040's alignment rank — neglected
  Goals first — beneath UIX-03's measurement lenses. The order answers *"which
  Goal have I been neglecting?"* on a screen whose lenses ask *"how are my
  outcomes going?"*; an unmeasured Goal with no recent activity sits above a
  measured Goal that is behind its own target date. The lens counts ("On track
  3") are computed from the **loaded page** and read as workspace facts —
  [DEBT-121](../product/PRODUCT_DEBT.md#-debt-121--status-view-counts-describe-the-loaded-page-not-the-workspace--p3--resolved-2026-08-28-v25-steer-01)
  names this a **trust cost**, and its own rule is the bar: *"a count that
  describes the page must not remain beside a label that reads as the
  workspace."* Underneath, the route loads three things it never renders (the
  gallery card's sparkline series, the definition of done, five alignment
  evidence rows — DEBT-207), the same Goal wears two identity marks on one
  screen (DEBT-208), and the Goal record still re-declares the measurement
  section's eight callbacks and two sheets beside the shared
  `GoalMeasurementSection` (DEBT-192) — so the next measurement capability must
  be built twice.
- **Outcome.** `/goals` states which question it answers — **the outcomes
  workspace** — and its default order is established workspace-wide in SQL for
  that question, before pagination, with the keyset cursor bound to it. The
  lenses filter in the collection read, and every count beside a lens is true
  for the workspace or absent. The route reads nothing it does not render. One
  identity-resolution rule paints the row and the pane. The record mounts the
  shared measurement section, so the wiring exists once.
- **Why it belongs in this programme.** It is the recorded decision the Goal
  layer has been queuing behind:
  [DEBT-120](../product/PRODUCT_DEBT.md#-debt-120--the-goals-gallery-is-ordered-by-alignment-not-by-outcome--p3--resolved-2026-08-28-v25-steer-01)'s
  closing condition asks exactly this (*"`/goals` states which question it
  answers (recorded, not implied), and its order is established workspace-wide
  in SQL before pagination for THAT question"*), and FOLLOW-02 deliberately
  took only the half it could (movement is an attention signal and does not
  convert the surface) while building the movement fact an outcome order can
  now weigh. Every later item renders through this surface; deciding it first
  is what stops the programme re-litigating it item by item.
- **One decision this item must take and record.** The outcome ranking — which
  of GOAL-02's statuses and the unmeasured buckets lead, and where completed
  Goals sit. The rank must exist once (`app/kernel/`), with the SQL expression
  and the pure comparator proven equal by a parity test — the DEBT-23/DEBT-120
  precedent. FOLLOW-02's finding stands as an input: a Goal **with a reading to
  lead with** outranks one with only absence to report.
- **Major dependencies.** None ahead of it. GOAL-02's evaluator, FOLLOW-02's
  movement facts and the alignment machinery are consumed, not modified.
- **Explicit non-goals.** **No return of the card gallery** — REDESIGN-04
  replaced it against the `mockup3.png` reference standard, that was a
  principle decision, and UX-02's rule holds: a decision made on a principle is
  re-read precisely, not re-taken because time passed. No change to
  `evaluateGoalProgress`, `evaluateGoalAlignment` or `evaluateGoalMovement`
  semantics. **No persisted status or rank column** — the order is computed in
  the read; if it genuinely cannot be, that is ADR-110 decision 7's finding
  path, not a column. No change to Today's Goal ranking (FOLLOW-02's
  `goalSummaryRank` stands). `listGoalsByAlignment` is **kept** for its other
  consumers — the guided Review, the insights read, the attention facts and
  Analytics all ask the alignment question and keep its order. No owner-set
  condition yet (STEER-02's). No client-side re-sort.
- **Schema / API changes.** **None.**
- **Canonical authorities that must not move.** `evaluateGoalProgress` remains
  the one place a Goal figure is computed. The new ordering is a
  `GoalRepository` read with its own versioned, scope-bound cursor — a stale or
  foreign cursor resets calmly to page one, exactly as the alignment cursor
  does. `GoalMeasurementSection` becomes the **one** measurement composition;
  `POST /goals/:goalId/mutate` and `/goals/:goalId/measurements` remain the only
  mutation paths.
- **Measurable acceptance criteria.**
  1. The question `/goals` answers is **recorded** (in `GOALS_MODULE.md` and the
     collection's own module doc), and the default order is established
     workspace-wide in SQL before pagination — proven against a workspace of
     **more than one page**, where a Goal needing attention on page two is never
     stranded behind healthy Goals on page one, and the cursor round-trips.
  2. The SQL rank and the kernel comparator **cannot disagree**: a parity test
     drives both over the same fact matrix, as `GOAL_ALIGNMENT_DISPLAY_RANK`
     already has.
  3. Every lens filters the **workspace**, not the loaded page — a lens's result
     set and its count agree with a seeded two-page workspace, asserted with a
     counting database and a stated statement budget — **or** the counts are
     removed entirely. DEBT-121's closing sentence is the acceptance, verbatim.
  4. The route **loads nothing it does not render**, asserted over the loader's
     returned shape: the sparkline series, unrendered definition of done and
     unrendered evidence reads are consumed by the decided presentation or
     removed with their plumbing.
  5. One identity rule: the row and the pane resolve the **same mark** for the
     same Goal, asserted on a Goal that has its own identity and one that
     inherits its Area's.
  6. [DEBT-192](../product/PRODUCT_DEBT.md#-debt-192--a-goals-measurement-callbacks-are-declared-twice-on-the-record-and-on-the-workspace-pane--p3--resolved-2026-08-28-v25-steer-01)'s
     closing condition, verbatim: `detail.tsx` declares no measurement or
     milestone callback of its own, and the Goals E2E journeys pass unchanged on
     both surfaces.
  7. Light and dark; 1440 / 1280 / 820 / 393 / 320; keyboard reach; accessible
     names; no horizontal overflow; `axe` clean with no rule disabled. Bounded
     queries with a flatness proof; no N+1; inside D1's 100-bound-parameter
     ceiling.
- **Closes.** DEBT-120, DEBT-121, DEBT-192, DEBT-207, DEBT-208.
  **Narrows.** DEBT-211 (the collection and record prose it rewrites).
- **Delivered 2026-08-28.** Every criterion met, in one PR with STEER-02.
  1. **The question is recorded** — `GOAL_OUTCOME_QUESTION` in
     [`app/kernel/goals/goal-outcome.ts`](../../app/kernel/goals/goal-outcome.ts),
     and in [`GOALS_MODULE.md`](../development/GOALS_MODULE.md#steer-01--what-goals-answers-v25-2026-08-28)
     with the precedence table and its argument. The order is
     `GoalRepository.listGoalsByOutcome`, established workspace-wide in SQL
     BEFORE pagination, proven over a ten-Goal, four-page workspace where the
     Goal needing attention was created LAST and still leads.
  2. **SQL and kernel cannot disagree** — `test/kernel/goal-outcome.test.ts`
     drives both over one seeded fact matrix covering all nine statuses plus
     explicit completion, the `GOAL_ALIGNMENT_DISPLAY_RANK` precedent. The
     schedule origin is resolved by one bounded preliminary statement and
     passed as JSON, because SQLite cannot do IANA conversion and an
     approximate date would break exact parity — recorded rather than absorbed.
  3. **Every lens filters the workspace, and every count is workspace-true** —
     `countGoalsByOutcomeLens`, from the SAME status and lens expressions the
     page read is filtered by, asserted against a two-page workspace with a
     counting database (two statements each, flat). Where the workspace figure
     is unavailable, no lens shows a number: DEBT-121's sentence, kept.
  4. **The route loads nothing it does not render** — the sparkline series, the
     collection's definition of done and the pane's five alignment-evidence
     rows are gone with their plumbing, asserted field-by-field over the
     loader's returned shape.
  5. **One identity rule** — `goalIdentitySource`, asserted on a Goal with its
     own identity and one that inherits its Area's, by reading the same value
     from the row and the pane.
  6. **DEBT-192 verbatim** — `detail.tsx` declares no measurement or milestone
     callback of its own, and the Goals E2E journeys pass unchanged.
  7. Light and dark, 1440 / 820 / 393 / 320, `axe` clean with no rule
     disabled, bounded queries with a flatness proof.
- **The cursor scope, stated.** Workspace + owner day + time zone + lens —
  every state that materially affects the ordered result, so a cursor cannot be
  replayed against a different question. A rejected cursor resets calmly to
  page one.

### ☑ STEER-02 — The owner's hand — **delivered 2026-08-28**

**A Goal takes the owner's judgement, and a mis-filed Goal can be re-filed.**

- **User problem.** Two halves, both recorded since DHDS-10.
  1. [DEBT-183](../product/PRODUCT_DEBT.md#-debt-183--a-goal-has-no-status-vocabulary-so-a-goals-condition-cannot-be-set--p3--resolved-2026-08-28-v25-steer-02):
     every judgement on a Goal surface is the machine's. An owner who has
     deliberately set a Goal aside for the winter cannot say so — and since
     FOLLOW-02, that silence is *printed*: a resting Goal reads *"No movement
     yet this week."* on `/goals` indefinitely, indistinguishable from neglect,
     which is precisely the manufactured guilt
     [`AGENTS.md` §2.4](../../AGENTS.md#2-product-philosophy) rules out — except
     the owner has no way to answer it.
  2. [DEBT-184](../product/PRODUCT_DEBT.md#-debt-184--a-goals-area-cannot-be-changed-after-creation--p3--resolved-2026-08-28-v25-steer-02):
     a Goal filed under the wrong Area stays there. A Project has `move`; a Goal
     does not, and the only remedy — recreate and re-link — destroys the Goal's
     Activity and measurement history.
- **Outcome.** A Goal carries a small, closed, owner-set **condition** beside
  its three derived answers — stated, never computed, never computing anything —
  and a Goal set aside leaves the attention surfaces the way a Someday/Maybe
  Task leaves commitment surfaces: still in its collection, still stating every
  derived fact, no longer asking for the owner's attention. And a Goal **moves**
  between Areas from its record with the same guards a Project's move has,
  keeping its history, measurements, links and contributing Projects, with both
  Areas' rollups agreeing afterwards.
- **Why it belongs in this programme.** Steering means the owner's reading of a
  Goal is part of the record, not only the machine's. Both entries were
  explicitly re-read and left open by FOLLOW-02 as *"separate domain
  decisions"* — this is the item that takes them. The condition must exist
  before STEER-03 propagates the Goal story to the Area record and the Review,
  so one propagation carries the whole story.
- **One decision this item must take and record.** The vocabulary's members.
  [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question)
  constrains the space: members state the owner's **intent** (pursuing this /
  set aside), never a quality verdict a derivation already computes — an
  owner-set "on track" beside GOAL-02's computed *On track* would be two
  authorities for one word. The exact set, its default, and its wording are the
  item's decision, recorded with the reasons.
- **Major dependencies.** STEER-01 (the settled collection the condition's lens
  lands on). The **owner-held backup precondition**: this is the programme's
  one migration, and AGENTS.md's rule stands — no production migration without
  a pre-migration backup, which is V2.4-GATE-01's still-open half. The
  migration ships and applies locally regardless; **applying it to production
  waits for the backup to be real.**
- **Explicit non-goals.** No auto-set or auto-clear of the condition — the
  system never writes the owner's judgement. No derived signal hidden,
  reworded, suppressed or re-toned by the condition: alignment, movement and
  measurement keep saying exactly what they said, and every cross-combination
  (set aside yet moving; pursued yet unmoved) stays expressible — FOLLOW-02's
  four-combination rule extended to a fifth axis. No Goal archival or lifecycle
  change. No notification. No cascade rules on move beyond the spine's own —
  a Goal's subtree (its advancing Projects and their Tasks) travels with it by
  construction, because their parentage points at the Goal, not the Area. No
  second parent-picker model — the move candidates are server-resolved active
  Areas, following the same trusted-resolution pattern
  `/projects/parent-options` already established.
- **Schema / API changes.** **One additive nullable column** on `goal_details`
  (the condition), with its validator, a focused intent, and an Activity verb
  whose payload records the change and never free text — the ADR-039 slice
  pattern, fourth verse. A `move` intent on the existing
  `POST /goals/:goalId/mutate`. Export/restore carry the new field the way
  GOAL-02's five columns are carried.
- **Canonical authorities that must not move.** The spine owns parentage — the
  move goes through `SpineRepository` with the same active-anchor,
  same-workspace, wrong-kind fail-closed guards `handleMove` gives a Project.
  `GoalDetailsRepository` remains the only mutation path for Goal-owned fields.
  Derived evaluators take **no** condition input — the condition is presentation
  and scope, never an input to alignment, movement or progress.
- **Measurable acceptance criteria.**
  1. The condition is inline-editable on the record and the workspace pane
     (one shared control), filterable on `/goals` through the STEER-01 lens
     contract (workspace-true or uncounted), and carried in export and restore —
     an archive written before this change still validates and restores.
  2. A set-aside Goal **leaves Today's Goal panel, the Projects page's Goal
     rail and `/plan`'s
     unsupported-Goal signals** — asserted — while `/goals` and its record still
     state alignment, movement and measurement unchanged — also asserted, in
     the same test, so scope and honesty are proven together.
  3. No derived sentence changes when the condition changes — asserted by
     rendering the same Goal under each condition value and comparing the
     derived strings.
  4. A Goal moved between Areas keeps its Activity history, measurements,
     milestones and links; both Areas' rollups agree afterwards (the moved
     Goal's Projects and Tasks count under the new Area and not the old); and
     the Goal's inherited identity follows the new Area where it has no colour
     of its own — each asserted against real D1.
  5. Cross-workspace, missing, deleted and wrong-kind move targets fail closed
     with the calm outcome every other mutate intent has; an unknown condition
     value stored in the column degrades to "no condition" rather than
     throwing — the migration-0038 lesson, reapplied.
  6. Light and dark; the phone widths; keyboard; accessible names; `axe` clean
     with no rule disabled.
- **Closes.** DEBT-183, DEBT-184.
- **Delivered 2026-08-28**, in the same PR as STEER-01.
  1. **The vocabulary, and the decision behind it.** Two states: **Pursuing**
     (the default, stored as `NULL`) and **Set aside** (`'set_aside'`). Members
     answer *"am I currently pursuing this?"* — never *"is it going well?"*, so
     the set deliberately excludes `on_track`, `off_track`, `healthy`,
     `at_risk`, `stalled` and `failing`, each of which would be a second
     authority for a word a derivation already computes with evidence
     (ADR-111 decision 2). "Pursuing" storing nothing is what makes the column
     purely additive: an old archive, an untouched row and a Goal nobody has
     spoken about all mean the same thing.
  2. **Inline-editable on the record and the pane from ONE shared control**
     (`GoalConditionField`), filterable on `/goals` through STEER-01's lens
     contract with a workspace-true count, and carried in export and restore —
     including an archive written before the field, rebuilt as a real ZIP with
     the key removed and its checksums recomputed, which validates, restores,
     and lands those Goals as pursuing.
  3. **Scope changes; truth does not.** A set-aside Goal leaves Today's Goal
     panel and `/plan`'s unsupported-Goal signals — excluded in SQL BEFORE the
     scan limit and before the signal cap, so it never costs a pursued Goal its
     place — while `/goals` and the record state alignment, movement and
     measurement unchanged. Asserted on both sides in the same tests, including
     one that compares the movement value byte-for-byte across the change.
  4. **No derived sentence changes when the condition changes**, asserted by
     rendering the same Goal under each value; and no derivation can see it,
     asserted at the SOURCE level after the value-level version was falsified.
  5. **A moved Goal is the same record** — id, creation instant, Activity,
     measurements, milestones and contributing Projects all survive, both
     Areas' rollups agree afterwards including the subtree, and the move is
     recorded through `SpineRepository.move`'s own link vocabulary rather than
     a new audit mechanism. Cross-workspace, missing, deleted, wrong-kind and
     archived targets fail closed with one calm outcome.
  6. Light and dark, the phone widths, keyboard, accessible names, `axe` clean.
- **The migration, and its production status.** `0048_goal_condition.sql`: one
  additive nullable column, implemented, tested and applied LOCALLY. It has
  **not** been applied to production, and must not be until V2.4-GATE-01's
  pre-migration backup precondition (DEBT-139) is real. That gate is unchanged
  and unweakened by this item.

### ☑ STEER-03 — One Goal, one story — **delivered 2026-08-28**

**Every surface that tells a Goal's story tells the same one.**

- **User problem.** The audit's finding 3, now
  [DEBT-206](../product/PRODUCT_DEBT.md): the Area record's Goals tab draws a
  Task roll-up (`taskCompleted / taskTotal`) as its Goal cards' progress bar — a
  third measure no other surface shows — with no alignment, no movement and no
  measurement on the card, so the same Goal reads *"53% · Ahead"* on Today and
  an unrelated percentage on its own Area. And finding 4, now
  [DEBT-209](../product/PRODUCT_DEBT.md): the guided Review's Goals step —
  the one place the owner deliberately sits down to ask whether action matched
  intention — shows alignment and contribution counts only, blind to
  measurement and movement. Around the edges, Search's Goal preview prints a
  raw ISO date and the module's prose describes surfaces that no longer exist
  ([DEBT-211](../product/PRODUCT_DEBT.md)).
- **Outcome.** One story. The Area record's Goals tab and the guided Review's
  Goals step read the same shared vocabulary Today reads —
  `~/shared/goal-progress` and `~/shared/alignment` — so a Goal's measurement
  status, movement, alignment **and owner-set condition (STEER-02's)** are the
  same facts in the same words wherever the owner meets them. A Goal the owner
  has set aside is therefore **distinguishable from a neglected one on both
  propagated surfaces** — the condition is stated beside the derived facts, and
  the Review's selection stays what it is — which is the half of STEER-02's
  problem that would otherwise survive it. The Task roll-up remains a rollup
  **fact** and stops being presented as the Goal's progress. Search's preview
  formats its facts. The module's prose describes the shipped product.
- **Why it belongs in this programme.** Steering needs one instrument panel.
  Three disagreeing progress bars for one Goal is the exact defect class
  GATE-02 closed for Task rows ("a row says something untrue about itself"),
  one level up the spine — and the Review step's blindness means the weekly
  ritual steers by less information than the daily glance. Both are
  presentation-of-existing-derivations work: no new derivation, no new chart,
  no schema change.
- **Major dependencies.** STEER-01 (the decided presentation vocabulary) and
  STEER-02 (the condition exists, so this propagation carries the whole story
  once — including how a set-aside Goal reads on an Area and in the Review).
  FOLLOW-02's movement read is consumed as-is: two statements for a page of
  Goals, whatever the surface.
- **Explicit non-goals.** No new derivation and no fourth measure. No Review
  redesign — the step keeps its shape and its place; its facts widen inside a
  **stated, asserted** statement budget, the FOLLOW-01 precedent (14 → 17,
  stated rather than absorbed). No new chart type and no chart dependency —
  the bar, the words and the existing `TrendLine` are the whole visual
  vocabulary. No Area-record redesign beyond the Goals tab's cards. No change
  to which Goals the Review step selects (`listGoalsByAlignment` keeps that
  question).
- **Schema / API changes.** **None.**
- **Canonical authorities that must not move.** `evaluateGoalProgress`,
  `evaluateGoalAlignment` and `evaluateGoalMovement` remain the only sources of
  any Goal figure — after this item, **no surface in the product renders a Goal
  progress bar not backed by one of them**, and that becomes an assertable
  product rule. `loadGoalSummaries` remains the one bounded summary read a
  collection composes.
- **Measurable acceptance criteria.**
  1. The Area record's Goals tab states, per Goal, the same measurement value /
     status, the same movement sentence **and the same owner-set condition**
     `/goals` states for the same Goal — asserted by machine key as equal
     values, the FOLLOW-02 parity method, not as matching sentences.
  2. **No surface renders a Goal progress figure not derived from the shared
     evaluators** — asserted by enumerating the product's Goal-progress
     renderings in one test, so the next fork fails a build rather than an
     audit. The Task roll-up no longer paints a Goal card's bar; where the
     count remains it is worded as what it is.
  3. The guided Review's Goals step states each Goal's measurement status,
     movement **and owner-set condition** beside its alignment — asserted: a
     set-aside Goal is distinguishable from a neglected one **in the ritual
     itself**, while the step's alignment-based selection is unchanged — inside
     a statement budget that is stated and asserted, flat in the number of
     Goals, and within the 100-bound-parameter ceiling. HABITS-01's two
     unsayable sentences hold on the new facts (a future window is never
     "unmoved"; ADR-110 decision 5).
  4. Search's Goal preview formats its target date with the product's date
     formatting, asserted.
  5. The module prose named in DEBT-211 is corrected with the surfaces it
     describes: the stale gallery/identity passages, the collection's module
     doc, the false `commands.ts` note, and the wrong debt id in `detail.tsx`.
  6. Light and dark; the phone widths (the Area tab and the Review's phone
     stepper both re-measured with the new facts present); keyboard; `axe`
     clean with no rule disabled.
- **Closes.** DEBT-206, DEBT-209, and (with STEER-01) DEBT-211.
- **Delivered 2026-08-28.** Every criterion met, in one PR with STEER-04.
  1. **The Area record's Goals tab states the same facts `/goals` states** — it
     renders the SAME `GoalStoryRow`, from the same shared evaluators, so there
     is no second composition to drift. Asserted by MACHINE KEY: every row on
     every surface stamps `goalStoryDataAttributes`, and
     [`goal-story.test.ts`](../../test/kernel/goal-story.test.ts) drives the real
     `/goals`, Area-record and Review loaders over one workspace and demands
     equality across a measured Goal, an unmeasured one, a
     configured-but-unstarted one and a set-aside one.
  2. **No surface renders a Goal progress figure not derived from the shared
     evaluators**, asserted by ENUMERATION —
     [`goal-progress-renderings.test.ts`](../../test/unit/goals/goal-progress-renderings.test.ts)
     lists every one with the authority it must reach the figure through, and a
     completeness scan makes a new, undeclared rendering fail a build. The Task
     roll-up no longer paints a Goal's bar; the counts survive on the row's
     context line, worded as counts of Projects and Tasks.
  3. **The guided Review's Goals step states measurement, movement and the
     owner's condition beside its alignment**, with the target date formatted —
     inside a budget that MOVED FROM 6 TO 12 and says so (the FOLLOW-01
     precedent; two of the six moved inside `loadGoalStories` rather than being
     added, so the arithmetic is 6 − 2 + 8). Flat in the number of Goals,
     asserted against a counting database. Its selection is unchanged:
     `listGoalsByAlignment` still decides which Goals appear.
  4. **Search's Goal preview formats its target date** with the same
     `formatCalendarDate` every other surface uses.
  5. **DEBT-211's remaining prose is corrected**: the search preview (item 5),
     and `commands.ts`'s `goals.new` decision (item 3) — TAKEN rather than
     deferred again: the command navigates to `/goals?drawer=new-goal`, DS-03's
     URL drawer contract, which is one more door into the ONE creation flow.
  6. Light and dark, 1440 / 820 / 393 / 320, keyboard, `axe` clean with no rule
     disabled.
- **One thing it did that the criteria did not name.** The Goal IDENTITY rule
  (`goalIdentitySource`, STEER-01) moved from `app/modules/goals/goal-view.ts`
  to `~/shared/goal-progress/goal-identity.ts`, re-exported from its old path.
  A module may not import another module's internals, and a rule that has to be
  the same on the Area record and in the Review has to live where both can
  reach it. There is still exactly one implementation.

### ☑ STEER-04 — From signal to step — **delivered 2026-08-28**

**Where a signal points, a next step is named — or the missing structure can be
created.**

- **User problem.** The product tells the owner *where* attention is needed and
  stops. Today's "Continue working" cards carry health, progress and counts but
  no next action —
  [DEBT-77](../product/PRODUCT_DEBT.md#-debt-77--a-project-card-cannot-say-what-the-next-action-is--p3--resolved-2026-08-28-v25-steer-04)'s
  words: *"on a surface whose whole purpose is 'what should I do now?', that is
  one click more than it should be."* A Goal is worse
  ([DEBT-210](../product/PRODUCT_DEBT.md)): its record shows past contribution
  evidence but no forward step; a Goal whose alignment reads *"No contribution
  path"* offers no way to create one (`GoalProjectChips` only re-parents an
  existing Project; the Projects tab's empty state offers nothing); and the
  no-structure state — *"this Goal was never given a path"* — is a dead end on
  the very surface that diagnosed it.
- **Outcome.** **One next-action rule, kernel-owned, consumed everywhere it is
  needed.** Today's project cards each name their next actionable Task, opening
  in the Drawer Today already hosts. A Goal's record and workspace pane name
  the next step across the Goal's contributing Projects, with the Project it
  belongs to. Where the honest answer is absence, the surface says so in
  REVIEW-02's established words rather than inventing a task — and where the
  absence is *structural*, the surface offers the remedy: **"New Project for
  this Goal"**, landing on the existing `/projects/new` with the parent
  preselected and server-verified.
- **Why it belongs in this programme.** It is the step that turns V2.4's
  attention signals into decisions — the difference between a report and a
  steering surface. DEBT-77 has prescribed the implementation path since
  POLISH-02 and REVIEW-02 proved the rule; the Goal half is the same rule read
  through `project.advances_goal`. The creation door costs no new capability:
  a Goal has been a valid, server-resolved Project parent since AREA-02.
- **Major dependencies.** STEER-01 (the record/pane composition it lands on is
  settled, and the measurement wiring exists once). STEER-02 (a set-aside Goal
  offers no next-step prompt on attention surfaces — the condition must exist
  first). The kernel smart-sort expression in `d1-task-repository.ts`, reused
  and never duplicated.
- **Explicit non-goals.** **No second notion of "next"** — DEBT-77's rule,
  verbatim: reuse the canonical `smart` sort *"rather than inventing a second
  notion of 'next', or Today and `/tasks` will disagree about which task is
  next."* **No Task creation on a Goal** — a Task belongs to a Project or an
  Area (`AGENTS.md` §4), and REDESIGN-04 §4.2 already refused a Goal Tasks tab
  for this reason; the creation door makes a *Project*. No auto-planning, no
  auto-scheduling, no AI proposal, no notification. No change to which
  Projects Today's cards show or their order. The guided Review's bounded
  next-action scan stays exactly what it is — a disclosed approximation with
  its own honest wording — and is not widened.
- **Schema / API changes.** **None.**
- **Canonical authorities that must not move.** The Tasks smart-sort expression
  is the one ordering; the next-action read is a bounded, workspace-scoped
  ranked statement (the `ROW_NUMBER() OVER (PARTITION BY …)` shape DEBT-77
  records) beside the existing facts reads — never one query per card and never
  a scan pretending to be exhaustive. Task mutation stays with the canonical
  posters; the card's row opens the shared Drawer and mutates nothing itself.
  `POST /projects/new` remains the one Project creation path.
- **Measurable acceptance criteria.**
  1. DEBT-77's closing condition, made assertable: every card in "Continue
     working" names its next action; the route's statement budget moves by
     **exactly one** bounded statement — flat in the number of cards, never one
     per card — asserted with a counting database; and a test pins Today's
     "next" to the same ordering `/tasks` uses. (This is that entry's own
     intent — its *"query count is unchanged (one additional statement, not
     N)"* means the count does not grow with the cards; the phrasing is
     reconciled in its V2.5 disposition, because "unchanged" and "one
     additional" cannot both be a budget assertion.)
  2. A Goal's record and pane name the next step across its contributing
     Projects — the same rule, proven against the same ordering — naming the
     Project, opening the canonical Task Drawer, and stating REVIEW-02's honest
     absence where nothing is visible.
  3. A Goal in the no-structure state offers "New Project for this Goal";
     following it lands on `/projects/new` with the parent preselected, the
     server re-verifies the parent as it already does, and the created
     Project's first Task subsequently moves the Goal's movement line — the
     loop proven end to end.
  4. A set-aside Goal (STEER-02) is offered no next step on Today or `/plan`;
     its record still answers when asked.
  5. Flatness: six cards cost what two do; the ranked statement is bounded and
     inside the parameter ceiling, asserted with a counting database.
  6. Light and dark; the phone widths; keyboard reach to the new row and door;
     accessible names; `axe` clean with no rule disabled.
- **Closes.** DEBT-77, DEBT-210. **Closes if reached.**
  [DEBT-25](../product/PRODUCT_DEBT.md#-debt-25--today-continue-working-project-cards-area-context-is-not-navigable--p3)
  — its closing condition needs the parent Area id in the same read this item
  already touches; take it only if the id travels in the existing statement,
  which is that entry's own bar.
- **Delivered 2026-08-28.** Every criterion met, in one PR with STEER-03.
  1. **DEBT-77's closing condition, assertable.** Every "Continue working" card
     names its next action; the route's budget moves by **exactly one** bounded
     statement, read after the parallel block because it takes the RANKED cards'
     ids, and flat — six candidates cost what two do, asserted with a counting
     database. Today's "next" is pinned to `/tasks`'s ordering by a parity test
     that compares the ranked statement against the canonical collection read
     for the same Project.
  2. **A Goal's record and pane name the next step across its contributing
     Projects**, by the SAME rule composed through `project.advances_goal`,
     naming the Project, opening the canonical Task Drawer, and stating
     REVIEW-02's honest absence where nothing is visible.
  3. **A Goal in the no-structure state offers "New Project for this Goal"** —
     the ONE shared `NewProjectForm` in the Drawer with the Goal as its decided,
     **server-verified** parent, posting to the same `POST /projects/new`. The
     loop is proven end to end against real D1: the created Project is
     contributing structure on the next read, and its first completed Task moves
     the Goal's movement line.
  4. **A set-aside Goal is offered no next step on Today or `/plan`** — it is
     absent from both surfaces entirely (STEER-02's exclusion, in SQL) — and its
     record still answers when asked. Asserted on both sides in one test.
  5. **Flatness**, both levels: one statement for a Goal's Projects whatever
     their number, one for Today's cards whatever their number.
  6. Light and dark, the phone widths, keyboard reach to the row and the door,
     accessible names, `axe` clean with no rule disabled.
- **DEBT-25 was NOT taken.** Its own bar is that the parent Area id must travel
  in the existing statement. The next-action read is a statement about TASKS
  partitioned by Project; it carries no Area, and adding one would mean widening
  a different read on the product's most-visited route to satisfy a P3. The
  entry stays open, unchanged, with its bar intact.
- **One thing it did that the criteria did not name.** `NewProjectForm` moved to
  `app/shared/project-creation/`, re-exported from the Projects module so no
  call site changed. A Goal's record composing the Projects module's form would
  be a cross-module import; writing a second form would be a second creation
  surface. The move is the `NewGoalForm` precedent, taken for the same reason.

### ☑ STEER-05 — The week's door — **delivered 2026-08-28**

**Today offers this week's Review: start it, or continue it.**

- **User problem.** The remaining, Today-side half of
  [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05)
  (P2), in its own words: *"the weekly Review has no entry point on the screen
  the owner opens every day, so starting one is something they must remember
  rather than something the product offers."* V2.4 made the Review worth
  opening — the week account and habit consistency landed in it, and STEER-03
  widens its Goals step — while the way in is still memory.
- **Outcome.** DEBT-34's closing condition, delivered: Today offers the current
  period's Review as a real entry point — start it if none exists, continue it
  if one is underway — reading the **same** `currentReviewPeriod` authority the
  Reviews module uses, so the two cannot disagree about which week it is. The
  entry is calm: an offer, not a nag.
- **Why it belongs in this programme.** The Review is where steering actually
  happens — the ritual that reads alignment, movement, the week account and
  habit consistency together and turns them into next week's focus. A
  steering programme that leaves the ritual's door missing has built
  instruments for a room the owner has to remember exists.
- **Major dependencies.** None hard. Sequenced last so Today's composition —
  which STEER-04 also touches — is measured once, in its final shape.
  STEER-03's widened Goals step makes the door worth walking through, but
  nothing here reads it.
- **One decision this item must take and record.** The composition: which of
  Today's finite surfaces gives up space for a once-a-week prompt — DEBT-34's
  own framing — and what the entry shows once the period's Review is
  **completed** (a quiet completed state, or nothing until the next period).
  Recorded with the reason, measured at the phone widths.
- **Explicit non-goals.** No notification, no badge, no urgency colour, no
  count — the calm rules hold; a Review the owner never starts is never
  described as overdue or missed (ADR-110 decision 5's spirit: an absent ritual
  is an absence, not a failure). No new Review machinery and no second period
  authority. No change to the Review's content or steps. No streak of
  completed Reviews, anywhere.
- **Schema / API changes.** **None.**
- **Canonical authorities that must not move.** `currentReviewPeriod` (the
  owner's calendar week) is the one period authority; the entry point reads it
  and never re-derives it. Review creation and resumption stay the Reviews
  module's — Today links, it does not mutate.
- **Measurable acceptance criteria.**
  1. With no current-period Review, Today offers **Start**; with one underway,
     **Continue** (resuming at the guided flow's own resume semantics); the
     wording names the period. Both proven end to end.
  2. The entry reads the same `currentReviewPeriod` authority the Reviews
     module uses — asserted structurally (one import path), not by two values
     agreeing today.
  3. Today's route query count is **unchanged**, per DEBT-34's closing
     condition. If the existence read genuinely cannot ride the existing
     statements, that is recorded and put to the entry with the measured cost —
     ADR-110 decision 7's posture — not absorbed silently.
  4. The completed-period state is the recorded decision, and a period with a
     completed Review never renders an urging.
  5. Light and dark; 1440 / 393 / 320 with the entry present in every state;
     keyboard; accessible name; `axe` clean with no rule disabled.
- **Closes.** DEBT-34.
- **Delivered 2026-08-28.** Every criterion met.
  1. **The three states, proven end to end.** With no Review for the owner's
     week Today offers **Start**; following it lands on `/reviews/new`, whose
     form already opens on that week; with one underway the same band offers
     **Continue**, which lands on `/reviews/:id/guide` and is redirected to the
     owner's own resume step (REVIEW-02's semantics, untouched). The wording
     names the period in every state, visibly in the panel head and inside the
     control's accessible name.
     [`steer-week-door.spec.ts`](../../e2e/steer-week-door.spec.ts) drives the
     whole lifecycle — start → create → continue → resume → complete — in one
     journey, and [`today-review-door.test.ts`](../../test/kernel/today-review-door.test.ts)
     proves the states against real D1, including under BOTH week-start
     preferences: the same workspace read as a Sunday-start owner says
     "continue" and as a Monday-start owner says "start", because the two are
     genuinely different weeks.
  2. **One period authority, asserted STRUCTURALLY.**
     [`review-door-authority.test.ts`](../../test/unit/today/review-door-authority.test.ts)
     scans every file under `app/`: `currentReviewPeriod` is DECLARED in exactly
     one module, every consumer reaches it through the one published path
     (`~/kernel/reviews`, no deep imports), and Today's door contains no week
     arithmetic of its own — no `planningWeekStart`, no `weekDatesFor`, no day
     offsets, no SQL and no table name. FALSIFIED: replacing the door's
     `currentReviewPeriod` call with `planningWeekStart` — which agrees with it
     on every day — fails the guard immediately, which is the point of asserting
     the shape rather than the values.
  3. **The query-count clause could NOT be honoured, and the cost is recorded
     rather than absorbed.** Nothing Today already reads touches
     `review_details`, so there was no existing statement for the existence read
     to ride. MEASURED on an empty workspace: **20 → 21**, one bounded
     statement, in the existing parallel block, identical in all three door
     states. Both figures are pinned by a counting database, so a second Reviews
     read or a per-state read fails the suite. The read is
     `ReviewRepository.findPeriodEntry` — creation's OWN idempotency lookup,
     exposed on the contract and sharing one `PERIOD_MATCH` predicate with it,
     so "is there one?" and "there already is one" cannot become two rules. It
     answers with a small `ReviewPeriodEntry` rather than a `Review` precisely so
     it costs one statement and not two. The cost is put to DEBT-34 with the
     measurement, per ADR-110 decision 7.
  4. **The completed-period state is the recorded decision** — a quiet completed
     state, not an absence: *"This week's Review is done."* and a link to the
     canonical record to re-read it. The reason is recorded at
     `ReviewDoorCard`: a door that vanishes the moment it is used sends the
     owner back to memory for the rest of the week, which is DEBT-34's own
     defect on a shorter clock. A period with a completed Review renders no
     urging, asserted by a vocabulary guard over the rendered band ("overdue",
     "missed", "late", "behind", "streak", "in a row") in every state.
  5. Light and dark, 1440 / 820 / 393 / 320 with the band present in every
     state, keyboard reach and operation, an accessible name carrying the
     period, `axe` clean with no rule disabled.
- **The composition decision, and the measurement behind it.** The band is
  **full width at the very foot of the grid, below everything** — DEBT-34's
  "which surface gives up space?" answered *none of them*. The obvious
  alternative (a second six-column doorway paired with `Daily reflection`) was
  built and MEASURED first: at 1440 the foot row already holds `Continue
  working` (x 264, w 560) and `Daily reflection` (x 840, w 560), so a third
  six-column cell wrapped and left 560px of empty grid — and because `Continue
  working` is data-conditional, whether it did so depended on whether the owner
  had a project with open work. A band is deterministic at every width and in
  every data state; it is the `HabitsPanel` precedent for the mirror-image
  reason. Nothing above the first task moved: the day's first actionable row is
  at 461 / 497 / 597 / 646 px at 1440 / 820 / 393 / 320 with and without it.
- **Two things it did that the criteria did not name.**
  1. **`reviewPeriodLabel` moved to the kernel.** It lived in
     `app/modules/reviews/review-view.ts` with private `monthYear` and
     `quarterLabel` helpers duplicating `review-periods.ts`'s own. Today naming
     the week it offers would have been a cross-module import or a third
     implementation, so the rule moved down beside `currentReviewPeriod` — the
     authority it labels — and the Reviews module re-exports it, so no call site
     changed. The STEER-03 `goalIdentitySource` precedent, taken for the same
     reason.
  2. **Two `target-size` defects on Today were fixed, and neither was this
     item's** —
     [DEBT-214](../product/PRODUCT_DEBT.md#-debt-214--todays-small-row-links-met-no-target-size-floor-on-a-fine-pointer--p2--raised-and-resolved-2026-08-28-v25-steer-05).
     WCAG 2.2 AA SC 2.5.8's 24×24 minimum is not conditional on the pointer, and
     two of Today's small row links met no pointer-agnostic floor: STEER-04's
     next-action link, floored only inside `@media (pointer: coarse)`
     (MEASURED at 1280: 75.7 × **16.9** px, 18.8px of safe clickable space), and
     `.dh-day-row__title`, floored nowhere at all (MEASURED at 320: 210 ×
     **19.6** px, 18.2px). Both were **already failing tests on `main`** —
     `today-focus.spec.ts`'s *"passes axe"* and `goal-measurement.spec.ts`'s
     *"Today's progress sections fit a 320px phone"* — verified on a clean tree
     with a fresh database before any of this item's code existed. Fixed with
     one new named `--app-pointer-target-min` token (the standard's 24px, beside
     the product's 45px touch target rather than replacing it), because this
     item's own criterion 5 is an axe-clean Today and a red page cannot be
     scoped around.
- **What it found on Today's page and deliberately did NOT fix.**
  [DEBT-215](../product/PRODUCT_DEBT.md#-debt-215--three-e2e-assertions-still-address-the-area-records-goals-tab-as-a-card--p2--resolved-2026-09-02):
  three assertions in `goals.spec.ts` and `areas.spec.ts` still address the Area
  record's Goals tab as the `role="article"` Card that STEER-03 replaced with the
  shared `GoalStoryRow`, and they fail on `main` for that reason (measured on a
  clean tree). That is a different item's surface and a different pass's repair —
  V2.4-GATE-01's own recorded reason for the same choice: *"building three more
  fixtures inside a pass repairing fifty-five other tests is how a gate branch
  stops being reviewable."* It is recorded with the measurement and the worked
  example for the fix rather than absorbed here.

---

## Why this sequence

- **STEER-01 first.** It takes the decision every later item renders through —
  what `/goals` is — and it repairs the one place the Goal layer currently says
  something untrue (page counts reading as workspace facts). Trust before
  capability, the same order V2.4 ran its gates before its features. It also
  collapses the duplicated measurement wiring, so STEER-03 and STEER-04 land on
  one composition instead of two.
- **STEER-02 second.** The owner's condition must exist before the story
  propagates: STEER-03 carries the whole Goal story to the Area record and the
  Review in one pass, and doing that before the condition exists means
  propagating twice. Its migration also starts the clock on the one
  production-apply constraint this programme has (the owner's backup), which is
  better met early than discovered late.
- **STEER-03 third.** With the surface decided (01) and the facts complete
  (02), one propagation makes every Goal story agree — including the ritual's.
- **STEER-04 fourth.** The action layer lands on the settled record/pane
  composition and respects the set-aside rule; its "New Project for this Goal"
  door completes the no-structure loop STEER-03's propagated signals will point
  at more often.
- **STEER-05 last, and unblocked throughout.** It depends on nothing above and
  may be taken earlier if an item ahead of it blocks; it is sequenced last so
  Today's composition — which STEER-04 also changes — is measured once, in its
  final shape. **That sequencing earned its keep**: measuring Today once, in its
  final shape, is what surfaced both the composition answer (the foot row was
  already full, so the door is a band) and the `target-size` defect STEER-04 had
  left on the same page.
- **E2E cost is answered per item, the FOLLOW-02 way.** Each item sizes its
  journey to fit the thirteen-partition gate before reaching for capacity
  (FOLLOW-02 fitted 18.7 s; FOLLOW-01 moved the count with arithmetic).
  [DEBT-205](../product/PRODUCT_DEBT.md#-debt-205--536-seconds-of-e2e-gate-capacity-is-stranded-because-a-sliced-spec-file-takes-its-partitions-exclusively--p2--resolved-2026-09-04-v28-conv-03)'s
  536 stranded seconds are recovered **only** by an item that measures it
  cannot fit — a deliberate pass over `derivePartitions`, never a side effect.

---

## LATER — real, evidenced, and deliberately not V2.5

Recorded so none is mistaken for an oversight. Each is a separate product
decision with a named home.

| Deferred | Evidence | Why not now |
|---|---|---|
| **Retrieval & capture velocity** — a canonical tag model, `#tag` + time in the capture grammar, Search's empty query offering recent records | [DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3--resolved-2026-08-29-v26-find-02), [DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3--resolved-2026-08-29-v26-find-03), [DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01) (P2); DHDS-13 §13 capture *"Below"* | **The strongest competing theme and the presumptive V2.6 — and it is now [V2.6](ROADMAP_V2_6.md), confirmed against its competitor rather than inherited.** One coherent programme around a kernel tag decision — V2.4's reason, still true. While DEBT-195 is open the product still does not claim an A on DHDS-13's scale, and this file says so rather than hiding it. |
| **One Task anatomy** — Today/search/Project tab rendering Tasks as Cards | [DEBT-128](../product/PRODUCT_DEBT.md#-debt-128--today-projects-and-search-still-render-tasks-as-cards-so-one-object-has-two-anatomies--p2--resolved-2026-09-03-v28-conv-02) + [DEBT-175](../product/PRODUCT_DEBT.md#-debt-175--the-project-records-tasks-tab-is-the-last-surface-that-does-not-render-the-shared-taskrow--p2--resolved-2026-09-03-v28-conv-01) (both P2) | The two entries' own instruction is to close **together**, as one bounded convergence pass. V2.5's items do not require it — GATE-02 proved the semantics converge through the shared kernel functions — and STEER-04's card next-action row opens the canonical Drawer rather than widening the fork. Strongest non-theme candidate to ride beside V2.6. |
| **A first-run / sparse-workspace experience** | DHDS-13 §13 (*"Below"*) | Unchanged from V2.4: a programme of its own, and this product is one owner's populated daily driver. |
| **The offline slice** — habit check-in, template create, dependency edit, relationship/order changes | DEBT-155, DEBT-160, DEBT-161, DEBT-167, DEBT-170, DEBT-190 | One decision about what the offline contract covers, judged together. No new evidence since V2.4. |
| **AI over the follow-through data** — daily planning proposals, the Review assistant's fact block | AI-03 ◐, [DEBT-91](../product/PRODUCT_DEBT.md#-debt-91--the-weekly-review-assistants-fact-block-is-narrower-than-the-guided-reviews-own-evaluators--p3), DEBT-92, DEBT-93 | **Newly unblocked and still deferred.** V2.4 built the owner-verifiable data AI-03's precondition named; a live provider key remains owner-held and has never been exercised from this repository, and evidence, not novelty, schedules AI work. **Deferred again by [V2.6](ROADMAP_V2_6.md#the-ai-decision-recorded-rather-than-postponed), which audited it as the working hypothesis and rejected it — not for unreadiness (the platform shipped 2026-08-05 and V2.5's own `loadGoalStories` is the fact block it needs) but because the blocker is a credential this repository has never held. The blocker, the gate and the sequence are named there.** |
| **Stronger reporting / Analytics growth** | DEBT-103, DEBT-145, [DEBT-122](../product/PRODUCT_DEBT.md#-debt-122--expressivesummary-now-has-no-consumer--p3) | The owner's own word is *"later"*. V2.5 takes the reporting loop's two bounded gaps (the Review step's blind spots, the missing door) and leaves the rest — including the `ExpressiveSummary` / M3X-hierarchy decision, whose obvious consumer is a future reporting surface. |
| **Project & template capabilities** — a Project description, template dates and repeats | [DEBT-137](../product/PRODUCT_DEBT.md#-debt-137--a-project-has-no-description-field-so-its-gallery-card-cannot-say-what-it-is--p2) (P2), [DEBT-165](../product/PRODUCT_DEBT.md#-debt-165--a-template-carries-no-dates-relative-or-otherwise--p2) (P2), DEBT-166, DEBT-168 | Real module capabilities, each with its own decision (a description slice; a closed offset vocabulary). Neither serves this theme, and taking P2s off-theme is how a programme becomes a grab-bag. |
| **The E2E machinery** — stranded capacity, accumulated-state specs, timing races | [DEBT-205](../product/PRODUCT_DEBT.md#-debt-205--536-seconds-of-e2e-gate-capacity-is-stranded-because-a-sliced-spec-file-takes-its-partitions-exclusively--p2--resolved-2026-09-04-v28-conv-03), DEBT-173, DEBT-203 (P2s) | Standing constraints every item works inside. Recovered or repaired only by a deliberate pass whose subject they are — machinery every job depends on is not edited as a side effect. |
| **Plan's board proportions** | DEBT-162, DEBT-163 | Unchanged from V2.4: composition questions, none costing the owner information. |

### Standing non-goals, carried forward unchanged

V2.3's and V2.4's lists still stand and are not re-litigated: subtasks · AI
automatic weekly planning · automatic time blocking · calendar write-back ·
Gantt charts and dependency timelines · automatic date shifting · critical path ·
a dependency notification programme · resource capacity planning · estimates and
time tracking · shared or team planning · public or shared smart lists · a
smart-list marketplace · a new calendar module · a month grid or week timetable ·
adherence scores, plan grades, streaks, chains, productivity numbers and
rankings of weeks (ADR-110).

V2.5 adds its own, from ADR-111:

- **No composite Goal score.** Alignment, movement, measurable progress and the
  owner's condition are four answers to four questions. No surface merges them
  into one number, rank, grade, colour or "health" — and movement remains an
  **attention** signal, never an outcome metric (FOLLOW-02's recorded rule).
- **No derived judgement stored, no stored judgement derived.** The system
  never writes the owner's condition; the owner's condition never feeds a
  derivation.
- **No second next-action rule.** One ordering, kernel-owned.
- **No gamification of the Review** — no completion streak, no "N weeks in a
  row", ever.

And the architectural ones, which V2.5 may not reopen without its own ADR: no
second Task authority · no second filter DSL · no new relationship model
(EntityLinks, ADR-002/ADR-106) · no second representation of a concept because a
new panel wants one · no module-local design primitive where a shared one owns
the behaviour · no new runtime component or design library, and no DHDS-14 · no
broad rewrite of working architecture for aesthetic reasons · no snapshot table
for a plan or a Goal (ADR-110).

---

## Dependencies

```
STEER-01  ──►  STEER-02  ──►  STEER-03  ──►  STEER-04       STEER-05
(the surface     (the facts:     (one story,     (the action     (the door;
 decision +      condition +      everywhere)     layer)          no hard
 true counts)    move)                                            predecessor —
                                                                  taken last so
                                                                  Today is
                                                                  measured once)
```

External, and stated once rather than per item: **V2.4-GATE-01's two owner-held
halves are the standing preconditions for any V2.5 production release** — a real
backup before any migration is applied (STEER-02 is this programme's only one),
and credentials for `verify:production`. They remain recorded in
[`ROADMAP_V2_4.md`](ROADMAP_V2_4.md), they are not re-adopted here, and no V2.5
item claims them.

Internal: every item consumes — and none modifies — `evaluateGoalProgress`
(GOAL-02), `evaluateGoalAlignment` (ADR-040), `evaluateGoalMovement` and the
`activity-window` machinery (FOLLOW-01/02), `loadGoalSummaries`, the Tasks
smart-sort expression, and `currentReviewPeriod`. STEER-02's condition column is
the one new stored fact in the programme, and it is owner-written only.

---

## The acceptance boundary

Every item carries DHDS-13's durable rule and V2.4's counterpart, both verbatim:

> **A visual claim about a rendered surface is proven by a measurement of that
> surface, not by looking at it.**

> **A numerical claim about the owner's history is proven against a fixture whose
> events are known, not against whatever the workspace happens to hold.**

And V2.5 adds one of its own, for the layer it builds:

> **A claim that two surfaces tell the same story is proven by reading the same
> machine value from both, never by comparing sentences that happen to match** —
> FOLLOW-02's parity method, promoted to the programme's rule.

Concretely, where applicable, every item is accepted against: real seeded data;
light and dark (dark driven by the media query); desktop, tablet and the
320 / 360 / 375 / 393 / 430 phone widths; keyboard reach, visible focus and an
accessible name on every control; overflow and truncation by measurement;
reduced motion where motion is involved; bounded queries with a flatness proof
and no N+1, inside D1's 100-bound-parameter ceiling; deterministic tests — no
test skipped, weakened, quarantined or deleted, and no timeout raised, to make a
phase look green. A behavioural defect is never closed on a screenshot.

---

## The audit's debt, reconciled

The 2026-08-27 Goal-experience audit raised six entries, and this roadmap gives
every one a home in the same pass — no finding is left as prose. Dispositions of
the older entries this programme takes or weighs are recorded on the entries
themselves in [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md).

| Entry | Severity | Disposition |
|---|---|---|
| **DEBT-206** — an Area's Goals tab draws a third Goal progress no other surface has | P2 | **Taken** — STEER-03. |
| **DEBT-207** — `/goals` loads three reads it never renders | P3 | **Taken** — STEER-01. |
| **DEBT-208** — the same Goal wears two identity marks on one screen | P3 | **Taken** — STEER-01. |
| **DEBT-209** — the Review's Goals step is blind to measurement and movement | P3 | **Taken** — STEER-03. |
| **DEBT-210** — a Goal signal names no next step and a structureless Goal offers no way to create one | P3 | **Taken** — STEER-04. |
| **DEBT-211** — the Goals module's prose has drifted from the shipped surface in five places | P3 | **Taken** — STEER-01 + STEER-03. This roadmap's own PR adds the one dated supersession note `GOALS_MODULE.md` needs to stop contradicting the code today; the rewrite lands with the items. |
| DEBT-120 · DEBT-121 · DEBT-192 | P3 | **Taken** — STEER-01. |
| DEBT-183 · DEBT-184 | P3 | **Taken** — STEER-02. |
| DEBT-77 (and DEBT-25 if reached) | P3 | **Taken** — STEER-04. |
| DEBT-34 | P2 | **Taken and CLOSED** — STEER-05 delivered the Today half; the Review half closed with FOLLOW-01. The entry is ☑. |
| DEBT-195 · DEBT-182 · DEBT-48 | P2/P3 | **Deferred whole** to the retrieval-velocity theme, with the A-scale consequence stated in [LATER](#later--real-evidenced-and-deliberately-not-v25). |
| DEBT-128 · DEBT-175 | P2 | **Not taken**, with the reason in LATER: they close together as their own bounded pass. |
| DEBT-205 · DEBT-173 · DEBT-203 | P2 | **Standing constraints**, recovered only deliberately. |

---

## Related documents

- [`ROADMAP_V2_6.md`](ROADMAP_V2_6.md) — the successor programme, where new work goes once STEER-05 is delivered
- [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) — the predecessor programme this succeeds, and the owner-blocked gate that stays recorded there
- [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question) — the decision this programme is built on
- [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) — the derived-never-stored rule every item inherits
- [ADR-040](../decisions/ARCHITECTURE_DECISIONS.md#adr-040--alignment-a-derived-non-persisted-goaltask-activity-signal-hosted-on-the-real-goals-collection) — alignment, whose ordering STEER-01 re-homes rather than deletes
- [`V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md`](../product/V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md) — the movement derivation and the four-combination rule STEER-02 extends
- [`GOALS_MODULE.md`](../development/GOALS_MODULE.md) — the Goals module authority (carries the supersession note until STEER-01/03 rewrite it)
- [`REDESIGN_04_SPINE_WORKSPACES_2026_08.md`](../design/REDESIGN_04_SPINE_WORKSPACES_2026_08.md) — the workspace decision STEER-01 keeps
- [`REVIEWS_MODULE.md`](../development/REVIEWS_MODULE.md) — the guided Review STEER-03 widens and STEER-05 opens a door to
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — the product handbook this theme is derived from
