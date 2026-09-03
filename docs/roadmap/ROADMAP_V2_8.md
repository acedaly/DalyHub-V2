# ROADMAP_V2_8.md — DalyHub V2.8, CONVERGE

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1, [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md)
> holds V2.2, [`ROADMAP_V2_3.md`](ROADMAP_V2_3.md) holds V2.3 (**closed**),
> [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) holds V2.4 (complete apart from
> V2.4-GATE-01's owner-held halves), [`ROADMAP_V2_5.md`](ROADMAP_V2_5.md) holds
> V2.5 (**complete 2026-08-28**), [`ROADMAP_V2_6.md`](ROADMAP_V2_6.md) holds
> V2.6 (**complete 2026-08-29**) and [`ROADMAP_V2_7.md`](ROADMAP_V2_7.md) holds
> V2.7 (**complete 2026-09-01** — all five RECALL items delivered).
>
> **This file is V2.8, and it is where new work goes.** It was defined on
> 2026-09-02 against `main` at `036d3da` (RECALL-04 merged, PR #246) by its
> own decision pass — which re-measured the product rather than inheriting the
> 2026-08-29 audit or V2.7's LATER table, chose a theme, numbered its debt from
> **DEBT-236** and recorded its decision as
> [ADR-115](../decisions/ARCHITECTURE_DECISIONS.md#adr-115-converge--a-task-is-rendered-by-the-shared-row-wherever-it-can-be-acted-on-a-fixture-never-carries-the-month-it-was-written-in-and-a-gate-that-cannot-say-green-is-a-truth-defect-not-a-rider).
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: IN PROGRESS (2026-09-03).** CONV-00 ☑ delivered
2026-09-02; CONV-01 ☑ delivered 2026-09-03; **CONV-02 is next**; CONV-03 ☐.

> **Amended 2026-09-02, before CONV-00 began**, as the follow-up resolution of
> the two review findings left unresolved on the defining PR (#247, merged
> before they were addressed). Two contracts were tightened; the theme, the
> sequence and the decision are unchanged. **CONV-00-E** now covers every
> fixture-date literal format that can recreate DEBT-236 — the two motivating
> regressions click long-form picker labels (*"Wednesday 29 July 2026"*), which
> an ISO-only check would never see — and must prove the check fails on both
> a future ISO literal and a long-form picker label of any date. **CONV-01**
> now states that adopting the shared row is capability-aware: a capability
> whose domain precondition is absent in a scope (drag, where the surface
> draws no drop destination and stores no order) stays absent through the
> row's existing contract, and is never invented to complete the convergence.
> ADR-115 decisions 2 and 4 carry the same wording.

---

## The theme: CONVERGE — one Task, one proof

**A Task is the same row with the same powers wherever you meet it — the
Project record, the waiting list and your phone included — and every claim
DalyHub makes about itself is backed by a gate that can say green again.**

Seven programmes in five weeks have given the product its capability. Measured
on 2026-09-02, the daily-driver chain has **no broken verb** for the first time
(below). What is left is not a missing feature. It is two structural debts that
every one of those programmes deferred, that have compounded while they waited,
and that tax every programme that could follow:

1. **The product's proof system is red and has been for fifteen consecutive
   `main` runs.** Every V2.7 PR shipped "its partitions no redder" by a human
   reading a red gate. In that fortnight two new failures arrived that nobody
   noticed and no register entry names, because a red gate cannot tell a new
   red from an old one. A repository-driven product whose gate cannot say green
   has lost the memory it is supposed to be.
2. **The most-used object has two anatomies on high-frequency surfaces**, and
   the fork widened again in V2.7 exactly as [DEBT-175](../product/PRODUCT_DEBT.md#-debt-175--the-project-records-tasks-tab-is-the-last-surface-that-does-not-render-the-shared-taskrow--p2)
   predicted — in the other direction this time: RECALL-03's follow-up fact
   landed on the *Card* path (`WaitingTaskCard`) and the shared row does not
   carry it.

V2.8 pays both down and stops. It ships no new module, no new capability class
and no visual redesign. It leaves behind a green, deterministic gate; one Task
anatomy; and three recorded rules that make both hard to lose again.

---

## Where V2.7 left the product

All five RECALL items delivered 2026-08-30 … 2026-09-01, every one of the
fourteen entries it raised (DEBT-222 … DEBT-235) closed:

- **RECALL-00** — seven measured path defects fixed (Diary links open the
  Diary; `/views` bind-safe and honest about its bound; one batched follow-up
  read; a named search control at every width; one active-navigation rule;
  deterministic Ask answers reachable with AI off; no Review guide dead-end).
- **RECALL-01** — search reaches Meeting prose, Diary bodies (explicit query
  only), Task descriptions and Review reflections through one SQL-cut excerpt
  contract; `LIKE` retained, no second index.
- **RECALL-02** — `spine_records.completed_at` is the one completion-time
  authority; a `completed` sort, a `completedWithin` window, two palette doors.
- **RECALL-03** — `followUpOn` is read by one filter dimension, one Today
  attention fact and one digest line; the Waiting surface pages by keyset.
- **RECALL-04** — meetings-today stated; one measurement predicate; alignment
  wears alignment words; period-scoped Review reads; the week account stays
  where the ritual happens.

**Recoverability is unchanged since 2026-08-30 and is not a gate here.** The
R2 backup tier is healthy (20/20 runs); a real production artefact was restored
into a throwaway remote D1 with matching counts and a clean
`PRAGMA foreign_key_check` (DEBT-199 ☑); the off-Cloudflare copy remains the
owner-held residue ([DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2), P2)
and DEBT-139 is down to one ~30-second owner UI check. Nothing in V2.8 carries
a migration, so nothing in V2.8 waits on either.

---

## The current truth, re-measured (2026-09-02, `main` @ `036d3da`)

Every claim below was measured on this tree, not inherited. Where an inherited
claim did not survive, the correction is recorded in
[Corrected](#corrected--do-not-carry-these-forward).

### The chain

`capture → organise → decide → do → review → learn → retrieve`, scored the way
V2.6 and V2.7 scored it:

| Stage | Verdict | What is strong | What is merely adequate, or where it still breaks | Class |
|---|---|---|---|---|
| **capture** | strong | 2 taps on a phone, one closed grammar with `#tag`, the token API, an offline queue for task/note/diary | No `share_target` in the manifest — the OS share sheet cannot feed capture (`public/manifest.webmanifest`); no capture-processing state (DEBT-102) | missing capability, P3 |
| **organise** | strong | One tag vocabulary (ADR-113), one links model, one filter grammar with four consumers | — | — |
| **decide** | strong | Today, Plan, one next-action rule, honest signals, meetings-today stated, follow-ups due on the waiting row | `/today` **overflows sideways at 200% zoom** — a WCAG 1.4.10 reflow failure on the surface the owner opens first (DEBT-221, measured red on every `main` run since 2026-08-28) | **truth / reliability, P2** |
| **do** | strong on `/tasks`, `/today`, `/plan` | The shared `TaskRow`: inline title/priority/due/parent, overflow menu, selection and bulk, swipe, drag where order is stored, optimistic patch map (ADR-086), five-step container ladder | **On the Project record and `/today/waiting` a Task is a `Card`**: no overflow menu, no inline title edit, no selection, no recurrence signal, no swipe, a second optimistic strategy, a second responsive ladder that hides priority/repeat/waiting-for below 26rem — on the surface an owner works a Project *from* (DEBT-128 + DEBT-175) | **structural duplication, P2** |
| **review** | good | Guided weekly Review; period-scoped tabs (RECALL-04); insights compare the previous snapshot in four places | Monthly/quarterly unguided (their own decision) | legitimately later |
| **learn** | fair | Single-step snapshot comparison; Analytics trend ≤ 8 buckets; Habit four-week strip; Asset value history | 52 Review snapshots a year are stored and only the most recent is ever read (`listSnapshotsBefore`: zero callers); `listMeasurementSeries`: zero callers (DEBT-212); `/today/activity`: no UI (DEBT-103) | missing capability — the Insight candidate, below |
| **retrieve** | strong | Content, time and commitment all answer (V2.7) | — | — |

**The chain no longer breaks at a verb.** It is weakened at two *properties*
that cut across verbs: the same object behaving differently by surface, and a
proof system that cannot currently distinguish a regression from history.

### The gate, measured

`main`'s CI has concluded **failure on fifteen consecutive runs**, #779
(2026-08-28, STEER-03/04, `1ce1e75`) through #815 (2026-09-01, RECALL-04,
`036d3da`). The last green `main` run was #777 (`d550343`, STEER-01/02,
2026-08-28). Static, Unit (unit + kernel) and Build are green on `036d3da`; the
E2E matrix is **7 of 13 partitions red, ten failing tests**:

| Failing test on #815 | Recorded? | Class | Since |
|---|---|---|---|
| `command-palette.spec.ts:616` — "contributes NO create-Goal command" | DEBT-216 | stale assertion; the product is right (`goals.new` exists, `goals/commands.ts:49-54`) | 2026-08-28 |
| `goals.spec.ts:13`, `goals.spec.ts:281`, `areas.spec.ts:12` — Area Goals tab addressed as a Card | DEBT-215 | stale assertion; **the entry's own claim that "there is no `article` role on the tab at all" is now false** (`ProgressRow.tsx:126-131` renders one); what cannot resolve is the `Open <title>` link name (`GoalStoryRow.tsx:162-176`) | 2026-08-28 |
| `project-templates.spec.ts:292` — template titles absent from `/today` | DEBT-220 | stale assertion; the structural guarantee beside it passes | 2026-08-29 |
| `assets-ownership.spec.ts:582` — obligation signal | DEBT-219 | **fixture time-bomb**: `ob-rc-inspect` due `2026-08-28` (`seed-record-convergence.sql:384-386`); a second arms on **2026-09-14** (`ob-rc-rego`, `:382`) | 2026-08-29 |
| `mobile-shell.spec.ts:502` — `/today` at 200% zoom | DEBT-221 | **real product defect** (WCAG 1.4.10) — see the correction below on its cause | 2026-08-28 |
| `editing-consistency.spec.ts:253` — set/change/clear a due date from the record | **not recorded** | **fixture time-bomb**: `PageUp` from an unset picker "opens on the owner's own month; July is one back" (`:301-303`) — true in August, false since 1 September. **Reproduced locally 2026-09-02** on a fresh seed: timeout at `:304`. Raised as [DEBT-236](../product/PRODUCT_DEBT.md#-debt-236--two-task-date-editor-journeys-assert-the-calendar-month-they-were-written-in--p2) | 2026-08-31 (#812) |
| `inline-editor-overlay.spec.ts:390` — the due-date editor's whole interface | **not recorded** | same class: four `PageDown`s from today then "Friday 25 December 2026" (`:450-454`) — reaches December only from August. **Reproduced locally 2026-09-02**: timeout at `:454`. DEBT-236 | 2026-09-01 (#815; the file sat in a partition that was red for another reason on #812) |
| `goals-alignment.spec.ts:28` — AREA-03 alignment journey | **not recorded** | **passed on #812, failed on #815** — the first run after RECALL-04, which touched `goal-outcome.ts`, `goal-progress-view.ts` and the alignment vocabulary. **Passes locally on a fresh seed, 2026-09-02** (28.3 s), so it is not a deterministic regression: DEBT-203's or DEBT-173's shape, recorded on DEBT-203, and CONV-00-G reproduces it in partition order before saying which | 2026-09-01 (#815) |

Beside those, the set of red partitions **moves between runs** — #812 had
p02, p06 and p09 red and p03, p11 green; #815 the reverse — which is
[DEBT-203](../product/PRODUCT_DEBT.md#-debt-203--the-e2e-suite-carries-latent-timing-races-at-roughly-one-per-two-runs-so-green-is-probabilistic--p2)'s
measured race rate (`notifications.spec.ts:214` on #812 is one instance). Two
P1 entries — [DEBT-125](../product/PRODUCT_DEBT.md#-debt-125--mains-e2e-suite-is-red-for-reasons-unrelated-to-the-change-that-finds-it--p1--no-longer-broadly-red-and-the-browser-fix-is-holding-the-suite-still-cannot-finish-harden-03-2026-08-12)
and [DEBT-157](../product/PRODUCT_DEBT.md#-debt-157--the-e2e-partition-durations-can-only-be-refreshed-from-a-failing-run--p1-re-rated-2026-08-20-mechanism-closed-by-harden-06a-the-same-day-held-open-for-its-confirming-run)
— owe nothing but *two consecutive green `main` runs*, and have been unable to
get them for the same fortnight. There is no quarantine, no allowlist, no
retry (`retries: 0`, `workers: 1`); the honesty layer works exactly as built,
and what it is honestly reporting is that the trunk's state is unknown.

**The cost is not "CI is red".** It is that the gate has stopped carrying
information: seven partitions red means a new regression in any of those seven
is invisible unless somebody reads the log, and in the fortnight it was red,
two new time-bombs went unrecorded and one possible regression (the alignment
journey) cannot be told from a race without a local reproduction. That is the
property [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1--resolved-2026-08-02)
was raised for, back at the V2 release, and it is the truth defect this
programme names first.

### The Task fork, measured

Where a Task is drawn on `main`, by surface (the full table is in the
decision's evidence; the load-bearing rows):

| Surface | Component | What the owner cannot do there that they can on `/tasks` |
|---|---|---|
| `/tasks`, `/today` bands, `/plan` | shared `TaskRow` (`TasksWorkspace.tsx:1876`, `TodayScreen.tsx:332,381,1546`, `PlanWorkspace.tsx:980`) | — |
| **Project record → Tasks tab** | generic `Card` with a hand-built prop builder (`ProjectTasksTab.tsx:51-513`; live comment at `:452`: *"This tab does not render `TaskRow` yet (DEBT-175)"*) | open the overflow menu; edit the title inline; select rows and act in bulk from the row; see the recurrence signal; swipe; watch a completed row leave with focus handed on; and below 26rem see priority, repeat or waiting-for at all (`tasks.css:1907-1913`, asserted hidden by `iphone-daily-driver.spec.ts:72`) |
| **`/today/waiting`** | generic `Card` (`waiting.tsx:312`, `WaitingTaskCard.tsx:26`) | anything but read: no completion control, no editor, no menu — and it is the one surface that draws RECALL-03's **follow-up** fact (`WaitingTaskCard.tsx:72-81`), which the shared row has no field for |
| Offline snapshot viewer | a module-private component **also named `TaskRow`** (`OfflineSnapshotView.tsx:339`) | read-only by design; the name collision misdirects |
| Search result, `/views` row, Meeting follow-up row, `NextActionLine` | bespoke *reference* rows (`SearchSurface.tsx:556`, `ViewsWorkspace.tsx:317-353`, `MeetingFollowUp.tsx:331-344`) | these are links to a Task, not Task rows — decided below |

Two completion toggles, two metadata layout systems, two responsive ladders
(`tasklist` at 56/44/34/21/12rem vs `tasks-list` at 46/26rem), two optimistic
strategies (ADR-086's patch map vs re-fetch), and **~930 lines of the UIX-01
Card override layer still alive in `tasks.css` (`:996-1928`)** kept alive by
exactly two consumers. Formatting logic is *not* duplicated — urgency, dates,
blocked wording and the status triple are single-sourced through
`task-view.ts` and `kernel/tasks/task.ts` — so the fork is anatomy and
interaction, which is the expensive kind to keep and the cheap kind to close.

### The other surfaces, briefly

- **Mobile (393 px).** A designed phone product: composed bottom bar, 2-tap
  capture, real sheets, swipe with a non-swipe equivalent, one-step-at-a-time
  guided Review. Open friction is P3 residue (DEBT-136, 161, 162, 163, 218,
  RECORD-03) plus DEBT-221. No broad polish pass is warranted; the one P2 is
  taken by CONV-00.
- **Offline / PWA.** Reads: only the `/offline` surface (a ±7-day snapshot with
  600-char excerpts); every cold navigation while offline redirects to it
  (`sw-template.js:437-450`). Mutations: seven Task operations on one entity
  type (`offline-mutation.ts:19-24, 41-68`), replayed through canonical routes
  with idempotency keys and base-value conflict arbitration; a loaded Tasks or
  Today surface stays usable through a network loss and never shows
  "Something went wrong" (`pwa-offline-tasks.spec.ts:681-727`). Habit
  check-ins, checklist structure, reorders, every non-Task module: online-only.
  The historic WebKit "problem repeatedly occurred" loop is fixed and
  backstopped (ADR-090; safe mode after four offline boots). Not covered by
  CI: hydrated offline rendering (DEBT-70, P2). No `share_target`, no
  `shortcuts`. The register's whole-slice deferral stands — nothing measured
  here reopens it, and the register's own words still hold: *"no new evidence
  since V2.4."*
- **Notifications / digest.** Two kinds (`digest`, `asset_obligation`), one
  external channel (Pushover, owner-configured, off by default), no email, no
  Web Push — by recorded design. The digest gained its follow-ups line in
  RECALL-03. No change wanted.
- **AI.** Measured in full below. Complete, tested, never once exercised
  against a provider; the credential is owner-held; the deterministic answers
  are reachable with AI off since RECALL-00-F.
- **Assets / Attachments.** No R2 binding in the application Worker, by
  written policy (`wrangler.jsonc`); the export manifest says in code *"File
  attachments: DalyHub stores none."* Measured in full below.
- **First run.** A standing non-goal, reaffirmed; the two vestigial Settings
  rows the audit named ("Workspace isolation: Active", "Deferred data tools")
  are still there (`settings/routes/index.tsx:1382-1386, 1410-1419`) and are
  recorded, not fixed.

### Corrected — do not carry these forward

- **DEBT-221's named cause does not hold.** The entry blames
  `span.dh-today__review-door-period` (the date range "cannot wrap"). On
  `main`, that span sits in the panel *head*, has carried `white-space: normal`
  since STEER-05 itself (`today.css:2127-2129`), and the door button's period
  is a `.dh-visually-hidden` span (`position:absolute; width:1px`) that cannot
  drive layout width. The overflow is real (the spec still fails); the
  offender was re-measured by this pass at 195 × 422 on a fresh seed:
  `scrollWidth` 239 against `clientWidth` 195, and the element that passes the
  edge is the door **button itself**, `a.dh-btn.dh-btn--outlined.dh-btn--sm`,
  laid out 206px wide inside `p.dh-today__panel-foot` — its *visible* label
  ("Start this week's Review") cannot wrap because the shared button is
  `white-space: nowrap`. The defect is real and unchanged; the cause moved.
  See the entry's 2026-09-02 correction.
- **DEBT-215's "no `article` role on the tab at all" is false today** —
  `ProgressRow` renders `<article aria-label={title}>`, so the `article`
  locators resolve and only the `Open <title>` link names do not.
- **DEBT-128's title is stale on two of its three surfaces.** Today adopted
  the row on 2026-08-17 (DEBT-143); search never became a Card (it is a bespoke
  `role="option"` row reusing the row's signal primitives). What the fork
  actually consists of today is the Project tab and `/today/waiting` — plus the
  override layer they keep alive. Corrected on the entry; the closing condition
  is unchanged and still unmet.
- **DEBT-151's headline is low.** The entry says 30 assets / 1,320,668 B; the
  PWA authority's own later table records 32 / 1,383,217 B (2026-08-25). The
  ceilings (1,450,000 B / 320,000 B wire / 40 assets) are unchanged; the
  headroom is thinner than the headline says. Corrected on the entry; not
  taken.
- **The V2.6/V2.7 framing of the E2E repair as a "rider that rides beside" is
  the claim this pass retires.** It was named in V2.6 (2026-08-28) and again
  in V2.7 (2026-08-30). It did not ride. A rider is work with no owner, and
  the measured cost of that is above.

---

## AI, decided again (Step 3 of the decision pass)

**What exists.** ~9,840 lines: two provider adapters (Anthropic, OpenAI) behind
one `StructuredRequest → StructuredResponse` contract, one pure URL derivation
(direct or Cloudflare AI Gateway), a reserve → run → reconcile runtime with
application-enforced budgets ($10/month, $1/day, deep tier off), a
content-free usage ledger, the proposal model with evidence-id citation that
rejects invented ids, structural People/Diary exclusion, four features
(meeting/note action extraction, the Weekly Review assistant, Ask DalyHub) and
30 E2E journeys proving the off state.

**What deterministic Ask can do now.** Five intents — overdue count, open
count, inbox count, latest meeting, upcoming meeting — answered server-side
before any provider gate (`assist.tsx:161-182`) and **reachable with AI
disabled since RECALL-00-F** (`ai/routes/index.tsx:83-85, 120-124`; E2E
`ai-assistance.spec.ts:186-198`).

**Has a provider-backed request ever been proven? No.** `AI_PLATFORM.md`
§21: *"STILL NOT RUN — re-verified 2026-08-28 … Nothing in this repository has
ever contacted Anthropic, OpenAI or a Cloudflare AI Gateway."* Every adapter
test injects `fetchImpl` against a mocked HTTP; the evaluation corpus uses a
deterministic fake; **no test and no script has reached a real provider.**

**Exactly what blocks a real request.** One of `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` (or the three AI Gateway values) as a **Worker secret** —
never a settings column, never a D1 row, deliberately absent from
`wrangler.jsonc` and from the Settings UI (`AiSettingsSection.tsx:4`: *"What
this surface deliberately does NOT contain: a field for an API key."*).
`scripts/ai-integration-check.mjs` needs nothing else: without the variable it
exits 2 with *"is not set. Nothing was sent."*

**Code-held or owner-held?** The credential is **owner-held**, whole, and this
repository cannot produce it. But re-measurement found one thing V2.6's gate
definition assumed and the code does not have: ADR-112 decision 2 lists "the
disabled and **fake-provider paths**" among what the gate proves, while
`e2e/ai-assistance.spec.ts:525-529` records *"There is no deterministic
test-provider seam in this repository — AI-01 shipped none on purpose."* So
the gate **as written** has a small code-held half — a dev-only fake provider
behind the existing adapter contract, and the check script wired as an npm
script — beside its owner-held half. Raised as
[DEBT-237](../product/PRODUCT_DEBT.md#-debt-237--the-ai-gate-names-a-fake-provider-path-that-the-repository-deliberately-does-not-have--p3) (P3).
A second code-adjacent risk stands unchanged: DEBT-213's registry is pinned to
2026-08-05, so the first live run may fail on a retired model id for reasons
unrelated to the adapter.

**Did RECALL-01 improve grounding?** For the *owner*, yes; for the *assistant*,
not yet. `evidence-retrieval.ts` was last touched by HARDEN-06 and composes
named fields (`agendaMarkdown`, `notesMarkdown`, task titles) — it does not
read `matchSource` or the new excerpts, and that is correct under ADR-114
decision 2 (body-search excerpts are a Search-surface artefact, never AI
evidence). The one real improvement is indirect: the same providers now
*admit* a Meeting or Task by body content, so a question phrased in the words
of a meeting's notes can retrieve that meeting where before it could not.
DEBT-93's wording ("a question phrased entirely differently … still retrieves
nothing") is unchanged and still true.

**The smallest useful AI slice now** is unchanged from V2.6's recorded
sequence and is *not a programme*: (1) the gate, (2) DEBT-91's fact block
(`loadGoalStories` + `selectGoalNextAction` already are the bounded fact
block; the work is to call them), (3) the Weekly Review assistant live inside
the one ritual that has a reviewer, a cadence and an undo.

**Does AI deserve to be V2.8? No — it remains gated, and the gate is now
stated precisely enough to run in one session:**

> **The gate passes when**, with `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set
> as a Worker secret in a non-production environment and **synthetic data
> only**: (a) `scripts/ai-integration-check.mjs` prints every PASS line —
> structured output parsed and schema-valid, the injection line refused,
> provider-reported usage present, the local cost estimate reconciled against
> it within the registry's stated tolerance, round-trip under the runtime's
> timeout; (b) the same request through the AI Gateway routing mode passes
> identically, or the mode is recorded as unproven; (c) a forced timeout and a
> forced 4xx/5xx map to the runtime's `failed` state with a redacted log line
> that contains no key, no prompt and no record; (d) `store: false` (OpenAI)
> is observed in the request the provider received; (e) the model registry is
> re-verified against the provider's live model list and `PRICING_VERIFIED_AT`
> advanced (closes DEBT-213); (f) the disabled path and the fake-provider path
> (DEBT-237) are green in E2E on the same tree; and (g) nothing was persisted:
> the usage ledger holds metadata only and no D1 row contains prompt or
> response text — asserted by query, not by inspection. Passing ships **no AI
> feature and no AI UI.**

The owner action is one secret. It is listed with the owner actions below,
not scheduled behind anything, and it does not wait for V2.8 to finish.

---

## Attachments, assessed (Step 4)

**Should Attachments move now? No.** The smallest legitimate capability is
recorded here so the next decision pass does not re-derive it:

- **Storage model.** One private R2 bucket bound to the application Worker
  (today it has none, by written policy — `wrangler.jsonc`, "deliberately has
  NO R2 binding"); objects keyed by workspace and attachment id, never by a
  user-supplied name; content served **only** through an authenticated
  same-origin route behind the existing request boundary (public-safe paths →
  capture → authenticate → provenance), so the CSP's `default-src 'self'`
  needs no widening and no signed cross-origin URL exists.
- **Metadata.** An `attachment` record — `EntityType` is an open string; only
  the four spine kinds are reserved (`spine-identifiers.ts:53`) — holding
  filename, byte size, content type, a content hash, the R2 key and soft-delete
  state; linked to any record through the ordinary EntityLink.
- **Upload / download.** Multipart through the one existing file-reading path
  shape (`settings/routes/restore.tsx:226-253` already bounds size *before*
  reading the body); download streams from R2 with `Content-Disposition:
  attachment` and a sniff-proof content type; no inline rendering of
  user-supplied HTML/SVG (ADR-015 §12 stands).
- **Limits.** Per-file and per-workspace byte budgets, enforced before the
  body is read, stated in Settings the way the export bound is.
- **Privacy.** Attachments inherit the record's class: a file linked to a
  Diary entry or a Person is excluded from AI evidence structurally, exactly
  as the record is.
- **Export.** The vault gains a binary collection — the manifest currently
  says *"File attachments: DalyHub stores none."* and the vault README repeats
  it — under the documented compatibility protocol; an export without its
  files must say so.
- **Backup/restore.** The backup Worker exports **D1 only**. Attachments make
  the R2 bucket a second data store the restore rehearsal must cover — a
  lifecycle rule and a second verify step — **before** any owner file is
  accepted. This is the prerequisite that makes Attachments a programme.
- **Mobile.** Capture from the sheet with the OS file picker; `share_target`
  for files is a separate decision.
- **Content search.** Later. RECALL-01 searches the text DalyHub owns; PDF/OCR
  text is a derived representation and stays refused until attachments exist.

**Why not now.** Foundational for Finance only; weekly-cadence use; the owner
already has a drive; and its first real item is a backup/restore programme
for a second store — while the product's *first* store's off-Cloudflare copy
is still owner-held. Sequenced after Insight and before Finance, unchanged.

---

## Finance, assessed (Step 5)

**Should Finance be next? No.** The money discipline it needs already exists
(ADR-049: integer minor units + a currency code, `kernel/money/money.ts`,
mixed-currency totals that report exclusions) and the obligation machinery is
the proven shape for recurring bills (30/7/1-day rungs, deduped forever,
digest line). Everything else is absent: no CSV/OFX/QIF parser anywhere in
`app/`, no import architecture of any kind beyond read-only ICS (X-03's
Todoist/Notion import is unbuilt), no accounts, no transactions, no categories.

The smallest useful shape stands as the 2026-08-29 audit §8 recorded it and
must not grow: manual accounts · transactions with CSV import and dedupe by
(account, date, amount, normalised payee) · one category set that is structure,
not tags (ADR-113's non-goal) · monthly budget vs actual · recurring
obligations reusing the Assets shape · a net-worth snapshot. Outside:
bank feeds, double entry, invoicing, tax, shared ledgers, investment analytics.

**Prerequisites, re-checked.** (1) Attachments must precede it — a finance
workflow without receipts/statements is half a workflow, and building files
inside Finance creates the second storage primitive the architecture forbids.
(2) The off-Cloudflare residue **does** change the risk: financial rows raise
the cost of a single-provider loss from "a fortnight of notes" to "a year of
reconciliation", so DEBT-198 becomes a hard gate for Finance where it is not a
gate for anything else. (3) No import architecture exists; it is Finance's own
first item. (4) Trust/recovery requirements rise enough to defer it: yes.
**Verdict unchanged: after Attachments, after DEBT-198, not before.**

---

## Insight, assessed (Step 6)

**Is there stored history the product collects and does not help the owner
learn from? Yes, and it is measured, not supposed:**

- `review_insight_snapshots` (migration `0034`): one row per completed Review
  — ≈52 a year at weekly cadence, each holding up to 40 Project states, 25
  Goal states, 20 Area counts and 50 carry-over ids. **Only `priorReviews[0]`
  is ever read** (`review-insights-context.ts:797-808`); `listSnapshotsBefore`
  (bounded at 8) has zero production callers.
- `goal_measurements`: the record and detail pane plot the full history; the
  collection shows the latest value only; `listMeasurementSeries` has zero
  callers (DEBT-212).
- Analytics: one bucketed series (tasks completed), capped at 8 points; the
  quarter range buckets fortnightly, so "completions per week for 12 weeks" is
  not askable. Projects/Goals completed have no line.
- `/today/activity`: a resource route with no UI (DEBT-103).
- Habit check-ins have a four-week strip; Asset value has a history view;
  planning-week and Review-period accounts are derived per window and never
  compared across windows.

Unanswerable today despite the data existing: a Goal's alignment over the last
six Reviews; which Projects were at risk in three consecutive Reviews; which
Tasks have carried over at every Review this quarter; completions per week
over twelve weeks.

**Is Insight a coherent high-value programme now, or still additive? It is
coherent, small and bounded — and additive.** Its rules are already written
(ADR-079 d2/d6, ADR-110 d3/d4/d7, ADR-111 d7: derived from Activity or the
one snapshot artefact, no score, no grade, no second stored artefact, every
figure names its window). Its shape would be three items: a multi-Review
trend read over `listSnapshotsBefore` rendered in the Review insights panel
and the Goal record; a Goal measurement series consumer or the removal of the
API; and the `/today/activity` surface-or-remove decision. Weekly cadence,
low risk, no external block, cheaper after RECALL-02. **It is the presumptive
V2.9**, and it is not V2.8, because a learning surface built on top of a
red gate and a forked Task anatomy is one more thing that will be verified by
reading logs and will need rendering twice.

---

## The governing product argument (Step 9)

Seven candidates, compared qualitatively — this repository does not score.

| | **A CONVERGE** (this programme) | B Insight | C AI activation | D Attachments | E Finance | F Offline / resilience | G A broad polish pass |
|---|---|---|---|---|---|---|---|
| **Daily-driver impact** | The Project record is where sustained work is organised, and every merge is a trust event. **A** | Weekly, at review time | Weekly, and hypothetical | Weekly | Weekly | Daily only on a commute; the loaded surface already survives a drop | Diffuse |
| **Frequency of use** | Many times a day (the Project tab, the waiting list, every merge) | Weekly | — | Weekly | Weekly | Situational | — |
| **Trust impact** | **Direct**: the gate says green or names its failure; one WCAG defect on Today fixed; one anatomy so a fact cannot be true on one screen and absent on another | Low | Low until a key exists | Medium (a second store to back up) | High-risk | Medium | Low |
| **Owner friction removed** | Overflow menu, inline title, selection, recurrence signal and swipe on the Project record; a phone Project tab that stops hiding priority; a waiting row that can be acted on | A trend the owner can currently read by opening past Reviews | None until the key | None the owner cannot do in a drive | None the owner cannot do in a bank app | Reading Today offline instead of the snapshot | Cosmetic |
| **Architecture readiness** | Everything exists: `TaskRow`, the patch map, the shared waits, the partition machinery, the honesty layer. **A** | Snapshot store and both idle APIs exist | Exceptional and idle; one seam missing (DEBT-237) | Missing the storage primitive and its backup — that is the point | Missing two prerequisites and an import architecture | ADR-090's queue exists; CI cannot observe hydrated offline (DEBT-70) | Ready |
| **Dependency leverage** | **Every** later programme lands on a green, deterministic gate and renders a Task once. **A** | Needs a green gate to be believed | Blocked on the owner; 0-for-4 record | Prerequisite for Finance only | Blocked twice | Enables nothing else | Enables nothing |
| **Mobile value** | The Project tab and the waiting list stop losing information below 26rem; the 200%-zoom Today is fixed | Low | Low | Medium | Medium | **High, if measured pain existed** — none is recorded ("no new evidence since V2.4") | Low |
| **Implementation risk** | Low and DalyHub-shaped: adopt an existing component on two surfaces, re-point tests, delete CSS; the repo has done this convergence three times (Today, Plan, Tasks) | Low | Unbounded at the provider | High (R2, export, backup, privacy, CSP) | Highest | High (service worker, iOS eviction, replay semantics) | Low, and invisible |
| **Blocked externally?** | No | No | **Yes** (the key) | No | Yes (attachments; DEBT-198) | No | No |
| **Makes another programme cheaper?** | All of them: verification, and any Task fact | AI (evidence) slightly | — | Finance | — | — | — |
| **Can the owner do the job another way?** | **No** — nothing else makes the gate carry information, and the Project tab's missing powers have no workaround short of opening `/tasks` | Partly (read past Reviews) | No, and cannot be proven here | Yes (a drive) | Yes (external apps) | Partly (the snapshot) | — |
| **Foundational or additive?** | **Foundational** — it restores the two properties every feature is built on | Additive | Additive (until the key) | Foundational for Finance only | Additive | Additive to a recorded contract | Neither |

**Recommended next programme: A — CONVERGE.** It is the only candidate that
is unblocked, foundational, exercised many times a day, and makes every other
candidate cheaper. B is the presumptive successor and is deferred *because* of
A, not instead of it. C's gate is stated precisely above and runs the day the
secret exists, outside any programme. D and E stay sequenced behind by their
own prerequisites. F has no measured owner pain and a deliberate recorded
contract; nothing here reopens it. G is what a programme becomes when it has
no theme, and this one refuses it — the only visual work in V2.8 is the
consequence of one component replacing another.

**The honest objection, answered.** *"A programme whose only outcome is 'CI
green' is not enough."* Agreed, and this is not that programme. Of the ten
failures on `main`, one is a real WCAG reflow defect on Today; three are
time-bombs of a class the register has twice recorded as concealing real
product defects (DEBT-173 → DEBT-201, DEBT-159); one is a possible RECALL-04
regression that cannot be told from a race today; and the gate's inability to
say green is itself the truth defect, because it is how the time-bombs and the
regression went unrecorded. The other half of the programme is a user-facing
capability gap on the surface an owner works a Project from, plus the deletion
of ~930 lines of duplicated anatomy that has cost one real defect (F-09) and
one widening (RECALL-03) already.

The programme decision and the rules every item inherits are
[ADR-115](../decisions/ARCHITECTURE_DECISIONS.md#adr-115-converge--a-task-is-rendered-by-the-shared-row-wherever-it-can-be-acted-on-a-fixture-never-carries-the-month-it-was-written-in-and-a-gate-that-cannot-say-green-is-a-truth-defect-not-a-rider).

---

## NOW

Four items. The gate first — every later item's own proof runs through it —
then the two halves of the anatomy, then the machinery that makes green a
property rather than a lottery.

---

### ☑ CONV-00 — The gate tells the truth again — **DELIVERED 2026-09-02**

**Every failing journey on `main` is repaired for the reason it fails, one
real defect is fixed, and no fixture ever again carries the month it was
written in.**

> **Delivered 2026-09-02** (PR [#249](https://github.com/acedaly/DalyHub-V2/pull/249), branch `claude/v2-8-conv-00-gate-truth-nptkjp`).
> What was decided and what was measured, part by part; the entries carry the
> detail.
>
> - **A** — `command-palette.spec.ts` now asserts the one-flow contract:
>   exactly one `New Goal` option under the title, the verb and the noun, no
>   `Create/Add Goal`; running it lands on `/goals?drawer=new-goal` and opens
>   the one shared `NewGoalForm` (one dialog, one form). `goals.new` is
>   untouched. Falsified both ways (unregister → count and click fail; reroute
>   to `/goals` → URL assertion fails). Closes DEBT-216.
> - **B** — `goalStoryRow` / `expectGoalStoryOpenLink` in `e2e/helpers.ts`:
>   rows by `[data-goal-story]`, the open link by the composed name (title,
>   then one " — " segment per derived answer the row's own `data-goal-*`
>   facts say it holds). No `article` wrapper, no `Open <title>`. Falsified
>   by an `Open` prefix and a `" · "` separator. Closes DEBT-215.
> - **C** — the structural guarantee stays; the surface half is scoped to
>   `taskRows()` on `/today` and `/plan`, because a Task is acted on in a row
>   and the next-action line is a reference (ADR-115 decision 3). The template
>   fixture's March-2027 source-Task dates were a second bomb and are derived.
>   Falsified by materialising the template task as a live Task on the owner's
>   day. Closes DEBT-220.
> - **D** — both repairs: the assertion is scoped to the journey's own card
>   (`expectCollectionSignal`), and every open seeded obligation, plus the
>   ute's next-service and renewal dates, is `date('now', '+N days')` with the
>   fixture's authoring offsets. Falsified with the pre-repair seed: the
>   unscoped locator fails strict mode on two cards; the scoped one passes.
>   Closes DEBT-219.
> - **E** — one shared module, `e2e/calendar-dates.ts`: targets from the
>   owner's day or the test's own value, labels generated in the grid's shape,
>   the opening month asserted, the press count derived
>   (`pickCalendarDayByKeyboard`), rendered forms read through
>   `shortCalendarDate`. **Decided:** the seeded `2026-07-29` stays a fixed
>   historical datum; the walk to it became run-relative. The Static check,
>   `scripts/e2e-fixture-dates.mjs check` (`pnpm run e2e:fixture-dates:check`,
>   a `Static` step beside `e2e:partitions:check`), reads ISO, long-form
>   picker labels and the abbreviated form, both September spellings, strips
>   comments string-aware, judges data literals against `HEAD`'s committer
>   date (on or after it is flagged — a fixture dated today arms tomorrow)
>   and picker labels whatever their date, and honours a same-line
>   `fixed-date:` annotation in both comment syntaxes. **First-run inventory:
>   1,315 literals in 42 files** (the "111" counted date-only seed literals;
>   the check also reads the date leading every timestamp) — 1,255 fixed
>   historical, 57 data literals on or after the reference day and 2 bare
>   picker labels resolved as **43 derived** and **16 annotated**, leaving 0
>   offenders. Falsified on a
>   scratch tree with **both** a bare future ISO in a seed and a bare *past*
>   long-form picker label in a picker journey: each fails Static naming file,
>   line, literal and form; each passes once annotated. Sixteen unit tests pin
>   the contract. Closes DEBT-236.
> - **F** — at the button: `dh-today__review-door-open` (`white-space: normal`,
>   `min-inline-size: 0`, start-aligned when wrapped) and a foot that may
>   shrink once it has wrapped — the `.dh-today__reflection-write` treatment,
>   not a change to the shared button. Re-measured with the same walk: 195 px
>   `scrollWidth` 195 / `clientWidth` 195, door 129 × 49 on two lines, only the
>   scrollable tab strip past the edge; 393 px door 206 × 32 on one line,
>   nothing past the edge. Falsified by restoring `nowrap` (239 at 195 px,
>   393 still green). Closes DEBT-221.
>   - **G** — reproduced in the committed p01 order on a fresh database per
>   run (isolated worktree, own servers): failed 2 of 2 runs before the fix
>   (34.2 s and 31.8 s, timing out at different steps); `main` #815 failed
>   it at 31.0 s and #820 passed it at 24.0 s; isolation 28.3 s. The
>   mechanism is an unsized budget — a dozen settled navigations and two
>   axe scans against the 30 s default — not a leaked record or a stale
>   wait, so it is repaired the way `goals.spec.ts` repaired its own:
>   `test.setTimeout(90_000)`, assertions unchanged, no product change.
>   With the correction, the same fresh-database p01 order passed 208 of
>   208 (one deliberate skip), the journey at 30.5 s — over the old budget,
>   inside the new one — and `main` #823's p01 passed it too. Recorded on
>   DEBT-203; the ten-run verdict stays CONV-03's.
> - **H** — the PR's own gate run, [#823](https://github.com/acedaly/DalyHub-V2/actions/runs/33631003222) on `27ba4dc`, is **18 of 18
>   jobs green** (Static with the new fixture-date step, Unit, Build, all
>   thirteen E2E partitions, CI Gate), and no partition uploaded a failure
>   artefact — the first credible green candidate since #777. The merge's
>   `main` run is the first of the two consecutive greens DEBT-125 and
>   DEBT-157 close on; the second is still required.
> - **H, one run later** — [#826](https://github.com/acedaly/DalyHub-V2/actions/runs/33636916922) on the
>   documentation-only final head `f6ece99` (E2E code byte-identical to
>   `27ba4dc`) went red on p02 and p03: three journeys this PR does not
>   touch and `main` has never failed (`appearance.spec.ts:92`,
>   `tasks-collection.spec.ts:634`, `people-diary-context.spec.ts:196`),
>   on a runner that ran both partitions 10–18% over the durations they
>   were balanced on. Each mechanism is named on DEBT-203 — an optimistic
>   attribute asserted before its save lands, a `networkidle` wait standing
>   in for the row's server state, an unsized 5 s budget — and none is
>   taken here, by the inclusion rule. That is DEBT-203's rate seen on a
>   green tree, which is CONV-03's subject and the reason its verdict is
>   ten runs rather than one.
> - **Ride-along.** `SETUP_AND_CI.md` says thirteen partitions and documents
>   the fixture-date rule; the changelog records the reflow fix.
> - **Scope guard held.** No product feature; no Task convergence; no
>   partition-machinery change; `retries: 0`, `workers: 1`; no skip, fixme,
>   quarantine, allowlist, sleep or empty commit. The two product changes are
>   one class on one link and one CSS rule.

This item's full implementation brief follows, at the depth a fresh session
needs to implement without re-running this audit. Each part names the
reproduced behaviour, the intended behaviour, the files, the regression proof
and the falsification. The inclusion rule: **a test is in scope if it is red on
`main` at `036d3da` or is a time-bomb this pass can see arming; nothing else
rides.**

#### A. The palette says what is true about Goal creation — closes [DEBT-216](../product/PRODUCT_DEBT.md#-debt-216--a-command-palette-test-still-asserts-that-goals-have-no-creation-command-which-steer-01-gave-them--p2)

- **Reproduced.** `e2e/command-palette.spec.ts:616-634` asserts
  `getByRole("option", { name: /^New Goal/ })` has count 0; the product
  registers `goals.new → /goals?drawer=new-goal` (`app/modules/goals/commands.ts:49-54`,
  with `:28` recording that STEER-03 added it). Red on every `main` run since
  #779.
- **Intended.** The test asserts the invariant it always meant: creating a
  Goal from the palette goes through the ONE shared `NewGoalForm` at
  `/goals?drawer=new-goal` — run the command, assert the Drawer opens on that
  URL, assert exactly one creation flow exists (the Areas/Projects create
  commands are the worked examples in the same file). Rename the test to say
  so. **Do not delete `goals.new`.**
- **Falsification.** Unregister `goals.new` and watch the renamed test fail;
  point it at a second URL and watch the one-flow assertion fail.

#### B. The Area Goals tab is asserted through the row's own contract — closes [DEBT-215](../product/PRODUCT_DEBT.md#-debt-215--three-e2e-assertions-still-address-the-area-records-goals-tab-as-a-card--p2)

- **Reproduced.** `goals.spec.ts:151` and `:286`, `areas.spec.ts:94` ask for a
  link named `Open <title>`; the row names its link
  `"<title> — <alignment> — <movement>"` (`GoalStoryRow.tsx:162-176`). The
  `article` locators at `goals.spec.ts:148` / `areas.spec.ts:90` DO resolve
  (`ProgressRow.tsx:126-131`) — correct the entry, which says otherwise.
- **Intended.** Locate rows by `[data-goal-story="<id>"]` and assert on the
  values the row carries, the way `steer-goal-story.spec.ts` already does; the
  open affordance is asserted by its real accessible name, built from the same
  `goalStoryRowAccessibleName` the product uses. **Do not re-add an `article`
  wrapper or an `Open <title>` label to satisfy a spec.**
- **Falsification.** Change the row's name composition and watch all three
  assertions name the change.

#### C. A template's tasks are asserted absent by identity — closes [DEBT-220](../product/PRODUCT_DEBT.md#-debt-220--a-project-templates-assertion-reads-a-template-tasks-title-which-steer-04-now-shows-as-a-projects-next-action--p2)

- **Reproduced.** `project-templates.spec.ts:316-325` asserts every template
  task title has count 0 on `/today` and `/plan`; `NextActionLine`
  (`TodayScreen.tsx:140, 1757`) legitimately shows the Project's next action,
  whose title the template copied. The structural guarantee at `:307-313`
  (no `entities` row for a template task) passes.
- **Intended.** Keep the structural assertion as the guarantee. Replace the
  text-count assertion with one scoped to task rows (`[data-testid="task-row"]`
  and the plan queue's rows), excluding `.dh-next-action`, or drop the surface
  half where the structural assertion already proves the claim — record which.
  **Do not remove the next-action line.**
- **Falsification.** Instantiate the template as live work in the fixture and
  watch the scoped assertion fail.

#### D. The obligation journey asserts on the card it created — closes [DEBT-219](../product/PRODUCT_DEBT.md#-debt-219--an-assets-journey-went-red-on-2026-08-29-because-a-fixture-obligations-due-date-passed--p2)

- **Reproduced.** `assets-ownership.spec.ts:605` asserts
  `getByText("1 obligation overdue")` unscoped; `ob-rc-inspect` (due
  `2026-08-28`, `seed-record-convergence.sql:384-386`) has been overdue since
  2026-08-29 and the locator resolves to two elements. `ob-rc-rego` (due
  `2026-09-14`, `:382`) arms next.
- **Intended.** Scope the assertion to the journey's own card (the smaller
  change the entry recommends) **and** apply part E's rule to the seed so the
  second bomb is defused before it fires: seeded obligation dates are expressed
  relative to the run day at seed time.
- **Falsification.** Un-scope the locator and watch strict mode fail on a
  seed with two overdue obligations.

#### E. No fixture carries the month it was written in — closes [DEBT-236](../product/PRODUCT_DEBT.md#-debt-236--two-task-date-editor-journeys-assert-the-calendar-month-they-were-written-in--p2)

- **Reproduced, locally, 2026-09-02, on a fresh seed.**
  `editing-consistency.spec.ts:253` clears the due date, reopens the picker
  ("Unset, so the grid opens on the owner's own month; July is one back",
  `:301-303`), presses `PageUp` once and clicks "Wednesday 29 July 2026" —
  which is in the grid only when the owner's month is August. Timeout at
  `:304`. `inline-editor-overlay.spec.ts:390` sets "Today", reopens, presses
  `PageDown` four times and clicks "Friday 25 December 2026" (`:450-454`) —
  true from August only. Timeout at `:454`. Both went red the day the owner's
  calendar (Australia/Sydney) turned to September; #812 and #815 confirm.
- **Intended.** The two journeys compute their targets from the run day
  through the same owner-day helper the product uses: "a day in the month two
  ahead", named by the same long-date formatter the grid uses for its
  accessible names, and the number of `PageDown`/`PageUp` presses derived from
  the difference between the target month and the month the grid opens on
  (which the test asserts first, rather than assumes). The seeded task's
  restore step targets the seeded date by walking from the opened month to
  July 2026 by computed count, or the fixture's date becomes run-relative —
  decide once and record.
- **The invariant.** *A fixture or E2E journey must not hard-code a future
  calendar date whose correctness depends on the month or day the test runs.*
  For date-picker interactions specifically: the target date is derived from
  the run/owner day; its accessible label is **generated** with the same
  formatter and locale semantics the picker uses for its day names, never
  typed as a literal; and the `PageUp`/`PageDown` count is derived from the
  source and target months, never from the month the test was authored in.
  A raw long-form label in picker E2E code is therefore prohibited
  **whatever its date** unless annotated (below): the presses that reach a
  day are counted from where the grid opens, and when the value is unset
  that is the owner's current month — so a label from last month is as
  run-dependent as one from next month. `Wednesday 29 July 2026` is already
  in the past on the amending commit and is exactly the literal that broke.
  The label is generated, or it is explained.
- **The rule, made checkable.** A small Static-tier script
  (`scripts/e2e-fixture-dates.mjs --check`, wired beside
  `e2e:partitions:check`) fails the build if any `e2e/**/*.sql` or
  `e2e/**/*.ts` fixture or spec carries a **future date literal in any
  supported format** — later than the commit's date — **that is not
  annotated** with the reason it is safe (an explicit `-- fixed-date: <why>`
  / `// fixed-date: <why>` on the same line). The annotation applies to every
  supported format, not to ISO alone. **An ISO-only scan is insufficient and
  does not close DEBT-236**: both motivating regressions click long-form
  accessible labels (*"Wednesday 29 July 2026"*, *"Friday 25 December
  2026"*), so a check that reads only `YYYY-MM-DD` stays green while the
  exact month-dependent picker defect is reintroduced. The supported formats
  are, at minimum:
  1. **ISO `YYYY-MM-DD`** — the seeds' form (`e2e/*.sql`).
  2. **The long-form English label** the picker's accessible names use and
     the Playwright picker tests click — weekday, day, month, year, e.g.
     `Wednesday 29 July 2026` (`editing-consistency.spec.ts:302`,
     `inline-editor-overlay.spec.ts:453`).
  3. **The abbreviated display form** the specs already assert on — day,
     abbreviated month, year, e.g. `29 Jul 2026`
     (`editing-consistency.spec.ts:263`, `dhds-10-inline-manipulation.spec.ts:509`,
     `goals.spec.ts:97`), with or without a weekday prefix.

  The date test differs by what the literal *is*. For **data literals** —
  seed values in `e2e/*.sql`, a rendered-format assertion on a value the
  same test typed — a literal earlier than the commit's date is fine; the
  future is what arms. For **picker-action labels** — the long-form
  weekday-day-month-year form a spec clicks inside a date grid — the date
  is no defence: every one is flagged, past or future, unless annotated,
  because the month walk that reaches it starts from wherever the grid
  opens. (`editing-consistency.spec.ts:280`'s `Saturday 15 August 2026`,
  one press from the *seeded* July month, is run-independent and is the
  worked example of class 3 below — annotated to say so, or generated
  anyway.)
  The check is **not** a naive regex that fails on every match: its first run
  enumerates every current match in every supported format (111 ISO literals
  in `e2e/*.sql` at `036d3da`, plus the long-form and abbreviated literals in
  `e2e/*.ts`), and the item classifies each one, in the PR, as exactly one
  of — (1) **derived / safe**: computed from the run day, no literal remains;
  (2) **fixed historical datum**: in the past, ignored by the check;
  (3) **deliberately fixed future datum**, annotated with why it is safe
  (a Goal target of `2099-12-31` no run will reach; a rendered-format
  assertion on a value the same test just typed); (4) **time-bomb**,
  converted to derived. That enumeration and classification are part of the
  deliverable, not a follow-up. The detection mechanics — tokenising,
  month-name tables, how a label's date is parsed — belong to the
  implementation; this contract fixes what the check must catch.
- **Falsification.** Set the machine clock (or the owner timezone fixture) to
  a month in which the old assertions would have passed and confirm the new
  ones still pass. Then prove the Static check with **both** of these, each
  introduced on a scratch tree and each observed to fail Static: an
  **unannotated future ISO literal** in an `e2e/*.sql` seed, and an
  **unannotated long-form picker label whose date is already past** (the
  `Wednesday 29 July 2026` form, dated before the commit — so the proof
  cannot be satisfied by the data-literal date test) in an `e2e/*.ts`
  picker journey. Annotate each with `fixed-date:` and watch the check pass
  again. **The invariant is not complete until both are caught**; a check
  that catches the ISO literal alone, or that only catches a picker label
  when its date is in the future, does not close this part.

#### F. Today reflows at 200% zoom — closes [DEBT-221](../product/PRODUCT_DEBT.md#-debt-221--today-overflows-sideways-at-200-zoom-because-the-week-doors-date-range-cannot-wrap--p2)

- **Reproduced, locally, 2026-09-02, on a fresh seed.**
  `mobile-shell.spec.ts:502-505` drives `/today` at 195 × 422 and requires
  `documentElement.scrollWidth <= clientWidth`; it fails at 239 vs 195. **The
  recorded cause is contradicted on `main`** (see Corrected above). Walking
  every element whose right edge passes the client width names exactly three:
  `a.dh-viewtabs__tab` (a deliberately scrollable strip — not document
  overflow), `p.dh-today__panel-foot` at 206px, and inside it the door,
  `a.dh-btn.dh-btn--outlined.dh-btn--sm`, laid out **206px** wide. The
  button's visible label, *"Start this week's Review"*, is what cannot wrap:
  the shared button is `white-space: nowrap`, and the period is a visually
  hidden span outside the visible box.
- **Intended.** Fix at the button, not the range: below the phone tier the
  door's label may wrap (`white-space: normal`, `min-width: 0` inside its flex
  parent, the shared button's outlined geometry preserved), or the door uses
  the product's shorter wording there — decided on the measurement, with the
  same walk re-run at 195px showing no element past the edge but the tab
  strip. The door stays reachable and keeps naming its period for assistive
  technology.
- **Falsification.** Restore the rule and watch the 195px assertion fail
  while 393px still passes.

#### G. The alignment journey is reproduced in partition order, then repaired at the mechanism — an instance on [DEBT-203](../product/PRODUCT_DEBT.md#-debt-203--the-e2e-suite-carries-latent-timing-races-at-roughly-one-per-two-runs-so-green-is-probabilistic--p2)

- **Reproduced, partly.** `goals-alignment.spec.ts:28` passed on #812 and
  failed on #815, the first `main` run after RECALL-04 touched
  `goal-outcome.ts`, `goal-progress-view.ts` and the alignment vocabulary.
  Run in isolation on a fresh seed on 2026-09-02 it **passes** (28.3 s), so
  it is not a deterministic regression; it is DEBT-203's shape (a wait that a
  leftover state already satisfies) or DEBT-173's (the spec creates a Goal,
  Project and Task live through the UI and then reads the alignment view of a
  workspace ten earlier specs have written to). Recorded on DEBT-203 by this
  pass.
- **Intended.** Run p01's spec list in the committed order against one
  database (`pnpm exec playwright test $(node scripts/e2e-partitions.mjs
  specs p01)`) and watch whether it reproduces. If it does, name the leaked
  record or the unsatisfiable wait and repair it at a shared wait
  (`waitForInteractive`, `waitForResponse` on the mutation) or by scoping the
  assertion to the records the spec created — DEBT-203's and DEBT-173's own
  prescriptions. If it does not reproduce in five partition-order runs, it is
  recorded as such on DEBT-203 with the run ids, and CONV-03's ten-run
  measurement is where it gets its verdict. No product change is made on a
  failure that cannot be reproduced.

#### H. Two green `main` runs — advances [DEBT-125](../product/PRODUCT_DEBT.md#-debt-125--mains-e2e-suite-is-red-for-reasons-unrelated-to-the-change-that-finds-it--p1--no-longer-broadly-red-and-the-browser-fix-is-holding-the-suite-still-cannot-finish-harden-03-2026-08-12) and [DEBT-157](../product/PRODUCT_DEBT.md#-debt-157--the-e2e-partition-durations-can-only-be-refreshed-from-a-failing-run--p1-re-rated-2026-08-20-mechanism-closed-by-harden-06a-the-same-day-held-open-for-its-confirming-run)

- The merge of this item is the first `main` run with zero **deterministic**
  failures since #777. Its result is read from the `e2e-results-*` artefacts
  and recorded on both entries. Any residual failure must reproduce as a race
  under DEBT-203's signature and is filed there by name; a failure that does
  not is this item's, and the item is not done. Both P1s close on the second
  consecutive green (CONV-01's merge, or a `workflow_dispatch` once CONV-03
  adds it).

#### CONV-00 — the frame

- **Scope guard.** No product feature; no Task convergence (CONV-01/02); no
  partition-machinery change (CONV-03); no offline, AI, Insight or design
  work; no test skipped, quarantined, weakened or retried to reach green
  (`retries: 0` and `workers: 1` unchanged); no empty commit to kick CI.
- **Ride-alongs, same files, no new debt raised.**
  `docs/development/SETUP_AND_CI.md:110-113` still describes a twelve-way E2E
  matrix; the manifest and `PARTITION_COUNT` are thirteen — corrected in the
  same PR. DEBT-215's and DEBT-221's stale cause claims are corrected on their
  entries (already done by this pass; the item confirms by measurement).
- **Mobile/accessibility bar.** F is itself the accessibility fix; every
  touched journey keeps its `axe` scan with no rule disabled; 195 / 393 / 1440.
- **Query budgets.** None move: A–E and G are test-only; F is CSS.
- **Debt.** Closes DEBT-215, 216, 219, 220, 221, 236; advances DEBT-125,
  157, 203 (G's instance recorded there). Raises nothing unless G finds a
  product defect, which is then raised with its evidence.
- **Recommended branch.** `claude/v2-8-conv-00-the-gate-tells-the-truth`
- **Recommended PR title.** `V2.8 CONV-00: the gate tells the truth again — seven journeys, one defect, one fixture rule`

---

### ☑ CONV-01 — The Project record renders the shared Task row — **DELIVERED 2026-09-03**

**A Task on its Project's record uses the same `TaskRow` anatomy and exposes
every action valid in that scope.**

> **Delivered 2026-09-03** (branch `claude/v2-8-conv-01-project-taskrow`).
> What was built, what was removed, what was measured, and what was
> deliberately left for CONV-02.
>
> - **Anatomy, before → after.** `ProjectTasksTab.tsx` built generic `Card`
>   props by hand (`toTaskCardProps`, a private `ProjectTaskCompleteToggle`, a
>   Card metadata run, a `pendingCompletion` map and `postTaskBulkAction` for
>   one-row completion, an error paragraph, and a page re-fetch after every
>   save) inside `CardCollection` under the `dh-tasklist` opt-in. It now
>   renders the shared `TaskRow` inside the shared `TaskList`, over the shared
>   `SerializedTaskListItem` (the Project-private `SerializedProjectTask` shape
>   and `serializeProjectTask` are gone — the type is an alias of the shared
>   one, serialised by `serializeTaskListPage`), projected by
>   `toTaskRowProjection`, hosted by the shared `useTaskSurfaceActions`, selected
>   through the shared `taskSelectionReducer`, departing through
>   `useDepartingRows`, renaming through `TaskTitleEditor`, and offering the
>   shared `buildTaskRowActions` set. The tab keeps only what is the tab's:
>   the scope, the Open/Completed/All rail, the record-level empty state, "Add
>   task", the never-navigating "Load more", and WHERE the bulk bar sits.
> - **Capability set now on the record.** Inline title, due-date, priority and
>   Project editors; the overflow (Plan for today · Rename · Move to Project or
>   Area… · Move to Someday / Maybe · Skip this occurrence · Stop repeating ·
>   Open task); completion and reopen; selection (toolbar toggle and touch
>   hold) with Shift-range; bulk actions; the recurrence, blocked and
>   checklist signals; the parent mark; swipe; the current-record mark; the
>   departure with focus handoff; ADR-086 reconciliation; the shared container
>   ladder. An archived Project's rows take the row's own `readOnly` form
>   (no completion control, every editor disabled, one door to the record).
> - **Deliberately absent by scope — drag.** The tab passes no `dragHandle`
>   and issues no move or reorder request: it draws no drop destination and
>   stores no order (DEBT-188 stands). Asserted structurally
>   (`shared-row-consumers.test.ts`), by rendering (no `[data-dh-drag-item]`,
>   no `.dh-taskrow__handle`) and E2E on the record, while `/tasks` grouped
>   by a drop dimension still renders a grip (`dhds-11-drag-reorder.spec.ts`,
>   unchanged). No order column, migration, ranking API or reorder action was
>   added.
> - **One bulk path.** The `/tasks` bulk bar moved out of `TasksWorkspace.tsx`
>   into the shared `TaskBulkActionBar` (with the empty-selection
>   `TaskSelectionPrompt`), and both surfaces render it over the one
>   `/tasks/bulk` contract (`TaskBulkResult` now on the shared task-record
>   contract; the module re-exports it). Proven: select three rows on the
>   record, Complete → ONE POST to `/tasks/bulk` carrying three ids, rows
>   reconcile, the progress band reads the accepted count. The tab's private
>   completion-through-bulk path is deleted.
> - **Optimistic reconciliation.** The shared host's patch map: an accepted
>   inline save paints at once, the server stays authoritative (every patch is
>   dropped when the loader answers), a refusal rolls back exactly the keys it
>   painted, and the outcome is announced once through the tab's single live
>   region. The host gained two things every bounded surface can use and
>   Today/Plan simply do not pass: a `departing` set (ids the server has just
>   accepted a change to, DHDS-11's eligibility rule) and `announce` (the bulk
>   bar's channel). The Project's progress, health and overdue counts are never
>   faked: the host revalidates the record loader after every accepted
>   mutation, and the E2E journey reads the band before and after a
>   completion, a reopen, a move and a bulk completion.
> - **Statement budget, measured** (`test/kernel/conv-01-project-tasks-budget.test.ts`,
>   real D1, `prepare` counted on the very `loadProjectTasksPage` both routes
>   run): **before 3 per page** (page · blocked aggregate · checklist
>   aggregate), **after 3 per page + 1** bounded `searchTaskParents` (limit 50,
>   `/tasks`'s and Today's own bound) per record load for the row's inline
>   Project editor and the bar's Move — flat at 3 and at 30 tasks, no per-row
>   read. The parent identity and the recurrence the row now draws were
>   already joined by `listProjectTasks`'s one statement; the old serialiser
>   simply dropped them.
> - **Responsive.** The tab's own ladder is gone from its rows; the shared
>   `tasklist` container queries govern. At 393 px the row is two lines,
>   priority is on it and its inline editor opens the shared sheet at the
>   touch floor, the recurrence signal follows the row's rule, no horizontal
>   overflow, axe clean; `iphone-daily-driver.spec.ts` now asserts that
>   instead of the hidden waiting-for meta.
> - **Dead code removed.** `toTaskCardProps`, `ProjectTaskCompleteToggle`,
>   `ROUTINE_TASK_STATES`, the `pendingCompletion` map, the completion error
>   paragraph and `.dh-project-tasks__error`, `serializeProjectTask` and the
>   `SerializedProjectTask` interface, the duplicated loader reads in
>   `detail.tsx`/`tasks.tsx` (now `project-tasks-load.server.ts`), the private
>   `BulkActionBar`/`BulkMenu` in `TasksWorkspace.tsx`, and the `helpers.ts`
>   exception comment. **Retained for CONV-02**: the UIX-01 Card override
>   layer in `tasks.css` (`:996-1928`), because `/today/waiting` still draws a
>   Card under it — the tab no longer wears `dh-tasklist` as a Card opt-in, so
>   nothing on the record paints from that layer any more.
> - **Tests re-pointed, not deleted.** `gate-02-honest-signals.spec.ts`
>   (`.dh-card` → the shared row locator, colour read unchanged),
>   `project-settings.spec.ts` (`article` → `taskRow`),
>   `iphone-daily-driver.spec.ts` (hidden meta → priority reachable on the
>   shared row), `ProjectTasksTab.test.tsx` (all seven PROJ-01 pagination and
>   reconciliation journeys kept on the new anatomy, plus optimistic,
>   refusal, bulk, read-only and no-grip proofs), `project-view.test.ts`
>   (the shared serialiser). New: `shared-row-consumers.test.ts` (the
>   enumerated-consumer contract), the kernel budget test, and
>   `conv-01-project-taskrow.spec.ts` (seven journeys on an owned fixture:
>   anatomy/no grip; rename · due · priority survive a reload; complete with
>   departure, focus handoff, one announcement and the band; reopen on All;
>   move via the picker leaves the Project; three-row bulk through
>   `/tasks/bulk`; keyboard reach and axe at 1440; 393 px). Screenshot passes
>   are opt-in captures with no committed baselines, so none was regenerated.
> - **Falsified**, each restoring exactly one failure: the old `Card` import
>   back in the tab (consumer contract); a `postTaskBulkAction` for the
>   selection (contract + unit bulk proof); a `dragHandle` on the tab (no-grip
>   assertions); the 26rem priority-hiding rule (393 px journey); a re-fetch
>   in place of the patch (unit optimistic proof); a per-row read in the
>   loader (kernel budget); a broken focus handoff (E2E completion journey).
> - **Closes** DEBT-175. **Advances** DEBT-128 (one of its two consumers).
>   DHDS-10's surface table is corrected (the tab now renames and moves);
>   `TASKS_MODULE.md` and `PROJECTS_MODULE.md` carry the scope/capability
>   rule.

- **User problem.** [DEBT-175](../product/PRODUCT_DEBT.md#-debt-175--the-project-records-tasks-tab-is-the-last-surface-that-does-not-render-the-shared-taskrow--p2)
  (P2): `ProjectTasksTab.tsx` builds `Card` props by hand (`:51-513`) and says
  so at `:452`. Measured delta against `TaskRow` on 2026-09-02: no overflow
  action menu, no inline title editor, no row selection or shift-range, no
  long-press, no swipe, no drag handle (a correct absence, not a gap — see
  the capability contract below), no departure animation with focus
  handoff, no recurrence signal, no pending patch map (the tab re-fetches a
  page, `:184`, where `TasksWorkspace.tsx:522` patches optimistically), its
  own bulk path (`postTaskBulkAction`, `:581`), and a second responsive ladder
  (`tasks.css:1657, 1738, 1818`) that below 26rem hides priority, repeat and
  waiting-for (`:1907-1913`) — including the inline priority editor DHDS-10
  added to this very tab.
- **Outcome.** The tab renders `TaskRow` inside the shared `TaskList`, fed by
  the same loader shape `/tasks` uses, with the ADR-086 patch map, the shared
  overflow-action builder, the shared selection/bulk contract and the shared
  container ladder. `e2e/helpers.ts:84`'s `taskRows()` finds a Project's tasks,
  and the exception comment there is deleted. The Project's health, overdue
  counts and progress band keep reporting the accepted save the way DHDS-10
  made them (that behaviour is asserted, not assumed, before and after).
- **Capability contract — shared anatomy is not every capability in every
  scope.** Adopting `TaskRow` means adopting its anatomy: the inline title
  editor, the inline priority and due editors, the overflow menu, selection
  and bulk where the scope allows them, the recurrence signal, the shared
  responsive ladder and the ADR-086 optimistic reconciliation. A capability
  whose domain precondition is absent in a scope stays disabled or absent
  there **through the row's existing capability contract** — a slot the
  caller does not pass, a prop the caller sets off — never by forking the
  row, and never by inventing the missing domain semantics so the capability
  can be switched on. Drag is the worked example. AGENTS.md §7 and DHDS-11
  license a drag only where the object has **a real destination or a real
  stored order**. `TaskRow` draws a grip only when its caller passes a
  `dragHandle` (`TaskRow.tsx:172-185` — *"A row is never draggable 'because
  it is a Task row'"*), and `/tasks` passes one only where it draws
  destinations: the buckets of a grouped dimension (`TASK_DROP_DIMENSIONS`
  — parent, priority, status, sector; `task-drop-targets.ts:63-68`) whose
  membership is a stored field a drop changes. That drag orders nothing
  within a list and is untouched by this item. The Project tab draws no
  destination — it is a flat list of one Project's tasks under an
  open/completed/all filter — and stores no manual order
  ([DEBT-188](../product/PRODUCT_DEBT.md#-debt-188--tasks-have-no-manual-ranking-model-so-a-task-cannot-be-dragged-up-a-list--p3)
  stands), so it passes none — exactly as Today, Plan and Search pass none
  today. The tab does **not** add a grouped bucket or a Project-local
  ranking model to "complete" the convergence; it gains drag only if and
  when it draws a real destination or its scope stores a real order.
- **What stays the tab's.** Its scope (this Project's tasks), its grouping and
  its "all / open" toggle, the Project-level empty state, and the create
  affordance. Nothing else is bespoke.
- **Tests that pin the old anatomy, re-pointed rather than deleted.**
  `gate-02-honest-signals.spec.ts:341-342, 376-391` (`.dh-card` → the row and
  its painted-colour read); `project-settings.spec.ts:280` (an `article`
  named `Open …` → the row's locator, since a list item has no accessible
  name); `iphone-daily-driver.spec.ts:72` (the hidden `waiting-for` meta →
  the row's own phone rule, which must **not** hide priority); `visual-system`
  / `dhds-13` / `gate-d` / `collection-header` screenshot baselines for
  `/projects/:id` regenerated with the change and reviewed.
- **Performance budget.** The tab's statement count is pinned before and
  after by a counting test and does not rise; the row adds no per-row read
  (parents are batched as they are on `/tasks`).
- **Measurable acceptance criteria.**
  1. On a Project record, a task can be renamed inline, given a due date and
     priority, completed, reopened, opened, moved and acted on from its
     overflow menu — proven E2E at 1440 and 393.
  2. Selecting three rows and applying a bulk action goes through the same
     `/tasks/bulk` contract `/tasks` uses; the tab's private bulk path is gone.
  3. Completing a row on the tab leaves with the departure contract and hands
     focus on; the Project's progress band updates from the accepted save.
  4. At 393 px the row shows priority (DHDS-10's editor is reachable) and
     recomposes to two lines rather than hiding facts; `axe` clean.
  5. A fact added to `TaskRow` in a later change appears here with no
     per-surface change — asserted by the shared-row contract test that
     enumerates its importers.
  6. The tab passes no `dragHandle` and issues no move or reorder request;
     the row renders without a grip there while `/tasks` grouped by a drop
     dimension still renders one and still moves a Task between buckets —
     asserted, so the capability contract is proven rather than assumed.
- **Non-goals.** No `/today/waiting` work (CONV-02); no drag on the tab and
  no manual ranking model (DEBT-188 stands — the tab draws no drop
  destination and stores no order, so the row's `dragHandle` slot is left
  unpassed rather than the row being forked, a Project-local order invented
  or a grouped bucket added to justify a grip); no Project description
  (DEBT-137); no CSS deletion yet (the override layer has one more consumer
  until CONV-02).
- **Closes.** DEBT-175. **Advances.** DEBT-128 (one of its two consumers).

---

### ☐ CONV-02 — One anatomy, everywhere a Task can be acted on — **NEXT**

**Where a Task can be acted on it is the shared row; where it is only
referred to it is a link; and the Card layer that drew it twice is gone.**

- **User problem.** [DEBT-128](../product/PRODUCT_DEBT.md#-debt-128--today-projects-and-search-still-render-tasks-as-cards-so-one-object-has-two-anatomies--p2)
  (P2, title corrected by this pass): `/today/waiting` renders a read-only
  `Card` (`waiting.tsx:312`, `WaitingTaskCard.tsx:26`) that draws three facts
  the shared row has no field for — the waiting-for subject, "since ·
  elapsed", and RECALL-03's follow-up label (`:72-81`) — so the fork widened in
  V2.7 in the direction DEBT-175 did not predict: the Card path has a fact the
  row lacks. And ~930 lines of the UIX-01 Card override layer
  (`tasks.css:996-1928`) survive on two consumers.
- **Outcome, in three decided parts.**
  1. **`/today/waiting` adopts the row**, and the row grows the waiting facts
     as **one optional row fact, decided once**: a `waiting` slot carrying
     subject, since/elapsed and the follow-up state (due today / overdue /
     upcoming), rendered by the shared fields on every surface that passes it
     — which means the `/tasks` collection filtered by `followUp=due` shows the
     same fact the waiting list shows. The list becomes actionable: complete,
     reopen, edit the follow-up date inline through the existing details
     editor, open the record. The keyset cursor, the honest subtitle and the
     count/parity proofs from RECALL-03 are kept and re-asserted unchanged.
  2. **A reference to a Task is a link, not a row — recorded as a rule.** The
     search result row, the `/views` row, the Meeting follow-up row and
     `NextActionLine` are references: they carry a title, a destination and at
     most the signal primitives (`PriorityIndicator`, `UrgencyChip`) and never
     grow a second metadata run or a second action set. The offline snapshot
     viewer's private component is renamed (`SnapshotTaskRow`) so nothing but
     the shared row is called `TaskRow`, and its read-only status is stated in
     its header.
  3. **The override layer is deleted.** `tasks.css:996-1928` goes with its
     last consumer; `dhds:check` and the screenshot baselines prove nothing
     else painted from it.
- **Performance budget.** `/today/waiting` keeps its statement count (pinned
  by the RECALL-03 tests); the waiting slot rides the read the surface already
  makes.
- **Measurable acceptance criteria.**
  1. On `/today/waiting`, a task can be completed, reopened and have its
     follow-up date changed inline; the follow-up fact matches the machine
     value the rail and the digest state (RECALL-03's three-surface parity
     test extended to the row).
  2. `grep -r "from \"~/shared/card\"" app/modules/tasks app/modules/projects
     app/modules/today/task app/modules/today/routes/waiting.tsx` returns
     nothing; `tasks.css` has no `.dh-collection--tasks .dh-card` rule.
  3. Exactly one exported component named `TaskRow` exists in `app/`.
  4. The reference-row rule is asserted: none of the four reference surfaces
     renders a completion control or an overflow menu.
  5. 1440 / 393 / 320, light and dark, `axe` clean, keyboard reach on the
     new actions.
- **Non-goals.** No change to what the waiting list *is* (no nav entry — the
  recorded decision stands); no snooze; no People follow-up cadence
  (DEBT-44); no search-row redesign; no new Task status.
- **Closes.** DEBT-128. **Depends on** CONV-01 (the layer's other consumer).

---

### ☐ CONV-03 — Green is a property, not a lottery

**An unchanged tree gets the same answer every time, and the whole gate is
usable.**

- **User problem.** Three P2 machinery entries that every programme has
  worked inside and none has owned:
  [DEBT-203](../product/PRODUCT_DEBT.md#-debt-203--the-e2e-suite-carries-latent-timing-races-at-roughly-one-per-two-runs-so-green-is-probabilistic--p2)
  (≈1 latent race per 2 runs; closing condition "ten consecutive green runs on
  one unchanged tree", 2 achieved);
  [DEBT-173](../product/PRODUCT_DEBT.md#-debt-173--e2e-specs-assert-against-the-shared-workspaces-accumulated-state-so-re-ordering-the-suite-changes-what-they-see--p2)
  (specs assert against accumulated state; one full run leaks ~217 records;
  named leakers include `ai-assistance.spec.ts`'s "Book the venue" Task);
  [DEBT-205](../product/PRODUCT_DEBT.md#-debt-205--536-seconds-of-e2e-gate-capacity-is-stranded-because-a-sliced-spec-file-takes-its-partitions-exclusively--p2)
  (536 s stranded because `responsive.spec.ts` takes two partitions
  exclusively at 73% each while p01–p11 sit at 100%).
- **Outcome, in three parts.**
  1. **DEBT-205, option 2**: `responsive.spec.ts` (519 tests, 1471.6 s) is
     split near 50/50 by viewport tier into two real spec files; the split is
     re-derived and the thirteenth partition is either retired or filled — the
     packer is not changed.
  2. **DEBT-173**: every named leaker cleans up (the AI proposal's created
     Task, the identity mutator, the templates); every spec that asserts over
     "the first row", a bounded band or a count either owns its fixture under
     a prefix or scopes to a record it owns by title; the local gate script
     wipes and reseeds between runs. Closing condition met as written: two
     runs of one commit under two different derived splits with identical
     results.
  3. **DEBT-203**: a `workflow_dispatch` trigger on `ci.yml` so a run can be
     repeated on an unchanged tree without an empty commit (still forbidden);
     the ten-run measurement is then performed on the finished tree, every
     failure repaired at a shared wait or a published readiness signal, never
     with a retry. The entry closes on the count, which this item records as
     it accrues.
- **Measurable acceptance criteria.**
  1. `pnpm run e2e:partitions:check` green with no partition below ~70% of
     the ceiling while another sits at 100%.
  2. Two runs of one commit under two derived splits: identical per-test
     results, read from artefacts.
  3. Ten consecutive dispatched runs on one tree: all green, `retries: 0`,
     nothing skipped — recorded on DEBT-203 with run ids.
  4. A local `pnpm run e2e:gate` run twice from one seed without a manual
     wipe reports identical results.
- **Non-goals.** No change to what the gate requires (all green, no
  allowlist); no retries; no test deleted to make room; no product change.
- **Closes.** DEBT-203, DEBT-173, DEBT-205; with CONV-00-H, DEBT-125 and
  DEBT-157.

---

## Why this sequence

**CONV-00 first** because every later item proves itself through the gate,
and a red gate proves nothing: it is the cheapest item, it restores
information, and it fixes the one real user-facing defect in the set.
**CONV-01 second** and **CONV-02 third** because they are the two consumers
of one CSS layer and the second cannot delete it until the first has moved;
CONV-01 is also the larger owner-facing gain and the more contained change.
**CONV-03 last** because its proof is a stability measurement over a
*finished* tree — the convergence PRs are the last large test churn of the
programme, and measuring ten runs before them would measure a tree about to
change.

```
CONV-00 ──► CONV-01 ──► CONV-02        CONV-03
(gate       (Project    (waiting;      (deterministic;
 truthful)   record)     layer gone)    ten greens)
```

Nothing rides beside this programme. That is deliberate and it is the lesson
of V2.6 and V2.7: the two riders those programmes named became this theme.
The code-held half of the AI gate (DEBT-237) is the one bounded piece of work
outside the theme that a session may take **in its own PR, on its own
evidence, the day the owner's secret exists** — the same rule V2.6 fixed for
the tripwire.

---

## LATER — real, evidenced, and deliberately not V2.8

| Deferred | Evidence | Why not now |
|---|---|---|
| **Insight over stored history** — the presumptive V2.9 | 52 snapshots/yr, `priorReviews[0]` only; `listSnapshotsBefore` and `listMeasurementSeries` zero callers (DEBT-212); Analytics capped at 8 buckets; DEBT-103 | Coherent and small (three items, shape recorded above); additive; needs the green gate and the one anatomy it would otherwise render twice. Its rules are already ADRs 079/110/111 and are not restated. |
| **AI activation** | AI_PLATFORM §21 unchanged; the gate stated precisely above; DEBT-237 (code-held seam), DEBT-213, DEBT-91 | Owner-held secret, 0-for-4 record on owner-held blockers. The gate is a tripwire: run it the day the secret exists; then DEBT-91; then the Weekly Review assistant. Not a theme. |
| **Attachments (R2)** | Smallest shape and prerequisites recorded above; DEBT-35; no R2 binding by policy | Foundational for Finance only; its first item is backup/restore for a second store. After Insight, before Finance. |
| **Finance** | Money discipline exists (ADR-049); no import architecture; audit §8 shape | Behind Attachments and DEBT-198 by its own logic; the shape must not grow. |
| **The offline slice** | DEBT-70 (P2), 151 (P2, headline corrected), 155, 160, 161, 167, 170, 190 | One decision about what the contract covers; no measured owner pain; `share_target` is its own decision. If it is ever taken, DEBT-70 (CI observes hydrated offline) comes first, because a claim about offline that CI cannot see is the class of claim this programme exists to end. |
| **The off-Cloudflare backup** · **DEBT-139's last clause** | DEBT-198 (P2), DEBT-139 (◐) | Owner-held by construction; not V2.8 gates (no migration in this programme). |
| **A first-run pass** · **the two vestigial Settings rows** · **DEBT-102** | Standing non-goal; `settings/routes/index.tsx:1382-1419`; the register | Unchanged; the rows are recorded on DEBT-107's list of recorded-not-fixed findings, not taken here. |
| **Guided monthly/quarterly Reviews** · **Project description** (DEBT-137) · **template dates** (DEBT-165) · **plan board proportions** (DEBT-162/163) | Register entries unchanged | Their own decisions; P2s off-theme are how a programme becomes a grab-bag. |

### Standing non-goals, carried forward unchanged

V2.3 → V2.7's lists stand and are not restated (subtasks · calendar module ·
write-back · scores/streaks/grades (ADR-110) · composite Goal score (ADR-111)
· second search index / embeddings / second tag model / second filter
vocabulary (ADR-112) · explicit-query boundary, one excerpt grammar, one
completion-time truth, no reminder engine (ADR-114) · the whole list). V2.8
adds its own, from ADR-115:

- **A Task is rendered by the shared row wherever it can be acted on.** No
  surface grows a second task anatomy because a panel wants one; a new fact
  goes on the row or nowhere.
- **A reference to a Task is a link.** Search results, cross-view rows,
  follow-up rows and next-action lines never grow a second metadata run or a
  second action set.
- **A fixture never carries the month it was written in.** Future dates in
  fixtures — in any literal format that can recreate the defect, ISO or the
  long-form and abbreviated labels the specs click and assert on — are
  computed at seed/run time or annotated with why they are safe; Static
  enforces it, and is proven on both an ISO literal and a picker label.
- **A gate that cannot say green is a truth defect, not a rider.** Its
  repair has an owner and an item, every time.
- **Green is measured, never retried.** `retries: 0`; no quarantine, no
  allowlist, no empty commits; stability is ten runs on one tree.
- **No visual redesign.** The only visual change in V2.8 is the consequence
  of one component replacing another.

---

## Dependencies

**External.** None that gate merge. The owner-held items — DEBT-198's four
secrets and the public-repo security decision, DEBT-139's 30-second UI check,
and the AI secret — are recorded below and are **not** V2.8 preconditions;
this programme ships no migration and no data-carrying change.

**Internal.** CONV-00 precedes everything (its merge is the first measured
run). CONV-01 precedes CONV-02 (the CSS layer's two consumers). CONV-03 last.
Every item consumes — and none modifies — the shared `TaskRow`/`TaskList`
contract, the ADR-086 patch map, the shared waits, the partition manifest's
derivation (CONV-03 re-derives; it does not change the packer), and the
honesty layer in `e2e-partition-summary.mjs`.

**Owner-held actions, separated from code work.**

| Action | Unblocks | Where recorded |
|---|---|---|
| Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as a Worker secret in a non-production environment | The AI gate, as stated above | AI_PLATFORM §21, ADR-112 d2, this file |
| Four GitHub `production` secrets + the public-repo protection decision | DEBT-198 | DEBT-198 |
| ~30 seconds in production: choose an identity colour, reload, confirm | DEBT-139's last clause | DEBT-139 |
| Dispatch ten CI runs on one tree (or approve a session doing it) once CONV-03 lands | DEBT-203's closing count | CONV-03 |

---

## The acceptance boundary

Every item carries the five durable rules, verbatim:

> **A visual claim about a rendered surface is proven by a measurement of that
> surface, not by looking at it.** (DHDS-13)

> **A numerical claim about the owner's history is proven against a fixture
> whose events are known, not against whatever the workspace happens to
> hold.** (V2.4)

> **A claim that two surfaces tell the same story is proven by reading the
> same machine value from both, never by comparing sentences that happen to
> match.** (V2.5)

> **A claim that data survived a change of representation is proven by moving
> real data through the migration and reading it back.** (V2.6)

> **A privacy rule is proven against a workspace that contains the record the
> rule protects.** (V2.7)

And V2.8 adds one of its own, for the layer it repairs:

> **A claim that a test proves something is proven by making it fail.** Every
> repaired journey in this programme names the change that reddens it, and
> every fixture that depends on a date names the day it would have gone red —
> or is written so that no such day exists.

Concretely, where applicable, every item is accepted against: real seeded
data; hostile rows in a second workspace on every touched query; light and
dark; 1440 and the 320/360/375/393/430 phone widths plus the 195px zoom case
for Today; keyboard reach, visible focus, accessible names; `axe` clean with
no rule disabled; bounded queries with counting-DB proofs; deterministic
tests — none skipped, weakened, retried or quarantined to look green; and the
falsification pass named on each part.

---

## The debt, reconciled

Every entry this programme raises, takes, corrects or deliberately leaves is
given a disposition here and on the entry. **This pass raised DEBT-236 and
DEBT-237** (next free **DEBT-238**) and corrected four existing entries in
place rather than renumbering them, because their anchors carry
cross-references (DEBT-215, DEBT-221, DEBT-128, DEBT-151).

| Entry | Severity | Disposition |
|---|---|---|
| **DEBT-236** — two date-editor journeys assert the month they were written in | P2 | **Raised · CONV-00-E** (reproduced locally 2026-09-02) · **RESOLVED 2026-09-02 by CONV-00** |
| **DEBT-237** — the AI gate names a fake-provider path the repository does not have | P3 | **Raised · not taken** — the code-held half of a tripwire, in its own PR the day the secret exists |
| DEBT-215 · DEBT-216 · DEBT-219 · DEBT-220 · DEBT-221 | P2 | **RESOLVED 2026-09-02 by CONV-00** (A, B, C, D, F); DEBT-215's and DEBT-221's stale cause claims corrected 2026-09-02 and confirmed by measurement |
| DEBT-125 · DEBT-157 | P1 ◐ | **Advanced by CONV-00-H** — the PR's gate run [#823](https://github.com/acedaly/DalyHub-V2/actions/runs/33631003222) is 18/18 green with every partition's `e2e-results-*` published and no failure artefact; #826 on the documentation-only head was red on three DEBT-203-class journeys the PR never touched, recorded there. **Measured again by CONV-01 (2026-09-03): the merge's `main` run [#828](https://github.com/acedaly/DalyHub-V2/actions/runs/33680967861) is 17/18 — p04 red on one DEBT-203-class journey (`tasks-journey.spec.ts:334`) at 18.5 min against a 16.1 min budget — so it is NOT the first consecutive green; the count restarts, and neither entry is closed** |
| DEBT-175 | P2 | **TAKEN · CONV-01 · RESOLVED 2026-09-03** — the tab renders the shared row; the consumer contract test enumerates it |
| DEBT-128 | P2 | **TAKEN · CONV-02**; title corrected 2026-09-02 (Today moved 2026-08-17; search never was a Card; `/today/waiting` is); **advanced 2026-09-03 by CONV-01** — the Project tab no longer paints from the Card layer, leaving `/today/waiting` its only consumer |
| DEBT-203 · DEBT-173 · DEBT-205 | P2 | **TAKEN · CONV-03**; two new DEBT-203 instances recorded from `main`'s own runs (`notifications.spec.ts:214` on #812, `goals-alignment.spec.ts:28` on #815 — the latter passes on a fresh seed); the alignment instance reproduced in partition order by CONV-00-G (2 of 2 local runs, `main` #815) and repaired as an unsized budget |
| DEBT-151 | P2 | **Corrected, not taken** — headline 30/1,320,668 B → 32/1,383,217 B per the PWA authority's own table; ceilings unchanged |
| DEBT-70 | P2 | **Not taken** — the offline slice's first item if the slice is ever taken; recorded in LATER |
| DEBT-212 · DEBT-103 | P3 | **Deferred to Insight (presumptive V2.9)** |
| DEBT-91 · DEBT-92 · DEBT-93 · DEBT-213 | P3 | **Deferred, unchanged** — the AI sequence V2.6 fixed; the gate now stated precisely above |
| DEBT-35 | P3 | **Not taken** — the smallest attachment shape and its prerequisites recorded above so the decision is not re-derived |
| DEBT-198 · DEBT-139 | P2 · P1 ◐ | **Owner-held, unchanged, not gates** |
| DEBT-102 · DEBT-107 (the two Settings rows) · DEBT-136/161/162/163/218 · RECORD-03 | P3 | **Unchanged**, per V2.7's LATER |

---

## Related documents

- [`ROADMAP_V2_7.md`](ROADMAP_V2_7.md) — the predecessor programme, complete 2026-09-01
- [ADR-115](../decisions/ARCHITECTURE_DECISIONS.md#adr-115-converge--a-task-is-rendered-by-the-shared-row-wherever-it-can-be-acted-on-a-fixture-never-carries-the-month-it-was-written-in-and-a-gate-that-cannot-say-green-is-a-truth-defect-not-a-rider) — this programme's decision record
- [ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine) · [ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable) — the retrieval and AI-gate decisions this programme preserves
- [ADR-095](../decisions/ARCHITECTURE_DECISIONS.md#adr-095-the-task-row--a-product-component-over-the-generic-card-one-column-grid-and-container-queries-as-the-responsive-authority-for-a-list) · [ADR-086](../decisions/ARCHITECTURE_DECISIONS.md#adr-086-optimistic-presentation-on-task-lists-with-server-authoritative-reconciliation-and-announcement) — the row and the patch map CONV-01/02 adopt
- [`HARDEN_05_GREEN_MAIN_2026_08.md`](../product/HARDEN_05_GREEN_MAIN_2026_08.md) · [`HARDEN_06A_FINISHING_E2E_GATE_2026_08.md`](../product/HARDEN_06A_FINISHING_E2E_GATE_2026_08.md) — the mould CONV-00 and CONV-03 are cast in
- [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) — the gate's authority
- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) · [`PROJECTS_MODULE.md`](../development/PROJECTS_MODULE.md) · [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md) — the module authorities CONV-01/02 touch
- [`AI_PLATFORM.md`](../development/AI_PLATFORM.md) — §21 is the blocker; the gate above is its passing condition
- [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md) — the offline contract this programme leaves unchanged
- [`DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md) — the last audit; this pass re-measured rather than inherited it
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is owed, including DEBT-236 and DEBT-237
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — "Trusting: if I put it here, it's safe and I'll find it" — the feeling this programme protects
