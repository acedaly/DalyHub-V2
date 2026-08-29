# DalyHub — Post-V2.6 Product Audit & What Comes Next (2026-08-29)

> An evidence-led audit of the product as it exists on `main` at `b928fd4`
> (V2.6 FIND-01 delivered), answering one question: **if DalyHub stopped adding
> features today, what would prevent it from being an excellent personal
> operating system and daily driver — and what should we build or improve
> next?**
>
> Method: the constitution, roadmaps through V2.6, the debt register, module
> docs and ADR index were read first; then the implementation itself was
> inspected (routes, kernel, repositories, styles, tests), and the application
> was **run** — local D1 migrated and seeded via the E2E setup, then driven with
> a real browser at 1440×900 and 393×852, including capture, search, the task
> drawer and the phone shell. Where documentation and implementation disagree,
> the code and runtime behaviour are treated as the evidence and the
> discrepancy is reported. Findings new to this audit are marked **[new]** and
> are deliberately **not** given DEBT numbers — issuing numbers belongs to the
> pass that edits the register.
>
> Scope guard: **FIND-02/03/04 (one tag vocabulary, tags on Tasks, `#tag` in
> the capture grammar) are committed V2.6 scope.** Nothing below recommends
> that work; where a gap is theirs, it is credited to them and set aside.

---

## 0. The headline

DalyHub is an unusually well-built product wrapped around **two failures of its
own first principle** — *"The system is your memory… capture must be
effortless; retrieval must be certain"* (`PRODUCT_PRINCIPLES.md` §philosophy):

1. **The memory is not safe.** No disaster-recovery copy of the production
   database has ever existed. The nightly backup has failed 23+ consecutive
   times at its own (correct) encryption guard because the owner-held secret
   was never set (DEBT-198, P1); six migrations were applied to production with
   no backup behind them (DEBT-139, P1); the remote restore path has never been
   exercised (DEBT-199, P1); and `verify:production` has never run, so *"the
   repository still cannot say what is deployed, only what it believes is
   deployed"* (DEBT-84). Every one of these is a documented, ~30-minute owner
   action. Until it happens, DalyHub is a beautifully engineered place to lose
   the most private data a person has — and this audit rates that a **P0 for
   daily-driver adoption**, whatever severity the register uses.

2. **The memory is title-deep.** Search matches Note bodies, but **not Meeting
   notes or agendas, not Diary bodies, not Task descriptions, not Review
   reflections** (`d1-meeting-repository.ts:481` — title+location only;
   `d1-diary-repository.ts:344` — title only; `d1-task-repository.ts:1710` —
   title+checklist only; `d1-review-repository.ts:398` — title only). What was
   *said in a meeting* — the exact thing MEET-01's capture bar makes effortless
   to put in — cannot be found again by searching for it. "What did I complete
   yesterday?" is likewise unanswerable: there is no completed-date sort or
   filter anywhere (`task.ts:747-761`, `d1-task-repository.ts:2189-2198`), and
   the Completed view's label ("most recent first") is not what its
   `sort: "updated"` delivers (`task-system-views.ts:125-128`).

Everything else — and there is a lot of genuine excellence: the Tasks surface,
the Goal story layer, the honest analytics, the composed phone shell, the
controlled AI platform — sits on top of those two facts. **The next programme
should finish the sentence V2.6 started**: V2.6 makes titles fast to reach
(recency, tags, `#tag`); the successor should make the *whole record*
reachable, and the *time* dimension of the owner's own history answerable. AI
stays correctly gated behind the owner-held provider key; Finance is a real
candidate but belongs **later**, behind the trust floor and an attachments
decision.

---

## 1. The product, module by module

Ratings here are the **owner's experience**, not the code's quality. The
product's own post-DHDS-13 scorecard (mean 8.1, `DHDS_13 §14`) is a fair
measure of *visual and interaction* quality; this table asks whether each
surface is useful, discoverable, fast and finished as a daily tool.

| Surface | What it is today | Verdict |
|---|---|---|
| **Today** | A genuine command centre: Now band → plan (Overdue/Due/Planned) → schedule (external calendar) → habits → goal progress → attention rail → continue-working → reflection → the week's Review door. 13 parallel bounded reads, 21 D1 statements pinned by test (`today-review-door.test.ts:277`). | **Strong**, with holes: meetings today are invisible as a fact once the last one starts — the `Meetings today` chip is dead code (`day-view.ts:642-652` has no consumer; `data.meetings` feeds only `nextUp`) **[new]**; the waiting signal is one rail row capped inside `ATTENTION_MAX = 5` (`attention-view.ts:128-140`); the week's stat rank is collapsed inside a `<details>` contradicting its own file header (`TodayScreen.tsx:514` vs `:9-33`). |
| **Tasks** | The strongest module. Rich model (status/priority/two dates/sectors/someday/waiting/delegation/recurrence incl. after-completion mode/dependencies/checklists), 17 system views, real keyset pagination, declarative filters, honest bulk bar, inline editing on the row, one kernel "still owed" rule. | **Excellent.** Missing, in order of daily cost: tags (FIND-02/03's), completed-date retrieval **[new]**, manual ordering (DEBT-188), `followUpOn` written/edited/exported but never queried by anything (`task.ts:875-982` has no such filter) **[new]**. |
| **Inbox / capture** | 2 taps on phone (bar "Add" → type → Save), 2 clicks on desktop, external `POST /api/capture` for Siri/Shortcuts, offline capture queue for tasks/notes/diary, closed token grammar (verified live: `Call the plumber #home p2 friday` → P2, Friday due, title keeps `#home` — FIND-04's example verbatim). | **Good**; FIND-04 owns the `#tag` gap. Post-V2.6 residue: no global capture *keyboard* shortcut (`shortcut-reference.ts:45-56` documents only ⌘K, `/`, `?`), and the manifest ships no `share_target`/`shortcuts` (`public/manifest.webmanifest`), so phone-OS share-sheet capture rides only the token API. |
| **Search / retrieval** | Well-built shell (combobox, ranking tiers, 12 providers, 2s per-provider deadline, FIND-01 recent records with the Diary privacy sentence — verified live). | **The weakest load-bearing surface.** Body content unsearchable outside Notes (§0). No FTS — every provider is a leading-wildcard `LIKE` (deliberate, `SHARED_SEARCH.md:441-455`). Link pickers still have a moving bounded horizon (DEBT-201's residue: "the horizon MOVES; it does not disappear"). |
| **Projects** | Solid collection + record (overview/tasks/knowledge/links/activity/settings), health signals, templates (with recorded gaps DEBT-165/166/167/168), canonical next actions. | **Good.** The record's Tasks tab is still the last non-`TaskRow` surface (DEBT-175, paired with DEBT-128 — their own pass). No description field (DEBT-137). |
| **Areas** | Collection + record with goal stories, identity system. | **Good, quiet.** No description (DEBT-98). |
| **Goals** | Post-V2.5 this is decision-grade: outcome-ordered collection, one goal story (6 facts, machine-parity asserted), movement lines, owner's `set_aside` condition, one next-action rule, measurement panel with pace. | **Strong.** Gaps: no check-in cadence or nudge (a stale Goal produces a status word, never a prompt — `GOAL_STALE_AFTER_DAYS` is the only consequence); milestones carry no dates; a Goal with no measurement has **no trend of any kind**; and the story is assembled at three sites (`/goals` inline, `loadGoalStories`, the Review's alignment step markup) — parity is tested, but it is drift waiting for a fourth site. |
| **Reviews** | A genuinely good weekly guided flow (7 steps, insights panel, plan account, snapshot on completion). The week's door on Today (STEER-05) closes the entry-point gap. | **Good weekly; thin otherwise.** Monthly/quarterly/annual/custom types exist with **no guided flow at all** (`guide.tsx:91` redirects non-weekly). The record's period tabs have two real defects **[new]**: `openTasks` lists *today's* workspace-wide overdue under a period label (`review-period-context.ts:51-56, 80-85`), and completed/diary/people reads are bounded at 50 *before* the period filter, silently losing rows in a busy period. |
| **Notes** | The deepest supporting module: real Markdown editor, wiki-links + record links reconciled to EntityLinks on save, backlinks, full-body search, export/print. | **Excellent.** No pinning/notebooks — tags-and-links only, which is coherent. |
| **People** | Widest detail slice; derived stay-in-touch kernel (states, cadence, curated interaction types); unified relationship timeline; circles. | **Good, but inert where it matters**: `birthday`, `next_follow_up` and the whole `due_for_follow_up`/`out_of_touch` derivation produce **no notification and no Today presence** — display-only (`NOTIFICATION_KINDS = ["digest","asset_obligation"]`, `notification.ts:48`). The `person_details.notes` tab is a second, unlinked, unsearchable place to write about a person, one tab from a Linked tab that could hold a real Note **[new]**. DEBT-44 (held-meeting on a non-attendee's timeline) still awaits its product decision. |
| **Meetings** | Best in-the-moment ergonomics in the product: capture bar (Note/Action/Decision/Outcome), items→Tasks with required parent, atomic `held` fact feeding People timelines, day-grouped collection. | **Good.** No recurrence/series at all (grep is empty); follow-ups capped at 100 via an N+1 loop (below); its notes/agenda bodies are unsearchable (§0); calendar linkage lives only in Today's schedule drawer. |
| **Diary** | Honest thin chronology: 9 entry types, backdating (`occurred_at`), week-strip day nav, inspector capture, day-context suggestions. | **Adequate**; deliberately no mood/energy/templates. One real defect **[new]**: the shared destination map sends every Diary link to `/diary/:id` (`destination.ts:54`), which is a **JSON resource route with no UI** (`diary/routes/entry.tsx` has a loader and no default export) — verified live: `GET /diary/d-search-e2e` returns `application/json` including the private body. Every Linked Items row, person-timeline link and hover-card destination for a Diary entry opens raw JSON. The file's own comment claims the opposite ("PEOPLE-03 added the Diary entry route", `destination.ts:26-29`). |
| **Assets** | The most complete *system*: typed details, logbook events, obligations with recurrence/meter thresholds/atomic completion/successors, on-demand task linkage — and the **only** module that reaches out (30/7/1-day notification rungs). | **Strong.** Its own biggest gap is the product-wide one: no attachments, so a module about registrations, policies and warranties cannot hold the registration paper, the policy PDF or the receipt (DEBT-35; `manifest.ts:118` "File attachments: DalyHub stores none"). |
| **Habits** | Clean behaviour model (effective-dated schedules, one completion/day, three honest readings, no streaks — ADR-102/110 held structurally). | **Good.** Check-ins online-only (DEBT-155); history strip only on the record. |
| **Analytics** | Five explained metrics, completion + overdue trends, area distribution; every figure links to its records; honesty notes. Three fixed ranges. | **Honest but shallow.** No goal trend (never reads `goal_measurements`), no project dimension, no habit view, no hour-of-day (DEBT-145). The best two panels (overdue level+direction, where-the-work-landed) are genuinely decision-useful; the rest is counting. |
| **Views** | Cross-module saved views over 6 scopes; useful built-ins ("Waiting & follow-up", "Needs attention"). | **Load-bearing but rough**: no cursor at all — result 61 is unreachable by any means (`view-query.ts:31`, `view-result.ts:141-148`); saved views appear in no navigation; pinning is hard-coded; and the repository carries a live D1 failure risk (below) **[new]**. |
| **AI surfaces** | `/ai` (Ask DalyHub), AI tabs on Meeting/Note, Weekly Review assistant — all calm and honest with AI off. | See §7. One product defect **[new]**: the five deterministic Ask intents (overdue/open/inbox counts, latest/upcoming meeting) cost nothing and contact no provider, are advertised in Help (`help-content.ts:647`), and are **unreachable** — the UI hides the question form behind the same enabled+configured gate as the paid path (`ai/routes/index.tsx:62-70,105-108`), while the server answers them *before* the `ai_disabled` throw (`assist.tsx:163-183` vs `ai-runtime.ts:181`). |
| **Settings** | 12 sections, sensible groups, real backup/restore flow (typed `REPLACE`, verified safety backup), per-device offline panel. | **Good.** Vestigial rows ("Workspace isolation: Active", "Deferred data tools: Deferred") occupy a section between real ones; density exists as a concept with no control. |
| **Navigation** | Registry-driven rail (21 entries), composed phone bar (Today · Tasks · Add · Projects · More — asserted by `e2e/mobile-shell.spec.ts:45`), one frame origin. | **Strong**, with drift **[new]**: opening `/person/:id`, `/meeting/:id` or `/asset/:id` leaves *no* nav item current — `activeNavigationHref` matches by path nesting and those detail paths are singular (`navigation-active.ts:26-35` vs `people/routes.manifest.ts:43`), the exact failure UX-01 says it fixed. Three shell files still describe the phone bar as `Today · Tasks · Capture · Diary · More` (`mobile-navigation.ts:78-79`, `AppShell.tsx:17`, `MobileTopBar.tsx:40-43`) — it is Projects, not Diary. The desktop search button has **no accessible name between 768–1024px** (label `display:none` below `64rem`, icon `aria-hidden`; `shell.css:1194-1236`, `DesktopTopBar.tsx:181-192`). |

---

## 2. DalyHub as one system: where the loop breaks

The loop is **capture → organise → decide → do → review → learn → retrieve**.
Capture through review is genuinely coherent — one task authority, one activity
stream, one links model, one identity rule, and V2.4/V2.5 made the signals
honest. The breaks are concentrated at **retrieve**, **learn**, and the
**remember-for-me** half of the contract:

1. **Retrieve breaks at depth** (§0). The owner must remember *which record's
   title* contains a fact, or walk the record's timeline by hand. That is the
   owner remembering something DalyHub should remember.
2. **The system never reaches out for anything but assets and the digest.**
   `NOTIFICATION_KINDS` is a closed set of two (`notification.ts:48`). No task
   reminder, no meeting lead notice, no person follow-up, no review nudge
   beyond Today's quiet band. Some of this is principled calm (per-event
   overdue nagging is explicitly refused, and rightly); but a *meeting that
   starts in 30 minutes* and a *follow-up date the owner explicitly wrote on a
   delegated task* are commitments, not noise — and today both are silent.
   `followUpOn` is the sharpest case: editable (`TaskDetailsTab.tsx:257`),
   exported (`build-vault.ts:594`), and **no query anywhere reads it** **[new]**.
3. **"What changed?" has no surface.** The workspace-wide Activity endpoint
   (`/today/activity`) is built, tested and orphaned (DEBT-103; grep finds no
   caller). History exists only per record.
4. **Learn is write-only in places.** Review snapshots capture per-Goal and
   per-Area state on every completion, and no code path ever compares them
   (`review-insight-snapshot.ts:106-126` vs the three read sites) — "did this
   Goal's alignment change since my last Review?" is **stored and unanswered**
   **[new]**. `listMeasurementSeries` has no caller (DEBT-212).
5. **Two vocabularies for the same decision.** Time Sectors
   (`this_week`…`routines`) are stored, validated, editable and offered as a
   filter/grouping on `/tasks` — and **no daily surface reads them**: Today and
   `/plan` plan by `scheduled_date` alone (`day-view.ts` date-union;
   `PlanWorkspace.tsx:50-56`). An owner who faithfully sets sectors gets
   nothing back on the surfaces where the day and week are decided **[new]**.
6. **Cross-surface honesty gaps** — for a product whose brand is truthfulness:
   *"Goals on track"* means three different things under one label (Today:
   GOAL-02 status over ≤4 goals, `measures.ts:167-199`; Analytics: alignment
   `active` over ≤40, `analytics-context.ts:436-460`; `/goals` lens: status
   workspace-wide, `goal-outcome.ts:176-177`) **[new]**; the Completed view's
   description promises an order its sort doesn't implement; the Review period
   tabs mix today's state into a period's story (§1).

None of these breaks require new modules. All of them are the same shape:
**data the owner already gave DalyHub, not yet given back.**

---

## 3. The daily-driver test

Can the owner answer, quickly:

| Question | Answer today | Evidence |
|---|---|---|
| What matters today? | **Yes, mostly** — Today's plan bands + Now + attention rail | §1 Today |
| What should I do next? | **Yes** — Now band; kernel next-action on projects/goals | STEER-04 |
| What am I waiting for? | **Half** — Waiting views exist (`/tasks` Waiting/Delegated, `/today/waiting`, the cross-module built-in), but the Today presence is one capped rail row, `/today/waiting` has no nav entry and a hard 100 cap with no cursor, and follow-up dates never fire anywhere | `attention-view.ts:128-140`; `waiting.tsx:59,75` |
| What is overdue? | **Yes, strongly** — one kernel rule, honest ageing, canonical list | GATE-02 |
| What changed? | **No** — no workspace activity surface | DEBT-103 |
| What did I recently work on? | **Yes** — FIND-01, verified live | §1 Search |
| What am I forgetting? | **Partial** — daily digest + asset rungs; nothing for meetings, follow-ups, people dates | §2.2 |
| Which Projects are drifting? | **Yes** — attention rail, health + reasons, stale/at-risk states | Today/Reviews |
| Which Goals are moving? | **Yes (this week)** — movement lines everywhere; **no** longer trend | §1 Goals |
| What commitments have I made to people? | **Weak** — delegation is free text, follow-ups invisible, meeting follow-ups live per meeting; the person record shows counts, not open commitments | §1 People |
| What should I review? | **Yes** — the week's door | STEER-05 |
| Where did I put that thing? | **Titles yes; contents no**; physical things yes (Assets) | §0 |
| What needs my attention this week? | **Yes** — `/plan` queue + signals + digest | §1 Plan |

**Ranked by real-use frequency, the gaps are:** (1) content-deep retrieval —
many times a day; (2) waiting/commitments visibility — daily; (3) "what did I
complete / what changed" — daily-to-weekly; (4) meetings-today fact +
lead-time notice — on meeting days; (5) goal trend — weekly at review time.

---

## 4. Mobile / iPhone

The phone experience is a **designed product, not a squeezed desktop** — the
DHDS-13 claim holds up under a real 393×852 drive:

- **Shell**: composed bottom bar (Today · Tasks · Add · Projects · More), 44px
  floors enforced under coarse pointers (`tokens.css:7903-7926`), keyboard
  inset handling, safe-area caps. Search is one tap from the top bar. Verified
  by screenshot.
- **Capture**: 2 taps to a saved task; the sheet opens on Task with type chips
  (verified). Offline capture works for task/note/diary and replays through
  canonical routes with idempotency keys.
- **Rows/sheets**: task rows genuinely recompose (two-line, big targets,
  action sheet), pickers/menus become sheets via one `useCompactViewport`
  seam.
- **Filters**: collections get a "Filter & sort" sheet on phone (verified on
  People — an earlier sweep's claim that People filtering is unreachable on
  phone is **wrong**; the sheet replaces the inline toggles).

Genuine phone problems, separated from taste:

1. **Offline is a place, not a property.** Any offline navigation redirects to
   the `/offline` surface (`sw-template.js:443-455`) — a capture form, queue
   panel and a ±7-day snapshot viewer. That is honest and safe, but reading
   this morning's plan on the train means the snapshot's reduced list, not
   Today. The mutation queue covers 7 task ops; habit check-ins, links,
   ordering and checklists (beyond completion) are online-only (DEBT-155/160/
   161/190 — the "offline slice" decision the roadmap already defers whole).
2. **A phone task row hides checklist progress** (DEBT-161) and drops
   parent + quiet priority below 30rem (`tasks.css:1422-1428`) — information
   loss at exactly the width the product calls a first-class citizen.
3. **iOS installability is manual A2HS** (correctly explained in Settings),
   and the manifest declares no `share_target` or `shortcuts` — the OS share
   sheet can't feed capture; only the token API can.
4. Trivia: the keyboard-reference sheet (`?`) has no touch entry point at all;
   the palette is two taps deep (acceptable — Search carries the load).

**Verdict: 7/10 as a phone product** — top-decile for a PWA of this scope; the
remaining distance is offline reach and small row-content losses, not layout.

---

## 5. Product quality / polish

DHDS-01…13 did what it claims: one row grammar (except the known DEBT-128/175
pair), one header, one floating layer, one drag grammar, honest empty states
(verified: Reviews, Diary, Schedule), undo over confirmation in the right
places, terminology discipline. The remaining polish debt is *known and
registered* (DEBT-107's eleven, DEBT-51, DEBT-100, DEBT-123…) and none of it
justifies another visual programme — DHDS-13 §18's "there is no DHDS-14"
stands.

What this audit adds beyond the register **[new]**: the unnamed top-bar search
button at 768–1024px (a WCAG 4.1.2 failure in a real band, §1 Navigation); the
lost nav anchor on singular record routes; the Diary JSON destination; three
stale shell/manifest comments that will misdirect the next agent
(`mobile-navigation.ts:78-79`; `ai/routes.manifest.ts:5` says `insight`, ships
`more`; `analytics/module` comment likewise). Screens exposing implementation
concepts are rare — the one real case is `/offline`'s diagnostics panel, which
is arguably owed to the owner.

---

## 6. Missing capabilities (through the seven questions)

Assessed sceptically; only three survive as genuinely missing capabilities
rather than improvements to existing ones:

1. **Content-deep search** — solves "find what I said/wrote, not what I titled".
   Frequency: daily. Existing product cannot do it another way (record
   timelines don't search prose). Belongs inside DalyHub, in the existing
   search providers — **not** a new module, **not** a second index: the exact
   `LIKE`+excerpt mechanism Notes already use (`d1-note-repository.ts:363-414`)
   extended to meeting/diary/task/review columns. Smaller cross-module
   capability: yes — this *is* the smaller capability. Deliberately not built:
   FTS5/embeddings (ADR-073 §20 refusal stands; single-owner workspaces are
   within `LIKE` bounds).
2. **Commitment surfacing (waiting / follow-ups / meeting lead)** — solves
   "DalyHub remembers what I promised and when to chase". Daily. Partially
   solvable today (Waiting views exist) but `followUpOn` and meeting-lead have
   no path at all. Belongs in existing Tasks/Today/notifications — the
   notification evaluator's rung machinery (`notification-evaluator.ts:141`)
   is already the right shape. Not built: per-event overdue nagging (stays
   refused), full reminders-on-anything (a later decision).
3. **Attachments** — solves "the registration paper lives with the asset, the
   PDF with the meeting". Weekly. Cannot be solved another way (photo_url
   paste is not storage). Requires R2 + export/backup/privacy decisions — a
   real programme, and a **prerequisite for Finance** (receipts/statements).
   Not now (§15), but it is the one *capability* gap a new storage primitive
   genuinely earns.

Rejected as modules: a calendar module (standing non-goal; CAL-01's read-only
projection is the right call), a mail client, time tracking, and a habits
expansion (the model's restraint is its value).

---

## 7. AI, specifically

**What exists** (verified): a complete controlled platform (~9,800 lines) —
proposal-only writes, budgets checked before calls, evidence-id citation,
structural People/Diary exclusion, a usage ledger with no content, 29 E2E
journeys proving the off state; four features (meeting/note action extraction,
Weekly Review assistant, Ask DalyHub); five deterministic Ask intents that
need no provider. **What has never happened**: a single live provider request
(`AI_PLATFORM.md` §21). The `/ai` page today renders one honest sentence and a
settings link (verified by screenshot).

**Judgement — V2.6's AI decision was right, and it still is.** Every
user-visible AI outcome is gated on an owner-held credential with a 0-for-3
record of owner-held blockers clearing, and Finding 3 stands: an assistant that
ran today would describe a set-aside Goal as neglected (DEBT-91), through the
one surface the owner can't correct by looking beside it. Activating AI is
**not** the next programme. Three concrete positions:

- **AI-GATE is not programme work — it is a tripwire.** The moment the key
  exists, run the pre-decided gate (`scripts/ai-integration-check.mjs` green
  against one provider, re-verify DEBT-213's pricing registry). It should be
  listed beside the owner actions in §15 NEXT, not scheduled behind anything.
- **DEBT-91's fact-block correction precedes any visible assistant** — already
  the recorded sequence; endorsed.
- **The single most useful first live capability, if the gate passes**, is the
  **Weekly Review assistant** (already built, grounded by STEER-03/04's fact
  block once DEBT-91 closes) — not chat, not extraction: it sits inside the
  one ritual where a synthesis of the week has a reviewer, a cadence and an
  undo. Meeting action extraction is second.
- **Do now regardless of the key** **[new]**: unbundle the five deterministic
  Ask answers from the AI gate (they are product features that happen to live
  on `/ai`), or stop advertising them in Help. One conditional in
  `ai/routes/index.tsx` misrepresents the product's own honesty rule.

---

## 8. Finance, specifically

**Does it belong?** Directionally yes — "Finance" is one of the constitution's
own example Areas (`AGENTS.md §4`), Assets already tracks value in integer
minor units, and Goals/Reviews/Today/reporting give a budget somewhere real to
land. A Finance module is the strongest *replace-another-app* candidate in the
product's future: budgeting apps are paid, and the loop (transactions →
categories → budget-vs-actual → review) matches DalyHub's existing
capture→review grammar.

**Is it worth the complexity now? No.** Three graduated reasons:

1. **The trust floor.** Importing every transaction of a person's financial
   life into a database whose only backup has failed 23 consecutive times is
   the wrong order. Finance is exactly the module whose data-loss cost is
   monetary and whose reconciliation depends on totals never silently drifting
   — D1 stores no decimals safely without the minor-units discipline, imports
   need dedupe, and a restore must be provably lossless. **Recoverable green
   is a hard precondition.**
2. **The attachments gap.** A finance workflow without statements/receipts
   attached is half a workflow; building attachments *inside* a finance
   module would create the second storage primitive the architecture forbids.
   Attachments (R2) should be decided first, on its own.
3. **Opportunity cost.** The daily-driver gaps in §3 are used many times a
   day; a budget is touched weekly. B's own asymmetry argument from V2.6
   applies: retrieval/commitment work makes *every* future module cheaper;
   Finance makes nothing else cheaper.

**The smallest Finance that genuinely replaces a paid app**, when its turn
comes: accounts (manual) · transactions with CSV import + dedupe · one
category set (a FIND-02 tag namespace is *not* it — categories are structure,
and V2.6's own non-goal says tags never become structure) · monthly budget
vs actual · recurring bills/income as obligations (the Assets obligation
machinery is the proven shape: rungs, dedupe, digest line) · net-worth
snapshot. **Explicitly outside DalyHub**: bank feeds/Open Banking (initially),
double-entry bookkeeping, invoicing, tax, shared/household ledgers,
investment analytics beyond balances. **Verdict: Later — a named candidate for
the programme after next, contingent on Recoverable green + the attachments
decision; not next, not never.**

---

## 9. Reporting and insight

DalyHub is currently **better at storing state than at giving the owner their
history back** — but its instinct (every figure explained, no vanity) is
exactly right, so the fix is aim, not style. Decision-useful and missing:

- **"What did I complete yesterday / this week?"** — retrieval, not a chart
  (§0). The single most-asked reporting question a task system gets.
- **Goal trend** — the snapshots already capture per-Goal state each Review
  and nothing reads it back (§2.4); a Goal without a measurement has no trend
  at all. One comparison read closes both.
- **The week account on the surface the owner opens** — FOLLOW-01's honest
  account renders only at the foot of `/plan` behind a disclosure and inside
  the Review; Today never accounts for the week just gone.
- Deliberately *not* recommended: dashboards-per-module, hour-of-day insight
  (DEBT-145 is real but a P3 curiosity), scores of any kind (ADR-110 stands).

---

## 10. Reliability and trust

The in-app story is genuinely strong — soft delete everywhere with no purge
path, 8-second undo on the mutations that matter, optimistic UI that never
lets an announcement lead the server (ADR-086), a restore flow that verifies
its own safety backup by round-trip before destroying anything
(`restore-workspace.ts:31-38`), fail-closed auth ordered before the router,
and offline queues that survive auth expiry without loss
(`OfflineProvider.tsx:461-468`). This is daily-driver-grade engineering.

The trust question fails **outside** the app:

| # | Fact | Status |
|---|---|---|
| 1 | No production backup has ever been produced (23+ failed runs; guard correct; secret unset) | DEBT-198, P1 — **owner-held** |
| 2 | Six migrations applied to production with no recoverable copy; `0048` pending behind the same gate | DEBT-139, P1 |
| 3 | Remote restore path never exercised; local path *measured broken* with the originally documented command | DEBT-199, P1 |
| 4 | `verify:production` never run — deployed state is believed, not known | DEBT-84 / V2.4-GATE-01 |
| 5 | Provider key absent — AI unprovable | AI_PLATFORM §21 |

Smaller but real, from this audit **[new]**: the cross-view repository binds
unchunked `IN (…)` lists — `#resolveLinkAnchors` binds `2 + 2n` parameters
(`d1-cross-view-query-repository.ts:715-769`), so 60 note/meeting results put
122 parameters into a statement against D1's 100 cap: `/views` can fail
outright at realistic sizes, while every sibling repository chunks at 40–80
precisely to avoid this. The Meeting record issues up to 100 sequential
`getTask` reads per load (`meetings/routes/detail.tsx:120-121`), and
`task-activity.tsx:139` loops per-id under a comment claiming "ONE bounded
batch" — the batch API exists and seven sibling routes use it. E2E "green" is
still probabilistic at ~1 race per 2 runs (DEBT-203) with two P1-rated
CI-trust entries held open for their confirming `main` runs (DEBT-125/157).

---

## 11. Simplification opportunities

- **Time Sectors: decide or retire** **[new]**. Either a daily/weekly surface
  reads them (e.g. the Plan queue offers a sector band) or they are retired in
  favour of scheduled-date + someday, which is what Today/Plan actually use.
  Two coexisting horizon vocabularies is quiet bureaucracy.
- **`person_details.notes`**: fold into a linked Note over time; at minimum
  stop presenting an unsearchable second writing surface as a tab peer.
- **Dead code carrying live names** **[new]**: `app/shared/filters/saved-views.ts`
  (a third saved-view contract, zero consumers, name-collides with the real
  `SavedView`); the unused command-execution boundary (`POST /commands/:id` —
  every palette command is `navigate`; either ship action commands or accept
  and document); `/today/activity` (DEBT-103 — ship a surface or remove);
  `ExpressiveSummary` (DEBT-122); `listMeasurementSeries` (DEBT-212);
  `dayChips` (§1 Today).
- **Vestigial Settings rows** ("Workspace isolation: Active", "Deferred data
  tools") — delete or fold into About.
- **Repo hygiene**: ~8 MB of root-level mockup PNGs belong in
  `docs/design/assets/`.
- **Keep, explicitly**: Views (load-bearing built-ins; fix, don't fold),
  Diary's thinness (honest), Habits' restraint, the no-calendar-module rule,
  and every standing non-goal list — none should be reopened.

---

## 12. Scores (the experience the owner receives)

| Dimension | Score | Evidence in one line |
|---|---|---|
| Daily-driver usefulness | **7** | Today/Tasks/Plan answer most of §3; meetings-fact, waiting reach, completed-yesterday and changed-what do not |
| Capture | **7** | 2 taps/2 clicks + grammar + API + offline queue; `#tag` is FIND-04's; no global key, no share_target |
| Tasks | **8** | Richest, most honest surface; no tags (owned), no completed-at retrieval, no manual order |
| Planning | **7** | Real queue with named bands, honest figures, account at the foot; board needs 1440 (DEBT-162), no drag (deliberate) |
| Goals | **8** | Story/movement/condition/next-step are decision-grade; no cadence nudge, no trend without a measurement |
| Reviews | **7** | Weekly guide + insights genuinely good; other cadences unguided; period tabs misreport (§1) |
| Retrieval / search | **5** | Shell excellent, FIND-01 live; body content unsearchable outside Notes; no time-based retrieval |
| Mobile experience | **7** | Composed shell, real sheets, 2-tap capture; offline is a place; row content loss ≤30rem |
| Visual / product polish | **8** | DHDS held: one grammar, honest states; residue is registered and small |
| Reliability / trust | **4** | In-app integrity is 8+; **no backup has ever existed**, restore unproven remotely, deploy unverified — the number the owner lives with |
| Reporting / insight | **5** | Explained and honest but shallow; stored history (snapshots, series) never returned |
| Cross-module coherence | **7** | Links/activity/identity/one-authority discipline is exceptional; three "on track" meanings, sector vocabulary unread, diary JSON destination |
| Performance | **7** | Budgets pinned by test (21-statement Today); precache 2× its baseline (DEBT-151), meeting N+1, LIKE scans bounded |
| Accessibility | **8** | Assert-tested (axe, targets, contrast both appearances); unnamed search button 768–1024, tooltip/feed P3s open |
| AI readiness | **8** | Platform complete, principled, tested; zero live proof; deterministic slice gated off in error |

**Overall product maturity: 6.5 / 10.** The architecture and test culture are
9/10; the owner's lived experience is a 7 held down to 6.5 by the trust floor
and title-deep retrieval — both of which are cheap relative to everything
already built. This is a product a small set of fixes moves a full point.

---

## 13. Findings, prioritised

**P0 — prevents safe/reliable use** *(register carries these as P1; for
daily-driver adoption they are P0)*
- **Backup/restore/verify cluster** — DEBT-198 + DEBT-139 + DEBT-199 +
  V2.4-GATE-01's `verify:production` half. Evidence: 23+ failed runs, prod six
  migrations past any recoverable copy. Journey: all of them. Impact: total
  data loss is one Cloudflare incident away. Root cause: owner-held secrets
  never set. Intervention: the documented owner sequence
  (`BACKUP_AND_RESTORE.md`), then the remote-restore probe. Already in
  register: **yes** — nothing new to raise; everything repo-side is done.

**P1 — major daily-driver weakness**
1. **Search cannot see content** (meeting notes/agenda, diary bodies, task
   descriptions, review reflections). Evidence: §0 repository cites. Journey:
   retrieve. Impact: "certain retrieval" fails for the highest-value prose.
   Root cause: providers match title(+location/tags) only; deliberate deferral
   (`SHARED_SEARCH.md:441-455`). Intervention: extend provider SQL with the
   Notes excerpt mechanism; Diary body behind its established privacy rule.
   In register: **no** (DEBT-93 is AI-retrieval; this is product search)
   **[new]**.
2. **Completed work is not retrievable by time**; Completed view label vs
   `sort:"updated"`. Journey: review/learn/retrieve. Root cause: no
   `completed_at` sort/filter (`task.ts:747-761`). Intervention: add sort +
   `completedWithin`; relabel or reorder the view. In register: **no** **[new]**.
3. **Commitments don't reach the owner**: `followUpOn` never queried; waiting
   marginal on Today; no meeting lead notice. Journey: do/review (people).
   Intervention: one Tasks filter + one Today/attention line + one digest
   line; consider a meeting-lead rung on the existing evaluator. In register:
   **no** (DEBT-57 closed asset-side only) **[new]**.
4. **`/views` can fail at realistic size** — unchunked `IN` binds up to
   `2+2n` params vs D1's 100 cap; plus no cursor past 60. Journey:
   organise/retrieve. Intervention: chunk like the seven sibling repositories;
   add keyset cursor. In register: **no** **[new]**.
5. **Diary links open raw JSON** (`destination.ts:54` vs loader-only route;
   verified live). Journey: retrieve/People timeline. Intervention: map to
   `/diary?mode=day&inspector=view:<id>` (what Diary search already does), or
   give the route a document response. In register: **no** **[new]**.

**P2 — meaningful improvement**
6. Meetings-today fact absent from Today + `dayChips` dead code (§1) **[new]**.
7. "Goals on track": one definition or three labels (§2.6) **[new]**.
8. Review period tabs: period-scope `openTasks`; filter-then-bound (§1
   Reviews) **[new]**.
9. Deterministic Ask DalyHub unreachable behind the AI gate (§7) **[new]**.
10. Meeting record N+1 (`detail.tsx:120-121`) and `task-activity.tsx:139`
    loop-vs-comment; nav anchor lost on singular record routes; unnamed
    search button 768–1024px **[new]**.
11. Register-carried P2s this audit re-affirms and defers to their own passes:
    DEBT-128+175 (one Task anatomy — still the strongest pair to ride beside
    the next programme), DEBT-151 (precache), DEBT-146 (one credential rule),
    DEBT-44 (person-timeline semantics), DEBT-203/205 (E2E machinery).

**P3 / polish** — stale shell comments and manifest navGroup prose; vestigial
Settings rows; `?` sheet unreachable on touch; root-level mockups.

**Later (valid, not now)** — Finance (§8); attachments/R2 (prerequisite for
Finance; own programme); offline expansion (the register's own whole-slice
decision); guided monthly/quarterly reviews; goal cadence nudges; DEBT-102
capture-processing decision; workspace-wide Activity surface (pairs naturally
with "what changed", but only if it earns a consumer — else remove).

**Reject (deliberately do not build)** — semantic/embedding search (refused,
ADR-073 §20 — nothing found here changes that); per-event overdue nagging;
streaks/scores/grades anywhere (ADR-110/111 are working exactly as designed);
a calendar module/month grid/write-back; generic AI chat; a second tag-like
labelling concept beyond FIND-02's vocabulary; DHDS-14.

---

## 14. The next programme

Strategies compared (scores 1–5 per criterion, unweighted; the table is a
summary of the argument, not a substitute for it):

| Criterion | A Consolidation (broad) | B Live AI | C Finance | D Insight | **E Recall & Account** |
|---|---|---|---|---|---|
| Daily value | 4 | 2 | 3 | 3 | **5** |
| Frequency of use | 4 | 2 (weekly) | 3 | 3 | **5** (every session) |
| User-visible payoff | 3 (diffuse) | 0 until key, then 4 | 4 | 3 | **5** |
| Product coherence | 3 | 4 | 2 (new domain) | 4 | **5** (finishes V2.6's own sentence) |
| Implementation complexity | 2 | 2 (code) / 5 (reality) | 5 | 3 | **2–3** |
| Architectural risk | 1 | 1 in code; unbounded at provider | 4 | 2 | **1** (no migration required by any core item) |
| Data risk | 1 | 1 (solved) | 5 | 1 | **1** |
| Mobile value | 3 | 1 | 3 | 2 | **5** (finding + being reminded are what a phone is for) |
| Ships incrementally | 4 | 1 (all-or-nothing gate) | 2 | 4 | **5** (each item lands alone) |
| Maintenance burden | 2 | 3 | 5 | 3 | **2** |
| Replaces an app/manual workflow | 2 | 2 | **5** | 2 | 4 (grep-your-own-notes, chase-spreadsheet) |

**Recommendation: E — "Recall & Account."** It is consolidation with a spine:
everything the owner has put into DalyHub becomes findable (content), datable
(time), and chased (commitments) — the three verbs §3 showed failing. It
extends V2.6's theme rather than opening a new front, needs no migration for
its core, ships item-by-item, and directly makes the eventual AI programme
cheaper again (deeper retrieval is DEBT-93's input, exactly as V2.6 argued for
tags and recency). B stays gated on the key (the gate runs the day it
arrives, outside any programme); C waits behind the trust floor and the
attachments decision; D's best two questions are folded into E and the rest
deferred.

---

## 15. Proposed sequence

### NEXT — before any programme, one owner session (~30–60 minutes)
Clear the Recoverable gate: set `BACKUP_ENCRYPTION_PASSPHRASE` (off-GitHub
copy first), dispatch the backup workflow, confirm run + `backup:verify`,
run DEBT-199's remote-restore probe against a throwaway D1, supply
`verify:production` credentials and run it once. Optionally in the same
sitting: create a provider API key → the pre-decided AI-GATE becomes runnable
(still not a programme). **Nothing an agent can do substitutes for this, and
every later programme is more dangerous without it** — FIND-02's migration
most immediately, Finance existentially.

### NEXT PROGRAMME — after FIND-02/03/04 land: **"RECALL — the whole record answers"** (5 items)

1. **RECALL-00 — the found-defects sweep.** *Problem:* five defects found by
   this audit undermine trust in ways no roadmap item owns (diary JSON
   destination; cross-view bind overflow + missing cursor; meeting-detail
   N+1 and the task-activity loop; unnamed search button; nav anchor on
   singular record routes). *Outcome:* each fixed with a regression test.
   *Why now:* they are cheap, and two are latent P1s. *Dependency:* none.
   *Acceptance:* a linked Diary entry opens the Diary day inspector; a
   60-result `/views` page with note/meeting anchors returns; Meeting detail
   loads its follow-ups in a bounded batched read, proven by statement count.
2. **RECALL-01 — search reaches content.** *Problem:* §0/2.1. *Outcome:*
   meeting agenda+notes, diary bodies (behind Diary's stated privacy rule),
   task descriptions and review reflections match with excerpts, using the
   existing Notes mechanism; providers stay bounded and stated. *Why now:*
   the largest remaining gap between the product and its first principle.
   *Dependency:* FIND-01 shipped (row grammar reused). *Acceptance:* a phrase
   that exists only inside a meeting's notes finds the meeting, end-to-end,
   with an excerpt; a diary body match appears only under the recorded
   privacy decision; bounded-pattern proof per provider.
3. **RECALL-02 — completed work is retrievable by time.** *Problem:* §13-P1-2.
   *Outcome:* `completed_at` sort + a completed-window filter reachable from
   the Tasks controls and palette ("Completed yesterday / this week"); the
   Completed view's label and order agree; Analytics' completed metric links
   land on a list that is actually completion-ordered. *Dependency:* none.
   *Acceptance:* the question "what did I complete yesterday?" is answered in
   two interactions from anywhere, proven E2E; counted-statement proof.
4. **RECALL-03 — commitments reach the owner.** *Problem:* §13-P1-3.
   *Outcome:* `followUpOn` becomes a filter + a "Follow-ups due" line in the
   attention facts and digest; `/today/waiting` gains its nav/palette parity
   and a cursor; a meeting-lead notice ships as one new rung on the existing
   evaluator **or** the recorded decision says why not. *Dependency:* none
   (notification machinery exists). *Acceptance:* a delegated task with
   `followUpOn = today` appears in Today's rail and the digest on that date;
   waiting list pages past 100; decisions recorded.
5. **RECALL-04 — the day and the week account for themselves.** *Problem:*
   §1 Today, §2.6, §9. *Outcome:* meetings-today becomes a stated fact on
   Today (revive or replace the dead chip); "Goals on track" gets one
   definition or three distinct labels (recorded); the Review period tabs are
   period-true; the week account gains its Today presence at the week
   boundary (or the recorded decision keeps it in Plan/Review). *Dependency:*
   RECALL-02 for the completed-window read. *Acceptance:* machine-value
   parity tests across the three former "on track" surfaces; period-context
   test seeded across a month boundary.

*Riding beside the programme, unchanged from V2.5/V2.6's own judgement:* the
DEBT-128 + DEBT-175 one-Task-anatomy pass remains the strongest bounded
convergence candidate, in its own PR, not absorbed.

### AFTER THAT *(provisional, in this order of likelihood)*
- **Insight over stored history** — the goal-trend read over the snapshots
  already captured (§2.4), `listMeasurementSeries` gaining its caller or
  leaving, and the workspace Activity surface decision (DEBT-103) — a small
  programme, only if RECALL's retrieval work leaves the appetite.
- **Attachments (R2)** as its own decision-heavy programme — export, backup,
  privacy, budgets — explicitly sequenced **before** Finance.
- **Finance (smallest viable, §8)** — contingent on Recoverable green +
  attachments; its shape is already sketched and should not grow beyond it.
- **AI activation** — whenever the key clears the gate: DEBT-91's fact block,
  then the Weekly Review assistant live, per the sequence V2.6 already fixed.

### NOT NOW (attractive, refused for the moment)
- **Live AI as the headline programme** — the gate is a tripwire, not a theme.
- **Finance** — wrong side of the trust floor and the attachments decision.
- **Embeddings/semantic search, FTS5** — `LIKE` within stated bounds first;
  revisit only with measured pain in a single-owner workspace.
- **Offline expansion** — the register's own whole-slice decision; nothing
  here changes it.
- **A first-run/onboarding pass, DHDS-14, new modules of any kind, month
  grids, write-back calendaring, reminders-on-everything** — standing
  non-goals, all reaffirmed by this audit's evidence.

---

*Written by the post-V2.6 product audit, 2026-08-29, from the code at
`b928fd4`, a seeded local runtime, and the repository's own records. New
findings are unnumbered by design; the next register pass issues numbers
(next free ID per the register: DEBT-217).*
