# REFERENCE_PRODUCTS.md — Products & Libraries DalyHub Studies

> The central reference catalogue. It records **what we've already learned from each reference product and candidate library** so agents don't repeatedly re-research the same things.
>
> Works with [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) (the rules for reuse) and the [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) (where borrowed patterns land). Before researching a product or picking a library, **read this first**; after researching, **update it**.

---

## How to use and maintain this file

- **Two kinds of entries:**
  1. **Product inspirations** — what to *learn* (product/UX/interaction ideas). Some are closed-source or strong-copyleft: **study-only**, never copy code.
  2. **Reusable building blocks** — permissively-licensed libraries we may *depend on or adapt*, per the [reuse workflow](../governance/OPEN_SOURCE_POLICY.md#approved-reuse-workflow).
- **Licences are a snapshot, not gospel.** Every licence below is recorded to the best current knowledge and **must be re-verified against the exact version at reuse time** ([policy](../governance/OPEN_SOURCE_POLICY.md#licensing-rules)). If you verify one, note the date.
- **When you research anything here,** add findings (health, risks, licence confirmation) to its entry so the next agent inherits your work. New candidates get a new entry using the [template](#entry-template).

**Legend:** 🟢 reusable (permissive) · 🟡 reuse with recorded decision (weak copyleft) · 🔴 study-only (strong copyleft / closed).

---

## Product inspirations

### Notion — 🔴 study-only (closed source)
- **Why chosen.** The canonical "everything app": flexible records, linked databases, block editing, calm information density.
- **What DalyHub should learn.** Records-as-first-class-objects; relations between databases (informs [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)); block-based editing; restrained visual design.
- **Relevant modules.** Notes, Projects, the shared [Record Layout](../design/DESIGN_SYSTEM.md#record-header).
- **Repository / licence.** Closed source. No code reuse — pattern inspiration only.
- **Reusable patterns.** Linked-record UX, slash-command block insertion, database views as windows onto one dataset.
- **Risks.** Notion is *too* flexible — DalyHub deliberately provides opinionated structure (the [Area spine](../../AGENTS.md#4-the-area--goal--project--task-model)) instead of a blank canvas. Learn the polish, not the sprawl.

### Obsidian — 🔴 study-only (closed source; local Markdown files)
- **Why chosen.** Best-in-class local-first Markdown PKM with backlinks and graph thinking.
- **What DalyHub should learn.** Markdown-as-source-of-truth ([ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)); bidirectional links and backlinks ([NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks)); ownership/portability ethos.
- **Relevant modules.** Notes, Diary, linking.
- **Repository / licence.** Closed source (plugin ecosystem is varied — check individual plugin licences before reuse).
- **Reusable patterns.** Backlink panels, `[[wikilink]]` linking affordances, local/portable data feel.
- **Risks.** Obsidian is file-centric; DalyHub is entity-centric. Borrow the linking/portability feel, not the file-tree mental model.

### Linear — 🔴 study-only (closed source)
- **Why chosen.** The gold standard for keyboard-driven speed, command palette, and calm-but-dense UI.
- **What DalyHub should learn.** [Command Palette](../design/DESIGN_SYSTEM.md#command-palette)-first interaction; instant optimistic UI; keyboard-complete workflows; restrained, fast design.
- **Relevant modules.** Command Palette, [Today](../roadmap/ROADMAP_V2.md#phase-2--today--execution-workspace-today), all keyboard workflows, [performance budgets](../../AGENTS.md#16-performance-expectations).
- **Repository / licence.** Closed source. Interaction inspiration only.
- **Reusable patterns.** `⌘K` everything, quick actions, snappy transitions, opinionated speed.
- **Risks.** Linear is a team issue tracker; DalyHub is a personal life OS. Borrow the *interaction model*, not the team-workflow features.

### Raycast — 🔴 study-only (closed source)
- **Why chosen.** The reference for a command-first launcher: a single input that unifies navigation, search and executable actions, with context-aware suggestions and a curated keyboard vocabulary.
- **What DalyHub should learn.** One surface that merges commands and search without confusing them; context-aware ranking (surface-relevant actions first); calm inline feedback for a running action; a restrained suggested/recent set on an empty query.
- **Relevant modules.** [Command Palette](../design/DESIGN_SYSTEM.md#command-palette) (DS-09), Quick Actions, all keyboard workflows.
- **Repository / licence.** Closed source. Interaction inspiration only.
- **Reusable patterns.** Command/search/action in one list; context-aware suggestions; deterministic keyboard model; honest pending/success/failure states.
- **Risks.** Raycast is an extensible macOS launcher with arbitrary extensions and scripts; DalyHub commands are intentionally curated, registry-declared and free of remote plugins or user scripting. Borrow the *interaction model*, not the extension marketplace.

### Things 3 — 🔴 study-only (closed source)
- **Why chosen.** Exemplary personal task UX: calm, focused, beautifully restrained "Today" experience.
- **What DalyHub should learn.** The [Today/Execution](../roadmap/ROADMAP_V2.md#-today-01--execution-workspace) surface; Areas→Projects→Tasks structure (a direct cousin of our spine); gentle, non-nagging tone.
- **Relevant modules.** Today, Areas/Goals, Projects, Tasks.
- **Repository / licence.** Closed source. Product inspiration only.
- **Reusable patterns.** "Today" as the daily home, the Areas/Projects hierarchy, quiet completion feedback.
- **Risks.** Things has no cross-linking or knowledge layer — DalyHub goes further with [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) and Notes/People.

### Sunsama / Amie — 🔴 study-only (closed source)
- **Why chosen.** Daily planning rituals and calendar-integrated day design done calmly.
- **What DalyHub should learn.** [Planning](../roadmap/ROADMAP_V2.md#-today-04--planning) and [Review](../roadmap/ROADMAP_V2.md#phase-10--review-review) flows; intention-setting; a humane, unhurried pace.
- **Relevant modules.** Today → Planning, Review.
- **Repository / licence.** Closed source. Flow inspiration only.
- **Reusable patterns.** Guided daily planning, weekly review ritual, calendar-as-context.
- **Risks.** Heavy calendar coupling; DalyHub treats calendar as one input among many.

### AppFlowy — 🔴 study-only (AGPL-3.0)
- **Why chosen.** Open-source Notion alternative — useful to study *how* an entity/records product is structured.
- **What DalyHub should learn.** Data-model and view architecture for flexible records; grid/board/calendar views over one dataset.
- **Relevant modules.** Notes, Projects, views/filters.
- **Repository / licence.** `AppFlowy-IO/AppFlowy` — **AGPL-3.0 → study-only. Do not copy code or link it in** ([policy](../governance/OPEN_SOURCE_POLICY.md#licensing-rules)).
- **Reusable patterns (ideas only).** Record/view separation, filter/sort model. Implement independently.
- **Risks.** Strong copyleft — a real legal risk if code leaks in. Read for ideas, write your own.

### Logseq — 🔴 study-only (AGPL-3.0)
- **Why chosen.** Open outliner/PKM with blocks, backlinks, and daily-journal-first design — close to our Diary + Notes + linking model.
- **What DalyHub should learn.** Daily-journal-as-entry-point ([Diary](../roadmap/ROADMAP_V2.md#phase-9--diary-diary)); block references; backlinking.
- **Relevant modules.** Diary, Notes, linking.
- **Repository / licence.** `logseq/logseq` — **AGPL-3.0 → study-only.**
- **Reusable patterns (ideas only).** Journal-first capture, block/backlink UX.
- **Risks.** Same strong-copyleft caution as AppFlowy.

---

## Reusable building blocks (candidate libraries)

> These are *candidates*, not commitments. Adopt via the [reuse workflow](../governance/OPEN_SOURCE_POLICY.md#approved-reuse-workflow) and the [evaluation checklist](../governance/OPEN_SOURCE_POLICY.md#reusable-evaluation-checklist). **Re-verify the licence for the exact version before adopting.**

| Building block | Solves | Repo (typical) | Licence (verify!) | Notes / risks |
|---|---|---|---|---|
| **cmdk** | [Command Palette](../design/DESIGN_SYSTEM.md#command-palette) primitive | `pacocoursey/cmdk` | 🟢 MIT | Accessible, composable command menu. **Reviewed & rejected for DS-09** (see the Command Palette evaluation): DS-08's native combobox + the DS-03 modal hooks already meet the bar, and cmdk owns no execution/catalogue/contextual model — build, add no dependency. |
| **Radix UI / primitives** | Accessible unstyled UI primitives (dialog, popover, tabs) | `radix-ui/primitives` | 🟢 MIT | Backbone for accessible [Design System](../design/DESIGN_SYSTEM.md) components. |
| **shadcn/ui** | Copy-in component patterns over Radix + utility CSS | `shadcn-ui/ui` | 🟢 MIT | Components are *copied in* (provenance comment + record the source). |
| **Tiptap / ProseMirror** | Rich Markdown editor | `ueberdosis/tiptap`, `ProseMirror/*` | 🟢 MIT | Core for the [Markdown editor](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor). Check which extensions/versions. |
| **remark / rehype** (`unified`) | Markdown parse + safe render | `remarkjs/*`, `rehypejs/*` | 🟢 MIT | **Adopted** for the Markdown pipeline ([FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline) / [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline)) — see the [FND-08 evaluation](#markdown-pipeline-evaluation-fnd-08). `react-markdown` was evaluated and **not** adopted. |
| **dnd-kit** | Accessible drag-and-drop | `clauderic/dnd-kit` | 🟢 MIT | For reordering/scheduling with keyboard equivalents ([DS-04](../design/DESIGN_SYSTEM.md#cards)). |
| **TanStack Query / Table / Virtual** | Data fetching, tables, list virtualisation | `TanStack/*` | 🟢 MIT | Virtualisation for [Timeline/Activity/Search](../../AGENTS.md#16-performance-expectations). |
| **date-fns** | Date math | `date-fns/date-fns` | 🟢 MIT | Lightweight, tree-shakeable date utilities. |
| **Lucide** | Icon set | `lucide-icons/lucide` | 🟢 ISC | Consistent iconography ([Foundations](../design/DESIGN_SYSTEM.md#foundations)). |
| **Zod** (or similar) | Runtime validation | `colinhacks/zod` | 🟢 MIT | Validate boundaries/imports ([security](../../AGENTS.md#17-security-requirements)). |
| **rehype-sanitize** (`hast-util-sanitize`) | XSS-safe rendering | `rehypejs/rehype-sanitize` | 🟢 MIT | **Adopted** (tree-based, no DOM/JSDOM — Workers-safe) for [FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline); DOMPurify+JSDOM was **rejected** (needs a DOM). See the [FND-08 evaluation](#markdown-pipeline-evaluation-fnd-08). |

> **Platform note.** The application platform and toolchain are now settled in [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain) (Cloudflare Workers + React Router v8 + Vite + Wrangler; see the verified scaffold findings below). Cloudflare **storage** services (D1, KV, R2, Durable Objects) remain a proposed, deferred direction (see [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#platform)); their SDKs/tooling are evaluated the same way when adopted. Todoist and Notion are **import/sync sources** ([X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar)), not dependencies to reuse code from.

---

## Verified scaffolds / starters

### Cloudflare `create-cloudflare` React Router starter — 🟢 reusable (MIT)
- **Why chosen.** The official, first-party way to scaffold a full-stack React Router app that runs on Cloudflare Workers. Used as the reference scaffold for [FND-01](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold) / [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain).
- **What DalyHub should learn.** The canonical wiring of React Router v8 (framework mode, SSR) + the Cloudflare Vite plugin + Wrangler, including the Workers entry adapter (`workers/app.ts`), `entry.server.tsx` streaming render, and the split `tsconfig` project references.
- **Relevant modules.** Whole-app foundation; every later module builds on this scaffold.
- **Repository / licence.** Generated via `npm create cloudflare@latest -- --framework=react-router` (C3). Template and the React Router project it derives from are **MIT** — verified against the generated `node_modules/react-router/LICENSE.md` and package metadata on **2026-07-17**. Reusable (permissive); provenance recorded in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) and inline comments in the adapted files.
- **Reusable code.** Config and entry files adapted directly (with provenance comments): `vite.config.ts`, `react-router.config.ts`, `workers/app.ts`, `app/entry.server.tsx`, `app/root.tsx`, and the `tsconfig.*` project references.
- **Reusable interaction patterns.** N/A (toolchain, not UX).
- **Risks.** The template ships extras not needed for a restrained foundation — **Tailwind CSS**, a demo "welcome" page with branding/logos, and Google Fonts links. All were removed to avoid pre-empting the design system (DS-01) and to keep the dependency footprint minimal. The C3 generator is interactive and can overwrite a directory; we generated into a throwaway temp dir and integrated files selectively, never running it over this repo.
- **Research notes (2026-07-17).** Verified current versions on npm: `react-router` 8.2.0 latest (template pins 8.0.0), `@cloudflare/vite-plugin` 1.45.1, `wrangler` 4.112.0, `vite` 8.1.5, `react` 19.2.7, `typescript` 5.9.3 (template pin; TS 7.0.2 exists but tooling targets 5.x — not adopted). `vite preview` serves the built app in the Workers runtime locally, which the Playwright smoke test relies on. All bundled/dev dependencies are permissive (MIT / Apache-2.0 / ISC); no copyleft in the tree.

---

## Storage & data kernel evaluation (FND-02)

> The build-vs-reuse evaluation behind [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage). Licences verified against installed/target versions on **2026-07-17**.

### Cloudflare D1 — 🟢 platform service (relational store)
- **Why chosen.** Cloudflare-native serverless SQLite: relational persistence with no separate database server to run or pay for, matching the single-user, Workers-based platform ([ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain)). Runs fully locally via Miniflare/Wrangler with no credentials.
- **What DalyHub uses.** The `entities` base table and all kernel persistence. Bound as `DB` in `wrangler.jsonc`.
- **Licence / provenance.** A Cloudflare platform service consumed through `wrangler` (MIT OR Apache-2.0) and `miniflare` (MIT) — no source is vendored. Nothing copyleft enters the tree.
- **Risks.** SQLite/D1 constraints (limited `ALTER`, no stored procedures, per-database size/write limits); mitigated by keeping the kernel small and the storage behind a repository contract so the store can be swapped.

### D1 migrations — 🟢 platform tooling
- **Why chosen.** First-party, git-tracked, sequential SQL migrations (`migrations/NNNN_*.sql`) applied by Wrangler (`wrangler d1 migrations apply`) and by the Workers Vitest integration in tests. Plain SQL stays portable, inspectable and recoverable.
- **What DalyHub uses.** `migrations/0001_create_entities.sql`; local scripts `db:migrations:list:local`, `db:migrate:local`.
- **Risks.** No automatic down-migrations — forward-only discipline is documented in [`DATA_KERNEL.md`](../development/DATA_KERNEL.md).

### Cloudflare Workers Vitest integration (`@cloudflare/vitest-pool-workers`) — 🟢 reusable (MIT)
- **Why chosen.** The official way to run Vitest **inside the real Workers runtime** with an isolated local D1, so the kernel is integration-tested against real D1 (not a mock) with the committed migration applied. "Drive the real thing" ([testing philosophy](../../AGENTS.md#14-testing-philosophy)) at unit-test cost.
- **What DalyHub uses.** `vitest.workers.config.ts` (the `cloudflareTest()` plugin + `readD1Migrations`), applying migrations in a setup file to `env.DB`.
- **Repository / licence.** `cloudflare/workers-sdk` — **MIT**, verified against installed **0.18.6** on **2026-07-17**. Dev-only dependency; bundles the same `wrangler@4.112.0` and `miniflare` already used, plus `esbuild`/`zod` — all permissive. Peer `vitest ^4.1.0` matches the pinned `vitest@4.1.10`.
- **Risks.** Vitest-4 line is recent and its config API changed from earlier majors (`defineWorkersConfig` → `cloudflareTest()` plugin); pinned exactly and covered by the running suite. Storage isolation is per **file** in this line, so tests reset rows in `beforeEach`.

### ORM / query-builder candidates — rejected for FND-02 (build our own thin repository)
- **Drizzle ORM** (`drizzle-orm`, 🟢 Apache-2.0) — type-safe schema + queries with good D1 support. **Rejected for now:** adds a dependency and abstraction the tiny single-table schema does not need; reconsider only via a new ADR if query complexity grows.
- **Kysely** (🟢 MIT) — typed query builder, lighter than an ORM. **Rejected:** still more machinery than prepared statements over one table.
- **Prisma** (🟡 Apache-2.0; heavier, engine-based) — **Rejected:** heavyweight for Workers/D1 and closest to the V1 stack we are leaving; the V1 Prisma schema is explicitly **not** reused.

**Decision (Depend / Adapt / Build).** **Depend** on Cloudflare D1 + Wrangler migrations + `@cloudflare/vitest-pool-workers` (dev); **Build** a small DalyHub-owned typed repository over prepared D1 statements; **Reject** ORMs/query-builders for FND-02. See [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage).

---

## Workspace isolation evaluation (FND-03)

> The build-vs-reuse evaluation behind [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context). **No new runtime or dev dependency was added** — FND-03 is a security-boundary and data-model change implemented entirely with existing TypeScript, D1 and test tooling. The candidates considered and rejected:

- **A branded-type / validation library (e.g. Zod, `newtype-ts`) for `WorkspaceId`.** Considered for the validated, branded id. **Rejected — build:** a branded string type plus a ~20-line `parseWorkspaceId` validator is smaller and clearer than a dependency, and matches the existing hand-rolled entity validation (no Zod in the kernel yet). Zod remains a candidate for larger boundary/import validation later ([security](../../AGENTS.md#17-security-requirements)), not for a single id.
- **`AsyncLocalStorage` (Node/Workers built-in) for implicit request context.** Considered for threading `WorkspaceContext`. **Rejected — do not use:** ADR-010 requires context to be passed *explicitly*; ALS is an ambient hidden dependency that obscures the very boundary the feature makes explicit, complicates tests, and is a Workers-runtime footgun. No dependency, and deliberately not the built-in.
- **A cursor signing/encryption library (e.g. a JWT/HMAC helper).** Considered for tamper-proof pagination cursors. **Rejected — unnecessary:** workspace ids are scope identifiers, not secrets, so cursors are treated as untrusted input, validated by shape + version + scope, with every value still bound in SQL. Versioned scope-binding gives the correctness guarantee without key management. Revisit only if a demonstrated security need appears.
- **An ORM/query-builder for the FK rebuild.** Already rejected for FND-02 (above); FND-03's table rebuild is plain, inspectable SQLite migration SQL (`migrations/0002_*`), consistent with ADR-009.

**Decision (Depend / Adapt / Build).** **Build** the workspace kernel, resolver, composition boundary and scoped repository with existing tooling; **add no dependency**; the foreign key and migration are plain committed D1 SQL. See [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context).

---

## EntityLinks evaluation (FND-04)

> The build-vs-reuse evaluation behind [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle). **No new runtime or dev dependency was added** — FND-04 is a kernel data-model change implemented entirely with existing TypeScript, D1 and Workers/Vitest test tooling. The candidates considered and rejected:

- **A graph database or graph library (e.g. an in-app adjacency/graph package).** Considered for storing "links between anything". **Rejected — build on D1:** the relationships DalyHub needs are typed, directed, workspace-scoped rows with referential integrity — exactly what a relational table with composite foreign keys gives, using the store already accepted in [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage). A graph engine would add an operational component and a second store for no benefit at this scale; graph traversal is not an FND-04 requirement.
- **An ORM/query-builder for the link table and its joins.** Already rejected for FND-02/FND-03; the `listForEntity` join and the create/unlink/restore statements are small, inspectable prepared SQL, consistent with ADR-009. **Rejected — build.**
- **A branded-type / validation library for `EntityLinkType`.** Considered, as for `WorkspaceId`. **Rejected — build:** a branded string plus a small `parseEntityLinkType` validator (reusing the entity kernel's dotted-identifier shape) is smaller and clearer than a dependency, with no validation framework in the kernel yet.
- **A UUID package for link ids.** **Rejected — use the platform:** the Workers-native `crypto.randomUUID()` already backs entity/workspace ids; no `uuid` dependency is warranted.
- **A cursor signing/encryption library.** **Rejected — unnecessary** (same reasoning as FND-03): the link cursor is a dedicated, versioned, scope-bound format treated as untrusted input, with every value bound in SQL. Workspace/entity ids are scope identifiers, not secrets.

**Decision (Depend / Adapt / Build).** **Build** the EntityLink kernel, D1 adapter, migration and scoped repository with existing tooling; **add no dependency**; the parent unique key, composite foreign keys and indexes are plain committed D1 SQL. See [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle).

---

## Shared Activity model evaluation (FND-05)

> The build-vs-reuse evaluation behind [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording). **No new runtime or dev dependency was added** — FND-05 is a kernel data-model + atomic-recording change implemented entirely with existing TypeScript, D1 and Workers/Vitest test tooling. The candidates considered and rejected:

- **An event-sourcing framework / event store (e.g. an off-the-shelf event-sourced aggregate library).** Considered for "an append-only event stream". **Rejected — build on D1:** DalyHub is deliberately **not** event-sourced — domain tables remain the source of truth and Activity is a history/audit stream derived atomically from meaningful mutations ([ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording)). An event-sourcing framework would impose aggregates, projections and replay the product does not want, and add a heavy dependency for what is two STRICT tables plus a small recording seam.
- **A message broker / queue / event bus (Kafka, Cloudflare Queues, a pub/sub library).** Considered for "publishing events". **Rejected — out of scope & wrong shape:** FND-05 records history transactionally with the domain mutation; there is no cross-service delivery, fan-out or async processing requirement. A broker would add an operational component and break the atomic "one mutation → one event, or neither" guarantee that a single `D1Database.batch()` provides.
- **An ORM/query-builder for the activities/subjects tables and the Timeline join.** Already rejected for FND-02/03/04; the feed/Timeline queries, the subject `IN (...)` fetch and the guarded insert statements are small, inspectable prepared SQL, consistent with [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage). **Rejected — build.**
- **A JSON-schema / validation library for the payload (e.g. Zod/Ajv).** Considered for recursive payload validation. **Rejected — build:** a small recursive validator + shared serialiser (rejecting unsupported/cyclic/non-finite values, bounding depth and encoded byte size) is smaller and clearer than a dependency, and the kernel deliberately carries no validation framework yet.
- **A UUID package for activity ids.** **Rejected — use the platform:** the Workers-native `crypto.randomUUID()` already backs entity/link/workspace ids; injectable in tests for deterministic ids.
- **A cursor signing/encryption library.** **Rejected — unnecessary** (same reasoning as FND-03/04): the Activity cursor is a dedicated, versioned, scope-bound format treated as untrusted input, with every value bound in SQL. No cursor field is a secret.

**Decision (Depend / Adapt / Build).** **Build** the Activity kernel, D1 read adapter, atomic recording seam, migration and scoped read repository with existing tooling; **add no dependency**. Atomicity uses the platform's own `D1Database.batch()` (transactional, verified against the official docs and proven in real D1 integration tests), not a bespoke or third-party transaction coordinator. See [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording).

---

## Module registry evaluation (FND-06)

> The build-vs-reuse evaluation behind [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery). **No new runtime or dev dependency was added** — the registry, validation, deterministic lookup and discovery are implemented entirely with existing TypeScript and the toolchain's own Vite `import.meta.glob`. Patterns studied and candidates rejected:

- **VS Code extension registry / contribution points — 🔴 study-only pattern.** DalyHub borrows the *shape* of "modules declare typed contribution points that the shell discovers" — routes, commands, settings as declarative contributions — but **not** the runtime plugin host, activation events, or extension marketplace. DalyHub modules are trusted compiled-in code, discovered at build time; there is no dynamic/remote loading ([ADR-013 §4.1](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery)).
- **Obsidian / editor plugin systems — 🔴 study-only.** Reinforce the "capabilities via manifest" idea, but they load third-party code at runtime, which DalyHub explicitly rejects for a single-owner product holding private data.
- **A dependency-injection / plugin framework (e.g. an IoC container, `awilix`, `tsyringe`).** Considered for wiring module capabilities. **Rejected — build:** the registry is a validate-once, freeze, index-by-id computation over trusted manifests; a DI container adds ceremony and a dependency for what a small kernel function does more clearly, and would invite a mutable service locator the ADR forbids.
- **A schema-validation library (Zod/Ajv) for manifests.** **Rejected — build & reuse:** module-id/route-path/setting-default validation is small and specific, and identifier validation is **reused** from the existing FND-02/04/05 kernels rather than re-specified — consistent with the kernel carrying no validation framework yet.
- **A file-based route generator or a custom Vite plugin for discovery.** Considered for turning manifests into routes. **Rejected — use the toolchain's own `import.meta.glob`:** it is a constrained, deterministic, build-time transform already provided by Vite (proven under Vite in unit tests and in the production build), needing no bespoke plugin. Route *composition* into React Router is left to a thin platform adapter for FND-09.
- **A cross-module import-boundary linter/framework (dependency-cruiser, custom ESLint rule).** Considered to enforce "no module imports another module's internals". **Rejected — a small repository test suffices:** a focused test resolves import specifiers against the `app/modules` tree, enforcing the boundary without a heavy analysis tool ([ADR-013 §18](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery)).

**Decision (Depend / Adapt / Build).** **Build** the module kernel (definition/capability contracts, validation, typed errors, immutable registry, pure discovery collector), the app-layer Vite glob discovery, and the platform route-contribution adapter with existing tooling; **add no dependency**. See [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery).

---

## Spine / hierarchy evaluation (FND-07)

> The build-vs-reuse evaluation behind [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics). **No new runtime or dev dependency was added** — the spine is a kernel domain model + D1 adapter implemented entirely with existing TypeScript, D1 and Workers/Vitest tooling, composing the FND-02/04/05 kernels. Candidates considered and rejected:

- **A tree / hierarchy / closure-table library (or `ltree`, nested-set, materialised-path packages).** Considered for storing and querying the parent/child tree. **Rejected — build on EntityLinks:** the spine is fixed-depth (four levels) and personal-scale; parentage is already the cross-spine relationship the EntityLink primitive exists for ([ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle)). A general graph/tree engine would be far more than a fixed four-level hierarchy needs, and the exactly-one-parent rule is enforced by a single partial unique index. Deep/unbounded traversal is explicitly out of scope.
- **An ORM / query-builder for the spine tables, joins and rollups.** Already rejected for FND-02–05; the creation batches, gated inserts and rollup aggregates are small, inspectable prepared SQL, consistent with [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage). **Rejected — build.**
- **A workflow / state-machine library for completion.** Considered for the incomplete↔complete lifecycle. **Rejected — build:** completion is a single nullable `completedAt` timestamp with idempotent transitions; a state-machine dependency would dwarf the model FND-07 deliberately keeps minimal.
- **A materialised-view / caching layer for progress rollups.** Considered for "fast progress". **Rejected — derive:** rollups are computed from current active descendants with a small, fixed number of bounded queries; a cache would add a drift/invalidation hazard the fixed-depth, personal-scale hierarchy does not warrant ([ADR-014 §rollups](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics)).
- **A UUID package / cursor signing library.** **Rejected — reuse the platform** (same reasoning as FND-02–06): Workers-native `crypto.randomUUID()` for ids, and a dedicated versioned, scope-bound cursor treated as untrusted input with every value bound in SQL.

**Decision (Depend / Adapt / Build).** **Build** the spine kernel (identifiers, record/rollup contracts, validation, cursor, repository interface), the D1 adapter, migration `0005`, the reserved-type guards and the four module manifests with existing tooling; **add no dependency**. Atomicity uses the platform's own `D1Database.batch()` and the shared `D1ActivityRecorder`. See [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics).

---

## Markdown pipeline evaluation (FND-08)

> The build-vs-reuse evaluation behind [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) (concretising [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)). Unlike FND-02–07, this item **adds runtime dependencies** — Markdown parsing and sanitisation are commodity, security-critical problems we must *not* hand-roll ([OSS policy](../governance/OPEN_SOURCE_POLICY.md)). Licences verified against the exact installed versions on **2026-07-18**.

### Selected stack — `unified` (`remark`/`rehype`) — 🟢 reusable (MIT)
- **Why chosen.** The mature, standard, actively-maintained AST-based Markdown/HTML ecosystem. It parses to mdast, converts to hast and sanitises the **tree** (not text), which is exactly the "sanitise after parsing" defence ADR-015 requires — and it runs with **no DOM/JSDOM**, so it works in the Cloudflare Workers runtime.
- **What DalyHub uses.** A minimal string-producing pipeline: `remark-parse` → `remark-gfm` → (strip footnotes) → `remark-rehype` (`allowDangerousHtml: false`) → DalyHub image/link transform → `rehype-sanitize` (one frozen allowlist schema) → `rehype-stringify`. Wrapped behind the kernel `MarkdownRenderer` contract so no library type leaks to callers.
- **Exact versions & licences (verified 2026-07-18, all MIT).** `unified` 11.0.5, `remark-parse` 11.0.0, `remark-gfm` 4.0.1, `remark-rehype` 11.1.2, `rehype-sanitize` 6.0.0, `rehype-stringify` 10.0.1. Dev-only types: `@types/hast` 3.0.5 (MIT).
- **Transitive tree.** The full closure is the `unified`/`remark`/`rehype`/`micromark`/`mdast-util`/`hast-util`/`unist-util`/`vfile` family (~90 small single-purpose packages), **all MIT** except `@ungap/structured-clone` (**ISC**) — every one permissive/allowed-by-default, no copyleft, no `no-licence` package. Verified by enumerating installed `node_modules` package metadata on 2026-07-18.
- **Workers/browser compatibility.** Pure ESM, no Node-only or DOM API requirement, no native modules, no telemetry/phone-home, no filesystem/network at runtime. Proven by a real **Workers-runtime** integration test importing the production pipeline (`test/kernel/markdown-render.test.ts`, `markdown-security.test.ts`), the production build, and the Wrangler dry-run.
- **Footprint & bundle.** The stack is imported only by `app/platform/markdown`; because no route imports it yet, it is **tree-shaken out of both the client and server bundles** (the FND-01 foundation route is unaffected). Later modules (Notes/Diary/descriptions) should lazy-load the renderer so the parser enters only the routes that need it.
- **Risks.** A larger transitive tree than DalyHub's other foundations (many tiny packages) — mitigated by their shared, well-maintained `unified`-collective governance and by keeping the stack behind one contract so it can be patched or swapped centrally. Security patches are not optional; the tree is pinned in `pnpm-lock.yaml`.

### Rejected candidates
- **`react-markdown` (🟢 MIT).** Renders straight to a React element tree (no HTML string). Reasonable, but it pairs with the same remark/rehype/sanitiser stack while pulling React into the render path and encouraging per-call plugin arrays; it also ties rendering to React (not usable on an export/non-React path). **Rejected** to avoid shipping *both* a string stack and `react-markdown`, and to keep one branded sink with non-optional sanitisation.
- **`DOMPurify` (+ `jsdom`) (🟢 MIT).** The popular sanitiser, but **DOM-based**: server-side it needs a real DOM/JSDOM, a poor fit and unnecessary weight inside Workers. `rehype-sanitize` (`hast-util-sanitize`) sanitises the hast tree with no DOM. **Rejected.**
- **Rich-text editors — Tiptap / ProseMirror / CodeMirror / Lexical / Milkdown / Monaco (mostly 🟢 MIT).** Authoring tools, not a render/storage foundation; they add large runtime weight. **Rejected for FND-08** — a future editor ([NOTES-01](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor)) must still save Markdown source.
- **Syntax highlighters — `highlight.js` / Prism / Shiki (🟢 MIT).** Deliberately excluded; code renders as escaped, inert text with no language class. Highlighting is later UI work layered onto safe output. **Rejected.**

### Reuse evaluation — `unified` Markdown/sanitiser stack
- [x] Problem is a commodity worth reusing (Markdown parsing + XSS-safe sanitisation — not a DalyHub differentiator)
- [x] Checked REFERENCE_PRODUCTS.md for existing notes (the building-blocks table already flagged remark/rehype + a sanitiser as the ADR-006 direction)
- [x] Licence read for the exact versions: **MIT** (all six runtime packages + `@types/hast`) → category: **Allowed**
- [x] Licence is Allowed
- [x] Transitive dependency tree licence-checked — **all MIT except one ISC**; no copyleft/prohibited pulled in
- [x] Maintenance health acceptable — `unified` collective, widely adopted, actively released
- [x] No known unresolved critical security issues / CVEs for the pinned versions
- [x] Footprint acceptable — small single-purpose packages; tree-shaken out of bundles until a module imports the renderer
- [x] Fits our stack (ESM, Workers-compatible, TypeScript types) and our security bar (tree-based sanitisation)
- [x] No privacy-violating telemetry / phone-home
- [x] Provenance recorded — exact versions pinned in `pnpm-lock.yaml`; MIT notices added to `THIRD_PARTY_NOTICES.md`
- [x] REFERENCE_PRODUCTS.md updated with findings (this section)

**Decision (Depend / Adapt / Build).** **Depend** on the minimal `unified` stack (`unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-stringify`); **Build** the DalyHub-owned pieces (the branded `MarkdownSource`/`SanitizedMarkdownHtml` contract and validation, the URL policy, the frozen sanitisation schema, the image/link/footnote transforms, and the one React sink); **Reject** `react-markdown`, DOMPurify+JSDOM, editors and syntax highlighters. See [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline).

---

## App shell / auth evaluation (FND-09)

> The build-vs-reuse evaluation behind [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing). FND-09 adds **one** runtime dependency (`jose`) for JWT verification — a security-critical, commodity primitive we must not hand-roll ([OSS policy](../governance/OPEN_SOURCE_POLICY.md)). Everything else (the shell, routing, navigation, theme, request boundary) is built on the existing stack. Findings verified against installed/official sources on **2026-07-18**.

### Dated documentation findings (verified 2026-07-18)

- **React Router v8 framework route configuration** (reactrouter.com; corroborated against the installed `@react-router/dev@8.0.0` type declarations). `app/routes.ts` default-exports `RouteConfig` (`RouteConfigEntry[] | Promise<RouteConfigEntry[]>` — it may be async and use `import.meta.glob`). Helpers: `route(path, file, options?, children?)`, `index(file, options?)`, `layout(file, options?, children?)`, `prefix(prefixPath, routes)`, `relative(dir)`. Each entry requires a **build-time `file`** (relative to the app directory); there is **no** runtime `lazy`/import-thunk field. This is the primary source of the ADR-013 route-contract refinement (ADR-016 §5.10).
- **React Router v8 route modules & loader/action context** (installed `react-router@8.0.0` declarations). Route modules export `default`, `loader`, `action`, `ErrorBoundary`, `HydrateFallback`, `meta`, `links`, `headers`, `handle`, `shouldRevalidate`; per-route generated types come from `./+types/<name>`. Loaders/actions receive `context` typed as `Readonly<RouterContextProvider>`; values are read with `context.get(routerContext)` where `routerContext = createContext<T>()`. Route `middleware` (`MiddlewareFunction`) is present un-prefixed.
- **Load-context injection & Cloudflare Vite plugin** (installed declarations; developers.cloudflare.com Workers/React Router guide). `createRequestHandler(build, mode)` returns `(request, loadContext?: RouterContextProvider) => Promise<Response>`. The Worker entry (`workers/app.ts`) receives `(request, env, ctx)`; DalyHub authenticates there and passes a `RouterContextProvider` carrying the validated session into the handler, so loaders read it via `context.get(...)`. Bindings (`env`) reach loaders via the `cloudflare:workers` module.
- **Cloudflare Access JWT validation** (developers.cloudflare.com, retrieved 2026-07-18). Header `Cf-Access-Jwt-Assertion`; JWKS at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`; `iss = https://<team>.cloudflareaccess.com`; `aud` is the Application Audience (AUD) tag; algorithm RS256; identity tokens carry `sub`/`email`/`identity_nonce`, whereas service tokens carry `common_name` with an empty `sub`; logout at `/cdn-cgi/access/logout`.
- **`jose` Workers/Web-Crypto compatibility** (github.com/panva/jose + npm, retrieved 2026-07-18). Latest **6.2.3**, **MIT**, zero runtime dependencies, tree-shakeable ESM, targets WebCrypto + Fetch (Workers-compatible), no telemetry. `createRemoteJWKSet(url, options?)` has a bounded cache (`cooldownDuration` 30s, `cacheMaxAge` 10m, `timeoutDuration` 5s); `jwtVerify(token, keyOrJWKS, { issuer, audience, algorithms })` verifies signature + `exp`/`nbf` and, when supplied, `iss`/`aud`. Tests use `generateKeyPair`/`SignJWT`/`createLocalJWKSet` for a network-free, non-weakened verification path.

### Reuse evaluation checklist — `jose` 6.2.3

- [x] Problem is a commodity worth reusing (JWT/JWS signature verification + JWKS — a security-critical primitive we must not hand-roll)
- [x] Checked REFERENCE_PRODUCTS.md and the official Cloudflare guidance (which uses `jose`)
- [x] Licence read for the exact version: **MIT** → category: **Allowed**
- [x] Transitive dependency tree licence-checked — **zero runtime dependencies**
- [x] Maintenance health acceptable — actively maintained, widely adopted (panva)
- [x] No known unresolved critical security issues / CVEs for the pinned version
- [x] Footprint acceptable — tree-shakeable ESM; server-only (absent from the client bundle, enforced by an architecture test)
- [x] Fits our stack (ESM, WebCrypto/Fetch, Workers-compatible, TypeScript types) and our security bar (RS256 pinned, issuer/audience/time/owner enforced)
- [x] No privacy-violating telemetry / phone-home
- [x] Provenance recorded — exact version pinned in `pnpm-lock.yaml`; MIT notice added to `THIRD_PARTY_NOTICES.md`; adapted-snippet provenance in the verifier source
- [x] REFERENCE_PRODUCTS.md updated with findings (this section)

**Decision (Depend / Adapt / Build).** **Depend** on `jose@6.2.3` for Cloudflare Access JWT verification; **Adapt** (not copy) Cloudflare's official "Validate JWTs in Workers" `createRemoteJWKSet` + `jwtVerify` shape with recorded provenance; **Build** the DalyHub-owned pieces (the storage-independent auth kernel contract/errors/validation, the owner-enforcing Access authenticator, the development authenticator, the Worker request boundary, registry-driven route/navigation composition, the cookie-backed theme, and the security-header policy) on the existing stack; **Reject** Auth.js/Lucia/Passport/Clerk/Supabase/Firebase, a second router, a global-state library, a UI framework and an icon package. See [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing).

---

## Shared Forms & field controls evaluation (DS-06)

Candidates considered for a shared forms system: **form/validation** — React Hook Form, Formik, TanStack Form, Zod-driven resolvers (all 🟢 MIT); **accessible combobox/listbox** — Radix UI, Downshift, React-Aria/React-Spectrum (all 🟢 MIT); **date** — `date-fns` (🟢 MIT). None was adopted.

- **Form/validation libraries.** None offers the DS-06 requirement that matters most — a *declared* autosave-vs-explicit save model with a stale-safe autosave coordinator — and each would impose an API shape and a runtime dependency for problems a small typed core solves. **Rejected — build:** a framework-free validation/dirty/save-state/autosave model plus two hooks (`useForm`, `useAutosaveField`), consistent with the zero-dependency precedent ([ADR-017 §17.4](../decisions/ARCHITECTURE_DECISIONS.md#adr-017-design-tokens-and-the-shared-record-layout), [ADR-019](../decisions/ARCHITECTURE_DECISIONS.md#adr-019-shared-card-identity--reorder-and-the-filter-expression--url-contract)).
- **Headless combobox libraries.** A focused `useCombobox` over a native input + `role="listbox"` meets the interaction and WCAG 2.2 AA bar for the select control and the entity-link picker at zero dependency. **Rejected — build (for now);** the door stays open to adopt one behind the same control API if requirements outgrow it.
- **Date library.** Date-only values are compared as integers and datetime as explicit-UTC ISO strings — a few pure helpers, no library. **Rejected — build.**
- **Markdown / EntityLinks.** Reused from the existing kernels (FND-08 `unified` pipeline via the `MarkdownContent` sink; FND-04 `EntityLinkRepository`) — no new dependency.

**Decision (Depend / Adapt / Build).** **Build** the DalyHub-owned forms system (the React-free model, the field anatomy and controls, the two save hosts, the combobox, and the entity-agnostic entity-link picker + server service) on the existing stack; **reuse** the FND-08 Markdown pipeline and the FND-04 EntityLink kernel; **add no dependency**, no persistence and no migration. See [ADR-022](../decisions/ARCHITECTURE_DECISIONS.md#adr-022-shared-forms--field-controls--declared-save-model-validation-boundary-and-the-entity-link-picker).

---

## Shared Search evaluation (DS-08)

> The build-vs-reuse evaluation behind [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation). **No new runtime or dev dependency was added.** For each capability a small, in-house implementation over the existing stack was smaller, dependency-free and Workers-safe, consistent with the ADR-018/019/020/022 zero-dependency precedent. Candidates reviewed (re-verify the licence for the exact version before ever adopting):

| Capability | Candidates (typical licence) | Runtime/bundle impact | Decision |
|---|---|---|---|
| **Fuzzy matching & scoring** | Fuse.js (🟢 Apache-2.0), fzf/fzy scoring (fzy 🟢 MIT, algorithm), fuzzysort (🟢 MIT), match-sorter (🟢 MIT), cmdk `command-score` (🟢 MIT) | A general fuzzy engine (Fuse.js indexing, weights, options) is far more than short-title matching needs and adds a runtime dependency; match ranges/scoring vary per library | **Build** — a ~90-line subsequence matcher with consecutive-run/word-boundary bonuses and code-point match ranges. Only the well-known *idea* of subsequence scoring was reused; no code copied, so no attribution required. |
| **Accessible combobox / listbox & keyboard navigation** | Downshift (🟢 MIT), React-Aria/React-Spectrum (🟢 Apache-2.0), cmdk (🟢 MIT), Radix (🟢 MIT) | Each imposes an API shape and a runtime dependency; DS-06 already set the precedent that a focused native combobox meets the WCAG 2.2 AA bar | **Build** — a native `role="combobox"` + `role="listbox"` with `aria-activedescendant`, reusing the DS-03/PX-02 focus/inert/scroll-lock hooks (no second focus trap). Door stays open behind the same API. |
| **Modal / focus management** | (see DS-03) | — | **Reuse** the DS-03 `useDrawerFocus`/`useBodyScrollLock`/`useInertBackground` hooks (ADR-020 §20.9). |
| **Compact search indexing / virtualisation** | FlexSearch/Lunr (🟢 varies), TanStack Virtual (🟢 MIT) | Unwarranted for a single-user app whose bounded result set (≤50) renders a handful of nodes; an index would be premature | **Reject** — bounded result counts make an index or virtualiser unnecessary. |

**Decision (Depend / Adapt / Build).** **Build** the DalyHub-owned Search system (the React-free model incl. the in-house fuzzy matcher, the runtime orchestrator, the browser controller and the combobox surface); **reuse** the DS-03 modal hooks, the PX-02 entity identity, and the DS-03 Drawer; **add no dependency**, no persistence and no migration. No third-party code was copied, so `THIRD_PARTY_NOTICES` is unchanged. See [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation).

---

## Command Palette evaluation (DS-09)

> The build-vs-reuse evaluation behind [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action). **No new runtime or dev dependency was added.** DS-08 already built the in-house fuzzy matcher, the native combobox and the safe navigation the palette reuses, so the marginal cost of a new dependency buys nothing the tokens-only, kernel-clean, Workers-safe stack does not already have — and none of the candidates own a command *execution* boundary, a serialisable catalogue or a contextual-action model. Candidates reviewed (re-verify the licence for the exact version before ever adopting):

| Capability | Candidates (typical licence) | Runtime/bundle impact | Decision |
|---|---|---|---|
| **Command-menu component** | cmdk `pacocoursey/cmdk` (🟢 MIT) | A React command-menu primitive (list, item, groups, `command-score`) — but it owns no execution boundary, catalogue transport or contextual model, imposes its own composition, and adds a runtime dependency and a second focus/portal system | **Reject & build** — DS-08's native combobox + the DS-03 modal hooks already meet the a11y bar; the palette adds the command model DS-09 needs. Only the well-known subsequence-scoring *idea* (already in DS-08) is reused; no code copied. |
| **Command / keybinding architecture** | VS Code contribution points + keybindings, Linear/Raycast command menus (🔴 study-only) | Study only — closed or too large | **Study** — informed the discriminated `navigate`/`execute` kinds, registry-declared commands, a reserved keyboard vocabulary, and context-aware ranking. Nothing vendored. |
| **Fuzzy matching, keyboard-selection, highlighting, safe navigation** | (see DS-08) | — | **Reuse** DS-08's React-free model (`~/shared/search/model`) — one matcher, one selection-maths, one navigation helper. No second copy. |
| **Modal / focus management** | (see DS-03) | — | **Reuse** the DS-03 `useDrawerFocus`/`useBodyScrollLock`/`useInertBackground` hooks (ADR-020 §20.9) — no second focus trap. |
| **Headless combobox / listbox** | Downshift (🟢 MIT), React-Aria (🟢 Apache-2.0), Ariakit (🟢 MIT) | Each imposes an API and a runtime dependency for behaviour DS-08 already ships natively | **Reject** — no large UI framework; the native combobox stays. |

**Decision (Depend / Adapt / Build).** **Build** the DalyHub-owned Command Palette + shared action system (the React-free model, the trusted catalogue boundary, the authenticated execution route, the provider/hooks/surface and the Card/Header adapters); **reuse** DS-08 Search (model, controller, transport, navigation, highlighting) and the DS-03 modal hooks; **refine** the FND-06 command contract into a discriminated union and relocate the navigation-target validator into the kernel; **add no dependency**, no persistence and no migration. No third-party code was copied, so `THIRD_PARTY_NOTICES` is unchanged. See [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action).

---

## Entry template

Copy this to add a new reference product or building block:

```markdown
### <Name> — 🟢/🟡/🔴 <reuse status> (<licence>)
- **Why chosen.** <the specific reason it's worth studying/using>
- **What DalyHub should learn.** <concrete lessons / patterns>
- **Relevant modules.** <which DalyHub modules this informs>
- **Repository / licence.** <url> — <licence + reuse category; note verification date>
- **Reusable code.** <what could be depended on/adapted, or "ideas only">
- **Reusable interaction patterns.** <UX patterns to borrow>
- **Risks.** <licence, maintenance, fit, or philosophical mismatches>
- **Research notes.** <health/CVEs/findings + date, so it isn't re-researched>
```

---

## Related documents
- [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) — the rules governing everything catalogued here.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — where borrowed interaction patterns are formalised.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the items these references inform.
- [`docs/README.md`](../README.md) — documentation index.
