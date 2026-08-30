# ROADMAP_V2_6.md — DalyHub V2.6

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1, [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md)
> holds V2.2, [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) holds V2.3 (**closed**),
> [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) holds V2.4 (complete apart from
> V2.4-GATE-01's two owner-held halves), and
> [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md) holds V2.5 — **complete since
> 2026-08-28, when
> [STEER-05](ROADMAP_V2_5.md#-steer-05--the-weeks-door--delivered-2026-08-28)
> landed.** This file was written while STEER-05 was still ☐, and every
> statement below that it is unfinished is preserved as the record of what was
> true when the decision was taken; the prerequisite is met.
>
> **This file is V2.6, and it is where new work goes** — *after* STEER-05, which
> was not moved here, not re-scoped and not absorbed. V2.5 finished in V2.5.
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

---

## V2.6 IS COMPLETE (2026-08-29)

All four items are ☑ delivered, and the programme closed **every** entry it took:
[DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01)
(FIND-01), [DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3--resolved-2026-08-29-v26-find-02)
(FIND-02) and [DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3--resolved-2026-08-29-v26-find-03)
(FIND-03), with DHDS-13 §13 advanced by FIND-04. Six entries were raised and
deliberately not taken (DEBT-216 by FIND-01; DEBT-217 … DEBT-221 by the tag
programme), each about a surface the item does not own.

**The E2E gate is red, and not for this programme's reasons.** Seven journeys
fail on this branch's head, and every one of them fails for a cause that predates
it: DEBT-215 (three assertions, left by STEER-05), DEBT-216 (left by FIND-01),
DEBT-219, DEBT-220 and DEBT-221. Eight of the thirteen partitions are green, the
unit and kernel suites are green, and none of the tag programme's own 19 journeys
fails. Repairing five other items' surfaces inside this branch is the
reviewability cost this register keeps recording, so they are written down
instead — the truth-restoration pass that owns them now has five entries carrying
measurements, rather than a red gate carrying no explanation.

**Complete is not deployed, and the two are not conflated.** FIND-02 committed
[`0049_create_tag_vocabulary.sql`](../../migrations/0049_create_tag_vocabulary.sql),
which **carries data** — it moves every tag out of three columns and rebuilds two
tables. It is applied locally and proven from the old schema; it is **not applied
to production**, and it must not be until V2.4-GATE-01's owner-held backup half is
genuinely satisfied ([DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-scheduled-production-backup-has-never-produced-a-backup-because-the-encryption-key-is-not-configured--p1),
P1, still open). Merge readiness is established; deployment readiness is the
owner's, and no item in this programme claims it.

---

## The theme: RETRIEVAL & CAPTURE VELOCITY

**V2.5 made the Goal layer decision-grade. V2.6 makes the workspace fast to put
things into and fast to get things out of.**

Three programmes in a row have made DalyHub *truthful*: V2.4 made task and
planning signals honest and derived follow-through from the Activity stream,
V2.5 made a Goal say one thing everywhere and point at a step. None of them
touched the two actions the owner performs dozens of times a day — **putting a
thought in** and **finding a record again**. Both are measurably below the bar
the product set for itself, both have been deferred twice with the reason
recorded each time, and the register carries a standing sentence about it:

> *"While [DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01)
> is open the product does not claim an A on DHDS-13's own scale."*

V2.6 is the programme that removes that sentence.

It is **not** an AI programme, and the reason is written out in full in
[The AI decision](#the-ai-decision-recorded-rather-than-postponed) rather than
compressed to "AI later" — because the AI question was audited seriously for
this programme, the answer is *not* "AI isn't ready", and a future reader
deserves the actual blocker rather than a shrug.

---

## Where V2.5 left the product

Four of five items delivered (2026-08-28):

- **STEER-01** — `/goals` is ordered by outcome, in SQL before pagination; lens
  counts are workspace-true; three dead reads removed; one identity rule.
- **STEER-02** — the owner's hand: a stored `set_aside` condition beside the
  derived signals, never merged with them; a Goal moves between Areas keeping
  its history.
- **STEER-03** — one Goal story, composed once by `loadGoalStories` and read by
  the Goals collection, the Area record, the Goal record and the guided Review's
  Goals step. Eight D1 statements, flat in the number of Goals, parity asserted
  by comparing machine values across three loaders.
- **STEER-04** — one next-action rule (`selectNextAction` / `selectGoalNextAction`,
  kernel-owned), on Today's project cards and the Goal record, plus the door
  that creates the missing Project.

**STEER-05 — the week's door — was not delivered when this programme was
defined.** It was V2.5's last item and it stayed there. **It has since landed
(2026-08-28):** Today offers the current period's Review, and
[DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2)
is closed. The precondition this programme set itself — **STEER-05 is completed
before FIND-01 starts** (see [Dependencies](#dependencies)) — is satisfied, and
V2.5's five-item sequence is complete.

What V2.5 did **not** touch, and what this programme is about: no tag model was
created, no capture token was added, no recency source was built, and Search
still answers an empty query with a restatement of its own placeholder.

---

## The audit this programme is built on

Unlike V2.4 and V2.5, this programme is not built on a fresh product audit — it
is built on **debt that was already measured, twice deferred with its reason,
and re-verified against current `main` for this decision**, plus a readiness
audit of the AI platform that the working hypothesis for V2.6 assumed did not
exist. Both audits are recorded here because both changed the answer.

### Finding 1 — the retrieval and capture evidence is unconditional, and stale

| Entry | Severity | Verified against `main` (2026-08-28) |
|---|---|---|
| [DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01) | **P2** | True. `app/routes/search.ts` resolves a bounded `q` against the registry's search providers. There is no recency source anywhere in the product, and no provider can answer an empty query. |
| [DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3--resolved-2026-08-29-v26-find-02) | P3 | True. Tags are a free-text JSON array on **three** detail tables — `person_details.tags` (0013), `asset_details.tags` (0016), `note_details.tags` (0019) — each normalised in `~/shared/forms/tags.ts` and each with its own suggestion set. No tag record, no workspace vocabulary, no rename, no search. |
| [DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3--resolved-2026-08-29-v26-find-03) | P3 | True. No tag field on `task_details`, no tag dimension in the Tasks filter declaration. The entry's own desired state — *"almost certainly"* a kernel primitive rather than a Task-only field — is still the open decision. |
| DHDS-13 §13 | — | Capture speed rated **"Below"** the reference bar, unchanged. |

And the specific mechanism, which matters for scoping FIND-04: the capture
grammar in [`app/shared/task-record/quick-capture.ts`](../../app/shared/task-record/quick-capture.ts)
(803 lines) is a *deliberately bounded closed token vocabulary* — `p1`…`p4`, the
Time Sectors, `someday`, `routine`, `waiting`, `delegate`, restrained calendar
phrases and bounded `every …` recurrence. It has **no `#tag` token, and could
not have one**, because there is nothing for a tag token to resolve against.
The capture gap and the tag gap are the same gap seen from two ends.

### Finding 2 — the AI platform is built, and has never made a request

This is the finding that changed the programme. The V2.6 working hypothesis was
that DalyHub should now build *"one narrow, explainable assistant capability
built on existing product-derived facts."* **That capability already exists and
shipped on 2026-08-05.** What was audited, and what is actually there:

- **~9,800 lines across four layers.** `app/kernel/ai/` (3,851, pure — contracts,
  response schemas, a versioned prompt registry, the model/pricing registry,
  budgets, the evidence and citation contract, the privacy classification, the
  feature policy table, the request state machine, a typed error family);
  `app/platform/ai/` (2,628 — Anthropic and OpenAI adapters, one `fetchJson`
  transport owning timeout/abort/redaction, the pure `providerEndpoint` SSRF
  boundary, secret resolution that hands out adapters and never keys, evidence
  retrieval over the existing search projections and EntityLinks, deterministic
  answers); `app/modules/ai/` (1,658 — `/ai`, `/ai/assist`, `/ai/apply`);
  `app/shared/ai/` (1,675 — the review UI and the Weekly Review surface).
- **Four features, a closed set**: meeting action extraction, note action
  extraction, the **Weekly Review assistant**, and Ask DalyHub (which answers
  allowlisted deterministic intents from repositories with **no provider call at
  all**).
- **Storage**: migration `0030`'s `ai_usage_requests` operational ledger — which
  records no prompt, no response and no record content — and
  `workspace_ai_preferences`. No AI-owned domain state.
- **Tests**: `test/unit/ai/{schemas,policy,adapters,acceptance,evaluation,review-surface}`,
  `test/kernel/{ai-platform,ai-apply-proposal}`,
  `test/unit/deploy/production-ai-configuration`, and
  [`e2e/ai-assistance.spec.ts`](../../e2e/ai-assistance.spec.ts) — 897 lines,
  29 journeys, which prove AI is off by default, that the surfaces explain
  themselves calmly with no provider, that Settings holds no field that could
  store a key, that refusal is server-side, and that `/ai/apply` cannot be
  reached without a reviewed proposal.
- **The governing rules already exist and are stronger than the ten principles
  this programme was asked to consider adopting.**
  [ADR-073](../decisions/ARCHITECTURE_DECISIONS.md#adr-073-the-controlled-ai-platform--provider-independence-proposal-only-writes-application-enforced-budgets-and-an-evidence-contract)
  states twenty decisions covering proposer-not-authority, facts-passed-not-derived,
  explicit confirmation, evidence-id citation with rejection of invented ids,
  no AI-owned state, application-enforced budgets checked *before* the call,
  full usability with AI off, and structural privacy exclusion of People and
  Diary. They are preserved, not restated.

And then, in the platform's own words
([`AI_PLATFORM.md`](../development/AI_PLATFORM.md) §21, **re-verified for this
programme**):

> **Nothing in this repository has ever contacted Anthropic, OpenAI or a
> Cloudflare AI Gateway.**

`scripts/ai-integration-check.mjs` — the only thing that would — has never run.
`git log` shows no change to `app/kernel/ai`, `app/platform/ai` or that script
since the AI-02 release. Every claim DalyHub makes about its own request shape,
header set, response envelope, `store: false` and token accounting is a claim
about **provider documentation read on 2026-08-05**, not about a request that
was made.

### Finding 3 — V2.5 made the AI grounding gap both cheaper and worse

[DEBT-91](../product/PRODUCT_DEBT.md#-debt-91--the-weekly-review-assistants-fact-block-is-narrower-than-the-guided-reviews-own-evaluators--p3)
records that the Weekly Review assistant's fact block reports `0` placeholders
for stalled Projects, Projects without a next action, Goal alignment and Diary
counts. Re-reading
[`app/modules/ai/review-facts.ts`](../../app/modules/ai/review-facts.ts) against
current `main` shows the entry is now **too narrow twice over**:

- **Cheaper to close.** `loadGoalStories` (STEER-03) *is* a bounded, tested,
  eight-statement fact block containing measurement, alignment, movement, the
  owner's condition and contributing Projects. `selectGoalNextAction` (STEER-04)
  is the canonical next action. The fact block DEBT-91 wants no longer has to be
  built — it has to be *called*.
- **Worse if it ran.** The block still has no field for the owner's `set_aside`
  condition, for movement, for measurement or for the canonical next action. An
  assistant that ran today would describe a Goal the owner **deliberately put
  down** as neglected — telling the owner something untrue about their own
  recorded judgement, which is the exact failure ADR-111 decision 1 exists to
  prevent, arriving through the one surface that cannot be corrected by looking
  at the screen beside it.

This is recorded on DEBT-91 as a dated V2.6 amendment rather than as a new
number, because it is the same defect finding new instances.

### Finding 4 — the AI model and pricing registry has no way to go stale safely

Not previously in the register.
[`app/kernel/ai/ai-models.ts`](../../app/kernel/ai/ai-models.ts) pins six
provider model ids and their prices with `PRICING_VERIFIED_AT = "2026-08-05"`.
ADR-073 decision 8 **refuses** a model with no verified price for budgeted use,
which is the right rule; ADR-073's own consequences say the registry *"is a
dated fact that will go stale and must be re-verified deliberately."* Nothing
schedules that deliberation: no test asserts freshness, no preflight checks it,
and the only surfacing is a sentence in Settings. A retired provider model id
would return `404`, which
[`provider-transport.ts`](../../app/platform/ai/provider-transport.ts) maps to
`model_unavailable` — so the **first** live run, whenever it happens, may fail
for a reason that has nothing to do with the code under test. Raised as
[DEBT-213](../product/PRODUCT_DEBT.md).

---

## The governing product argument

### The working hypothesis, tested

The hypothesis put to this decision was:

> *V2.6 should be AI-first, with one narrow, explainable assistant capability
> built on DalyHub's existing product-derived facts.*

It was tested and **rejected**, for a reason that is close to the opposite of
the one that would have been given a month ago. Not *"AI is premature"* — AI is
built, and V2.5 made its grounding excellent. The reason is:

**Every user-visible outcome of an AI programme is gated on a credential this
repository has never held, and this repository has a measured, 0-for-3 record
on owner-held blockers clearing.**

Three are outstanding right now:

| Owner-held blocker | Open since | Programmes it has outlived |
|---|---|---|
| A provider API key ([`AI_PLATFORM.md`](../development/AI_PLATFORM.md) §21) | 2026-08-05 | V2.2 · V2.3 · V2.4 · V2.5 |
| `BACKUP_ENCRYPTION_PASSPHRASE` ([DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-scheduled-production-backup-has-never-produced-a-backup-because-the-encryption-key-is-not-configured--p1), P1) | 2026-08-22 | V2.4 · V2.5 |
| `verify:production` credentials (V2.4-GATE-01 RELEASED) | 2026-08-22 | V2.4 · V2.5 |

Scheduling a programme whose headline item cannot be *proven* — not merely
cannot be polished, cannot be proven at all — behind the fourth is optimism, not
evidence. **The asymmetry is what settles it:** if AI is chosen and the key
never arrives, V2.6 ships nothing the owner can see. If retrieval is chosen and
the key arrives mid-programme, nothing is lost and the AI programme gets
**cheaper** — because a canonical tag vocabulary and a recency source are inputs
to `evidence-retrieval.ts`, which is
[DEBT-93](../product/PRODUCT_DEBT.md#-debt-93--ai-evidence-retrieval-is-keyword-and-relationship-only--p3)'s
own subject. The dependency arrow points one way, and only one way.

### The candidates, weighed

Both were audited against the same criteria. Qualitative, per this repository's
tradition — there is no composite score, and inventing one for a two-way choice
would be the same mistake ADR-111 forbids for Goals.

| | **A — AI-first** | **B — Retrieval & capture** |
|---|---|---|
| **Daily-driver value** | The one shipped assistant lives *inside* the weekly Review. Used ~once a week. | Search and capture are used many times a day. **B** |
| **Frequency** | Weekly, deliberate, opt-in. | Every session. **B** |
| **User-visible payoff** | **Zero until a key exists.** Then large. | Immediate and unconditional. **B** |
| **Architectural readiness** | **Exceptional.** Platform built, budgets enforced, schemas owned, V2.5's fact block ready to call. **A** | Requires a genuine kernel decision (tags) plus a recency-source decision. Neither is settled. |
| **Implementation risk** | Low in code; **unbounded** in provider reality — §21 says to expect a header, field name or envelope documentation did not settle. | Ordinary, DalyHub-shaped, and the repository is demonstrably good at it (ADR-014, ADR-102, ADR-106 are this exact shape). **B** |
| **Data / privacy risk** | Real but *already solved*: structural classification, People and Diary excluded by default, `store: false`, a ledger with no content. **A** | New: a recency ledger records *what the owner looked at*, which is a category of data DalyHub has never stored. Must be decided, not assumed. |
| **Migration risk** | None — no migration needed. **A** | Three existing free-text tag columns must converge onto one vocabulary without losing a tag. Real, and the reason FIND-02 is its own item. |
| **Dependency risk** | **Total, external, and unclearable from inside this repository.** | None external. **B** |
| **Mobile value** | Low — a weekly deliberate action on the surface least used on a phone. | High — capture and re-finding are what a phone is *for*. **B** |
| **Ships incrementally** | Poorly. The gate is all-or-nothing: a key exists or it does not. | Cleanly. Four items, each closing named debt on its own. **B** |
| **Falsifiable correctness** | Deterministic half: yes, and largely **already tested**. Provider half: **not falsifiable in this repository at all.** | Fully falsifiable. A tag normalises, persists, filters and appears in one vocabulary, or it does not. **B** |
| **Current debt severity** | DEBT-91, 92, 93 — all **P3**. | DEBT-195 **P2** with a standing A-scale sentence; DEBT-182, DEBT-48 P3; DHDS-13 §13 "Below". **B** |
| **Unlocks later work** | Little. Search gains nothing from an assistant. | **Directly unlocks AI**: tags and recency are retrieval inputs (DEBT-93). Also unlocks saved-view expressiveness and cross-module findability. **B** |
| **Can the product explain its result truthfully?** | Today, **no** — the fact block would describe a set-aside Goal as neglected (Finding 3). | Yes. A recent record is a record; a tag is a tag. **B** |

**A wins on readiness and on privacy maturity. B wins on everything the owner
would notice.**

### Why this and not the other candidates

Weighed against the evidence, and rejected as the *theme*:

- **AI over the follow-through and Goal data** — the working hypothesis, and the
  strongest competitor for the second programme running. Recorded in full in
  [The AI decision](#the-ai-decision-recorded-rather-than-postponed) with its
  named blocker, the gate it must start with, and the debt that comes with it.
  Deferred **whole**, for a stated reason, with the sequence it will take when
  the blocker clears written down in advance so that programme does not have to
  re-decide it.
- **One Task anatomy** — [DEBT-128](../product/PRODUCT_DEBT.md#-debt-128--today-projects-and-search-still-render-tasks-as-cards-so-one-object-has-two-anatomies--p2)
  + [DEBT-175](../product/PRODUCT_DEBT.md#-debt-175--the-project-records-tasks-tab-is-the-last-surface-that-does-not-render-the-shared-taskrow--p2)
  (both P2), whose own instruction is to close **together** as one bounded
  convergence pass. V2.5 named them *"the strongest non-theme candidate to ride
  beside V2.6"*, and that judgement is re-taken and **held**: FIND-01 renders
  recent records into Search, which is one of the three surfaces DEBT-128 names.
  It is not taken here — a convergence pass is its own subject, and doing half
  of it inside a retrieval item is how a pair that must close together stops
  being a pair — but FIND-01 **must not widen the fork**: see its non-goals.
- **A first-run / sparse-workspace experience** — DHDS-13's other *"Below"*.
  Unchanged from V2.4 and V2.5: a programme of its own, and this product is one
  owner's populated daily driver.
- **The offline slice** — DEBT-155, 160, 161, 167, 170, 190. One decision about
  what the offline contract covers, judged together. No new evidence since V2.4.
  Note, and do not absorb: FIND-04 touches the capture grammar, which the
  offline capture queue replays — the constraint is recorded on that item.
- **Stronger reporting / Analytics growth** — the owner's own word is *"later"*,
  unchanged. DEBT-103, DEBT-145, DEBT-122 stay where they are.
- **Project & template capabilities** — DEBT-137 (P2), DEBT-165 (P2), DEBT-166,
  DEBT-168. Real module capabilities, each with its own decision. Taking P2s
  off-theme is how a programme becomes a grab-bag; V2.5 said so and it is still
  true.
- **The E2E machinery** — DEBT-205, DEBT-173, DEBT-203. Standing constraints
  every item works inside, repaired only by a pass whose subject they are.
- **Another visual/quality programme** — still foreclosed by DHDS-13 §18. There
  is no DHDS-14. Every UI change in this programme is tied to a named product
  problem on a named surface.

The programme is accepted as
[ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable),
which fixes the constraints every item below inherits.

---

## NOW

Four items. The unconditional P2 first, then the kernel decision the theme was
deferred whole for, then its two consumers.

**All four are ☑ delivered (2026-08-29)**, and the register's standing A-scale
sentence left with FIND-01. **V2.6 is complete.**

---

### ☑ FIND-01 — Search answers before you type — **delivered 2026-08-29**

**Opening Search shows the records you were just working on.**

- **User problem.**
  [DEBT-195](../product/PRODUCT_DEBT.md#-debt-195--searchs-empty-query-offers-nothing-to-open--p2--resolved-2026-08-29-v26-find-01)
  (P2), in its own words: *"The fastest path to a record you looked at five
  minutes ago is to remember and retype its name."* Opening Search with no query
  shows one sentence that restates the placeholder directly above it. Every
  reference product answers the empty query with recent records, and
  [`AGENTS.md §3`](../../AGENTS.md#3-personal-operating-system-principles) says the command palette is
  the shell — a shell that is useless until a keystroke is not a shell.
- **Outcome.** DEBT-195's closing condition, delivered: opening Search with no
  query lists the owner's recent records, workspace-scoped, in the **same row
  grammar the results use**, and opening one is one keystroke and one Enter
  away. The A-scale sentence leaves the register.
- **Why it belongs in this programme, and why it is first.** It is the theme's
  only P2, it has no dependency on the tag decision, and it is the half of the
  theme that can be finished whatever happens to the other three. V2.5's own
  STEER-05 is the standing argument for not putting the severity leader last: a
  programme's final item is the one that does not ship.
- **Major dependencies.** None inside this programme. Sequenced after STEER-05
  only because V2.5 finishes first.
- **One decision this item must take and record — and it is the whole item.**
  **Where does recency come from?** Two candidates, and they are not close in
  cost:
  - ***Derived — "recently worked on".*** Read from the existing FND-05 Activity
    stream: the records this owner most recently *changed*. No migration, no new
    write path, no new category of data, and it is
    [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)'s
    standing posture applied to a new question. **This is the preferred answer**
    and the one to disprove before reaching for the other.
  - ***Stored — "recently opened".*** A bounded per-owner ledger written on
    record open. Strictly more faithful to DEBT-195's wording, and strictly more
    expensive: a migration, a write on every navigation, a prune policy
    (cf. [DEBT-69](../product/PRODUCT_DEBT.md#-debt-69--offline-capture-receipts-accumulate-with-no-prune--p3)),
    an export decision, an offline decision, and a genuinely new category of
    personal data — *what the owner looked at* — which DalyHub has never stored
    and which Diary and People make a real question rather than a formality.
    Activity **cannot** supply it: activity types are module-registered mutation
    verbs and there is no view event, and adding one would put navigation noise
    into the one append-only audit stream (ADR-005/ADR-012).

  Whichever is chosen, the reason is recorded on the item, the rejected one is
  recorded with what it would have cost, and **the privacy consequence is stated
  in the owner's own words on the surface** if Diary or People records can
  appear.
- **Explicit non-goals.** No semantic search, no embeddings, no ranking rewrite
  (DEBT-93 stays open and is not touched here). No "frequently used", no
  scoring, no personalisation model, no learned ordering — recency is a date, not
  a prediction. No second search index and no second row component: this renders
  the **existing** search row, which is also why it **must not** introduce a
  fourth Task anatomy — a Task in this list is whatever Search already draws for
  a Task, unchanged, so DEBT-128's pair still closes together elsewhere. No
  cross-workspace recency.
- **Schema / API changes.** **Decided by the recency decision above.** The
  derived answer needs none. The stored answer needs one forward-only migration,
  and then it also owes an export/restore answer and an offline answer, both
  named on the item before it is written.
- **Canonical authorities that must not move.** The DS-08 search orchestrator
  stays the one composition boundary; providers still come only from
  `ModuleRegistry.listSearchProviders()`; the workspace scope is still resolved
  server-side through `resolveAuthenticatedWorkspaceScope` and never from a
  request; the empty-query path fails **closed** exactly as the query path does.
- **Measurable acceptance criteria.**
  1. Opening Search with no query lists at least one recent record in a
     workspace that has any history, and opening it is one keystroke and one
     Enter away. Proven end to end.
  2. The rows are the **same component** the query results render — asserted
     structurally, not by two screenshots resembling each other.
  3. A workspace with no history renders the calm empty state, not an error and
     not a spinner that never resolves.
  4. Privacy is proven by a test, not by intent: whichever categories the
     recorded decision excludes are absent from the list **for a workspace that
     contains them**.
  5. Bounded: one query, flat in workspace size, inside D1's 100-bound-parameter
     ceiling, with a counted-statement proof.
  6. Light and dark; 1440 / 393 / 320; keyboard reach, visible focus, accessible
     name; `axe` clean with no rule disabled.
- **Closes.** DEBT-195.
- **Delivered 2026-08-29.** Every criterion met, and the recorded decision taken.

  **The decision: recency is the most recent Activity event a record is a subject
  of.** The DERIVED reading, as the item preferred — newest first, an exact tie
  broken by the more recently created record, then by entity id, all descending.
  No migration, no table, no column, no write path, and no new category of
  personal data: the stored *"recently opened"* ledger was not reached for, and
  the view event decision 5 refuses was not added. It lives in
  [`app/kernel/recent-records/`](../../app/kernel/recent-records/) and nowhere
  else.

  **What the audit changed about that plan.** The item, this file and ADR-112 all
  named Activity as preferred; none of them said why it is the only honest
  answer. `entities.updated_at` is the obvious cheaper authority and is
  maintained INCONSISTENTLY across the detail tables — which is why
  `d1-area-repository.ts` already carries an `EFFECTIVE_PROJECT_UPDATED_AT_EXPR`
  folding `project_details.updated_at` over it. A recency source on that column
  would silently under-report every edit that touched only a detail table. The
  Activity stream has no such gap (ADR-005/ADR-012), so it is the authority
  rather than merely the preference.

  **A second empty state nobody had documented.** `SearchSurface` also rendered a
  device-local `localStorage` list of results the owner had ACTIVATED inside
  Search. It is retired rather than kept beside the new list: empty on first use,
  on a new device and after clearing site data; aware only of what had been
  opened *through Search*; per-browser rather than workspace-scoped. DEBT-195 was
  open the whole time it existed, which is the evidence it did not close it. Only
  its storage key survives so sign-out still purges it.

  **Bounded, and measured rather than asserted.** ONE D1 statement, six bound
  parameters, `countingDb`-proven identical for a workspace of two records and
  one of thirty. Flatness is real rather than statement-count-only: the query
  bounds the SCAN before it aggregates, walking at most 600 rows of the existing
  `activities_workspace_occurred_idx` — the same figure as FOLLOW-01's
  `MAX_WINDOW_EVENTS` — rather than grouping the workspace's whole history. The
  cost is a stated horizon, pinned by its own test. **No existing budget was
  raised**, and the heaviest E2E partition is unchanged at 15.4 min.

  **The privacy consequence, stated on the surface in the owner's own words**, as
  the item required: Diary — and only Diary — is excluded, because this is the
  one Search surface that renders without the owner asking for it, and a standing
  line says so where they can read it. Proven against a workspace CONTAINING a
  Diary entry seeded as its newest record. People are deliberately included; the
  stronger protection is structural, because a recent row carries an id, a type,
  a title and a date and no field that could hold a record's contents.

  **The fork was not widened.** The rows are the existing `SearchOption`, asserted
  structurally by comparing a recent row's rendered class list with a searched
  row's — not by two screenshots resembling each other. A Task here opens the
  Task Drawer Search already opens. DEBT-128 and DEBT-175 still close together
  elsewhere.

  **A defect found in review, not by any test that existed.** The first version
  applied the SQL `LIMIT` and *then* dropped rows whose type had no destination,
  so unopenable records spent the limit and the list came back short or empty.
  `habit` was such a type — a record page since HABITS-01, no entry in the shared
  destination map, and a Habits provider hard-coding its own route around the
  gap. Ten Habits and one Area produced eight SQL rows and **zero** rendered
  results. Fixed in both places: `habit` gained its entry in the one destination
  authority, and the query now selects an allow-list of listable types so the
  class cannot recur. Proven by a synthetic routeless type, and guarded by a test
  that every registered entity type is listable or deliberately excluded.

  **One thing found by falsification rather than by reasoning.** The tie-break was
  originally the entity id alone. Ties are the COMMON case — creating a Task
  inside a Project makes both subjects of one event at one instant — so the list
  led with whichever random id sorted higher, and the owner's new Task sat below
  its Project about half the time. The kernel test was flaky across runs, which is
  what exposed it; `createdAt` now breaks the tie first, consulted only on an
  exact equality so it never competes with recency.

  **Raised, and deliberately not taken.** [DEBT-216](../product/PRODUCT_DEBT.md) —
  a command-palette test still asserting that Goals have no creation command,
  which STEER-01 gave them. Failing on `main` before this item existed, reproduced
  with its work stashed, and a different item's surface.

---

### ☑ FIND-02 — One tag vocabulary — **delivered 2026-08-29**

**A tag means the same thing everywhere, and there is one place tags come from.**

- **User problem.**
  [DEBT-182](../product/PRODUCT_DEBT.md#-debt-182--tags-have-no-canonical-model-so-they-have-no-canonical-picker--p3--resolved-2026-08-29-v26-find-02)
  (P3): tags are a free-text string list per module — `person_details.tags`,
  `asset_details.tags`, `note_details.tags` — normalised by
  `~/shared/forms/tags.ts` but not a first-class anything. Every module offers
  its own suggestion set, none offers search, `#errand` on a Note and `Errand` on
  an Asset are different tags, and nothing can be renamed.
- **Outcome.** DEBT-182's closing condition, delivered: **tags have one
  vocabulary source, and adding one anywhere in the product is the same
  interaction.** `TagsField` becomes an adapter over the shared `Picker` with a
  create command — which the picker already supports — rather than a bespoke
  control with a per-module list behind it.
- **Why it belongs in this programme.** It is the decision the whole theme was
  deferred *whole* for, twice. DEBT-48 says the answer is *"almost certainly"* a
  kernel primitive; DEBT-182 says a picker needs a model to pick from; the
  capture grammar cannot gain a `#tag` token until a token has something to
  resolve to. One decision unblocks three entries.
- **Major dependencies.** None. FIND-03 and FIND-04 both depend on this.
- **One decision this item must take and record.** **Is a tag a kernel primitive,
  and if so which one?** Three candidates, and the item states why it rejected
  the two it did not take:
  - a workspace-scoped `tags` table plus a join, usable by every entity type;
  - a reserved `EntityLink` type over a tag entity
    ([ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)'s
    stance that relationships are a kernel concern, which DEBT-48 cites);
  - keeping per-module columns and adding only a shared read-time vocabulary
    aggregate — cheapest, and it does not deliver rename.

  And with it, the **migration** answer: the three existing free-text columns
  converge onto the chosen model **without losing a tag and without silently
  merging two tags the owner meant to keep apart**. Case folding is a decision
  with a user-visible consequence (`tags.ts` deliberately preserves the casing
  the owner typed) and is recorded, not assumed.
- **Explicit non-goals.** No tag hierarchy, no nesting, no colours, no icons, no
  per-tag settings surface, no tag record page, no tag-based automation, and no
  tag on every entity type merely because the model would allow it — an entity
  gains tags when an item says so. No second labelling concept: this is the one
  vocabulary, and Areas/Goals/Projects remain **structure**, never tags.
- **Schema / API changes.** **One forward-only migration**, and it carries data.
  Export, restore and the offline slice each get an explicit answer *before* it
  is written — a converged tag that does not survive a round trip is data loss,
  and this repository has
  [DEBT-105](../product/PRODUCT_DEBT.md) and HARDEN-06B in its history to prove
  the class is real.
- **Canonical authorities that must not move.** `~/shared/forms/tags.ts` stays
  the one normalisation rule (it is promoted, not forked); the shared `Picker`
  stays the one option-selection control; EntityLinks stay the one relationship
  model — if the link option is taken, it is a **registered link type**, never a
  second join table. Structural spine links remain reserved and untouched.
- **Measurable acceptance criteria.**
  1. One vocabulary source, asserted structurally: every tag-writing surface
     resolves through one module, proven by import path rather than by behaviour
     agreeing today.
  2. The migration is proven **both ways** against real D1 on a fixture holding
     tags in all three existing columns, including a case-differing pair, with
     the recorded case decision asserted on the result.
  3. Adding a tag is the same interaction on People, Assets and Notes — proven
     end to end on all three, not on one plus an assertion about the others.
  4. Export → restore returns every tag, on every entity that had one.
  5. Bounded: the vocabulary aggregate is one query with a stated ceiling, flat
     in workspace size, with a counted-statement proof.
  6. Light and dark; 1440 / 393 / 320; keyboard; accessible name; `axe` clean.
- **Closes.** DEBT-182 (the model and the picker).
- **Delivered 2026-08-29.** Every criterion met, and both recorded decisions
  taken. The full reasoning is
  [ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates).

  **The model: a workspace VOCABULARY plus a polymorphic attachment.**
  `workspace_tags (workspace_id, tag_key, label)` is the vocabulary — the primary
  key IS the identity — and `entity_tags (workspace_id, entity_id, tag_key)`
  attaches one to any entity, cascading from the entity and RESTRICTing against
  the vocabulary. Both `STRICT`, both guarded by CHECK constraints the
  application's own rule must satisfy (`tag_key = lower(tag_key)`,
  `lower(label) = tag_key`, a length bound), so the database refuses a row the
  rule would not have produced.

  **Both rejected candidates, with their reasons.** A reserved EntityLink type
  over a tag *entity* was rejected because an entity in this product acquires a
  record page, a timeline, Activity events, Search presence and a place in the
  spine — every one of them an ADR-112 non-goal, so the model would have to be
  defended against its own affordances forever. A read-time aggregate over the
  three existing columns was rejected because two spellings cannot be given one
  identity without a stored identity, which makes rename — DEBT-182's own
  complaint — unreachable by construction.

  **The case decision, recorded because its consequence is user-visible.**
  Identity is the **ASCII case-folded, whitespace-normalised key**; display is
  the owner's **first** spelling. ASCII-only, deliberately: SQLite's `lower()`
  folds ASCII only, so `toLowerCase()` would disagree with the migration and the
  CHECK constraint the moment a non-ASCII capital appeared, and
  `toLocaleLowerCase` would make a tag's identity depend on the reader's locale.
  Three engines must compute this identically. The cost is stated rather than
  hidden: `Café` and `café` remain two tags — the conservative failure, because
  two tags can be merged by renaming and one cannot be split.

  **The migration is proven from the OLD shape, which is the acceptance boundary
  this programme added.** `migrations/0049_create_tag_vocabulary.sql` stages every
  tag from all three legacy columns through `json_each`, ranks the spellings
  deterministically so the surviving label does not depend on row order, fills
  both tables, then drops `note_details.tags` and REBUILDS `person_details` and
  `asset_details` (a bare `DROP COLUMN` would have silently lost constraints).
  `test/kernel/migration-0049.test.ts` (20 tests) applies migrations `0001`…`0048`,
  seeds tags through the **old** schema — all three columns, an overlap, a
  case-differing trio, a whitespace pair, several per record, records with none,
  a soft-deleted record, a second workspace — applies `0049`, and reads the new
  one. The falsification pass removed `asset_details` from the migration and three
  of those tests failed.

  **A comma is a separator, never part of a tag — found in review (PR #238).**
  The shared field has always split a typed string on one and the declarative
  filter joins its members with one, so a key containing a comma could not be
  addressed by `?tag=` at all. It is split wherever a tag can enter, including
  migration `0049` reading a legacy JSON member (so both words survive), and the
  database refuses one.

  **Export and restore.** The snapshot gains `workspaceTags` and `entityTags` and
  its version stays **2** — deliberately, so the backup taken immediately BEFORE
  this migration stays restorable; restore prefers the collections and otherwise
  rebuilds them from the per-record arrays a pre-`0049` archive carries. Both
  paths are covered, including an orphan vocabulary entry and a legacy archive.
  The **Markdown vault** reads the same collections (corrected in review): a
  tagged Task had been restoring perfectly from the JSON while showing no tags at
  all in the readable copy, because the vault built Task files from a detail row
  that no longer has a `tags` column.

  **One interaction, proven structurally AND on all three surfaces.**
  `~/shared/forms/tags.ts` is now nothing but re-exports of `~/kernel/tags`, and
  `test/unit/tags/vocabulary-singularity.test.ts` (7 tests) asserts it at SOURCE
  level: one definer of the normalisation rule, one validator, every module
  validator importing from the kernel and calling no `toLowerCase` of its own,
  and tag SQL written from exactly one module. `TagsField` is now a `Picker`
  adapter, and `e2e/find-tag-vocabulary.spec.ts` (7 journeys) drives People,
  Assets and Notes through ONE helper — including a machine-value signature
  comparison, a tag created on a Person and offered on an Asset, and the case
  identity end to end.

  **Bounded, and counted.** A record's tags ride its existing `SELECT` as one
  correlated projection, so no surface pays a statement to display them; a write
  is exactly **three** statements whatever the tag count. The vocabulary read is
  ONE statement with a stated ceiling, proven identical for a workspace of two
  records and one of twenty-two. The only budget that moved is the export
  statement count (37 → 39), for two new FIXED collections — neither per-record —
  and it is justified in the test that asserts it rather than quietly raised.

---

### ☑ FIND-03 — Tags where the work is — **delivered 2026-08-29**

**Tasks can be tagged, and the collection can filter by tag.**

- **User problem.**
  [DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3--resolved-2026-08-29-v26-find-03)
  (P3): the TASKS-03 filter set was specified to include tags *"where Tasks
  already support them"* — they do not, so the collection ships no tag filter.
  The entry's own framing of the gap is the honest one: DalyHub already
  classifies work by parent, Time Sector, priority, delegate and status, so this
  is narrower than it sounds — but *a genuinely cross-cutting label
  (`#errand`, `#deep-work`) has no home*, which is precisely the case tags are
  for and the case the spine deliberately does not serve.
- **Outcome.** DEBT-48's three-part closing condition, delivered in full: a tag
  model exists on the Task domain with create, edit and validation; the Tasks
  filter declaration gains **one** `tags` dimension whose options come from a
  bounded workspace-scoped aggregate — the same shape the delegate filter
  already uses; and it is covered by a real-D1 combined-filter test.
- **Why it belongs in this programme.** Tasks are the highest-traffic collection
  in the product. A vocabulary that reaches People, Assets and Notes but not
  Tasks is a vocabulary the owner cannot use where they work.
- **Major dependencies.** **FIND-02.** This item adds no model; it adopts one.
- **One decision this item must take and record.** Whether a tag participates in
  **saved views** (ADR-082's cross-module query contract) and in the **smart-sort
  expression** — and if it does, that it is *one* dimension in the *one*
  declarative filter vocabulary, never a second filter model. DEBT-49 closed a
  two-filter-model split once; re-opening it for tags would be the same mistake
  with a new noun.
- **Explicit non-goals.** No tag-based priority, no tag-driven ordering, no
  automatic tagging, no suggested tags, no tag rules or saved tag queries beyond
  the one filter dimension. No AI anywhere near this item.
- **Schema / API changes.** Whatever FIND-02's model requires for Tasks, and
  **nothing else** — no second tag concept, and no smuggled `label` field
  (DEBT-48's own TASKS-04 warning, still standing).
- **Canonical authorities that must not move.** One Task authority; one
  declarative filter vocabulary with its existing two consumers; the Tasks
  smart-sort expression; the kernel next-action rule (STEER-04) — a tag never
  becomes an input to what is "next".
- **Measurable acceptance criteria.**
  1. A Task can be tagged, edited and validated through the same interaction
     FIND-02 established, on desktop and phone.
  2. The Tasks collection offers **one** `tags` dimension, options from a
     bounded workspace aggregate, covered by a real-D1 **combined**-filter test
     (tag × at least two existing dimensions).
  3. The filter is expressible in a saved view, or the recorded decision says it
     deliberately is not.
  4. Bounded, flat, counted, inside the parameter ceiling.
  5. Light and dark; 1440 / 393 / 320; keyboard; accessible name; `axe` clean.
- **Closes.** DEBT-48.
- **Delivered 2026-08-29.** Every criterion met, and the recorded decision taken.

  **The Task adopts the model; it adds none.** `TaskDetails.tags` reads through
  the same projection every other tagged record reads, is written by the same
  three guarded statements in the same atomic batch as the Task's own mutation,
  and is edited through the same `TagsField` — `e2e/find-task-tags.spec.ts` drives
  it through the SAME helper the People, Assets and Notes journeys use, on desktop
  and at 393px. No `label` field was smuggled in, as DEBT-48's own TASKS-04
  warning still required.

  **ONE dimension in the ONE declarative vocabulary.** `tags` is a filter
  dimension in `TaskViewConfig`, translated by the one `toWorkspaceFilters`, and
  resolved by the repository as an `EXISTS` **semi-join** — never a `JOIN`, which
  would return a Task carrying two of the filtered tags twice and corrupt the
  page, the count beside the filter and the keyset cursor. `test/kernel/task-tags.test.ts`
  (15 tests) proves tag × parent × priority together, no duplication,
  deterministic pagination, workspace isolation, that removing a tag changes the
  result, and that the filter costs no extra statement.

  **The recorded decision, both halves.** A tag **IS** expressible in a saved
  view — and needed no mechanism to be, because a saved view stores the
  declarative configuration and the dimension is in it; the round trip is proven
  through the real view switcher. A tag is **NOT** an input to the smart-sort
  expression and **NOT** an input to the STEER-04 next-action rule. That is
  asserted behaviourally *and* at source: `test/unit/tasks/tag-boundary.test.ts`
  reads `next-action.ts` and the `case "smart":` expression and requires the word
  to be absent from both.

---

### ☑ FIND-04 — `#tag` on the capture line — **delivered 2026-08-29**

**One more token in the grammar the product already has.**

- **User problem.** DHDS-13 §13 rates capture speed **"Below"** the reference
  bar. The quick-capture parser recognises priority, Time Sector, `someday`,
  `routine`, `waiting`, `delegate`, dates and recurrence — everything except the
  one thing every reference product's capture line starts with. Capturing
  `Call the plumber #home p2 friday` should produce a tagged Task, not a Task
  titled *"Call the plumber #home"*.
- **Outcome.** `#tag` is a recognised token class in the existing closed
  vocabulary, shown in the existing preview the owner can correct before saving,
  on every surface that uses the parser.
- **Why it belongs in this programme, and why it is last.** It is the capture
  half of the theme and it is worthless before FIND-02 and FIND-03 — a `#tag`
  token with no vocabulary and no Task tag field has nothing to resolve to. It
  is genuinely small *because* the two items before it did the work.
- **Major dependencies.** **FIND-02 and FIND-03.**
- **One decision this item must take and record.** What `#` does when the tag
  does **not** yet exist — create it silently, offer to create it in the
  preview, or leave the token as literal words. The parser's own standing rule
  points at the third-or-second: *"a phrase the grammar cannot fully recognise is
  left as ORDINARY WORDS rather than clamped into a rule the owner did not ask
  for."* Creating vocabulary as a side effect of typing is how a tag list becomes
  unusable, and the decision records which way it went and why.
- **Explicit non-goals.** **No natural-language understanding and no AI** — the
  parser's own opening comment is the constraint, and it is not relaxed here.
  No new date grammar, no new priority grammar, no new recurrence grammar: this
  item adds **one** token class and touches nothing else in 803 lines. No
  free-form `@` person token, no `+` project token, no `/` command token — each
  is its own decision with its own resolution question, and none is smuggled in
  beside this one.
- **Schema / API changes.** **None.** The parser is pure; the field it fills was
  built by FIND-03.
- **Canonical authorities that must not move.** `quick-capture.ts` stays the one
  capture grammar and stays pure and React-free. The whole-word, trailing-date
  and never-empty-title rules are preserved exactly. **The offline capture queue
  replays captures through the canonical route
  ([ADR-090](../decisions/ARCHITECTURE_DECISIONS.md#adr-090-offline-mutation-as-a-transport-concern--a-queue-of-intents-replayed-through-the-canonical-route-with-field-focused-conflict-arbitration))
  — a queued capture written before this item must still replay correctly after
  it, and that is a test, not an assumption.**
- **Measurable acceptance criteria.**
  1. `#tag` is recognised as a whole token, case-insensitively, anywhere the
     other tokens are, with the title correctly reduced and never emptied.
  2. A `#` that is part of ordinary text (`the #1 priority`, a Markdown heading
     pasted in) stays text — proven by table-driven cases, including the
     adversarial ones.
  3. The unknown-tag behaviour is the recorded decision, proven.
  4. The preview shows the recognised tag and the owner can remove it before
     saving.
  5. A capture queued offline before this change replays correctly after it.
  6. Every surface using the parser behaves identically — proven by driving the
     parser, not by checking one screen.
- **Advances.** DHDS-13 §13 (capture *"Below"*).
- **Delivered 2026-08-29.** Every criterion met, and the recorded decision taken.

  **One token class, and the refusals are the hard half.** A `#` word is a tag
  when it begins with a letter or digit, contains only letters, digits, `-` and
  `_`, and carries at least one **letter**. `test/unit/tasks/quick-capture-tags.test.ts`
  (30 tests) includes a sixteen-row adversarial table that must stay ordinary
  text: `the #1 priority`, `Fix #42 before Friday`, `Row #1-2`, `# Heading`,
  `## Subheading`, `### three hashes`, a stray `#`, `#-`, `#_private`, `#home.`,
  `#home,`, `#home!`, `#home?`, `“#home”`, `end.#home` and `a/#home`. The parser's
  own rules are preserved exactly — whole word, anywhere the other tokens may
  appear, and a line of nothing but tags stays a Task titled with the literal
  text rather than an untitled Task with tags.

  **The unknown-tag decision: OFFERED, never created silently.** The middle of the
  three options. The preview words it — *"New tag: …"* against an existing tag's
  *"Tag: …"* — and the owner removes it with the control every token already has,
  which restores the literal words. *"Leave it as literal words"* was rejected as
  the general rule with its reason: that rule is about phrases the grammar
  **cannot fully recognise**, and `#` is an explicit marker, like `due …`, which
  the grammar recognises perfectly. What is genuinely at stake is the vocabulary,
  and the preview answers that by showing the word as new **before** anything is
  saved.

  **And an offer needs somewhere to appear — corrected in review (PR #238).**
  Only the full create form renders the preview; the in-list quick-add row, the
  capture sheet and every external transport do not, and on those the first
  implementation created the tag anyway — invisibly, and permanently, because an
  unreferenced vocabulary entry is deliberately kept. A surface that cannot offer
  now does not create: it resolves a tag the workspace already holds and leaves
  every other `#word` as the words the owner typed. Proven on the real surface —
  a `#typo` in the quick-add row leaves `workspace_tags` untouched and stays in
  the title — and against real D1 on the capture endpoint, including the replay
  path, which re-derives the title and therefore had to learn the same rule.

  **The offline answer is a test, as the item required.**
  `test/kernel/offline-capture-replay-compatibility.test.ts` replays a **frozen**
  pre-FIND-04 queue record — written as a literal, not built by today's code —
  through the shipped `captureFormData` and the shipped `POST /tasks/new` against
  real D1. It arrives as the words the owner typed, with no tag and **no
  vocabulary created behind their back**, and it is still idempotent. The
  namespace digest is pinned to its literal value, because `OFFLINE_SCHEMA_VERSION`
  is an input to it and moving it would strand every queued capture. Falsified
  two ways: bumping that constant, and re-reading a queued title through the new
  grammar — three assertions failed, naming the exact title that would have been
  rewritten.

  **Every surface, proven by driving the parser.** The `/tasks` quick-add row, the
  full create form, the global capture sheet and the server-side capture service
  all call the one parser and the one `applyCaptureTags` mapping, so they cannot
  disagree about what a recognised tag becomes on the wire.

---

## Why this sequence

**FIND-01 is first because it is the only P2 and the only item with no
dependency.** V2.5 supplied the argument directly: when this was written its own
severity-carrying final item, STEER-05, had been ☐ for the whole programme. A
programme's last item is the one that does not ship, so the entry carrying the
register's standing A-scale sentence does not go last. (STEER-05 did ship, on
2026-08-28 — which does not weaken the argument: it spent a programme as the
last item precisely because it was last.)

The cost of that ordering is stated rather than hidden: FIND-01 designs the
recent-record row **before** the tag vocabulary exists, so a later item that
wants tags on a recent row adds them to a row. That is an addition, not a
rework, and it is the cheaper of the two mistakes available.

**FIND-02 is second because it is the decision the theme was deferred whole
for**, and because both remaining items are its consumers. Doing it early means
the programme's shape is known while there is still room to act on it; doing it
late would leave two items waiting on an unmade kernel decision.

**FIND-03 then FIND-04**, in that order, because a `#tag` token needs somewhere
to put a tag.

```
STEER-05 ──►  FIND-01          FIND-02  ──►  FIND-03  ──►  FIND-04
(V2.5's       (the P2;         (the tag      (Tasks        (#tag in
 last item,    recency +        vocabulary    tags +        the capture
 finished      empty query;     decision      the one       grammar;
 first)        no dependency    + migration)  filter        one token
                                              dimension)    class)
```

---

## The AI decision, recorded rather than postponed

AI is deferred. This section exists so that it is deferred with a **named
blocker, a named first item and a named cost**, rather than with the word
"later" — and so the programme that eventually takes it does not re-litigate
what has already been decided here.

### The blocker, named exactly

> **No request has ever been sent from this repository to Anthropic, OpenAI or a
> Cloudflare AI Gateway.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are
> owner-held Worker secrets that have never been present in any environment this
> repository builds or tests in. Until
> [`scripts/ai-integration-check.mjs`](../../scripts/ai-integration-check.mjs)
> completes green against at least one provider, every statement DalyHub makes
> about its own request shape, header set, response envelope, `store: false`
> and token accounting is a statement about **documentation read on 2026-08-05**
> — not about a request that was made.

That is the blocker. It is one owner action, it is not a build, and this
repository cannot clear it. There is a **second**, which the owner action alone
does not clear:
[DEBT-213](../product/PRODUCT_DEBT.md) — the model and pricing registry is
pinned to 2026-08-05 with nothing scheduling its re-verification, so the first
live run may fail on a retired model id for reasons unrelated to the code.

### The AI-GATE decision test, taken now

When AI is scheduled, its first implementation item is **A — the infrastructure
proof gate**, not B — the first user-facing slice. This is decided here, in
advance, and the reason is that the alternative is already disproven by this
repository's own history: **DalyHub has a complete, well-tested, thoroughly
mocked AI platform that has never once been exercised, and every automated suite
is green.** Mocks passing is exactly the evidence that does not settle the
question. §21 says so in the platform's own words — *"the first person to supply
a key should expect to find something a header, a field name, a response
envelope — that documentation alone did not settle."*

The gate proves, against one real provider, with **synthetic data only**:
Worker → provider; a structured request; a schema-valid structured response;
timeout and error handling; redacted logging; the token/cost estimate reconciled
against provider-reported usage; that nothing is persisted; the
disabled/fallback path; the local fake-provider path; and the production
configuration boundary. It ships **no new AI feature and no AI UI.**

### The sequence AI takes when the blocker clears

Derived from the audit above, so the future programme starts from a position
rather than a blank page:

1. **AI-GATE — prove the live provider path** (above). Small, owner-gated, no
   new capability. Re-verifies the model/pricing registry as part of the same
   pass, closing DEBT-213.
2. **The Weekly Review assistant's fact block** — close
   [DEBT-91](../product/PRODUCT_DEBT.md#-debt-91--the-weekly-review-assistants-fact-block-is-narrower-than-the-guided-reviews-own-evaluators--p3),
   which is now **cheap and urgent for the same reason**: `loadGoalStories`
   (STEER-03) and `selectGoalNextAction` (STEER-04) already *are* the bounded
   fact block, so the work is to call them instead of the reduced local one —
   and until that happens an assistant that ran would describe a Goal the owner
   deliberately **set aside** as neglected. No new capability; a correction.
3. **Only then**, a new surface, if one is still wanted. AI-03's daily planning
   for Today remains the named open half, and it remains a P3.

Nothing in that sequence is adopted by V2.6, and no V2.6 item may reach for it.

### What is *not* the blocker, and must not be re-audited as one

Recorded because re-deriving it would waste a future programme's first week.
All of the following were audited for this decision and found **already
satisfied**: the proposal-only write boundary (`/ai/apply` re-validates and
writes through each module's own authority with the **owner** as the Activity
actor); provider independence behind one contract; the SSRF boundary as one pure
function; secrets as Worker-only values that never reach a browser, D1, a log,
an export or an error; application-enforced budgets checked **before** any call;
the evidence-id citation contract that **rejects** an invented id rather than
dropping it; structural privacy classification excluding People and Diary by
default; a usage ledger holding no prompt, response or record content; full
product usability with AI off, proven by 29 E2E journeys; and the explicit
refusal of a chat surface, agents, loops, background monitoring, arbitrary tool
execution and persistent conversation history.

**The ten AI architecture principles proposed for adoption by V2.6 are already
met or exceeded by ADR-073 and ADR-004.** They are not restated as a new
contract, because a second statement of an existing rule is a second authority,
and this repository's whole method is that there is one.

---

## LATER — real, evidenced, and deliberately not V2.6

| Deferred | Evidence | Why not now |
|---|---|---|
| **AI over the follow-through and Goal data** | AI-03 ◐, [DEBT-91](../product/PRODUCT_DEBT.md#-debt-91--the-weekly-review-assistants-fact-block-is-narrower-than-the-guided-reviews-own-evaluators--p3), DEBT-92, [DEBT-93](../product/PRODUCT_DEBT.md#-debt-93--ai-evidence-retrieval-is-keyword-and-relationship-only--p3), [DEBT-213](../product/PRODUCT_DEBT.md) | **The platform is built; it has never made a request.** Blocker, gate and sequence all named above rather than left as "later". V2.6 makes it *cheaper*: a tag vocabulary and a recency source are retrieval inputs, which is DEBT-93's own subject. |
| **One Task anatomy** | [DEBT-128](../product/PRODUCT_DEBT.md#-debt-128--today-projects-and-search-still-render-tasks-as-cards-so-one-object-has-two-anatomies--p2) + [DEBT-175](../product/PRODUCT_DEBT.md#-debt-175--the-project-records-tasks-tab-is-the-last-surface-that-does-not-render-the-shared-taskrow--p2) (both P2) | Their own instruction is to close **together**, as one bounded pass. Still the strongest non-theme candidate to ride beside this programme. FIND-01 renders the existing search row unchanged and is explicitly forbidden from widening the fork. |
| **A first-run / sparse-workspace experience** | DHDS-13 §13 (*"Below"*) | Unchanged from V2.4 and V2.5: a programme of its own; this product is one owner's populated daily driver. |
| **The offline slice** | DEBT-155, 160, 161, 167, 170, 190 | One decision about what the offline contract covers. FIND-02 and FIND-04 each owe the existing contract an answer; neither reopens it. |
| **Semantic / embedding retrieval** | [DEBT-93](../product/PRODUCT_DEBT.md#-debt-93--ai-evidence-retrieval-is-keyword-and-relationship-only--p3) | Explicitly **not** taken by FIND-01. ADR-073 decision 20 refused embeddings as a separate decision with its own cost, storage and staleness questions; that stands, and a recency source is not a step toward it. |
| **Stronger reporting / Analytics growth** | DEBT-103, DEBT-145, DEBT-122 | The owner's own word is *"later"*. Unchanged. |
| **Project & template capabilities** | DEBT-137 (P2), DEBT-165 (P2), DEBT-166, DEBT-168 | Real module capabilities, each with its own decision. Taking P2s off-theme is how a programme becomes a grab-bag. |
| **The E2E machinery** | DEBT-205, DEBT-173, DEBT-203 (P2s) | Standing constraints every item works inside; repaired only by a pass whose subject they are. |
| **Capture-processing state** | [DEBT-102](../product/PRODUCT_DEBT.md#-debt-102--dalyhub-has-no-capture-processing-state-so-unprocessed-captures-cannot-be-shown--p3) | Adjacent to this theme and deliberately **not** taken: it is a kernel decision about whether filing *is* processing, and FIND-04 speeds capture up without needing an answer. Absorbing it would make the theme two decisions wide. |
| **Plan's board proportions** | DEBT-162, DEBT-163 | Unchanged from V2.4 and V2.5: composition questions, none costing the owner information. |

### Standing non-goals, carried forward unchanged

V2.3's, V2.4's and V2.5's lists still stand and are not re-litigated: subtasks ·
AI automatic weekly planning · automatic time blocking · calendar write-back ·
Gantt charts and dependency timelines · automatic date shifting · critical path ·
a dependency notification programme · resource capacity planning · estimates and
time tracking · shared or team planning · public or shared smart lists · a
smart-list marketplace · a new calendar module · a month grid or week timetable ·
adherence scores, plan grades, streaks, chains, productivity numbers and
rankings of weeks (ADR-110) · no composite Goal score, no derived judgement
stored and no stored judgement derived, no second next-action rule, no
gamification of the Review (ADR-111).

V2.6 adds its own, from ADR-112:

- **Tags are a vocabulary, not a second structure.** A tag never becomes a
  parent, never carries progress, never orders a collection, never feeds the
  next-action rule and never becomes an Area, Goal or Project by another name.
- **Recency is a date, not a prediction.** No frequency weighting, no learned
  ordering, no personalisation model, no engagement signal anywhere in
  retrieval.
- **The capture grammar stays a closed token vocabulary.** No natural-language
  understanding and no AI in the capture path — ever, without its own ADR.
- **No second search index, no embeddings, no second tag model, no second
  filter vocabulary.**

And the architectural ones, which V2.6 may not reopen without its own ADR: no
second Task authority · no new relationship model (EntityLinks, ADR-002/ADR-106)
· no second representation of a concept because a new panel wants one · no
module-local design primitive where a shared one owns the behaviour · no new
runtime component or design library, and no DHDS-14 · no broad rewrite of
working architecture for aesthetic reasons.

---

## Dependencies

**External, and stated once rather than per item.** V2.4-GATE-01's two
owner-held halves remain the standing preconditions for any production release —
a real backup before any migration is applied (**FIND-02 is this programme's
migration, and FIND-01 may be a second**), and credentials for
`verify:production`. They stay recorded in
[`ROADMAP_V2_4.md`](ROADMAP_V2_4.md), are not re-adopted here, and no V2.6 item
claims them. [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-scheduled-production-backup-has-never-produced-a-backup-because-the-encryption-key-is-not-configured--p1)
(P1) is the same blocker seen from the register, and it is **more binding on
this programme than on the last two**, because FIND-02 moves existing owner data
between representations.

**Internal, and the one that must be said plainly:**
[STEER-05](ROADMAP_V2_5.md#-steer-05--the-weeks-door--delivered-2026-08-28) is
delivered before FIND-01 starts. It is V2.5's item, it was not moved here, and
V2.6 does not begin by leaving its predecessor unfinished. **Met on 2026-08-28**,
before any FIND item was started.

Every item consumes — and none modifies — the DS-08 search orchestrator and its
registry-discovered providers, `~/shared/forms/tags.ts`'s normalisation rules,
the shared `Picker`, the Tasks declarative filter vocabulary and its two
consumers, the quick-capture parser's existing token rules, the FND-05 Activity
stream, and the capture contract the offline queue replays through.

---

## The acceptance boundary

Every item carries the three durable rules its predecessors established, verbatim:

> **A visual claim about a rendered surface is proven by a measurement of that
> surface, not by looking at it.** (DHDS-13)

> **A numerical claim about the owner's history is proven against a fixture whose
> events are known, not against whatever the workspace happens to hold.** (V2.4)

> **A claim that two surfaces tell the same story is proven by reading the same
> machine value from both, never by comparing sentences that happen to match.**
> (V2.5)

And V2.6 adds one of its own, for the layer it builds:

> **A claim that data survived a change of representation is proven by moving
> real data through the migration and reading it back — never by a test that
> writes and reads the new shape only.** V2.5's own STEER-02 review found a
> deliberate falsifier surviving 210 export tests because the shared fixture
> never wrote the row the assertion compared. FIND-02 moves tags out of three
> live columns; that is the exact class of change where a test can pass for the
> wrong reason.

Concretely, where applicable, every item is accepted against: real seeded data;
light and dark (dark driven by the media query); desktop, tablet and the
320 / 360 / 375 / 393 / 430 phone widths; keyboard reach, visible focus and an
accessible name on every control; overflow and truncation by measurement;
reduced motion where motion is involved; bounded queries with a flatness proof
and no N+1, inside D1's 100-bound-parameter ceiling; deterministic tests — no
test skipped, weakened, quarantined or deleted, and no timeout raised, to make a
phase look green. A behavioural defect is never closed on a screenshot.

---

## The debt, reconciled

Every entry this programme takes, weighs or found is given a disposition here
and on the entry itself, so no future reader re-derives what is scheduled.

| Entry | Severity | Disposition |
|---|---|---|
| **DEBT-195** — Search's empty query offers nothing to open | **P2** | **CLOSED 2026-08-29** — FIND-01. Deferred by V2.4 and V2.5; the A-scale sentence has left the register. |
| **DEBT-216** — a palette test asserts Goals have no creation command | P2 | **Raised** by FIND-01's verification and deliberately not taken: STEER-01 shipped the surface, the assertion is stale, and it is a different item's surface. |
| **DEBT-182** — tags have no canonical model, so no canonical picker | P3 | **CLOSED 2026-08-29** — FIND-02, on both clauses: one vocabulary source, and one interaction everywhere. The model question it left open is settled in [ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates). |
| **DEBT-48** — Tasks have no tags, so no tag filter | P3 | **CLOSED 2026-08-29** — FIND-03, on all three clauses, including the real-D1 combined-filter test the entry names. |
| DHDS-13 §13 — capture speed *"Below"* | — | **ADVANCED, not raised to "At"** — FIND-04 answered the `#tag` half of the cell's own example; time of day is still not parsed, and the amendment says so rather than claiming the bar. |
| **DEBT-91** — the assistant's fact block is narrower than the product's own derivations | P3 | **Deferred, and AMENDED** with a dated V2.6 note: V2.5 made it both cheaper to close (`loadGoalStories` *is* the block) and worse if it ran (a set-aside Goal would be described as neglected). Not a new number — the same defect finding new instances. |
| **DEBT-92** — generated AI results are not persisted | P3 | **Deferred**, unchanged. Its own closing condition needs usage data that cannot exist before a live call. |
| **DEBT-93** — AI evidence retrieval is keyword and relationship only | P3 | **Deferred**, and **advanced by this programme without being taken**: FIND-02's vocabulary and FIND-01's recency source are inputs the retrieval service composes. Embeddings remain refused (ADR-073 §20). |
| **DEBT-213** — the AI model and pricing registry has no re-verification mechanism | P3 | **Raised** by this pass. Not previously represented; found by audit, not by prose. |
| **DEBT-217** — a convergence fixture seeds a Person outside the closed relationship vocabulary | P3 | **Raised** by FIND-02's People journey and deliberately not taken: the journey moved to a correctly seeded Person, and the fixture belongs to the record-convergence item. |
| **DEBT-218** — `axe` reports `scrollable-region-focusable` on the shared anchored surface | P3 | **Raised** by FIND-03 and MEASURED as pre-existing (6206px of content against a 694px clamp *with the tag group hidden*). Its scan was narrowed to the surface it owns, with the reason in the spec; **no rule was disabled**. |
| **DEBT-219** — an Assets journey goes red once a fixture obligation's due date passes | P2 | **Raised** by the tag programme's verification run and deliberately not taken. MEASURED: the seeded `ob-rc-inspect` was due 2026-08-28, so on 2026-08-29 a second card reads "1 obligation overdue" and an unscoped strict locator resolves to two. This branch changed no obligation row. |
| **DEBT-220** — a Project-templates assertion reads a title STEER-04 now shows as a next action | P2 | **Raised** by reading the full gate, and deliberately not taken. The element was NAMED by walking `/today`'s text nodes with only the fixture Project seeded: it is `NextActionLine`, live work that belongs there. |
| **DEBT-221** — `/today` overflows sideways at 200% zoom | P2 | **Raised** by reading the full gate, and deliberately not taken. MEASURED: 239px of document in a 195px viewport, from STEER-05's week-door date range at 206px. A real accessibility defect on another item's surface, reproduced on a clean `origin/main`. |
| **DEBT-102** — no capture-processing state | P3 | **Deliberately not taken**, with its reason in LATER: a kernel decision adjacent to the theme, and FIND-04 does not need it answered. |
| DEBT-128 · DEBT-175 | P2 | **Not taken**, unchanged from V2.5: they close together in their own pass. FIND-01 is explicitly forbidden from widening the fork. |
| DEBT-34 | P2 | **Not V2.6's.** It is STEER-05's, and STEER-05 stayed in V2.5 — where it closed this entry on 2026-08-28. |
| DEBT-198 · V2.4-GATE-01 | P1 | **Standing preconditions**, more binding here than before: FIND-02 carries data. |
| DEBT-205 · DEBT-173 · DEBT-203 | P2 | **Standing constraints**, recovered only deliberately. |
| DEBT-69 | P3 | **Named as a precedent, not taken**: if FIND-01's recorded decision is a stored ledger, it inherits the prune question this entry already describes. |

**Two entries were re-read and deliberately not raised as new debt**, because
the register already holds them: DEBT-92's persistence question and DEBT-93's
retrieval question are unchanged by anything V2.5 shipped, and restating them
under new numbers is the duplication this register forbids.

---

## Related documents

- [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md) — the predecessor programme, **whose STEER-05 was finished before this one started** (2026-08-28)
- [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) — V2.4, and the owner-blocked gate halves that stay recorded there
- [ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable) — the decision this programme is built on
- [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question) — Steering, whose stored-judgement rule the deferred AI work must respect
- [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) — the derived-never-stored rule FIND-01's decision is measured against
- [ADR-073](../decisions/ARCHITECTURE_DECISIONS.md#adr-073-the-controlled-ai-platform--provider-independence-proposal-only-writes-application-enforced-budgets-and-an-evidence-contract) · [ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture) — the controlled AI platform and its governing principle, both preserved unchanged
- [`AI_PLATFORM.md`](../development/AI_PLATFORM.md) — the AI platform authority; §21 is the blocker
- [`SHARED_SEARCH.md`](../development/SHARED_SEARCH.md) — the search composition FIND-01 extends
- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) — the collection FIND-03 adds a dimension to
- [`UNIVERSAL_CAPTURE.md`](../development/UNIVERSAL_CAPTURE.md) — the capture contract FIND-04 works inside
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — the product handbook this theme is derived from
- [`DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md) —
  the post-V2.6 product audit (2026-08-29, taken after FIND-01 with
  FIND-02/03/04 still ☐): the evidence base and proposed successor programme
  (**RECALL**) for the roadmap decision that follows this file. It proposes;
  the successor's own decision pass adopts, numbers its debt, and records its
  ADR — nothing in it changes this programme's scope.
