# DALYHUB_ENGINEERING_HANDOFF.md — DalyHub as it actually is

> **Status:** current as of 2026-09-16, `main` @ `482ddd6` plus this pass.
> **Audience:** the next senior engineer or AI agent, who has never spoken to the
> maintainers and cannot read any previous conversation.
> **Authority:** this document is a MAP, not a ruling. Where it and a specialist
> document disagree, the specialist document wins and this one has a bug. The
> constitution is [`AGENTS.md`](../../AGENTS.md).

DalyHub is a single-owner Personal Operating System — one place to run a life —
running as a Cloudflare Worker on D1, installed as a PWA on the owner's phone.
It has a small stable kernel, self-registering modules, an explicit CSS cascade,
a two-tier E2E gate, and an offline slice that is deliberately narrow.

**The single most useful thing to understand before changing anything: almost
every surprising decision in this repository has a MEASUREMENT attached to it, in
a comment, at the place the decision lives.** When something looks wrong, read the
comment before changing the code. Several of the oddest-looking choices here are
odd because the obvious alternative was tried and produced a defect that is named
at the site.

---

## 1. Product architecture

### 1.1 The stack, top to bottom

```
App Shell          navigation · routing · appearance · command palette · search
Modules            Today · Tasks · Projects · Areas/Goals · Notes · Diary · Meetings
                   People · Habits · Finance · Assets · Life Admin · Reports ·
                   Insight/Analytics · Reviews · AI · Settings
Shared frontend    Untitled UI React Pro + DalyHub composition (~/shared/*)
Kernel             Entities · EntityLinks · Activity · Workspaces · the spine ·
                   Markdown pipeline · Module Registry · AI proposals
Platform           D1 · auth · R2 · cron · email
```

Dependencies point **downward only**. Modules never reach sideways into each
other; they compose through kernel contracts and the registry. Full detail:
[`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md).

### 1.2 React Router, and where routes come from

React Router 8 in framework mode, server-rendered by the Worker.

**`app/routes.ts` is not a route list and must not become one.** It globs every
module's declarative `routes.manifest.ts` and composes the tree from them
(`composeModuleRouteConfig`). Adding a module route means adding a manifest entry
plus the route file — never editing a central switch. Shell-owned routes
(`/health`, the appearance and colour-scheme actions, the `app-shell` layout) are
declared directly and stay OUTSIDE the shell layout where they must.

`/design/*` fixture routes exist only when `NODE_ENV !== "production"`, so they
never reach a deployed Worker. **A fixture may only draw what the product draws**
— when the last product consumer of a component goes, its `/design/*` entry goes
in the same change (CLAUDE.md rule 3). Nine components survived four migration
passes because a gallery kept drawing them.

### 1.3 The Worker

One Worker, `workers/app.ts`, with four entry points:

| Handler | What it serves |
| :-- | :--- |
| `fetch` | every page and API request, through `handleAuthenticatedRequest` — **authentication runs before the React Router handler**, so no protected loader or action can execute unauthenticated |
| `scheduled` | one 15-minute cron running three jobs: the external calendar refresh, the notification tick, and the attachment purge sweep. There is deliberately no second cron and no second Worker |
| `email` | inbound capture mail (CAPTURE-01), inert unless Email Routing and capture addresses are configured |
| `queue`/none | there is no queue |

### 1.4 D1, R2, auth

- **D1** is the only database. 58 migrations in `migrations/`, applied in
  **filename order** (two pairs share a number — `0013` and `0039` — which is
  fine because Wrangler sorts by name).
- **R2** holds attachments, through the app Worker's `ATTACHMENTS` binding. The
  scheduled database backup is a **separate** Worker with its own bucket,
  provisioned and deployed by `scripts/backup-worker.mjs` — so a bad app deploy
  cannot take the backup job with it.
- **Authentication is Cloudflare Access.** The Worker validates the Access JWT at
  the request boundary; there is no password, no session table and no
  application-managed login. A dev-only authenticator (`.dev.vars`) exists for
  local work and E2E, and `build/server/.dev.vars` is stripped before any
  production-mode server runs — see the CI "Strip any local env file" step.
- **Workspace isolation is a security boundary.** Every query is scoped to a
  workspace id server-side. See
  [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation).

### 1.5 Deployment

Cloudflare Workers, custom domain `hub.daly.id.au`, `workers.dev` returning 404
and Preview URLs disabled. Deployment is orchestrated by
`scripts/deploy-production.mjs`, never by a raw `wrangler deploy` — see §6.

---

## 2. Frontend architecture

### 2.1 Untitled UI is the implementation authority, and the migration is finished

Generic UI — buttons, fields, selects, badges, tables, tabs, menus, dialogs,
progress, avatars, empty states — is **Untitled UI React Pro**, vendored under
`app/shared/ui/untitled/`. DalyHub composes product semantics above it.

The migration (UNTITLED-01 … 19) is **complete**. There is no phase to join. What
remains is a named, bounded register in
[`UNTITLED_UI_MIGRATION.md`](../design/UNTITLED_UI_MIGRATION.md#named-maintenance-debt).
Before building a generic control, read
[the generic UI inventory](../design/UNTITLED_UI_IMPLEMENTATION.md#the-generic-ui-inventory-at-the-end-of-this-pass):
the answer is almost always "that exists and it is Untitled's".

**Two generic systems still exist beside Untitled's, and both are deliberate:**

| | Why |
| :-- | :--- |
| `~/shared/tooltip/Tooltip.tsx` (9 importers, the whole shell chrome) | It renders a formatted keyboard-shortcut chip from the one shared notation formatter, so a tooltip reads `⌘B` on Apple and `Ctrl+B` elsewhere — the same string the Command Palette shows. Untitled's tooltip has no shortcut slot. `tooltip.css` is this component's entire appearance; **deleting it leaves every shell tooltip unstyled**, and an earlier audit wrongly called it dead. |
| `~/shared/ui/ConfirmationDialog.tsx` | Focus isolation, body-scroll lock, inert background and a typed-phrase confirmation. `application/modals` supplies a shell, not this behaviour. |

### 2.2 The CSS cascade — read this before touching a stylesheet

**Every rule DalyHub ships is in an explicit `@layer`.** Unlayered CSS outranks
layered CSS unconditionally and regardless of specificity, so one unlayered file
silently outranks the whole design system — which is what 73.7% of the production
stylesheet was doing until V3-CSS-01 measured it.

```
theme → dh-tokens → base → dh-floor → dh-legacy → components → utilities → dh-product
```

Declared once in `app/styles/untitled/untitled.css`; assigned once per stylesheet
in `app/app.css`. Two rules carry it:

1. **Generic control paint is Untitled's.** A DalyHub rule that paints one goes in
   `dh-legacy`, where it LOSES — and the right fix is to delete it and use the
   component.
2. **Composition is DalyHub's** — layout, hierarchy, domain spacing, entity
   identity, specialised workflows. That goes in `dh-product`, above `utilities`.

A stylesheet with no `layer()` fails `e2e/css-cascade-ownership.spec.ts`. If you
reach for `!important` or add a class to out-specify something, the layer
assignment is wrong — fix the owner.

**There is exactly one unlayered file, and it is forced**: seven rules in
`app/styles/markdown-editor-codemirror.css`. See §7.1.

Full model: [`CSS_CASCADE_ARCHITECTURE.md`](CSS_CASCADE_ARCHITECTURE.md).

### 2.3 Theming, tokens and appearance

Two colour vocabularies ship side by side, deliberately:

- `app/styles/tokens.css` — 8,453 generated lines, the DalyHub/MD3 semantic
  tokens, **five colour schemes × two appearances**;
- `app/styles/untitled/theme.css` — Untitled's colour foundations.

`dh-tokens` sits **after** `theme` so DalyHub's values win where the two collide.
Choosing between them is named maintenance debt item 14 and is *not* a bundle-size
question — the four non-default schemes cost **2.4 kB brotli** (§3.2).

Both halves are **generated** by `scripts/generate-m3-scheme.mjs`, which writes
three committed artefacts: the colour blocks in `tokens.css`, the typed mirror
`app/shared/tokens/scheme.ts`, and the ten-string
`app/shared/tokens/theme-color.ts` the root document reads. `pnpm run
scheme:check` byte-compares all three. **Never hand-edit a generated file.**

Appearance: `<html data-appearance>` carries System / Light / Dark, written
server-side by `root.tsx`, so the first byte is already correct — no bootstrap
script, no flash, no hydration mismatch. `<html data-color-scheme>` carries the
scheme, orthogonally: **no layout, type, shape or motion token is
scheme-dependent.**

### 2.4 Where custom UI is justified

Three categories, and only three:

1. **Untitled ships nothing equivalent** (the Shared Card carries a *record*;
   Untitled ships no generic Card).
2. **Product behaviour Untitled does not have** (the tooltip's shortcut chip; the
   ConfirmationDialog's typed phrase).
3. **Domain composition** — anything that knows about Areas, Goals, Projects,
   Tasks, priorities or overdue dates. Those are product components by
   definition, and they compose Untitled primitives.

"Custom CSS looked easier" is not one of them.

---

## 3. Performance architecture

### 3.1 A route's cost is its static graph, not its own chunk

This is the single most common way to make DalyHub slower without noticing. A
navigation loads the route module, **every parent layout's module, and everything
any of them statically imports**. A one-line barrel import can add 100 kB, and
nothing in review, in a type or in a lint shows it.

Three such imports were live on `main` @ `482ddd6`:

| | Cost |
| :-- | :--- |
| `import { Sparkline } from "~/shared/charts"` in Today | 111.6 kB gzip of Recharts on the default landing route, to draw a 2.3 kB inline SVG |
| `import { useOffline } from "~/shared/offline"` in `usePendingTasks` | ~44 kB raw of Settings/offline panels on five routes that draw none of them |
| `import { COLOR_SCHEME_PALETTES }` in `root.tsx` | 78.4 kB of generated colour data in the chunk EVERY route loads, to read ten strings |

**`pnpm run perf:budget` now holds this**, in CI's Build job. Two assertions per
route: a gzip ceiling, and a `forbid` list of third-party runtimes that must not
be in that route's static graph at all (`recharts`, `@codemirror/view`,
`@codemirror/state`). The `forbid` list is the one with teeth — it names the
defect rather than its size. Raising a ceiling is `pnpm run
perf:budget:generate`; **re-generating is never the answer to a `forbid`
failure.**

### 3.2 The stylesheet

796 kB raw / 95 kB gzip / **69 kB brotli** — brotli is what Cloudflare serves, and
the raw figure is misleading because the file is mostly repetitive generated
tokens. Stripping the four non-default colour schemes saves 154 kB raw and
**2.4 kB brotli**, which is not worth a live feature and a second CSS entry point.
Measured; recorded in [`PERFORMANCE.md` §7.3](../development/PERFORMANCE.md).

### 3.3 The rest

Navigation cost, statement counts, round-trip depth, prefetch and revalidation are
[`PERFORMANCE.md`](../development/PERFORMANCE.md)'s subject, and the budgets there
are held by kernel tests rather than by wall-clock assertions — a CI runner's
clock is not evidence about production.

---

## 4. Data architecture

### 4.1 The spine

```
Area (no end)  →  Goal (optional, has success criteria)  →  Project (finite)  →  Task (atomic)
```

Supporting entities — **Notes, Meetings, People, Assets, Diary, Review, Habits,
Finance, Obligations, AI** — attach *across* the spine through **EntityLinks**,
which are a kernel primitive rather than a per-module feature.

### 4.2 The shape of a write

Every mutation goes through the module's domain path — never a shortcut, and
never a second authority. That rule is load-bearing for offline replay (§5): a
replayed intent posts to **the same route the online control posts to**. There is
no `/offline/mutate` and no replay-only handler.

Every meaningful change appends to the single **Activity** stream, which the
Activity Feed and Timeline render everywhere.

### 4.3 Migrations

- Forward-only. `migrations/NNNN_name.sql`, applied in filename order.
- Additive by default: every `ADD COLUMN … NOT NULL` carries a `DEFAULT`, and no
  column changes type.
- **Four migrations REMOVE something** (`0031`, `0049`, `0050`, `0051`). Each is
  deliberate and none loses data — the data moves into the structure that
  replaced it — but each closes the window in which rolling the *application*
  back is a recovery. This is derived, not remembered: `pnpm run db:compat`
  applies every migration to a throwaway SQLite database and diffs the schema
  after each one, and `pnpm run db:compat:check` fails in CI when the committed
  [`migration-ledger.json`](../development/migration-ledger.json) stops matching.
- Eleven migrations rebuild a table with SQLite's copy-and-rename pattern. In each
  one every surviving column keeps its name, type, default and constraint, and
  every row is copied by an **explicit column list** so a later `ALTER` that
  reorders physical columns cannot shift a value sideways. Follow that pattern.

---

## 5. Offline architecture

DalyHub 3.1 treats the installed PWA as a mobile application, not a responsive
website. [`MOBILE_WEB_EXPERIENCE.md`](../design/MOBILE_WEB_EXPERIENCE.md) is the
authority for phone composition; [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md)
for everything below.

### 5.1 The snapshot

A **fifteen-day window** — previous seven calendar days + today + next seven —
resolved in the **owner's** timezone, with all arithmetic on `YYYY-MM-DD` strings
via UTC midnight. Millisecond subtraction lands on the wrong date twice a year in
Australia/Sydney and is off by one for part of every day at UTC+10/+11.

Retained: Tasks, Notes (excerpt only — the full Markdown is **never** stored),
Diary, Meetings (attendee **names** only), and minimal References. Bounds:
`tasks 400, notes 100, diary 150, meetings 100, references 300`; when a bound
bites the view says the copy is partial. `test/kernel/offline-snapshot.test.ts`
asserts each record type's fields against an **allow-list**, so a new repository
field cannot silently flow onto the owner's device.

### 5.2 The namespace

```
namespace = "dh1-<schemaVersion>-" + sha256("dalyhub-offline v<n> <subject> <workspaceId>")[0..32]
```

A digest, so neither the Access subject nor the workspace id is written to the
device. Record keys are `${namespace}|${kind}|${id}`. **No store method reads
without a namespace** — there is no "read everything" method to forget about. On a
successful sync under a different namespace the other namespace's snapshot is
deleted before anything renders it; its **queued captures are kept**, because they
are that identity's unsynced work.

This is namespacing, **not encryption**.

### 5.3 The queue, receipts and idempotency

Two things go into the queue and they are different:

- **Captures** — a new Inbox task, quick note or diary entry: append-only records
  with no parent and no dependency on server state.
- **Mutations** — eleven operations across two entity types: seven addressing a
  Task (complete, reopen, rename, priority, due date, planned date, checklist
  tick) and four appending to a Meeting (agenda item, decision, outcome, action).

**Every queued item mints an idempotency key on the device**, and the server
**claims the key before it writes anything**. A retry of a settled claim writes
nothing at all — which is what stops a lost response turning one decision into two
rows. Receipts are filed under the target's id, so a receipt for "tick step 2"
cannot be satisfied by a request naming step 3.

### 5.4 Conflict

DalyHub does not guess. On replay, `decideConflict` compares the field the intent
contends over against the server's current value:

- a server change to a **different** field MERGES;
- a server change to the **same** field is a conflict the owner is shown and
  resolves;
- an **append** cannot conflict at all — it adds a row at a server-allocated
  position and overwrites nothing — so it returns `applied` without comparing,
  and never `satisfied` ("the record already holds your intent" is not something
  any reading of a meeting establishes: two identical actions are two actions).

Appends therefore carry **no base value** and are **never coalesced**; the entity
type is **derived** from the operation (`OFFLINE_MUTATION_ENTITY`) rather than
supplied beside it, so there is no code path that can queue `add_decision`
against a Task.

### 5.5 What is deliberately online-only

- **Meeting NOTES.** The notes body is one long document saved whole, so two
  devices writing to it offline would each overwrite the other's paragraph. An
  agenda item or a decision is a separate line and can safely be added from
  anywhere.
- **Everything AI.** Proposals need a model.
- **Search, Reports, Insight, Finance, Assets, Life Admin, Settings writes.**
- **Any bulk copy of Projects or People.** A project, area or person reaches the
  device only because a retained record points at it, and only as an id and a
  label.

**The rule for adding to the offline set** is in `MOBILE_WEB_EXPERIENCE.md`, and
it is a rule rather than a preference: an operation qualifies when it has clear
idempotency AND clear conflict semantics. An append has both for free. A
whole-document save has neither.

### 5.6 Auth failure during replay

An expired sign-in during replay does not discard the queue and does not show a
generic error. It says the sign-in expired, says the phone is still holding the
owner's work, and offers **"Sign in and continue"** — which returns to the record
the owner was on.

---

## 6. Release and deployment

### 6.1 Version authority

**`app/lib/version.ts` is the one authority.** `APP_VERSION` is hand-maintained
there and bumped in the release commit; `package.json` carries the same string and
`test/unit/about/package-version.test.ts` fails on drift. About and `/health` both
read it. Nothing copies a version string.

**A version number identifies a BUILD that ran.** That doctrine is why there is no
`2.1`, `2.2` or `2.3`, and it is why the 3.1 work in the changelog carries no
number yet — see §9.

### 6.2 The required order

1. **Back up.** `pnpm run db:production:export -- --output <file>` **and** a
   DalyHub export from Settings → Privacy & data. This is the step that makes
   everything after it reversible.
2. **Preflight.** `pnpm run deploy:production:preflight` — credential-free, no upload.
3. **Look.** `pnpm run db:production:list` names exactly what is pending.
4. **Migrate.** `pnpm run db:production:apply`.
5. **Verify the schema.** `db:production:list` reports nothing pending.
6. **Deploy.** `pnpm run deploy:production`.
7. **Verify.** `pnpm run verify:production`, then read `/about` through Access.
8. **Identity check** after any deploy including migration `0028` — see
   [`IDENTITY_AND_ACTORS.md`](../development/IDENTITY_AND_ACTORS.md).

Use `pnpm run db:production:*`, **never** `wrangler d1 … --env production`: the
committed production `database_id` is a placeholder by design, and `--env` selects
an environment rather than supplying an id.

### 6.3 Rollback, and its real limit

**Do not roll a migration back.** The sequence is forward-only.

Rolling the *application* back is a recovery **only across additive migrations**.
Four migrations remove something, and `pnpm run deploy:production:release-check`
prints `ROLLBACK BOUNDARY` when the pending set contains one. The runbook for
"the migration succeeded and the deploy did not" is in
[`DEPLOYMENT.md`](../development/DEPLOYMENT.md#when-the-migration-succeeded-and-the-deploy-did-not);
the short version is that **forward is the cheap direction** and the only
alternative is restoring the step-1 backup, which discards everything written
since.

**The service worker outlives a rollback.** A previous release's worker stays
installed in every browser that has it. See
[`PWA_AND_OFFLINE.md` → Rollback](../development/PWA_AND_OFFLINE.md#rollback).

### 6.4 Backups

Three, and they answer different questions
([`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md)):

| Copy | What it is |
| :-- | :--- |
| the DalyHub export (Settings) | the only one DalyHub can restore **in-app** |
| the R2 scheduled dump (BACKUP-01) | a D1 SQL dump, unencrypted, in the owner's own bucket |
| the GitHub artifact (AUDIT-11) | the same dump, encrypted, OFF Cloudflare |

**A raw D1 export cannot be imported as-is** — it must be reordered first, because
it will not load with foreign keys enforced. That is measured, on both the local
executor and Cloudflare's remote import endpoint, in § 5.0a/5.0b of that document.
Do not discover this during an incident.

`pnpm run restore:rehearsal` runs the whole-product restore rehearsal.

---

## 7. Fragile areas — where a competent engineer will break DalyHub

These are ranked by how easy they are to break and how quietly they fail.

### 7.1 CodeMirror and the cascade

**CodeMirror injects its stylesheet at RUNTIME**, which is unlayered by
construction, and unlayered beats every layer unconditionally. So DalyHub's
overrides for the properties CodeMirror itself declares cannot be layered either
— that is `app/styles/markdown-editor-codemirror.css`, seven rules, the
architecture's one exception.

This corner has produced a shipped defect **three times**, each from a
hand-written list of "what CodeMirror declares":

1. un-layering the *whole* editor stylesheet, which then outranked the five
   product surfaces that legitimately override it (the guided Review lost its
   `50vh` cap; axe reported a serious `scrollable-region-focusable`);
2. a narrowing written from a probe that printed 60 of CodeMirror's 320
   selector/property pairs, so the caret's `border-left-color` stayed layered and
   lost — the text cursor rendered black at **1.06:1** against the dark surface,
   on every writing surface in the product, invisible to axe and fine in light
   mode;
3. `background:` on `.cm-selectionBackground`, which is nine longhands, eight of
   which CodeMirror does not declare.

**The list is no longer what decides.** `e2e/css-cascade-ownership.spec.ts` →
*"the unlayered CodeMirror exception is exactly what CodeMirror contests"*
derives it from the live injected stylesheet through the browser's own CSS
parser, compares **longhands**, matches **real elements** rather than class names,
and fails in both directions. It was verified to fail on exactly the two changes
it exists to catch.

**If you integrate another library that injects CSS at runtime**, its overrides
cannot be layered either. Put them in their own file, keep it to the declarations
the library itself sets, say so at the import — and do **not** un-layer the whole
stylesheet that happens to contain them.

### 7.2 Offline replay

Read receipts, idempotency and conflict resolution (§5.3, §5.4) **before**
touching the queue. The properties that are easy to break without a test noticing:

- a replayed intent must post to the **same route the online control posts to**;
- an append must never coalesce, never carry a base value, and never return
  `satisfied`;
- an idempotency key must be claimed **before** the write, not after;
- `targetId` is part of the coalesce key — drop it and two ticks on two checklist
  steps silently become one.

### 7.3 Migration compatibility

See §4.3. The trap is assuming "additive" because previous migrations were. Run
`pnpm run db:compat` and read the answer.

### 7.4 Focus restoration and React Router revalidation

Closing a record used to send the owner back to the top of the Tasks list four
times out of five on a phone — the page briefly collapsed while the record
opened, DalyHub read that as "you were at the top", and put them there. Anything
that changes when a list unmounts, or how scroll position is captured, can
recreate it.

Relatedly: **a node can be detached by revalidation between locating it and
interacting with it.** Several E2E failures have this shape, and so does at least
one class of real user-facing bug.

### 7.5 iOS, the PWA and the service worker

- Chromium is **not** iPhone WebKit. Nothing automated here is evidence about
  iOS Safari. Where the repository carries a real-device checklist, it is there
  because automation cannot answer the question.
- There is **one** Visual Viewport listener, deliberately. Adding a second is how
  keyboard and safe-area handling starts fighting itself.
- The service worker is the hardest thing here to roll back (§6.3).

### 7.6 Auth and session handling

Authentication runs at the request boundary **before** the React Router handler.
Anything that moves work above that line runs unauthenticated. The dev-only
authenticator must never reach a production-mode server — CI strips
`build/server/.dev.vars` for exactly this reason.

### 7.7 E2E fixture isolation

The suite drives **one** dev server against **one** local SQLite file while
fixtures open it from a separate process. Consequences worth knowing:

- specs assert against the shared workspace's **accumulated** state, so
  re-ordering the suite can change what they see (DEBT-173);
- `SQLITE_BUSY` and a foreign-key failure from an ordered cleanup are both
  transient; `e2e/d1.ts` retries exactly those and nothing else;
- **a helper's SQL must be idempotent**, because the whole command is re-run.

---

## 8. Testing

| Tier | Command | What it holds |
| :-- | :--- | :--- |
| Unit / component | `pnpm run test:unit` | pure logic, components, generated-artefact invariants |
| Kernel | `pnpm run test:kernel` | the real Workers runtime against a real D1 — migrations, repositories, statement budgets, the offline snapshot allow-list |
| E2E — **PR gate** | `pnpm run test:e2e` | the correctness journeys, a representative accessibility scan in both appearances, **every** open-overlay accessibility scan, the responsive boundary widths over the daily drivers, the overlays at 320 |
| E2E — **nightly** | `.github/workflows/nightly.yml` | exactly three files: `accessibility-matrix`, `responsive-desktop`, `responsive-phone` — each ONE assertion repeated across a route × width × appearance matrix |

The nightly tier is **not** a place to put a test because it fails often, and it
must never become a required check. `pnpm run e2e:partitions:check` fails if a
spec file is in both tiers or in neither.

### 8.1 The partition

The Playwright job is a GitHub Actions matrix, one job per partition of
`e2e/partitions.json`, which records the **measured seconds** of every spec file.
It is generated, committed and checked. It replaced `--shard=n/N` because
Playwright's own sharding divides by test COUNT and DalyHub's tests cost between
0.8 s and 53 s each — equal counts were wildly unequal work, and six of seven
`main` runs lost between 27 and 118 tests that way.

`pnpm run e2e:gate` runs the whole local gate exactly as CI runs it.

### 8.2 Invariant tests worth knowing about

| Test | What it would catch |
| :-- | :--- |
| `e2e/css-cascade-ownership.spec.ts` | an unlayered rule anywhere; a legacy rule beating Untitled; a CodeMirror declaration silently losing; an unnecessary unlayered exception; an invisible caret or placeholder in either appearance |
| `test/kernel/migration-production-baseline.test.ts` | a migration that loses, resurrects or rewrites owner data |
| `test/unit/deploy/migration-rollback-boundary.test.ts` | a new migration that removes something, without the deployment runbook changing with it |
| `test/kernel/offline-snapshot.test.ts` | a new repository field silently reaching every owner's device |
| `test/kernel/navigation-statement-budget.test.ts` | a route that starts issuing more statements or deeper round trips |
| `scripts/route-budget.mjs` | a barrel import putting a charting or editor runtime on a daily-driver route |
| `test/unit/tokens/contrast.test.ts` | a generated colour that fails WCAG in either appearance |
| `test/unit/ci/e2e-tiers.test.ts` | a spec file in both E2E tiers or neither |

### 8.3 Common causes of a red run

1. **A fixed `waitForTimeout` racing hydration.** A duration cannot express "after
   the thing I am measuring exists". Wait on a signal — `data-editor-ready`,
   `waitForInteractive`, a locator — not a number.
2. **A detached node.** Revalidation can remove the element between locating it
   and clicking it.
3. **Page activation.** Playwright reports an element as `inactive` rather than
   focused when the page is not the browser's active one, which earlier tests in
   the same file can cause by opening their own contexts. `page.bringToFront()`
   before a focus assertion.
4. **Accumulated workspace state** (§7.7).
5. **A generated artefact out of date** — `scheme:check`, `icons:check`,
   `db:compat:check`, `e2e:partitions:check` all fail on drift and all have a
   `:generate` counterpart.

---

## 9. Daily-driver surfaces, and what each one is architecturally

Not what they are for — what they *do to the system*.

| Surface | Architectural significance |
| :-- | :--- |
| **Today** | The default landing destination, so it is the product's first paint for most sessions and the strictest performance budget. It composes almost every shared primitive, which makes it the first place a shared regression shows. |
| **Tasks** | The heaviest collection, the one with saved views, and the surface the offline mutation slice was built for. The Task record drawer embeds the Markdown editor, which is why `/tasks` must not statically load the editor runtime. |
| **Projects** | The spine's middle. Health and rollup calculations converge here. |
| **Meetings** | The second offline-writable entity (appends only), and the source of follow-up Tasks — the clearest example of one module producing another's records through kernel contracts. |
| **Notes** | The writing surface: CodeMirror, the Markdown pipeline, and `[[Wiki Links]]`. The most cascade-sensitive module in the product. |
| **Diary** | Chronology. The only module whose ordering authority is `occurred_at` rather than `created_at`, which is why migration `0011`'s backfill used the entity's own `created_at` as the only truthful signal a legacy row had. |
| **Areas** | The spine's root, and the only entity that never completes. Every rollup terminates here, so an Area's read path touches more of the kernel than any other. |
| **People** | Woven through everything rather than a CRM bolted beside it: linked to Meetings, Projects, Tasks, Notes and Diary, and the accumulated timeline is the value. The most privacy-sensitive data in the product — People and Diary are never sent to an external model unless the owner opts in per action. |
| **Goals** | Measurement and projection — the only place a target, a baseline and a direction combine, and the source of the chart layer's hardest requirements. |
| **Habits** | Periodic adherence. Its arithmetic is the one most sensitive to the owner's timezone and week-start. |
| **Finance** | The largest per-row dataset and the one with a cursor-paginated ledger; the AI categorisation feature's subject. |
| **Assets / Life Admin** | Obligations, renewal dates and the notification tick's main source. Migration `0050` converted the old `asset_obligations` table into first-class entities plus EntityLinks. |
| **Reports / Insight / Analytics** | Read-only aggregation over everything else, with its own statement-count budget (`test/kernel/reports.test.ts`). The place a kernel query regression shows up first. |
| **Reviews** | The guided weekly Review is the most composed surface in the product — a step rail, embedded editors with density caps, and evidence panels. It is also where the cascade exception's first over-wide version was caught. |
| **Ask DalyHub (AI)** | Online-only, and a **proposer, never an actor**: nothing is written until the owner approves. Every proposal is legible and reversible. It reads and proposes changes to the same entities every human action touches — no side-channel state. |

---

## 10. Key commands

```bash
# Development
pnpm install
pnpm run dev                       # http://localhost:5173

# The gates, in the order CI runs them
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run scheme:check              # generated colours match the generator
pnpm run untitled:theme:check
pnpm run dhds:check
pnpm run icons:check
pnpm run docs:links:check          # every relative link and #anchor resolves
pnpm run db:compat:check           # the migration rollback ledger matches migrations/
pnpm run e2e:partitions:check
pnpm run e2e:fixture-dates:check
pnpm run test                      # unit + kernel
pnpm run build
pnpm run perf:budget               # per-route JS budget, needs a build
pnpm run test:e2e                  # or: pnpm run e2e:gate, the full local gate

# Everything above, in one command
pnpm run verify

# Regenerating a generated artefact (never hand-edit one)
pnpm run scheme:generate
pnpm run icons:generate
pnpm run e2e:partitions:generate
pnpm run db:compat:generate
pnpm run perf:budget:generate

# Measurement
pnpm run db:compat                 # the full migration compatibility report
pnpm run perf:navigation           # navigation timings

# Production (owner credentials required; none of this runs in CI)
pnpm run deploy:dry-run            # credential-free, CI-safe
pnpm run deploy:production:preflight
pnpm run deploy:production:release-check
pnpm run db:production:list
pnpm run db:production:apply
pnpm run db:production:export -- --output <file>
pnpm run deploy:production
pnpm run verify:production
pnpm run restore:rehearsal
```

---

## 11. Before you change X, understand Y

- **Before modifying the offline queue**, understand receipts, idempotency and
  conflict resolution — §5.3, §5.4 and `PWA_AND_OFFLINE.md` §15.
- **Before touching any stylesheet**, understand cascade layers and which layer
  the file is in — §2.2 and `CSS_CASCADE_ARCHITECTURE.md`. A rule in the wrong
  layer does not look broken; it is simply inert.
- **Before touching the Markdown editor's CSS**, understand why seven rules are
  unlayered — §7.1. This corner has shipped three defects.
- **Before adding a migration**, run `pnpm run db:compat` and decide whether it
  removes anything. If it does, the deployment runbook changes with it — §4.3, §6.3.
- **Before importing from a barrel in a route module**, check what else that
  barrel exports. `pnpm run perf:budget` will tell you after the fact; the diff
  will not — §3.1.
- **Before building a generic control**, read the generic UI inventory. Adding a
  second one is a design-system defect, not a shortcut — §2.1.
- **Before deleting a "dead" stylesheet**, grep for the class in `.tsx` **and**
  check for dynamic construction (`` `dh-surface--${variant}` ``). A static grep
  said six `ui.css` modifiers were unused; all six are built at runtime.
- **Before adding an E2E test**, decide its tier and add a measured duration —
  `e2e:partitions:check` fails on a file in both tiers or neither.
- **Before claiming an iOS behaviour works**, note that Chromium is not WebKit —
  §7.5.
- **Before writing a fixed `waitForTimeout`**, find the signal you actually mean.
  §8.3.
- **Before believing a debt entry**, re-verify it against the repository. This
  pass found a register entry that would have had the next engineer delete a live
  stylesheet — §2.1.

---

## Related documents

| Document | Answers |
| :-- | :--- |
| [`AGENTS.md`](../../AGENTS.md) | how we build DalyHub, and what "good" means |
| [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) | what DalyHub is and how it should feel |
| [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) | how the pieces fit together technically |
| [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) | why each choice was made |
| [`CSS_CASCADE_ARCHITECTURE.md`](CSS_CASCADE_ARCHITECTURE.md) | which layer a stylesheet belongs in |
| [`UNTITLED_UI_IMPLEMENTATION.md`](../design/UNTITLED_UI_IMPLEMENTATION.md) | how to implement generic frontend UI |
| [`MOBILE_WEB_EXPERIENCE.md`](../design/MOBILE_WEB_EXPERIENCE.md) | phone composition, and the offline rule |
| [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md) | the service worker, snapshot, queue and replay |
| [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) | the deployment procedure and its recovery paths |
| [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) | recovery, in every scenario |
| [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) | the gate, the tiers and the partition |
| [`PERFORMANCE.md`](../development/PERFORMANCE.md) | how navigation is measured and what it costs |
| [`DALYHUB_RESIDUAL_DEBT.md`](DALYHUB_RESIDUAL_DEBT.md) | what is left, prioritised |
