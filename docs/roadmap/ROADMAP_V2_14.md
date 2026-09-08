# ROADMAP_V2_14.md — DalyHub V2.14, GROUNDED AI

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md)
> hold V2.1 … V2.8; [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) holds V2.9 INSIGHT
> **and the remaining V2 sequence, V2.15 … V2.16**, which this file does not
> restate and does not replace; [`ROADMAP_V2_10.md`](ROADMAP_V2_10.md) holds
> V2.10 LIFE ADMIN; [`ROADMAP_V2_11.md`](ROADMAP_V2_11.md) holds V2.11
> EVIDENCE; [`ROADMAP_V2_12.md`](ROADMAP_V2_12.md) holds V2.12 FINANCE CORE;
> [`ROADMAP_V2_13.md`](ROADMAP_V2_13.md) holds V2.13 REPORTS (**complete
> 2026-09-07**).
>
> **This file is V2.14, and it is where new work goes.** It was defined on
> 2026-09-07 against `main` at `353ede6` (V2.13 REPORTS, PR #271) by a pass that
> re-measured the whole AI platform — kernel, gateway, adapters, budgets,
> ledger, evidence, prompts, schemas, proposal path, settings and every live
> surface — rather than inheriting the PRESUMPTIVE sketch in
> [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v214--grounded-ai-presumptive--gated-on-the-owner-held-key).
> Where that sketch and this file disagree, **this file wins**, and every
> disagreement is stated with the measurement that produced it.
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.14 GROUNDED AI — see [Programme status](#programme-status).**

**Successor: V2.15 ASSISTED AI — DEFINED 2026-09-08**, and it is where new work
goes: [`ROADMAP_V2_15.md`](ROADMAP_V2_15.md). Nothing in V2.15 is built here.
V2.14 is **read-only AI**: it adds no mutation, no new proposal kind and no
apply path.

---

## The theme: GROUNDED AI — explain the facts

DalyHub already computes a great deal deterministically. V2.9 gave it one
history vocabulary; V2.10 gave it one obligation model; V2.12 gave it money that
never sums unlike currencies; V2.13 gave it a `ReportResult` that carries its
own window, unit, currency, bound and standing caveats. The product knows what
happened.

**What it cannot do is talk about it.** The owner can read *Spending by
category* for August and read it again for July, and DalyHub will not say a word
about the difference. The Weekly Review shows the owner a wall of true facts and
leaves the noticing entirely to them. Ask DalyHub answers a keyword-retrieval
question over Note and Meeting excerpts and cannot answer *"why was August more
expensive than July?"* at all, because nothing assembles the comparison.

The product theme is one sentence: **DalyHub computes the facts; AI explains
them.**

> I open *Spending by category* for August. The figures are DalyHub's, as
> always. I press **Explain this report**. A short paragraph says groceries rose
> and transport fell, and every figure in it is a chip I can press to see the
> exact row it came from. I press *Check it* and I am on the Finance month that
> holds the transactions. Nothing was invented, and if I turn AI off the figures
> are still there.

### The one architectural rule

**The provider never owns product truth.**

```
owner question / owner action
   ↓
deterministic intent + parameter resolution      (no model)
   ↓
canonical repositories · Reports · history       (no model)
   ↓
FactBlock — every figure DalyHub may state       (no model)
   ↓
provider                                          (the model, at last)
   ↓
explanation, validated against the FactBlock      (no model)
```

Not:

```
owner question → model → model picks a data source → model computes a figure
```

There is no agentic database access, no tool-calling, no generated SQL, no
free-form data-authority selection and no embedding index
([ADR-073 §20](../decisions/ARCHITECTURE_DECISIONS.md#adr-073-the-controlled-ai-platform--provider-independence-proposal-only-writes-application-enforced-budgets-and-an-evidence-contract)).
The model receives a bounded, labelled block of already-computed facts and is
asked to explain them. Everything it says that is a number must cite a fact that
holds that number, and DalyHub checks — structurally, in code, not by asking the
model nicely.

**The design test.** Delete the AI provider mentally. Does DalyHub still know
every fact shown? If yes, the architecture is grounded. If any figure on screen
exists only because a model produced it, the work is not done.

---

## Phase 0 — what the AI platform actually is, measured

This section is the inventory the definition pass produced. It replaces the
"~9k LOC" estimate that has been carried since V2.1 with a count taken on
`353ede6`.

### Size

| Layer | Files | Lines | What it holds |
|---|---:|---:|---|
| `app/kernel/ai/` | 12 | 3,851 | errors, model registry, feature policy, evidence + privacy, preferences, budget, usage ledger contract, fingerprint, response schemas + validators, prompt registry, execution policy |
| `app/platform/ai/` | 12 | 2,628 | configuration (the only reader of a key), availability, provider endpoints, transport, Anthropic + OpenAI adapters, evidence retrieval, deterministic answers, weekly-review evidence, the request runtime |
| `app/modules/ai/` | 8 | 1,684 | the assist route, the apply route, Ask DalyHub, the proposal apply engine, the Review facts |
| `app/shared/ai/` | 7 | 1,675 | the client view model, the request controller, the panel primitives, the extraction and Weekly Review surfaces |
| **Total** | **39** | **9,838** | |

The old estimate was very nearly right by accident. What it did not say is how
much of it is *live*, which is the number that matters.

### What has a real production caller

| Capability | Feature id | Live surface | State |
|---|---|---|---|
| Meeting extraction | `meeting-action-extraction` | `meetings/routes/detail.tsx:900` | live, proposal-producing |
| Note extraction | `note-action-extraction` | `notes/routes/detail.tsx:333` | live, proposal-producing |
| Weekly Review assistant | `weekly-review-assistant` | `reviews/guided/ReviewGuideSteps.tsx:738` | **live, but reading a fact block with five hard-coded zeros** ([DEBT-91](../product/PRODUCT_DEBT.md)) |
| Ask DalyHub | `workspace-question-answer` | `ai/routes/index.tsx` | live; five deterministic intents answered with no provider, everything else keyword retrieval over Notes/Meetings/Tasks/Projects |

### What is dead scaffolding

**None of it.** This is the pass's most useful negative finding. Every module in
`app/kernel/ai/` and `app/platform/ai/` has a caller on the live path;
`apply-proposal.ts` is reached from the apply route and is exercised by
`test/kernel/ai-apply-proposal.test.ts`. There is no orphaned adapter, no
half-built second gateway and no abandoned feature id. The platform is small,
complete and unexercised **only** in the sense that it has never contacted a
provider.

### What is blocked by the missing key

Everything above the adapter seam is proven by test; nothing below it has ever
run. `scripts/ai-integration-check.mjs` is the only code that contacts a real
provider, it is opt-in and excluded from CI, and
[`AI_PLATFORM.md` §21](../development/AI_PLATFORM.md#21-manual-provider-verification-opt-in-never-in-ci)
records it as **STILL NOT RUN**. Re-measured for this pass on 2026-09-07:
`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are both absent from this environment,
so the statement stands unchanged.

### The provider gate, re-measured

- Both providers are supported and **neither is preferred**: `pickProvider`
  takes the owner's stored `defaultProvider` when it is configured and the only
  configured one otherwise. `DEFAULT_AI_PREFERENCES` decides the stored default;
  this release does not change it.
- The credential is read in exactly one module (`ai-configuration.ts`), which
  returns `configured: true` and an adapter factory and **never the key**. The
  browser bundle cannot reach `app/platform/ai/` at all — the module
  import-boundary test asserts it.
- Every AI binding is optional. DalyHub builds, starts, tests and deploys with
  none of them set, and AI simply reports itself unconfigured.

**This does not block V2.14.** The programme ships a deterministic dev/test
provider at the adapter seam (GROUND-00) so the complete product flow is proven
end to end without a key, a token or a secret in CI. Production activation
remains owner-gated, and the exact activation steps are documented rather than
guessed.

### The debt this programme owns

| Debt | What it says | What this pass measured |
|---|---|---|
| [DEBT-237](../product/PRODUCT_DEBT.md) | the AI gate names a fake-provider path the repository does not have | true; no fake adapter exists. **GROUND-00 closes it.** |
| [DEBT-213](../product/PRODUCT_DEBT.md) | the model/pricing registry is pinned to a 2026-08-05 reading nothing re-verifies | `PRICING_VERIFIED_AT` still `2026-08-05`. **GROUND-00 re-verifies what a repository can verify and states what it cannot.** |
| [DEBT-91](../product/PRODUCT_DEBT.md) | the Weekly Review assistant's fact block is narrower than the guided Review's own evaluators | true and precisely locatable: `review-facts.ts` returns `stalledProjects: 0`, `projectsWithoutNextAction: 0`, `diaryEntries: 0`, `goalsWithActivity: 0`, `goalsWithoutActivity: 0`. **GROUND-02 closes it.** |
| [DEBT-92](../product/PRODUCT_DEBT.md) | generated results are not persisted, so reuse is bounded to one isolate | unchanged, and **deliberately not taken**: V2.14 does not persist AI prose. Re-read when live usage exists. |
| [DEBT-93](../product/PRODUCT_DEBT.md) | AI evidence retrieval is keyword and relationship only | unchanged, and **deliberately not taken**: grounded intents do not retrieve by keyword at all, so the entry's premise does not apply to the new surfaces. Re-read when live usage exists. |
| [DEBT-198](../product/PRODUCT_DEBT.md) | no off-Cloudflare encrypted backup | **unchanged and untouched.** Grounded AI does not close Finance recoverability and does not permit real financial import. All Finance AI work here is proven against synthetic data. |
| [DEBT-250](../product/PRODUCT_DEBT.md) · [DEBT-251](../product/PRODUCT_DEBT.md) | Asset valuations keep no history; Task completion is attributed to the CURRENT Area | inherited as truth limitations. A Report's `standingNote` travels into its FactBlock as a bound, and the answer may not erase it. |

---

## What V2.14 is, and what it deliberately is not

**Is.** Retrieval, comparison, summary, explanation and pattern identification
over facts DalyHub computed, cited by id, in three surfaces: the Weekly Review
ritual, a Report, and a bounded Ask.

**Is not.** Inventing a figure. Calculating a product fact DalyHub should
calculate. Changing data. Creating a Task. Categorising a transaction. Settling
an Obligation. Any mutation at all — V2.15 owns actions. A chat with memory.
Document understanding, OCR, PDF text or any attachment content. Embeddings, a
vector store or a semantic index. A productivity score, a health score or a
grade of any kind. Financial, legal, tax or medical advice.

---

## The items

### GROUND-00 — make the foundation provable ☑

**The problem.** The platform's every claim above the adapter seam is tested and
its every claim below it is documentation. There is no way to exercise the real
product path — gateway, budget, ledger, schema, validation, refusal — without a
key, so a feature built on it cannot be proven and a failure cannot be
diagnosed.

**What is built.**

1. **A deterministic dev/test provider at the adapter seam.** It implements the
   same `AiProviderAdapter` contract the real adapters do and is constructed by
   `resolveAiConfiguration` in place of a real adapter. Everything above it —
   preference gate, feature policy, privacy filter, token estimate, budget
   reservation, ledger row, retry/fallback plan, schema validation, citation
   validation, reconciliation, release — is the code a real provider runs.
   Production code does not know it is fake anywhere except that one seam.
2. **It cannot be selected in production.** Enabling it requires
   `AI_FAKE_PROVIDER=1` **and** a development/test `ENVIRONMENT`, using the same
   two-key rule the development authenticator already uses. An architecture test
   asserts the production configuration refuses it.
3. **It simulates the states that matter**, chosen deterministically from the
   request's own content: success, timeout, provider refusal, malformed
   response, an unknown fact id, an uncited observation, a fabricated figure,
   over-budget and an unavailable provider.
4. **Degradation is audited end to end.** Every failure code has an owner-facing
   state, and no AI failure reaches the global error boundary from a Review, a
   Report or Ask.

**Closes.** DEBT-237. **Advances.** DEBT-213.

### GROUND-01 — establish the FactBlock ☑

**The contract.** One canonical `FactBlock` in `app/kernel/ai/fact-block.ts`.

```ts
type FactBlock = {
  id: string;                      // deterministic hash of the canonical payload
  intent: FactBlockIntent;         // closed set — one builder per intent
  question: string;                // the owner's question, or the report's
  subject: string;                 // "Spending by category"
  period: FactPeriod | null;
  facts: readonly Fact[];          // F1 … Fn — everything AI may state
  bounds: readonly FactBound[];    // the caveats that travel with the claim
  currencies: readonly string[];   // never merged
  truncated: boolean;
  consideredCount: number;
};

type Fact = {
  id: string;                      // "F1" — stable within one response
  label: string;                   // owner-authored text, sanitised, bounded
  value: FactValue;                // canonical units — minor units for money
  display: string;                 // DalyHub's own formatting; the AI restates it
  period: FactPeriod | null;
  reference: FactReference | null; // a SAFE link the UI builds; never a model URL
  note: string | null;             // this fact's own qualification
};

type FactValue =
  | { kind: "money"; minorUnits: number; currencyCode: string }
  | { kind: "count"; count: number }
  | { kind: "value"; amount: number; unit: string | null }
  | { kind: "ratio"; numerator: number; denominator: number }
  | { kind: "date"; iso: string }
  | { kind: "state"; state: string }
  | { kind: "absent" };
```

The kind lives on the **value**, not beside it, so a fact cannot claim to be
money and carry a bare number. `absent` is a first-class kind and the reason a
grounded answer can say *"there is no reading for August"* rather than *"August
is zero"* — the two are different claims about someone's life, and only one of
them is true. A `delta` kind was in the definition sketch and was dropped when
it was built: a difference is a `money` or `count` fact whose **label** states
the direction DalyHub computed, so there is no second arithmetic convention for
the model to interpret.

**Why it reuses the evidence architecture rather than replacing it.** The
existing `EvidenceItem` is a bounded *excerpt* with a citation id, a privacy
category and a deep link, and the response validator already refuses a citation
of an id DalyHub did not supply. A `Fact` is the same idea with a *value* and a
*unit* instead of prose, and it is carried alongside evidence in the same
request rather than instead of it. `EVIDENCE_KINDS` already contains `fact`;
V2.14 gives that kind a real shape.

**Grounding is structural, not instructional.**

- The response schema for a grounded feature has **no numeric field at all**.
  The model produces prose and `factIds`. Every figure the owner sees beside
  the prose is rendered by DalyHub from the `Fact`, not by the model.
- Every observation must cite at least one fact. An uncited observation is
  refused, not dropped.
- A cited id that DalyHub did not supply is refused.
- **Numeric claim checking**: every number-shaped token in an observation or the
  summary must be reproducible from a supplied fact — its canonical value, its
  formatted display, its period, or its record count. A figure that is not is a
  refusal (`provider_response_invalid`), and the deterministic facts stay on
  screen. This is tractable precisely *because* the schema is structured: there
  is a small, bounded set of strings to check against.

**Bounds are not optional.** A `ReportResult`'s notes — the standing caveat, the
bounded-group remainder, the mixed-currency split, the "no records" statement —
become `FactBound`s in the block, and the prompt states them. An explanation may
not say "across all history" when the block says twelve Reviews.

### GROUND-02 — ground the Weekly Review ☑

**The problem, exactly.** `computeWeeklyReviewFacts` returns five hard-coded
zeros for facts the guided Review computes properly three files away. The
assistant is therefore told, authoritatively, that the owner has no Goals with
activity and no stalled Projects — in the one sitting dedicated to noticing
exactly those things.

**What is built.** One Review FactBlock builder that calls the canonical reads
the guided Review already uses — `loadGoalStories`, the Project health
evaluator, `selectGoalNextAction`, the period account and `readAcrossReviews` —
and never re-derives one of them. No second Review fact engine.

The block carries: period completions and carry-over, Project health movement
across the recent Reviews, Goals with and without contribution, the most recent
measurement per Goal, obligations falling due, and a small bounded list of named
attention items. It does **not** carry every Task.

**The ritual does not depend on a provider.** The assistant is one section
inside the existing flow. With AI off, unconfigured, refused, timed out or over
budget, the Review renders exactly as it does today and the section says so in
one calm sentence.

**Closes.** DEBT-91.

### GROUND-03 — explain Reports, and answer bounded questions ☑

**Explain this report.** A local action on the report screen. The FactBlock is
derived from the `ReportResult` — the definition, the window, the measure, the
unit, the per-currency blocks, the rows, the totals, the remainder and every
note. The explanation names the period, the measure and the bound it is
explaining.

**Freshness.** The browser holds the result it is looking at, and the server
will not trust a browser-supplied figure. So the client sends the **FactBlock
hash** of what is on screen; the server rebuilds the block from a fresh
execution and refuses with `result_stale` if the hash differs. Prose is never
paired with numbers it was not written about, and no figure ever originates in
the browser.

**Ask DalyHub, bounded.** A deterministic parser resolves a question into one of
four grounded intents and its parameters, or into nothing:

| Intent | Question | Resolved parameters | Facts from |
|---|---|---|---|
| `finance_comparison` | why was August more expensive than July? | two periods, optional currency | `finance / money_out` grouped by category, twice, plus DalyHub-computed deltas |
| `goal_movement` | which Goals haven't moved recently? | a window | Goal stories + measurement series |
| `project_health` | which Projects have been at risk recently? | a Review count and type | `readAcrossReviews` |
| `obligation_horizon` | what do I need to deal with in the next 60 days? | a horizon in days | the obligation projection |

**The model never chooses.** Intent selection is a deterministic parser over a
closed set. The selected intent decides which builder runs; nothing is read
before the intent and its parameters are resolved and validated. A question
outside the set is refused honestly, naming what Ask *can* do.

**Where the figures come from.** Three of the four intents execute existing
V2.13 report definitions through `runReport`. That is deliberate: it means a
grounded answer and the Report the owner can open to check it are computed by
the same code, so they cannot disagree.

### GROUND-04 — make grounding and injection failures impossible to hide ☑

- The injection corpus is extended with owner-authored text in every place a
  grounded fact can carry it: Task, Project, Goal, Obligation and Meeting
  titles, Finance payees and memos, category names, and attachment filenames.
- Attachment **content** is asserted absent from every FactBlock by test, and
  the absence is structural: no builder reads an attachment body, and no code
  path exists from R2 to a prompt.
- Diary content is asserted absent. People are not a fact source.
- The ledger is asserted metadata-only by query: no amount, no payee, no label,
  no prompt and no fact value is written to `ai_usage_requests`.
- Workspace isolation is proven per builder against a foreign id.
- Every falsification in the table below is performed, proven to fail a test,
  and reverted.

### Falsification — thirty deliberate breaks, thirty red suites

A guarantee nothing can break is a guarantee nobody has tested. Each row below
was introduced into the working tree, the relevant suite was run, the failure
recorded, and the break reverted with `git checkout --` before the next.

| # | The break | Caught by |
|---:|---|---|
| 1 | numeric validator disabled, so a fabricated figure renders | `ai/grounded-schema` |
| 2 | an unknown fact id accepted as a citation | `ai/grounded-schema` |
| 3 | an uncited observation rendered beside cited ones | `ai/grounded-schema` |
| 4 | the adjacency rule removed, so "4 of 4" passes over a fact that says 3 of 4 | `ai/fact-block` |
| 5 | the development provider made selectable in production | `ai/fake-provider` |
| 6 | a fact builder reaches the Diary | `architecture/grounded-ai-boundaries` |
| 7 | an attachment filename enters a fact builder | `architecture/grounded-ai-boundaries` |
| 8 | an embedding model arrives on an AI path | `architecture/grounded-ai-boundaries` |
| 9 | a credential is read outside `ai-configuration.ts` | `architecture/grounded-ai-boundaries` |
| 10 | a grounded path calls a repository write | `architecture/grounded-ai-boundaries` |
| 11 | a Report's bound is dropped from the FactBlock | `ai/report-facts` |
| 12 | mixed currencies merged in the fact labels | `ai/report-facts` |
| 13 | the fact ceiling drops a block's totals instead of its tail | `ai/report-facts` |
| 14 | an arbitrary URL accepted as a fact reference | `ai/fact-block` |
| 15 | an owner label can close the fact block and open a policy | `ai/injection-corpus` |
| 16 | a truncated fact block reports itself complete | `ai/fact-block` |
| 17 | an unsupported question falls through to an intent anyway | `ai/ask-intents` |
| 18 | the grounded schema gains a field a figure could be returned in | `ai/grounded-schema` |
| 19 | a grounded answer accepted over an empty fact block | `ai/grounded-schema` |
| 20 | model markup rendered rather than refused | `ai/grounded-schema` |
| 21 | the ledger stores a fact LABEL instead of a record id | `kernel/grounded-ai` |
| 22 | a foreign workspace's record reaches a fact block | `kernel/grounded-ai` |
| 23 | DEBT-91's stalled-Project zero comes back | `ai/review-facts-overdue` |
| 24 | a set-aside Goal reported as ordinary | `ai/review-facts-overdue` |
| 25 | the Review block acquires a per-Project read (N+1) | `kernel/grounded-ai` |
| 26 | a Reports loader reaches the AI layer | `reports/report-boundaries` |
| 27 | a SECOND AI surface appears in the Reports module | `reports/report-boundaries` |
| 28 | the result identity moves with the clock | `reports/report-identity` |
| 29 | a lost caveat leaves the result identity unchanged | `reports/report-identity` |
| 30 | the stale-report refusal is deleted | `e2e/grounded-ai` |

**Three of these were harness misses on the first attempt and are worth naming**,
because a falsification that fails to break anything reads exactly like a
guarantee that holds. #21 edited `findReusable` rather than `reserve`; #25 used a
repository method that does not exist, so the break was swallowed by the
builder's own `safe()` wrapper; #22 passed an option the repository ignores.
Each was redone as a real break and then caught.

**#30 was a genuine test gap.** Deleting the stale-report refusal from the assist
route broke nothing: the refusal was covered only where it was constructed, not
where it is enforced. Three route-level browser journeys and
`test/unit/reports/report-identity.test.ts` were added, and the same deletion is
now red.

### What the falsification pass could not find, and a review did

Thirty breaks proved thirty guarantees were **enforced**. Not one of them could
ask whether a guarantee was **missing** — a harness tests the tests, and it does
not test the specification. An automated review of the pull request found five
defects that had survived it, and three of them are the kind this programme
exists to prevent. They are recorded here rather than folded quietly into the
diff.

| Finding | What was wrong | Fixed as |
|---|---|---|
| **Consent never ran on a grounded request** | AI-04 is enforced through the evidence set's categories; a grounded feature sends no evidence, so the check had nothing to inspect. `financial` is not allowed by default, so the first spending question would have sent money to a provider the owner never permitted financial content to reach. | A `FactBlock` declares `categories`; the runtime refuses to SEND a disallowed one, before the budget is reserved. [`AI_PLATFORM.md` §15](../development/AI_PLATFORM.md#a-fact-declares-its-category-because-it-has-no-excerpt-to-classify-v214). |
| **The obligation horizon named settled work** | `readObligationPage` returns every status by default, so completed, dismissed and on-hold commitments were counted and named as outstanding. | Filtered to `open`. Overdue commitments stay, with their own count fact and bound. |
| **"Which Projects have been at risk?" could not see the worst case** | `readAcrossReviews` drops a Project whose state never changed — right for an Insight panel about what moved, exactly wrong for this question. A Project at risk at every Review produced "nothing to report". | `readProjectHealthAcrossReviews`, extracted from it with `includeUnchanged`. One derivation, two views. |
| **The Review discarded its own figures on failure** | The route returns them on the failure envelope; the surface rendered the sentence and dropped them. | Rendered, and falsified. |
| **A citation pointed at other figures** | A saved report with changed controls lives at `/reports/<id>?src=…`; links were the bare id. Worse: the unsaved branch built `/reports/view?d=<json>`, and `d` is not a parameter Reports reads. | The page sends its own URL, validated server-side to a `/reports` path. |

**The lesson, stated so the next programme inherits it.** A falsification pass is
evidence about coverage, not about completeness. The consent gap was not a broken
guarantee; it was an absent one, and no amount of breaking the guarantees that
existed would have surfaced it. Reading the diff against the CONTRACT — here,
AI-04 — is a different activity from breaking the tests, and V2.15 should plan
for both.

---

## Programme status

☑ **GROUND-00** · ☑ **GROUND-01** · ☑ **GROUND-02** · ☑ **GROUND-03** ·
☑ **GROUND-04**

**V2.14 GROUNDED AI — implementation complete; production AI activation is
owner-gated by the provider key.** Every surface, every refusal path and every
grounding invariant is proven on the deterministic provider through the real
gateway. No request has ever been sent to Anthropic or OpenAI from this
repository, and
[`AI_PLATFORM.md` §21](../development/AI_PLATFORM.md#21-manual-provider-verification-opt-in-never-in-ci)
still says so truthfully.

### Owner activation

1. `pnpm exec wrangler secret put ANTHROPIC_API_KEY --env production` (or
   `OPENAI_API_KEY`; either is sufficient, both are supported, neither is
   preferred). The value is pasted at the prompt, never typed on a command line.
   Full steps and reasoning:
   [`DEPLOYMENT.md`](../development/DEPLOYMENT.md#activating-ai-in-production-owner-held-v214).
2. Optionally `AI_GATEWAY_ACCOUNT_ID` **and** `AI_GATEWAY_ID` together to route
   through Cloudflare AI Gateway, plus `AI_GATEWAY_TOKEN` for an authenticated
   gateway. Half-configuring the gateway is refused by preflight rather than
   silently ignored.
3. Turn AI on in Settings and choose the allowed features; it is off by default.
4. Run `node scripts/ai-integration-check.mjs anthropic` (or `openai`) with the
   key in the environment, against synthetic data only, and record the result on
   [`AI_PLATFORM.md` §21](../development/AI_PLATFORM.md#21-manual-provider-verification-opt-in-never-in-ci).
5. Re-verify the model and pricing registry against both providers' current
   pages before concluding anything from a failure ([DEBT-213](../product/PRODUCT_DEBT.md)).

The key is never placed in source, a fixture, CI, a log, a screenshot, an error,
an export, D1 or a browser bundle.

### Completion criteria

- [x] V2.14 defined against current `main`, with the AI platform re-measured.
- [x] A deterministic provider runs the genuine gateway path.
- [x] The fake provider cannot be selected in production, asserted by test.
- [x] `FactBlock` is the one contract; every grounded surface builds one.
- [x] No figure in any answer can be absent from its FactBlock.
- [x] Citations validate; an unknown id is refused.
- [x] The Weekly Review assistant is live on canonical Review facts.
- [x] Report explanation works, bound to the result's own hash.
- [x] Ask supports the four grounded intents and refuses the rest honestly.
- [x] Provider-off, malformed, timeout and budget-refusal states all keep the
      deterministic facts on screen — on **every** grounded surface, the Weekly
      Review included.
- [x] A grounded request obeys AI-04: a block naming a privacy category the
      owner has not allowed is refused before the budget is reserved.
- [x] The injection corpus is green; attachment content, Diary and People are
      absent from every FactBlock.
- [x] No new mutation path exists.
- [x] Hostile-workspace isolation proven per builder.
- [x] Normal route performance unaffected: no provider call in any loader.
- [ ] Production AI activation — **owner-held**, see above.

---

## Non-goals, stated so they are not re-litigated

- **No mutation.** V2.14 adds no proposal kind, no apply path and no write.
- **No embeddings, no vector store, no semantic index.** ADR-073 §20 deferred
  them and nothing here needs them.
- **No document AI.** No OCR, no PDF text, no image understanding, no R2 object
  reaches a provider.
- **No chat memory.** One question, one grounded response. DalyHub's structured
  data is the memory.
- **No Diary and no People as fact sources.** The most sensitive prose in the
  product is not where grounded AI starts.
- **No streaming.** A structured response is validated whole; partial claims are
  never rendered and then retracted.
- **No second AI settings page.** The existing Settings section is the one place.
- **No floating assistant.** Reports gets a local action, the Review gets a
  section in its own flow, Ask is the one general entry point, and there is no
  new primary navigation slot.
