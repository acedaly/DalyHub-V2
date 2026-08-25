# PRODUCT_DEBT_CLOSURE_2026_08.md — the all-open-debt pass

> A programme record, not a second register. [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md)
> is the authority on every entry; this file explains what was done to the whole
> of it on 2026-08-25, why, and — the part that matters most — why **106 entries
> are still open** and what would close each of them.

**Branch:** `claude/product-debt-closure-ofudxo` · **Base:** `main` @
`0e5f8ea` (*"V2.4-GATE-01: measure production, and record the main run lost to a
package download"*, #225).

---

## 1. The starting inventory

Parsed from the file rather than from its own summary prose, which is how the
counts below differ from the ones a reader would have guessed.

| Priority | Open (☐ or ◐) at `0e5f8ea` |
|---|---|
| P1 | 5 |
| P2 | 27 |
| P3 | 100 |
| P4 | 2 |
| **Total** | **134** |

Two counting notes, because both cost time before they were caught:

- **`grep '^### [☐◐]'` is wrong.** A bracket expression matches individual
  *bytes* of a multi-byte UTF-8 character, so it matches ☑ as well and reports
  every entry in the file. The correct pattern is `grep -E '^### (☐|◐) '`.
- **The entry TEMPLATE is a heading too.** `### ☐ DEBT-NN` at the bottom of the
  register is counted by any naïve scan. Every figure in this document excludes
  it.

---

## 2. What this pass actually did

**28 entries closed. 106 remain, every one of them with a reason stated in its
own entry.** No entry was closed on "it should be fixed by now"; no test was
skipped, quarantined or weakened; no ceiling was loosened to make a run pass; no
production claim is made that this repository cannot support.

The method was the same for every closure, and the fourth step is the one that
did the work:

1. read the entry's **literal closing condition**, not its title;
2. implement at the **narrowest authority** that makes the failure structurally
   impossible;
3. write the test **as the closing condition**;
4. **falsify it** — patch the implementation back to its previous shape, run the
   test, record the exact failure; restore; re-run;
5. write the falsification into the entry and the commit message.

Step 4 caught a test of this pass's own that could never have failed (§7), which
is the reason it is not optional.

---

## 3. Debt grouped by root cause

Eight groups. The grouping is the useful output: sixteen of the twenty-eight
closures were **four shared authorities**, not sixteen local repairs.

### 3.1 One calendar day — DEBT-52, DEBT-152, DEBT-154

The register said *"three copies of calendar-day arithmetic in the kernel"*.
**There were eight**, plus a ninth derivation of the week start. Each was
correct; nothing made them agree tomorrow.

`app/kernel/datetime/calendar-day.ts` is now the one authority, and it publishes
**both** parse contracts deliberately — a throwing `calendarEpochDay` and a
round-tripping `tryCalendarEpochDay` that refuses `2026-02-31`, because the two
callers genuinely need different answers. Every domain keeps its own **wording**
(`addDaysToIsoDate`, `addPlanningDays`, `shiftCalendarDate` — which still throws
`TaskValidationError`, not `RangeError`): one implementation, not one vocabulary.

A **source ratchet** in `test/unit/datetime/calendar-day.test.ts` fails if a
tenth copy appears.

The week start was the same defect one layer up: Today's strip, Plan's week,
Habits' week and Review's weekly period were four reads of "this week", and
Today's was hard-coded to Monday. `test/unit/planning/one-week-start.test.ts`
asserts all four agree for **both** `monday` and `sunday` across five dates —
**6 of its 12 assertions fail against the previous implementation.**

### 3.2 The server's answer is the answer — DEBT-89, DEBT-187

Two surfaces decided for themselves whether a mutation had succeeded.
`taskCompletionOutcome` is now one pure function over the response, and Reviews'
`set_status → completed` delegates to the same `completeReview` the explicit
command uses — so a path to "completed" can no longer skip the Review snapshot.

### 3.3 Bounded reads — DEBT-59, DEBT-65, DEBT-124

Three N+1s and an unbounded fan-out, each fixed in the repository rather than at
the call site: `listOpenTaskIds` (chunked at D1's parameter limit),
`#itemsFor` (one grouped read per page), and `listForEntities` (a `UNION ALL`
with `ROW_NUMBER() OVER (PARTITION BY …)` so **each anchor** is truncated rather
than the page). `MAX_TASK_LOOKUPS` — a cap that silently dropped obligations —
was deleted rather than raised.

### 3.4 Accessibility names and targets — DEBT-26, DEBT-50, DEBT-60, DEBT-185

A rendered GFM task-list checkbox now carries an `aria-label` derived from its
own item text (added to the frozen sanitisation allowlist, and the injection test
was rewritten to assert **escaping** rather than absence). The coarse-pointer
media query that reveals card and overflow actions now also matches
`(pointer: coarse)` and `(max-width: 48rem)` — measured at **32×32**, not the
28px the register recorded. Help and About gained mobile top-bar titles. The
shared `Picker` option publishes its `ariaLabel`.

### 3.5 Dead surfaces and stale entries — DEBT-104, 113, 114, 129, 132, 133, 134, 142

An unreachable `/today/plan` route deleted; `CardPresentation` narrowed to
`"list"` with the grid and board CSS and their fixtures removed; `insights.css`
renamed to `charts.css`; four token entries verified already resolved.

### 3.6 The Markdown editor's handoff — DEBT-202

The enhanced editor now starts from the **fallback's own value** rather than the
`value` prop it mounted with, carries the caret, and **reports the adopted text
upward** so the form agrees with the editor instead of saving over it. The
fallback was not touched: it is what makes the field work before JavaScript.

### 3.7 CI determinism — DEBT-204, DEBT-200

The gate lost a run to a truncated `pnpm` download on a documentation-only
commit. pnpm is now materialised **before** `setup-node`'s cache probe, with a
bounded, loud retry — not a generic one. Three E2E journeys that reported green
by never running now execute; the third's recorded cause was **wrong** (§4).

### 3.8 Rules that were conventions — DEBT-33, 40, 94, 99, 130, 172, 174

Six entries, one shape: a rule the product had **stated** and nothing
**enforced**. Each is now a mechanism.

| Entry | The rule | What now enforces it |
|---|---|---|
| DEBT-174 | ADR-108: a whole-document autosave carries a base version | an inventory over the tree; a fourth surface without one fails |
| DEBT-99 | one state-layer implementation | a ratchet that may only shrink — 27 → 1 |
| DEBT-130 | a drawer publishes a record's type once | an inventory over the twelve hosts |
| DEBT-40 | a colliding migration number is cited by filename | a scan of every `.md` under `docs/` |
| DEBT-172 | the worker and its manifest are bounded separately | two ceilings, plus one that they account for the served file |
| DEBT-33 | a preference change belongs in the history | one helper every write goes through |
| DEBT-94 | what the export cannot carry is NAMED | an unconditional limitation, and a test that the omission stays narrow |

---

## 4. Entries that were already resolved, or whose facts were wrong

The register is unusually careful, and it was still wrong in nine places. Each
correction is recorded in the entry itself.

- **DEBT-67** — *"seven curated themes"*. There are **five generated colour
  schemes**; the file the entry cites (`theme-preference.ts`) does not exist.
  THEME-01 shipped exactly the consolidation the closing condition asked for, and
  the eight-fold authoring tax it was raised about is gone: a scheme is generated
  from a seed, so a new token is authored once. **Resolved, no code change.**
- **DEBT-142** — resolved by PR #211, and its closing condition had become
  actively *wrong*: it asks that the generator stop emitting `area-accent-*`,
  which is now the machinery **beneath** `--dh-color-area-N`. Doing what it says
  would delete the identity ramp.
- **DEBT-129, 132, 133, 134** — resolved; register stale.
- **DEBT-08** — *"relationships are not yet universally visible in the UI"*.
  Nine record types mount the shared `LinkedItemsTab`, which reads the graph from
  either endpoint. What remains is that the **prose-reference** backlinks surface
  is Notes-only — one presentation, not a second relationship model.
- **DEBT-46** — asks for a decision between two options and says *"decide it
  deliberately"*. **Option two was taken**: DS-08's card family has `TimelineItem`
  as a first-class member, and its own header names Diary as a surface it exists
  for. The entry becomes a bounded adoption (the primitive needs three slots), not
  an open design question.
- **DEBT-32** — describes a persistence seam for code that no longer exists;
  `rg "useTodayLayout" app` returns nothing.
- **DEBT-01** — its premise (*"one configurable shared Card; every entity renders
  through it"*) is no longer the architecture. One Card became a family of five,
  deliberately.
- **DEBT-200** — **the most useful correction in the pass.** It records the
  pagination journey as skipping because *"the seeded workspace holds a single
  page of active tasks"*. Measured on the E2E database: the workspace holds
  **119** active Tasks against a page size of **50**. The real cause is that
  `?system=active` resolves the All-active built-in, which UIX-01 gave a
  `due_state` grouping — and a grouped view draws **no "Load more" control at
  all**. No fixture was needed; `group=none` was. A future agent would have built
  a fixture of fifty-one Tasks and changed nothing.
- **DEBT-130** — its stated reason for not being fixed (*"a shared-shell
  decision"*) was the wrong diagnosis. The shell already renders its description
  only when given one; twelve hosts each wrote the heading out by hand.
- **DEBT-172** — the register cites `SERVICE_WORKER_MAX_BYTES` as one ceiling
  with forty bytes of headroom. Correct, and the fix was to split it, not raise it.

**Read the register's causes as claims to check, not as findings.**

---

## 5. Product decisions taken

Three, all small and all inside an existing authority. Nothing here needed an
ADR, and that is the test each was held to: *is this durable enough that a future
reader must be told, or is it the obvious reading of a rule already written down?*

1. **A preference change records WHAT changed and never what it changed to**
   (DEBT-33). The entry itself said values may be sensitive or identifying; a
   field-name allowlist is the smallest thing that satisfies both halves. A
   timezone is a location; a capture parent is a record id.
2. **A drawer's description must not restate its label** (DEBT-130). A dialog
   whose `aria-describedby` says "Task record" under a label saying "Task" has
   told a screen-reader user nothing twice.
3. **A colliding migration number is cited by filename; a non-colliding one is
   not** (DEBT-40). The narrow rule, because "every migration reference must be a
   filename" would be noise, and noise is what the next author routes around.

**Decisions deliberately NOT taken** are as much a part of the record: whether
`/goals` is the Alignment view or the outcomes gallery (DEBT-120); whether
Areas and Projects carry a description (DEBT-98/137 — one decision, two entries);
whether the M3X expressive hierarchy survives DHDS (DEBT-122); whether a Person
timeline shows a linked record's events or only their own (DEBT-44); whether
`open` or `active` is the spine word (UIQ-012). Each is the owner's, and each now
says so in its own entry.

---

## 6. What was closed

**28 entries.** In priority order, then by number.

| Entry | P | How it closed |
|---|---|---|
| DEBT-89 | P2 | the server's answer, one pure function |
| DEBT-174 | P2 | an inventory test; falsified by writing the fourth surface |
| DEBT-187 | P2 | one `completeReview`, so no path skips the snapshot |
| DEBT-202 | P2 | the enhancement adopts the fallback's value and reports it |
| DEBT-26 | P3 | `aria-label` from the item's own text, allowlisted |
| DEBT-33 | P3 | field names in the history, never values |
| DEBT-40 | P3 | filenames, and a scan that keeps them |
| DEBT-50 | P3 | coarse-pointer and narrow-width reveal (measured 32×32) |
| DEBT-52 | P3 | one calendar-day authority, plus a ratchet |
| DEBT-59 | P3 | `listOpenTaskIds`, chunked; the silent cap deleted |
| DEBT-60 | P3 | Help and About get mobile titles |
| DEBT-65 | P3 | one grouped read per Meetings page |
| DEBT-67 | P3 | **already resolved** by THEME-01 (ADR-089) |
| DEBT-94 | P3 | the export names the setting it deliberately does not carry |
| DEBT-104 | P3 | the unreachable route deleted |
| DEBT-113 | P3 | `CardPresentation` narrowed to `"list"` |
| DEBT-114 | P3 | `insights.css` → `charts.css` |
| DEBT-124 | P3 | per-anchor truncation in SQL, not per page |
| DEBT-129 | P3 | **already resolved**; register stale |
| DEBT-130 | P3 | one `TASK_DRAWER_TITLE`; the description removed |
| DEBT-132 | P3 | **already resolved**; register stale |
| DEBT-133 | P3 | **already resolved**; register stale |
| DEBT-134 | P3 | **already resolved**; register stale |
| DEBT-142 | P3 | **already resolved**; closing condition had become wrong |
| DEBT-152 | P3 | one week start, honouring `firstDayOfWeek` |
| DEBT-154 | P3 | the same, across Today / Plan / Habits / Review |
| DEBT-172 | P3 | two ceilings, plus one that they account for the served file |
| DEBT-185 | P3 | the shared `Picker` publishes its option's name |

Three further entries **advanced materially and stayed ◐**, which is the honest
status rather than a pass:

- **DEBT-99** — 26 of the 27 remaining hand-rolled state layers converted; the
  ratchet is at **one**, and the one has a reason written beside it (a full-bleed
  opaque row band is not a translucent layer, and converting it is a Card change
  with a visual consequence).
- **DEBT-200** — all three journeys now execute and pass; the artefact-level
  demonstration is a `main` run.
- **DEBT-204** — the mechanism is fixed and pinned by five assertions; the
  demonstrating run is a `main` run.

---

## 7. Two things this pass got wrong, and how

Recorded because a closure pass that reports only its successes is the thing
this register exists to prevent.

**A test that could never fail.** `review-status-completion.test.ts`'s central
claim — *"the two paths are the SAME act"* — seeded two Reviews for the **same
week**. `create` is idempotent per `(type, period)`, so it was asserting about
**one** Review completed twice, and would have passed against the defect. Fixed
by giving each seed its own week and asserting `viaField !== viaCommand`;
falsification then produced two failures instead of one.

**A race that does not reproduce locally.** DEBT-202's E2E journey passed against
the *previous* implementation when run here, and the entry says so plainly. It is
a guard on the un-waited path, not the demonstration; the demonstration is the
unit test on the decision function, which fails four of seven assertions against
the old rule.

---

## 8. What remains open, and why — all 106

Every entry below carries, in `PRODUCT_DEBT.md`, a current issue, an impact, a
desired future state, a closing condition, the reason it is still open and a
roadmap or future home. **Twenty-three of them did not on 2026-08-25 and now do.**

### 8.1 Owner-blocked — 4 entries, and all three P1s among them

Nothing repository-side is owed. Each needs an action only the owner can take.

| Entry | P | The exact blocker |
|---|---|---|
| DEBT-198 | P1 | `BACKUP_ENCRYPTION_PASSPHRASE` is not set in the protected `production` GitHub environment, and a copy of the key must be held **off GitHub** — which is why an automated environment cannot satisfy it even if it could write the secret |
| DEBT-199 | P1 | the remote-restore probe needs `wrangler` authenticated as the owner **and** one real decrypted artefact, which DEBT-198 means does not exist |
| DEBT-139 | P1 | a pre-`0042` backup is **permanently unachievable** — `0042` was applied on 2026-08-16 with none taken. The entry's own reframing is left for the owner: the risk did not get avoided, it happened, six times |
| DEBT-84 | P3 | `verify:production` needs Cloudflare credentials; `wrangler whoami` reports not authenticated |

**No production evidence is claimed anywhere in this pass.**

### 8.2 Blocked on a `main` gate run — 6 entries

Each has had its repository-side work done and cannot produce the run from a
branch.

`DEBT-125` (P1, two consecutive green `main` runs) · `DEBT-157` (P1, the
confirming run for a mechanism HARDEN-06A closed) · `DEBT-203` (P2, ten
consecutive runs on one tree) · `DEBT-76` (P2, ten consecutive green `main` runs;
its named cause — `chrome-headless-shell` — was fixed by `channel: "chromium"`
and the fix is holding) · `DEBT-200` (P2, artefacts with no annotated skip) ·
`DEBT-204` (P2, a run where no job fails before `Install dependencies`).

DEBT-76's preferred remedy is `retries` on a browser crash. **It was not taken**,
because the brief for this pass forbids generic retries and the entry's own
condition is a measurement, not a mechanism.

### 8.3 Owned by a scheduled V2.4 item — 13 entries, deliberately untouched

The roadmap is not distorted to accommodate a cleanup pass. These are in scope
for an item that has not run yet, and taking them here would consume that item's
scope.

- **V2.4-GATE-02** — DEBT-194 (and DEBT-164, which it supersedes; *do not work
  them as two items*), DEBT-197, DEBT-193.
- **V2.4-GATE-02 non-goals, recorded as such** — DEBT-162, DEBT-163.
- **FOLLOW-01** — DEBT-34 (Review half), DEBT-156.
- **FOLLOW-02** — DEBT-78, DEBT-120, DEBT-192.
- **FOLLOW-02 explicit non-goals** — DEBT-183, DEBT-184.

### 8.4 A product decision the owner must make — 10 entries

UIQ-012 · DEBT-44 · DEBT-53 · DEBT-73 · DEBT-95 · DEBT-98 · DEBT-107 · DEBT-121 ·
DEBT-122 · DEBT-137.

Two notes. **DEBT-98 and DEBT-137 are one decision** (does a spine record carry a
short description?) recorded from two sides, and should be taken together.
**DEBT-95 is not deferred for difficulty**: its closing condition is *"a dedicated
PR amending `AGENTS.md`"*, which is that file's own closing rule, and folding a
constitutional amendment into a debt pass is exactly what the rule forbids.

### 8.5 Future features, not implementation debt — 28 entries

§12 of this pass's brief: *do not automatically implement deferred feature ideas.*
Each of these is a capability the product deliberately does not have, recorded so
the deferral stays visible rather than being rediscovered as an omission.

DEBT-35 (Asset attachments, OCR, ingestion) · DEBT-48 and DEBT-182 (a canonical
tag model) · DEBT-77 · DEBT-91, DEBT-92, DEBT-93 (AI capability) · DEBT-102 ·
DEBT-109 · DEBT-145 · DEBT-153 · DEBT-155 · DEBT-160, DEBT-161 · DEBT-165, DEBT-166, DEBT-167,
DEBT-168, DEBT-169, DEBT-170, DEBT-171 (templates, dependencies, recurrence) · DEBT-188, DEBT-189, DEBT-190, DEBT-191
(manual ranking and drag destinations) · DEBT-195 (a recency source Search does
not have) · DEBT-58 · DEBT-138.

**DEBT-188 deserves naming.** A manual ranking model for Tasks is the largest
deliberate omission in the register, and DHDS-11 declined to invent one. This
pass declines too, for the same reason: a ranking model is a domain concept with
persistence, conflict and export consequences, and no product evidence has asked
for it.

### 8.6 Evidence-triggered — 8 entries

A threshold, not a date. Fixing them now would be speculative generality.

DEBT-13 (a second storage adapter) · DEBT-61 (D1 exposes no cross-statement read
snapshot — **platform-blocked, not deferred**) · DEBT-62 (a workspace approaching
50,000 rows or 64 MiB) · DEBT-75 · DEBT-136 · DEBT-140 · DEBT-151 · RECORD-02 (a
second reason for the tab to exist).

### 8.7 Bounded implementation debt not taken, each with its reason — 37 entries

The largest group, and the honest one: these **could** be fixed, and were not,
because each needs a change to a shared surface that deserves its own review.

DEBT-01, DEBT-02, DEBT-07, DEBT-08 (the four V1-inheritance containers, each now
holding one named residual) · DEBT-14, DEBT-15, DEBT-56, DEBT-123 (four
accessibility rules disabled in the axe gate, each for a stated reason; **the
gate disables no rule silently**) · DEBT-18 · DEBT-20 · DEBT-25 · DEBT-31 ·
DEBT-32 · DEBT-46 · DEBT-51 · DEBT-54 · DEBT-55 · DEBT-69 · DEBT-70 · DEBT-71 ·
DEBT-74 · DEBT-99 (one entry left on the ratchet) · DEBT-100 · DEBT-103 ·
DEBT-128 · DEBT-141 · DEBT-146 · DEBT-147 · DEBT-150 · DEBT-159 · DEBT-173 ·
DEBT-175 · DEBT-176 · DEBT-178 · DEBT-181 · DEBT-186 · RECORD-03.

Three of these are worth a sentence each, because they are the strongest
candidates for the next pass:

- **DEBT-51** — the shared overflow menu escapes its card by z-index rather than
  by leaving the stacking context. Every future container that establishes one
  needs its own `:has()` patch. The fix is a portal or the native `popover`
  attribute; **nothing in `app/shared/` portals today**, so it is the first case
  that forces the decision.
- **DEBT-175 with DEBT-128** — one root cause: a Task is rendered as a Card on
  three surfaces and as the shared `TaskRow` everywhere else, so one object has
  two anatomies. They should close together.
- **DEBT-146** — two third-party credential stores with two different
  protections. Low exposure today; what it costs is that *"how does DalyHub
  protect a third-party credential?"* has no one-sentence answer, and the weaker
  answer is the one a third integration will copy.

---

## 9. Final register counts

| | At `0e5f8ea` | After this pass |
|---|---|---|
| Open (☐ or ◐) | 134 | **106** |
| Resolved (☑) | 79 | **107** |
| P1 open | 5 | 5 |
| P2 open | 27 | 24 |
| P3 open | 100 | 75 |
| P4 open | 2 | 2 |

**The next free debt ID is `DEBT-205`**, re-derived from the file at the end of
this pass. No entry was renumbered, no resolved entry was deleted, and no
historical evidence was removed — only claims that had stopped being true, each
replaced with what is.

### The five P1s are unchanged, and that is correct

Not one of them is fixable in this repository. Three are owner-blocked on
production access or an owner-held secret; two are blocked on a `main` gate run.
Every repository-side half of all five is done.

---

## 10. What "finished" means here

The target was **zero unexplained or actionable debt**, not zero open debt.

- **Actionable and unfixed: none that this repository can fix now.** Every
  remaining entry is owner-blocked, blocked on a `main` run, owned by a scheduled
  roadmap item, a decision the owner must make, an evidence trigger, a future
  feature, or bounded work whose reason for waiting is written in the entry.
- **Unexplained: none.** Every open entry answers six questions. Twenty-three did
  not before this pass.

**This is not "all debt resolved", and it should not be read as one.** 106
entries are open. What changed is that a reader can now go to any one of them and
learn, without re-deriving it, what it costs, what would close it, and who has to
act.
