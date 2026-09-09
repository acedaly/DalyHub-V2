# ROADMAP_V2_16.md — DalyHub V2.16, CONSOLIDATE

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md)
> hold V2.1 … V2.8; [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) holds V2.9 INSIGHT
> **and the remaining V2 sequence**; [`ROADMAP_V2_10.md`](ROADMAP_V2_10.md)
> holds V2.10 LIFE ADMIN; [`ROADMAP_V2_11.md`](ROADMAP_V2_11.md) V2.11
> EVIDENCE; [`ROADMAP_V2_12.md`](ROADMAP_V2_12.md) V2.12 FINANCE CORE;
> [`ROADMAP_V2_13.md`](ROADMAP_V2_13.md) V2.13 REPORTS;
> [`ROADMAP_V2_14.md`](ROADMAP_V2_14.md) V2.14 GROUNDED AI;
> [`ROADMAP_V2_15.md`](ROADMAP_V2_15.md) V2.15 ASSISTED AI.
>
> **This file is V2.16, the last release of V2, and it is where new work goes.**
> It was defined on 2026-09-08 against `main` at `06f57c1` (V2.15 ASSISTED AI,
> PR #273) by a pass that re-measured navigation, the route and command
> registries, the D1 schema, the export and restore registries, the R2 object
> lifecycle, the workspace resolver, the debt register and the open pull
> requests, rather than inheriting the PRESUMPTIVE sketch in
> [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v216--consolidate-presumptive--the-v3-readiness-release).
> **Where that sketch and this file disagree, this file wins**, and every
> disagreement below is stated with the measurement that produced it.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.16 CONSOLIDATE — see [Programme status](#programme-status).**

**Successor: V3 — a definition / product-strategy pass. Nothing in V3 is built
here.**

---

## The theme: CONSOLIDATE — one product, one map

V2.9 through V2.15 added, deliberately and in sequence, a history layer, a
Life Admin domain, an attachment platform, a Finance core, a performance
pass, a Reports engine, grounded AI and assisted AI. Seven releases in four
days of programme time, each of which passed its own gate.

V2.16 asks a different question, and it is the only question left before the
V3 boundary:

> **Is DalyHub still one product, or is it seven successful modules that share
> a database?**

This release owns six things and no others:

1. **information architecture** — the rail answers a question, not a shape;
2. **whole-product recovery** — one rehearsal, D1 and R2 together, proved by
   machine values rather than by row counts;
3. **the deletion / purge boundary** — decided, not discovered;
4. **product-debt disposition** — every open entry has exactly one home;
5. **architectural retirement** — what two releases left behind, removed;
6. **the V3 boundary** — measured clause by clause, TRUE or FALSE, never
   "mostly".

It owns **no new capability**. Not one.

**The design test.** Take any change in this programme and ask: *does an owner
get something DalyHub could not do yesterday?* If the answer is yes, it does
not belong in V2.16. The owner-visible outcome of a consolidation release is
that the product is easier to find your way around, provably recoverable, and
honest about what is not finished — never that it does more.

---

## Phase 0 — the product as it actually is, measured

Measured 2026-09-08 against `main` at `06f57c1`, before any edit.

### Size

| Surface | Files | Lines |
|---|---|---|
| `app/**` (`.ts` + `.tsx`) | 1,596 | 376,676 |
| `migrations/*.sql` | 57 | — |
| `test/unit/**` + `test/kernel/**` | — | see [Full verification](#full-verification) |
| `e2e/**` | 215 entries | — |

Largest single files: `d1-task-repository.ts` (8,745), `scheme.ts` (2,870,
generated), `d1-finance-repository.ts` (2,850), `d1-obligation-repository.ts`
(2,630), `d1-workspace-restore-repository.ts` (2,344), `TodayScreen.tsx`
(2,170), `TasksWorkspace.tsx` (2,046). **None of them is split by this
release.** Line count is not a defect; blurred ownership is, and none of these
files has more than one owner. See [Refused](#refused-in-v216).

### Navigation, as shipped

**24 navigable destinations in four groups**, derived from
`meta.navLabel` / `navGroup` / `navOrder` in each module's own
`routes.manifest.ts` and assembled by `buildNavigationModel`
(`app/platform/modules/navigation-adapter.ts`). Only `organise` and `more`
carry a heading; `daily` and `system` are separated by rhythm alone.

| Group | Entries (in `navOrder`) |
|---|---|
| `daily` | Today 5 · Plan 7 · Inbox 10 · Upcoming 20 · Tasks 30 |
| `organise` | Projects 110 · Goals 120 · Habits 125 · Areas 130 · Notes 140 · Diary 150 · Meetings 160 · People 170 · Insight 180 · Reports 185 |
| `more` | Finance 210 · **Views 210** · Life Admin 215 · Assets 220 · Reviews 230 · AI 240 |
| `system` | Settings 300 · Help 310 · About 320 |

Two findings the measurement produced, neither of them in the sketch:

- **`navOrder` 210 is claimed twice.** Finance and Views collide, and the tie
  is broken by registry list position — that is, by module discovery order,
  which is a glob. Two rows of the rail are in the order they are in by
  accident.
- **`more` is the second-largest group and holds nothing in common.** Money,
  commitments, possessions, reflection, AI and a saved-perspective tool. It is
  not a question; it is a leftovers drawer, which is what
  [§6 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#6-information-architecture)
  predicted it would become.

Three stale manifest comments still name the **retired** `capture` and
`insight` groups (Notes, People, Meetings, Reviews, AI), which were re-cut by
PX-03 and never removed. Documentation debt, fixed here.

**Mobile.** Three earned bottom-bar slots — Today (10), Tasks (20), Projects
(30) — plus Capture and More, capped by `MOBILE_PRIMARY_DESTINATION_LIMIT = 3`
in `app/shared/shell/mobile-navigation.ts`. Measured and **unchanged by this
release**: nothing in a regroup earns a phone slot.

### The command palette

Grouped by **kind** — Suggested / Current context / Actions / Navigation
(`app/shared/commands/grouping.ts`) — never by navigation taxonomy. There is
therefore no second taxonomy to reconcile, and V2.16 does not create one. The
module label a palette row wears comes from the catalogue, which reads the
registry, so the rail and the palette cannot disagree about a module's name.

**No user-visible "Analytics" string survives anywhere in `app/`.** RPT-04
relabelled the module `Insight` and kept `/analytics`; every remaining
occurrence of the word is a source comment or an identifier. A test now pins
that.

### The D1 schema

**60 tables** after 57 migrations (derived by replaying every
`CREATE` / `DROP` / `RENAME` in order, and confirmed against `sqlite_master`
in the Workers test runtime).

The workspace snapshot carries **43 paginated collections** plus `workspaces`,
`owner_app_preferences` and `task_saved_views` — **46 tables**. The remaining
**14** are excluded, and `EXPORT_EXCLUSIONS`
(`app/platform/export/manifest.ts`) names the exclusion in **prose, for a
human**. Nothing in the repository checks that the prose covers the schema.

> **This is the single most important finding of the Phase 0 pass.** The
> archive is complete today by inspection, not by construction. A future
> migration can add a table holding owner data and no test will notice that it
> cannot leave the product. CONSOL-02 closes it.

### Export, restore and the R2 lifecycle

- `SNAPSHOT_COLLECTION_ORDER` is total and fixed; `RETIRED_SNAPSHOT_COLLECTIONS`
  and `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` are append-only statements about
  archives already on disk.
- `d1-workspace-restore-repository.ts` holds `TABLES`, the collection → table +
  columns descriptor map, and clears a workspace by walking
  `STAGED_COLLECTIONS` **in reverse** — children strictly before parents. That
  reverse walk is the only proven whole-workspace delete order in the
  repository, and CONSOL-01 and CONSOL-02 both build on it rather than writing
  a second one.
- Attachments live in a private `ATTACHMENTS` bucket under a deterministic
  per-workspace prefix, with a purge ledger (`attachment_object_purges`), a
  sweep, and orphan / missing audits — all shipped by V2.11 and reused here.
- Two rehearsals already exist and pass: `attachment-restore-rehearsal.test.ts`
  (real bytes, real R2, real destruction) and `finance-archive-rehearsal.test.ts`.
  **Neither is whole-product**, and neither compares a derived owner-facing
  value across the round trip.

### Workspace deletion, measured

The strategy left CONSOL-01 as a genuine choice. The measurement settles it,
and the deciding fact was not in the sketch:

**`createConfiguredWorkspaceContextResolver` resolves exactly one workspace
from server configuration, confirms it exists, and has no auto-create and no
fallback** (`app/platform/workspaces/configured-context-resolver.ts` step 3).
There is no workspace-creation surface anywhere in the product. Deleting the
configured workspace row from inside the product therefore leaves every
authenticated request failing `WorkspaceNotFoundError`, with **no in-product
path back**. A "Delete workspace" button in Settings would be a button that
destroys the application that draws it.

See [CONSOL-01](#consol-01--settle-the-workspace-deletion-boundary-) for the
decision and what ships instead.

### Debt

**98 open entries** (`☐` or `◐`) in
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — 95 carrying a `DEBT-nnn`
id and three carrying an older prefix (`UIQ-012`, `RECORD-02`, `RECORD-03`),
which is why a count of the ids alone reads three short. The oldest was
raised 2026-07 and the newest by V2.15. They are not uniform: some are
owner-held operational gates, some are refused capability recorded honestly,
some are genuine correctness defects, and some have premises a later release
invalidated. CONSOL-03 gives each exactly one home.

### Open pull requests

Four, measured 2026-09-08: **#230**, **#265**, **#266**, **#268**. Their
disposition is [below](#open-pull-requests--disposition).

---

## What V2.16 is, and what it deliberately is not

### The five items

| Item | Owns |
|---|---|
| **CONSOL-00** | The question-first rail, at every width and appearance |
| **CONSOL-01** | The workspace deletion / purge boundary, decided and proved |
| **CONSOL-02** | Whole-product recovery, and total store classification |
| **CONSOL-03** | Every open debt entry given exactly one home |
| **CONSOL-04** | Retirement of what V2 left behind |

Plus **V3-BOUNDARY**, which is not an implementation item: it is the gate.

### Kept from the sketch

All five directional items are kept. The sketch was right about what
consolidation is.

### Changed from the sketch

1. **CONSOL-00's grouping is taken from
   [§6 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#6-information-architecture),
   not from the roadmap's one-line summary.** The roadmap sentence says
   "Views under system"; the strategy's table also puts **Assets** under *Deal
   with* (a possession is a thing you deal with — its rego, its service, its
   insurance — and every one of those is an Obligation) and **Reviews** under
   *Understand* (a Review is reflection, not organisation). Both are adopted.
2. **CONSOL-01 resolves to the second of its two permitted outcomes** — a
   recorded decision that deletion is an infrastructure act — on the
   measurement above, and it ships a **proved** procedure rather than a
   documented one. See the item.
3. **CONSOL-02 grows a second half the sketch did not name**: total store
   classification. A rehearsal proves the stores it knows about; a
   classification registry proves there are no others. Without the second, the
   first expires at the next migration.
4. **CONSOL-03 adds a disposition report as an artefact**, not merely edited
   entries, so "no ambiguous open debt" is a checkable claim rather than a
   feeling.

### Refused in V2.16

Named here so a later reader can see they were considered and refused, not
missed:

| Refused | Why |
|---|---|
| Splitting `TodayScreen.tsx` / `TasksWorkspace.tsx` / `d1-task-repository.ts` | Large, single-owner, well-tested. A split with no ownership problem to solve is churn that invalidates every blame line and every test path for nothing. AGENTS.md §13: no drive-by refactors. |
| A "Delete workspace" button | It would destroy the application that draws it (see above). |
| Asset valuation history (DEBT-250), Area-at-completion (DEBT-251), the standing duplicate read (DEBT-252) | New capability and new stored history. Re-homed to V3. |
| A CSS split for DEBT-249 | Measured, not guessed — see the item. Speculative CSS surgery in a consolidation release is exactly the "another performance release disguised as consolidation" the programme forbids. |
| Any change to `/analytics`, `/finance`, `/reports`, record routes or saved-view URLs | A relabel is not a migration. Bookmarks keep working. |
| Merging Search into *Understand* | Search is a utility over every domain, not a domain. It stays where it is. |
| Expanding Views | Views is secondary and stays secondary. It moves group and gains nothing. |

---

## The items

### CONSOL-00 — organise the product around its five questions ☑

**The rail answers a question.** Six groups, five of which are questions and
one of which is the machine:

| Group | Heading | Entries, in order |
|---|---|---|
| `do` | **Do** | Today · Plan · Inbox · Upcoming · Tasks |
| `organise` | **Organise** | Projects · Goals · Areas · Habits · Notes · Diary · Meetings · People |
| `deal-with` | **Deal with** | Life Admin · Assets |
| `money` | **Money** | Finance |
| `understand` | **Understand** | Insight · Reports · Reviews · AI |
| `system` | *(none)* | Views · Settings · Help · About |

**No group name becomes a route.** There is no `/do`, no `/organise`, no
`/deal-with`. A group heading is navigation structure; inventing a page to
justify a label is how a taxonomy becomes a product surface nobody asked for.

**Ordering is intentional, and stated.** Within `do`, the order is the day:
the surface you open, the week you plan, the queue you triage, what is coming,
everything. Within `organise` the spine leads (Projects → Goals → Areas),
then the behaviour domain, then the record modules in the order they are
created in a life. Within `understand`, the range you steer (Insight), the
questions you saved (Reports), the periodic ones (Reviews), the explanation
(AI). `navOrder` is re-cut to leave a gap between groups so the next module
lands somewhere on purpose, and the **Finance/Views collision is gone**.

**Routes do not move.** Every href is unchanged, `/analytics` included. This
item edits `meta.navGroup` and `meta.navOrder` and one shell component. A
`git diff` that touches a `path:` is a bug in this item.

**The phone bar is unchanged** — Today · Tasks · Add · Projects · More — and a
test asserts it, because the most likely accident in a regroup is a fourth
module quietly earning a slot.

**Accessibility.** The rail's grouping stops being decorative. Each group's
destinations become their own `<ul>` labelled by its own heading, so a screen
reader announces *"Money, list, 1 item"* on entry and never repeats the group
per row; the `system` block, which has no visible heading, carries an
`aria-label`. Keyboard order matches visual order because the DOM order is the
visual order. No accordion, no fake buttons, no landmark per group.

**`prefetch="intent"` survives the rebuild** — the shared
`PRIMARY_NAV_PREFETCH` policy is applied by one component, and
`navigation-prefetch.test.tsx` is extended to assert it on **every** rendered
row rather than on a sample.

### CONSOL-01 — settle the workspace deletion boundary ☑

**Decision: workspace deletion is an infrastructure act, and DalyHub says so.**
Recorded as **ADR-124**, closing [DEBT-242](../product/PRODUCT_DEBT.md).

Three measured reasons, in order of weight:

1. **A product deletion path would destroy its own application.** One
   configured workspace, resolved server-side, no auto-create, no creation
   surface. The owner would be left with a 503 and a `wrangler` command — which
   is where they started, minus their data and minus the app.
2. **The product cannot honestly complete the act.** R2 object removal is
   *queued* through the purge ledger and completed by a sweep; the backups
   bucket is deliberately unreachable from the application Worker
   ([ADR-119](../decisions/ARCHITECTURE_DECISIONS.md), `wrangler.jsonc`). A
   button that says "deleted" while bytes remain in two buckets is a lie with
   a progress spinner.
3. **The blast radius is wrong for the guarantee.** Fifteen tables outside the
   snapshot, two object stores and a service binding, orchestrated from a
   request that can be interrupted, with no cross-store transaction. ADR-046's
   Area purge is the precedent, and it is a precedent for a *bounded* purge of
   one record family — not for the whole workspace.

**What ships instead is not a paragraph.** Documentation that has never been
executed is a hypothesis:

- **`workspace-data-map.ts`** — the classification registry (see CONSOL-02),
  which derives an ordered, total **purge plan**: every table in the schema,
  with its workspace scope, children strictly before parents.
- **`pnpm run workspace:purge:plan`** — emits that plan as reviewable SQL for
  an operator. It is a *generator*; it opens no database and deletes nothing.
- **A kernel test that executes the plan** against an isolated synthetic
  workspace, over real D1 and real R2, and proves: zero rows remain in every
  workspace-scoped table, every attachment object under the workspace prefix
  is gone, **a second workspace in the same database is untouched**, and the
  plan is derived from the registry rather than hand-kept.
- **[`WORKSPACE_DELETION.md`](../development/WORKSPACE_DELETION.md)** — the
  operator procedure, the exact commands, what the backups retention policy
  does and does not promise, and the verification step.
- **Settings copy corrected** — "workspace deletion … not built yet" becomes a
  statement of the boundary with a link, because the old sentence said *not
  yet* about something that is now decided.

**No tombstone.** A tombstone exists to prove a deletion happened and to stop
id reuse. When the deletion is `wrangler d1 delete`, the database is gone and
there is nothing left to hold a tombstone — Cloudflare's own audit log is the
record. Inventing a row in a database that no longer exists is theatre. This is
recorded in the ADR rather than left as a silence.

**Backups retention, stated plainly.** Deleting live DalyHub removes the live
D1 rows and the live R2 objects. It does **not** reach into
`dalyhub-v2-backups`, whose lifecycle rules are the retention policy; those
copies expire on their own schedule. DalyHub does not claim cryptographic
erasure from historical backups, because it does not provide it.

### CONSOL-02 — prove whole-product recovery ☑

Two halves. The second is what stops the first expiring.

#### (a) Total store classification

**`app/kernel/export/workspace-data-map.ts`** — one registry classifying
**every** table in the D1 schema:

| Class | Meaning | Rule |
|---|---|---|
| `exported` | Owner data | **must** round-trip; names its snapshot collection |
| `operational` | Owner-configurable or ledger data deliberately excluded | **must** state the reason |
| `ephemeral` | Staging that must never masquerade as owner data | **must** be empty between operations |
| `infrastructure` | Not workspace-scoped at all | — |

Proved by `workspace-data-map.test.ts`, in the Workers runtime against the
**real migrated schema** read from `sqlite_master`:

- every table in the database is classified, and every classified table exists;
- every `exported` table names a collection that is in
  `SNAPSHOT_COLLECTION_ORDER` (or is one of the three owner-scoped tables), and
  every collection has a table;
- every `operational` entry's reason is non-empty and is reflected in
  `EXPORT_EXCLUSIONS`;
- the derived purge order is total, and children precede parents under the
  real foreign keys.

> **There is no persistent owner-data table outside an explicit export
> policy** — and from now on a migration that adds one fails the build.

#### (b) The whole-product rehearsal

`pnpm run restore:rehearsal`, over **real D1 and real R2** in the Workers pool,
isolated, synthetic, and repeatable. It never touches a production database or
bucket, and there is no mock on any path under test.

The journey:

1. seed one synthetic workspace covering **every durable product domain**,
   derived from the snapshot registry rather than from memory;
2. compute a **pre-export truth manifest** — not row counts: derived,
   owner-facing values;
3. export the full archive; verify its integrity;
4. **destroy** the workspace (D1) and its objects (R2);
5. **prove it is gone** — zero rows, zero objects, and the export path itself
   refuses;
6. restore from the archive;
7. verify every restored collection, byte-compare every attachment;
8. **recompute the truth manifest and compare it to the pre-export one.**

**Derived truth parity** is the point of step 8, and it is what neither
existing rehearsal does. The manifest holds, at a frozen owner day in
`Australia/Sydney`:

| Domain | The fact compared |
|---|---|
| Tasks / Today | open, overdue and completed counts for the frozen day |
| Goals | the measurement series |
| Reviews | the insight-snapshot history |
| Obligations | open / due state and the next occurrence |
| Finance | account balances, month totals, category totals, budget variance, transfer exclusion, settlement |
| Reports | a saved definition's **machine result**, re-executed |
| Insight | a representative history series |
| AI | the **FactBlock** built from restored deterministic data, for a fixed period |

The AI clause needs no provider: a FactBlock is deterministic, which is the
whole of what V2.14 decided. If the numbers a model would have been given
differ after a restore, the restore is wrong — and that is checkable with the
provider switched off.

**Owner-day freeze.** Every derived figure is computed at a fixed instant in a
fixed zone through the existing deterministic clocks, including a date on the
far side of an `Australia/Sydney` DST transition. Otherwise the rehearsal is a
test that can fail because it ran tomorrow.

**Refusal corpus.** Cross-domain failures only — the per-collection cases are
already covered and are not duplicated: a required collection missing, an
unknown future collection, a corrupted attachment byte, a missing attachment
object, a bad checksum, a foreign workspace id, a duplicated identity, an
oversize archive, an unsafe path, a malformed Finance row, and an
incompatible saved-Report config.

**Scale is recorded, not optimised.** Archive size, object count and statement
count are measured and written down. If the rehearsal finds a limit, the limit
is stated. No integrity check is weakened to make a number smaller.

### CONSOL-03 — close or re-home the debt register ☑

Every open entry gets exactly one of five dispositions, and
[`PRODUCT_DEBT_V2_16_DISPOSITION.md`](../product/PRODUCT_DEBT_V2_16_DISPOSITION.md)
is the report:

| Disposition | Means |
|---|---|
| **CLOSED** | Its own stated closing condition is now satisfied, and the proof is named |
| **OWNER-GATED** | Code-side complete; an owner action or owner-held evidence remains |
| **V3** | Genuine new capability or architectural expansion, re-homed with a reason |
| **STRUCK** | The premise no longer holds, with the superseding ADR or release named |
| **OPEN** | Neither closeable nor re-homable — an exceptional case, and it must say why |

**A closure is a proof, never a rewording.** Each CLOSED entry's original
closing condition is quoted and satisfied. Entries whose closing condition is
owner-held — **DEBT-198** (the off-Cloudflare backup), **DEBT-203** (the
dispatched-run count), **DEBT-213** (the live provider reading), **DEBT-139**,
**DEBT-157**, **DEBT-204** — stay OWNER-GATED. This programme does not
manufacture evidence it cannot produce.

**No debt dumping.** Re-homing to V3 requires the entry to be new capability,
architectural expansion, owner-held activation, or explicitly outside V2's
scope. A small correctness defect is V2.16's to fix, and several are fixed
here.

### CONSOL-04 — retire what V2 left behind ☑

**The retirement rule.** A piece of architecture may be removed only when all
six hold: no current product path needs it; no supported compatibility
contract needs it; a canonical replacement exists; tests prove parity; docs
are updated; and removal does not narrow restore compatibility.

**Zero grep callers is not enough** for anything public. A route, an export
field or a URL shape is also checked against the route manifest, the tests,
the archive readers and the deep-link surfaces before it is removed.

**Migrations are history and are never deleted or squashed.**

**Export compatibility has a stated horizon**, written down for the first
time: DalyHub reads **every archive it has ever written**.
`RETIRED_SNAPSHOT_COLLECTIONS` and `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` are
append-only, and a test now asserts they are never shortened. Consolidation
must not come to mean *only yesterday's backup restores*.

**One-authority tests.** V2.16 leaves the repository able to prove there is
exactly one of each: Obligation recurrence, the attachment primitive, the
history vocabulary, the Report executor, the AI provider request path, the
proposal apply authority, entity destinations, the navigation model, the
Search provider registry, the export/restore collection registry, the Finance
balance derivation, transfer semantics and Task completion truth. Where a good
test already exists it is reused, not duplicated.

**Registry coherence.** One audit proves that every durable entity type is
registered everywhere it must be — destination, navigation if top-level,
Search policy, export/restore, Activity policy, identity, attachment
eligibility, AI eligibility — and that every exception is **named** rather
than absent. A new domain cannot become half-wired.

---

## The V3 boundary — a gate, not a feeling

Derived from
[§12 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#12-the-v3-boundary)
and from the product as it is. Every clause is **TRUE**, **FALSE**,
**OWNER-GATED** or **RE-HOMED**. The measured result lives in
[`V3_BOUNDARY.md`](../product/V3_BOUNDARY.md), which this release creates and
which the PR reproduces.

Two questions are asked separately, because they have different answers:

> **Can this repository legitimately say V2 is consolidated?**

and

> **Can V3 begin?**

An optional owner-held activation (a provider key, a GitHub environment
secret) does not hold architectural progression hostage — the strategy does not
make it a hard gate, and pretending otherwise would mean V3 can never begin
for a reason that has nothing to do with the code. What it *does* gate is
stated per clause: production Finance use, live AI use, or nothing.

---

## Falsification

Thirty deliberate breaks were promised. **Thirty-eight were taken** — eight
more because gaps found while running them, and while reviewing the pull
request, deserved their own breaks rather than footnotes. Each was applied to the real tree, run, and reverted; the working
tree was confirmed clean afterwards.

**A falsification that stays green is a test gap, and the gap is fixed rather
than the break excused.** Two stayed green on the first attempt and both are
recorded as such below.

### CONSOL-02 — the archive, the purge and the round trip

| # | The break | The check that caught it |
|---|---|---|
| 1 | A table leaves the export registry while staying owner data | `workspace-data-map` — every `exported` table names a real archive slot |
| 2 | An owner-data table is reclassified `ephemeral` | `workspace-data-map` — an `ephemeral` table must actually be empty after a seed |
| 3 | The generated purge plan silently drops a table | `workspace-data-map` — the purge order is TOTAL over `sqlite_master` |
| 4 | Attachment bytes survive the destroy step | `whole-product-rehearsal` — "prove gone" lists the bucket and expects nothing |
| 5 | A Finance balance is carried rather than derived | `whole-product-rehearsal` — balances are recomputed on both sides |
| 6 | A snapshot collection leaves the dependency order | `workspace-data-map` — the order is checked child-before-parent |
| 7 | The archive stops carrying attachment bytes | `whole-product-rehearsal` — the byte-parity journey |
| 8 | A saved Report fails to come back | `whole-product-rehearsal` — the Report is RE-EXECUTED after restore |
| 17 | The purge reaches into a neighbouring workspace | `whole-product-rehearsal` — the neighbour is counted before and after |
| 26 | Old-archive compatibility is quietly dropped | `archive-support-horizon` — the stated horizon is a test, not a sentence |
| 27 | The AI FactBlock stops matching after a restore | `whole-product-rehearsal` — derived-truth parity, `factBlock` named explicitly |
| 29 | An operational store leaves the archive with no stated reason | `workspace-data-map` — `EXPORT_EXCLUSIONS` must cover every exclusion in prose |
| 31 | An `exported` table leaves `SNAPSHOT_COLLECTIONS` while the map still claims its slot | `workspace-data-map` — the map and the archive are checked against each other, both ways |

### CONSOL-00 — the information architecture

| # | The break | The check that caught it |
|---|---|---|
| 9 | A navigation item loses its group | `navigation-information-architecture` — no destination may be ungrouped |
| 10 | The phone bar gains a fourth destination | `navigation-information-architecture` — the daily-driver bar is asserted by name |
| 11 | "Analytics" returns to the rail | `navigation-information-architecture` + `command-palette-coherence` |
| 12 | A command points at a route that does not exist | `command-palette-coherence` — every navigate command resolves |
| 13 | Navigation prefetch is switched off | `PrimaryNavigation` — every row carries `PRIMARY_NAV_PREFETCH` |
| 14 | The touch floor is authored away again | `consol-00-question-first-navigation` E2E — 44px under `pointer: coarse` |
| 15 | Two destinations share one `navOrder` | `navigation-information-architecture` — order is unique and banded |
| 16 | A group name becomes a route | `navigation-information-architecture` — no group key may be a path |
| 20 | The per-Task link reverts to a hand-built string | `task-drawer-href` — the one authority decodes through `readDrawerStack` |

### CONSOL-04 — one authority per thing

| # | The break | The check that caught it |
|---|---|---|
| 18 | An entity type loses its destination | `v3-readiness-registry` — every identified type has somewhere to land |
| 19 | Diary enters empty-query recency | `v3-readiness-registry` — the recency exclusions are named |
| 21 | A second caller applies a proposal | `proposal-apply-authority` |
| 22 | A documentation link breaks | `docs:links:check` |
| 23 | An Obligation recurrence is duplicated | `one-obligation-domain` |
| 24 | A stray attachment file input appears | `one-attachment-surface` |
| 25 | An AI provider is called from a loader | `grounded-ai-boundaries` |
| 30 | A provider endpoint is named in a browser-importable module | `grounded-ai-boundaries` — the server-only boundary |

### The map itself — added because the review found it unguarded

`PRODUCT_MAP.md` states three kinds of fact — where every destination is,
which file proves each authority, and how much data there is — and **none of
them was checked by anything**, because a route is not a repository link and a
code span is invisible to every link checker. A map that can rot is worse than
no map, because a reader trusts it. Closed in
`product-map-coherence.test.ts`, then falsified three ways:

| # | The break | The check that caught it |
|---|---|---|
| 32 | An authority test is renamed and the map still names the old file | `product-map-coherence` — every path in a code span resolves |
| 33 | A destination is silently dropped from the map's table | `product-map-coherence` — the map's rows are checked against the discovered registry both ways |
| 34 | The table count goes stale after a migration | `product-map-coherence` — the figures are read out of the prose and compared to the classification |

### The independent review, and the eleven things it found

The brief asked for an automated independent full-diff review pass whose
question is **"what guarantee is missing entirely?"** — not "is this correct".
It was run against the whole diff and it earned its place: it found **a false
promise, a wrong operator command, a tautological test and a totality claim
that the very commit making it had broken.** Every one is fixed here rather
than argued with, and each fix carries its own check.

| Found | What was actually wrong | What now holds it |
|---|---|---|
| The archive support horizon | `RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS` was DEFINED as `[SNAPSHOT_SCHEMA_VERSION]`, so the test asserting it contains that version was `[X].includes(X)` — and the promise "DalyHub reads every archive it has ever written" was **already false**: v1 archives have been refused since 2026-08-21. The list is a literal now, the document states the measured horizon, and the REFUSAL is exercised either side of it | `archive-support-horizon` |
| The R2 deletion command | The operator procedure said `--prefix "attachments/<id>/file/"`. The real key root is `workspaces/<id>/attachments/`. The stated command matches **nothing** — an operator would have got an empty listing and left every attached file in the bucket after a "deletion" | `workspace-deletion-procedure` |
| The rehearsal's own fixture | `expect(after).toEqual(before)` is satisfied by empty equals empty, and four `exported` tables had no rows — including `project_details`, so the whole-product rehearsal had a Project with no detail row at all. All four are seeded now, with no exception list | `whole-product-rehearsal` |
| "Every foreign key is `ON DELETE RESTRICT`" | Stated three times as the REASON the purge order must be generated. Nine keys are `CASCADE` and one is `NO ACTION`; the query behind the check read each key's parent name and never its rule | `workspace-data-map` |
| The plan could not be run as documented | Every statement carried an unbound `:workspace_id` and `wrangler d1 execute` has no binding flag, and the file opened with a `BEGIN TRANSACTION` D1 rejects — so the documented procedure asked an operator to hand-substitute an id into sixty statements, which is the typo the parameterisation exists to prevent | `workspace-deletion-procedure` |
| "Every open entry has exactly one home" | `DEBT-255` was raised **by the CONSOL-03 commit itself**, open, with no disposition and in no table. The register is parsed now and every open entry must be disposed or named as this programme's own finding | `debt-register-coverage` |
| The two buckets' trust boundary | "The application Worker cannot reach the backups bucket" — one of ADR-124's two measured reasons — was a COMMENT in `wrangler.jsonc` and nothing else | `worker-bucket-boundary` |
| The ephemeral class's rule | Asserted only on a fresh database, where every table is empty. A cutover that stopped clearing `workspace_restore_staged_rows` would leave a second complete copy of the owner's data in D1, per restore | `whole-product-rehearsal` |
| Every stated table count | "Sixty tables … 45 exported, 13 operational, 2 ephemeral" appears across six documents and an ADR, all correct today and all stale at the next migration | `product-map-coherence`, `workspace-deletion-procedure` |
| Settings contradicted the disposition | The page still said reminders "are not built" while this release struck DEBT-35 on the grounds that obligation reminders shipped with V2.10 | the copy is corrected |
| The declared-skip guard's own gaps | It missed `xit`, `xdescribe`, `test.skip.each` and `describe.skipIf(true)` — four spellings of the same quarantine. Widened, while still allowing the expression-gated form real capability checks use | `stability-run` |

**What it found nothing wrong with**, checked and reported as such: the
accessibility work, the navigation assertions (`turns no group name into a
route` is a real comparison, because registry paths carry no leading slash),
`taskDrawerHref`'s decode-don't-pin shape, and the deleted
`px-03-navigation.test.ts`, which is strictly subsumed.

### The PR review, and the four things it found

A second review — the repository's own Codex reviewer, on the opened pull
request — found four more, and every one is the same shape as the first round:
a document telling somebody to do something that does not work.

| Found | What was actually wrong | What now holds it |
|---|---|---|
| **A purge that would have deleted nothing** | Procedure B said `wrangler d1 execute dalyhub-v2 --file purge.sql`. Without `--remote`, Wrangler runs against the LOCAL database — and then the verification block returns `0` for all sixty tables, because the local database is empty, while every production row is still there. **An operator would have read sixty zeroes and believed they were finished.** `scripts/production-d1.mjs` has always passed `--remote` for exactly this reason; the document had not | `workspace-deletion-procedure` |
| **A command that does not exist** | The R2 step said `wrangler r2 object list … --prefix …`. There is no such subcommand: `wrangler r2 object` has `get`, `put` and `delete` and nothing that enumerates a prefix. The procedure stopped at the step that removes the owner's evidence. It now names what actually works — `wrangler r2 bucket delete` for the single-tenant case that production actually is, and the S3-compatible endpoint or the REST API for a shared bucket — and states the tool's limit rather than papering over it | `workspace-deletion-procedure` |
| **A constitutional amendment smuggled into a release** | `AGENTS.md`'s own final line requires an amendment to be its own PR, and DEBT-95's own closing condition says the same. This release amended §15 anyway and closed the entry with the deviation "deliberate and named". **A pass whose stated rule is that debt is never closed by wording cannot close an entry by out-arguing its closing condition.** The amendment is reverted; DEBT-95 is open again, in a disposition category of its own, with the correction written out ready for the PR that should carry it | `debt-register-coverage` |
| **A declared Node range the operator command could not run in** | `engines.node` said `>=22.0.0`, and `workspace:purge:plan` loads a `.ts` module through Node's own type stripping, which is only the default from **22.18**. On 22.0–22.17 — a supported environment by the repository's own declaration — the command failed before printing a line. The floor is `>=22.18.0` now, so the declaration is true | the declaration itself |

The general guarantee behind the first two was missing entirely: **nothing
checked that a command this repository tells an operator to type is a command
the tool actually has.** Every `wrangler` invocation inside a fenced block of
`WORKSPACE_DELETION.md` is now checked against Wrangler's real subcommand
surface, and every `d1 execute` against the `--remote` flag. Prose *discussing*
a command that does not work is deliberately out of scope — the document has to
be able to explain why `wrangler r2 object list` is not the answer.

| # | The break | The check that caught it |
|---|---|---|
| 35 | `--remote` dropped from the purge step | `workspace-deletion-procedure` |
| 36 | The unrunnable `wrangler r2 object list` returns | `workspace-deletion-procedure` |
| 37 | A new open entry appears with no disposition | `debt-register-coverage` |
| 38 | A disposition row names an entry the register no longer has | `debt-register-coverage` |

### The two that stayed green, and what was done about them

| # | The break | What happened |
|---|---|---|
| 27 | The AI FactBlock stops matching after a restore | The first attempt added a dead counter to the fact builder — a **no-op**, so green was correct. Re-done as a real defect: the obligations restore descriptor forgets its four completion columns. One test failed, and the diff named `factBlock`. |
| 28 | A `test.skip` quarantines a journey inside the full gate | **A real gap.** `test.only` had been guarded since V2.8 CONV-03; the DECLARATION form of `skip` never was, and it is the cheaper dishonesty — one failing journey disappears, the run stays green, the count drops by one and nothing says so. Closed in `stability-run` over e2e, unit and kernel alike, telling the declaration form apart from the ~40 legitimate `test.skip(condition, "reason")` guards by their first argument. The break then went red. |

---

## Non-goals of V2.16

Dashboards · OCR or attachment text extraction · document AI · bank feeds or
Open Banking · transaction splits · investment holdings · new AI intents or
proposal kinds · semantic search · embeddings or a vector store · a new
offline programme · calendar integration · email integration · household
sharing · a theme or design-system overhaul · a new Today concept · a new
Reports engine · another Finance release · another performance release. A
missing capability that belongs in V3 is **re-homed explicitly**, never
smuggled in.

---

## Open pull requests — disposition

Recorded rather than assumed. Full detail in the PR body.

| PR | Premise | Disposition |
|---|---|---|
| #230 | DEBT-173: the Tasks journey owns its records at both ends | Re-measured against `main` |
| #265 | V2.10 close-out plus one carried fix | Re-measured against `main` |
| #266 | V2.8 CONV-03 order proof, run | Re-measured against `main` |
| #268 | Today's weekly-rank test makes its own week | Re-measured against `main` |

---

## Full verification

Static (format · lint · **clean** typecheck · docs links · DHDS · scheme ·
icons · fixture dates · partitions · diff check) · unit · kernel · production
build · E2E affected + full gate · the rehearsal command · the architecture and
registry checks · the structural navigation benchmark. No retries, no
quarantine, no `test.skip`, no sleeps, no blanket timeout increases, no empty
CI-trigger commits. Every red is classified.

Exact counts and provenance are recorded in [Programme status](#programme-status)
and in the PR body — never quoted from an earlier release.

---

## Programme status

**V2.16 CONSOLIDATE — COMPLETE 2026-09-09.** Defined against `main` at
`06f57c1`; the measured close-out, with exact counts and the final SHA, is in
the pull request. Nothing below is quoted from an earlier release.

| Item | State |
|---|---|
| **CONSOL-00** — question-first information architecture | Shipped. Six groups over the real registry, no href moved, the phone bar unchanged, grouping in the accessibility tree, and a WCAG 2.2 §2.5.8 defect four releases old ([DEBT-254](../product/PRODUCT_DEBT.md)) found and fixed on the way |
| **CONSOL-01** — the deletion boundary | Decided and PROVED. An infrastructure act, on the measurement that the product resolves one configured workspace with no creation surface; a registry-derived purge plan, a generator with a runnable form, an executed kernel proof and an operator procedure whose every literal is checked against the code |
| **CONSOL-02** — whole-product recovery | Shipped, in two halves. The rehearsal compares DERIVED owner-facing values across export → destroy → restore, and the total store classification means no owner-data table can exist outside an export policy |
| **CONSOL-03** — the register | 98 entries, zero ambiguous: 3 closed against their own stated closing conditions, 1 deferred to the dedicated PR its own condition names, 10 owner-gated, 82 re-homed with a per-entry reason, 2 struck. The two this release raised are recorded separately, one resolved and one open by decision |
| **CONSOL-04** — retirement and the map | Shipped. Two registry names, two commands and nine hand-built URLs retired; the archive support horizon stated and made checkable; the cross-registry audit and the product map added, both as gates |
| **The V3 boundary** | Measured clause by clause in [`V3_BOUNDARY.md`](../product/V3_BOUNDARY.md). **V2 is consolidated — YES. V3 may begin — YES, architecture only, under two named conditions. Every optional production feature activated — NO** |
| **Falsification** | 38 breaks, all red. Two stayed green on first attempt: one was a no-op and was re-done, one was a real gap and is closed |
| **Independent review** | Two rounds. Eleven missing guarantees before the PR opened and four more from the PR's own reviewer — fifteen, all fixed, each with its own check. See [Falsification](#falsification) |

---

## Related documents

- [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md) — §6 (information architecture) and §12 (the V3 boundary), which this release measures
- [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v216--consolidate-presumptive--the-v3-readiness-release) — the PRESUMPTIVE sketch this file supersedes
- [`V3_BOUNDARY.md`](../product/V3_BOUNDARY.md) — the gate, measured clause by clause
- [`PRODUCT_DEBT_V2_16_DISPOSITION.md`](../product/PRODUCT_DEBT_V2_16_DISPOSITION.md) — every open entry, with its one home
- [`PRODUCT_MAP.md`](../architecture/PRODUCT_MAP.md) — the five questions and the shared machinery beneath them
- [`WORKSPACE_DELETION.md`](../development/WORKSPACE_DELETION.md) — the deletion boundary and the proved operator procedure
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) — the recovery authority the rehearsal exercises
- [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) — the archive contract and its support horizon
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — the register CONSOL-03 disposes
