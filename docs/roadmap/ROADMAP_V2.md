# ROADMAP_V2.md — The DalyHub V2 Master Implementation Roadmap

> The single source of truth for **what we build next and in what order**. DalyHub V2 is built by implementing these items one at a time, each in its own PR.
>
> **The core workflow:** [`AGENTS.md`](../../AGENTS.md) tells you *how* to build; this file tells you *what* to build. A future prompt can be as small as: *"Implement the next unchecked ROADMAP_V2 item according to AGENTS.md."*
>
> Related: product intent in [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) · patterns in [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) · architecture in [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) & [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) · reuse via [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) & [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) · lifecycle in [`IMPLEMENTATION_WORKFLOW.md`](../product/IMPLEMENTATION_WORKFLOW.md).

---

## How to read and use this roadmap

Each item is **independently implementable** and carries five fields:

- **Purpose** — what it delivers and why.
- **Dependencies** — items that must exist first (by ID).
- **Expected outcome** — the observable result when done (the acceptance intent).
- **Priority** — `P0` (foundational, blocks much), `P1` (core), `P2` (important), `P3` (later).
- **Status** — ☐ Not started · ◐ In progress · ☑ Done · ⊘ Deferred.

Rules:

- **Do one item per PR.** If an item feels too big, it's really several — split it and note the split here.
- **Respect dependencies.** Don't start an item whose dependencies aren't ☑.
- **Update status here in the same PR** that implements the item (part of the [Definition of Done](../../AGENTS.md#18-definition-of-done)).
- **No time estimates.** We sequence by dependency and priority, not calendar.
- **IDs are stable.** Reference them from PRs, [PRODUCT_DEBT](../product/PRODUCT_DEBT.md), and ADRs.

Item ID scheme: `AREA-NN` (e.g. `FND-01`, `DS-03`, `TODAY-02`).

Legend: **☐** not started **◐** in progress **☑** done **⊘** deferred

---

## Phase 0 — Foundation (`FND`)

*The kernel. Nothing else can exist without it. All `P0`.*

### ◐ FND-01 — Repository & toolchain scaffold
- **Purpose.** Establish the app skeleton: language/framework, build, lint, format, typecheck, test runner, CI, and the deployment target per [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md).
- **Dependencies.** None.
- **Expected outcome.** `install`, `build`, `lint`, `test` all run green in CI; a trivial page deploys to the target environment.
- **Priority.** P0.
- **Status: ◐ In progress.** The application platform and toolchain are chosen and accepted ([ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain)): React Router v8 (framework mode) + React 19 + TypeScript on Cloudflare Workers, built with Vite + the Cloudflare Vite plugin, managed with pnpm/Corepack and Wrangler. A restrained foundation page renders through the Workers runtime locally and a `/health` endpoint returns JSON. `format`, `lint`, `typecheck`, unit/component tests (Vitest + RTL), production build, and a Playwright Chromium smoke test all pass locally and in GitHub Actions CI. Wrangler configuration is validated and the build passes a credential-free `deploy --dry-run`. **The only remaining item is an actual deployment to Cloudflare Workers**, which needs a Cloudflare account, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, and an approved target (see [`docs/development/DEPLOYMENT.md`](../development/DEPLOYMENT.md)). Marked `☑ Done` only once that deployment is verified. **Owner sequencing decision (2026-07-17):** live deployment verification is **deferred by owner decision** and **does not block subsequent local implementation**. FND-01's application scaffold, build, test suite, CI and credential-free deploy dry-run are complete and green; the technical dependency FND-02 needs from FND-01 is therefore treated as satisfied. This is a deliberate, owner-approved sequencing exception — FND-01 stays `◐ In progress` (not `☑ Done`) until deployment is actually verified, but product development proceeds on top of it.

### ☑ FND-02 — Data kernel: entities & storage
- **Purpose.** Implement the core entity substrate (a uniform record: id, type, workspace, timestamps, soft-delete) and the storage layer. Backs every entity type.
- **Dependencies.** FND-01 (its scaffold/build/test/CI are green; live Cloudflare deployment was deferred by owner decision and does not block this item — see FND-01's note).
- **Expected outcome.** Entities can be created/read/updated/soft-deleted through a typed contract, persisted and migration-managed. Ref: [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy).
- **Priority.** P0.
- **Status: ☑ Done.** The entity kernel is implemented and accepted via [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage): a storage-independent `EntityRepository` contract (`app/kernel/entities`) with a **Cloudflare D1** adapter (`app/platform/storage/d1`) over prepared, parameterised statements — no ORM. The base `entities` table (id, workspace_id, type, title, created_at, updated_at, deleted_at) is created by a committed D1 migration (`migrations/0001_create_entities.sql`) with CHECK constraints and access-path indexes. Operations — `create`, `getById`, `update` (title only), `list` (bounded, deterministic cursor pagination, type filter, deleted excluded by default), `softDelete`/`restore` (idempotent, defined outcomes) — all require `workspaceId`, are strongly typed (no `any`), and validate at the boundary. The suite runs pure unit tests **and** real D1 integration tests inside the Workers runtime (Cloudflare's official Vitest integration, migration applied to an isolated local database); `pnpm verify` and CI are green. Domain-specific fields, EntityLinks, Activity, the spine, and full workspace isolation are explicitly **out of scope** and left to their own roadmap items. `workspace_id` is carried and required but complete cross-workspace isolation remains [FND-03](#-fnd-03--workspace-isolation).

### ☑ FND-03 — Workspace isolation
- **Purpose.** Introduce the workspace boundary; scope all data access to a workspace as an organisational *and* security boundary.
- **Dependencies.** FND-02.
- **Expected outcome.** Every query is workspace-scoped server-side; data cannot leak across workspaces. Ref: [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation).
- **Priority.** P0.
- **Status: ☑ Done.** Workspace is now a real, persisted kernel/security boundary, accepted via [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context) (the concrete implementation of [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation)). A minimal `workspaces` table (id + UTC timestamps) is created by migration `0002_create_workspaces_and_enforce_scope.sql`, which back-fills a workspace for every existing `entities.workspace_id` and rebuilds `entities` with an **enforced foreign key** (`ON DELETE RESTRICT`) — the database rejects orphaned entities and refuses to delete a workspace that still owns entities, verified by real D1 integration tests including a sequential 0001→0002 migration test over seeded data. A storage-independent **workspace kernel** (`app/kernel/workspaces`: branded `WorkspaceId`, `WorkspaceContext`, request-free `WorkspaceContextResolver`, low-level `WorkspaceRepository`) plus a **server composition boundary** (`app/platform/workspaces`) resolve scope from a trusted `DEFAULT_WORKSPACE_ID` binding and fail closed. The module-facing `EntityRepository` is now **workspace-bound at construction** (`createEntityRepository(db, context)`); no module method accepts a `workspaceId`, every statement is scoped in SQL, cross-workspace reads/updates/deletes/restores reveal nothing, and pagination cursors are versioned and bound to workspace + filter + deleted-mode. Isolation is deliberately independent of authentication — [FND-09](#-fnd-09--app-shell-routing--auth) will swap the static resolver for an authenticated one behind the same interface. `pnpm verify`, CI and the credential-free deploy dry-run are green.

### ☑ FND-04 — EntityLinks
- **Purpose.** Typed, bidirectional links between any two entities as a kernel primitive.
- **Dependencies.** FND-02.
- **Expected outcome.** Any entity links to any other; links are queryable from both sides; deleting an entity handles its links cleanly. Ref: [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks).
- **Priority.** P0.
- **Status: ☑ Done.** The typed, workspace-bound EntityLink kernel primitive is implemented and accepted via [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle) (the concrete implementation of [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)): a storage-independent kernel (`app/kernel/entity-links`: branded `EntityLinkType`, `EntityLinkRecord`/`EntityLinkView`, validation, a dedicated versioned cursor, the workspace-bound `EntityLinkRepository` contract) with a **Cloudflare D1** adapter (`app/platform/storage/d1`) over prepared statements — no ORM. Migration `0003_create_entity_links.sql` adds the parent `UNIQUE (workspace_id, id)` key on `entities` and creates the STRICT `entity_links` table with **composite foreign keys** (`(workspace_id, source/target_entity_id) → entities (workspace_id, id)`, `ON DELETE RESTRICT`), a self-link `CHECK`, an identity uniqueness index and access-path indexes. A relationship is stored **once** with preserved direction and is queryable as *outgoing* from its source and *incoming* from its target; create is idempotent (`created`/`already_exists`/`restored`, restoring the same id after unlink); unlinking is reversible soft deletion; **endpoint soft-delete hides but preserves** links (no destructive cascade), endpoint restore reveals them, and explicitly-unlinked links stay unlinked. Queries are bounded and cursor-paginated with cursors bound to workspace + anchor + direction + type; the counterpart entity is returned via a joined query (no N+1); cross-workspace operations disclose nothing; all SQL values are parameter-bound. The composition boundary (`resolveWorkspaceScope`) now exposes both `entities` and `entityLinks`. Proven by real Workers/D1 integration tests (schema, direct-SQL integrity, creation, bidirectional queries, pagination, cursor scope-binding, lifecycle and the endpoint delete/restore contract) plus pure unit tests; `pnpm verify`, CI and the credential-free deploy dry-run are green. Activity events ([FND-05](#-fnd-05--shared-activity-model)) and link-type registration ([FND-06](#-fnd-06--module-registry)) are explicitly **out of scope**.

### ☑ FND-05 — Shared Activity model
- **Purpose.** One append-only activity/event stream that every entity change writes to.
- **Dependencies.** FND-02.
- **Expected outcome.** Mutations append uniform activity events; events are queryable per-entity (Timeline) and per-scope (Activity Feed). Ref: [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model).
- **Priority.** P0.
- **Status: ☑ Done.** The single, append-only, workspace-scoped Activity model is implemented and accepted via [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording) (the concrete implementation of [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model)): a storage-independent kernel (`app/kernel/activity`: branded `ActivityType`, `ActivityRecord`, `ActivityActor`/`ActivitySubject`, payload rules + shared JSON serialiser, a dedicated versioned cursor, the **read-only** `ActivityRepository`, and the recording seam) with a **Cloudflare D1** adapter (`app/platform/storage/d1`) over prepared statements — no ORM. Migration `0004_create_activities.sql` creates the STRICT `activities` and `activity_subjects` tables (parent `UNIQUE (workspace_id, id)`, composite foreign keys `ON DELETE RESTRICT`, access-path indexes); it is additive with **no backfill**. Every successful, meaningful Entity and EntityLink mutation appends exactly one uniform event **atomically** with the domain change via one `D1Database.batch()`, the event insert guarded on the domain statement's `changes()` — so failed mutations, idempotent no-ops and losing concurrent racers append nothing, and an Activity-insert failure rolls back the domain mutation. Events carry a trusted server-derived actor (a `system` actor today; FND-09 swaps in an authenticated user with no schema change), a validated branded type, one UTC timestamp shared with the domain record, and a bounded, safely-parsed JSON payload. A normalised subject association relates one **or many** entities to an event, so an EntityLink event appears in **both** endpoints' timelines while remaining one event. Queries — the workspace Activity Feed and per-entity Timeline (anchor active *or* soft-deleted) — are workspace-isolated, newest-first, bounded, cursor-paginated (dedicated scope-bound cursor) and free of N+1 lookups. Proven by real Workers/D1 integration tests (a `changes()`-across-batch proof, schema, direct-SQL integrity, validation, queries/cursors, entity & link mutation events, atomic rollback under forced failure, and concurrency) plus pure unit tests; all FND-02/03/04 tests remain green. `pnpm verify`, CI and the credential-free deploy dry-run are green. No new runtime dependency. The Timeline/Activity-Feed **UI**, the Module Registry ([FND-06](#-fnd-06--module-registry)) and later items are explicitly **out of scope**.

### ☑ FND-06 — Module registry
- **Purpose.** The mechanism by which modules self-register routes, entity types, commands, search providers, and settings.
- **Dependencies.** FND-02.
- **Expected outcome.** A new module is added without editing central switch statements; the shell discovers it via the registry. Ref: [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry).
- **Priority.** P0.
- **Status: ☑ Done.** The trusted, typed, self-registering module registry is implemented and accepted via [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery) (the concrete implementation of [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry)): a storage-independent kernel (`app/kernel/modules`: branded `ModuleId`, the declarative `ModuleDefinition` + capability contracts, the `defineModule` authoring helper, boundary validation, typed registry errors, the pure discovery collector, and the immutable `ModuleRegistry` with `createModuleRegistry`). Each module declares one side-effect-free manifest exposing readonly capability collections — **routes, entity types, EntityLink types, Activity event types, commands, search providers and settings**. Discovery is automatic and build-time: a constrained Vite `import.meta.glob` over the documented `app/modules/<module-id>/module.ts` convention (`app/modules/discover-modules.ts`) — **no central switch statement and no manually-maintained module array** — with the pure collection/validation kept in the kernel so it stays free of Vite/React Router/Cloudflare types. The registry is validated once and **immutable**: fresh defensive copies, deep-frozen results, deterministic ordering independent of filesystem enumeration, `null` for unknown lookups, and no registration after construction. It reuses the existing FND-02/04/05 identifier validators (no duplication, no database enums, no migration), namespaces command/route/search/setting ids under their module, reserves the kernel lifecycle Activity types, and fails fast on every collision class (duplicate module id, route id, route path, entity type, link type, Activity type, command id, search-provider id, setting key, invalid route parent, reserved type, invalid setting default, malformed discovery export). Static declaration is kept separate from runtime execution: command/search handlers receive an explicit `ModuleRuntimeContext` and are never invoked to build the registry (proven with counters). A platform adapter (`app/platform/modules/route-contribution-adapter.ts`) resolves route contributions into a nesting tree for FND-09 without eagerly loading page components. Proven by focused unit tests (definition/validation, every collision class, registry behaviour/immutability, lazy behaviour, automatic fixture discovery, the production discovery glob, and a cross-module import-boundary check) plus the untouched FND-02–05 kernel suite; `pnpm verify`, CI and the credential-free deploy dry-run are green. **No new dependency.** Navigation, route composition, the command palette, global search and settings surfaces — and any real product module — are built later by [FND-09](#-fnd-09--app-shell-routing--auth) and beyond, and are explicitly **out of scope** here; the registry only exposes the typed seams they will consume. FND-01's deferred deployment status is unchanged.

### ☑ FND-07 — Area → Goal → Project → Task hierarchy
- **Purpose.** Implement the backbone model and its rollup semantics (tasks → projects → goals → areas).
- **Dependencies.** FND-02, FND-04, FND-05.
- **Expected outcome.** The four spine entities exist with parent/child relations and correct progress rollup; changes emit activity. Ref: [`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model).
- **Priority.** P0.
- **Status: ☑ Done.** Built the first real domain model as a kernel-level spine (`app/kernel/spine`) plus a workspace-bound `SpineRepository` with a D1 adapter. First-class `area`/`goal`/`project`/`task` records stay ordinary `entities` rows; the only additive state is a STRICT `spine_records (workspace_id, entity_id, kind, completed_at)` table (migration `0005`) whose composite foreign key to `entities(workspace_id, id, type)` makes a spine kind that disagrees with its entity type impossible. Structural parentage uses five directed **child → parent** EntityLink types (`goal.belongs_to_area`, `project.belongs_to_area`, `project.advances_goal`, `task.belongs_to_area`, `task.belongs_to_project`); a partial unique index over `entity_links` enforces *exactly one active parent* per active non-Area record at the database. Completion is a single `completedAt` (Areas never complete, by CHECK); completion and soft-deletion are independent and never cascade. Rollups (Project/Goal/Area) are derived from active descendants with bounded SQL — never stored. Creation, move, complete/reopen, rename and soft-delete/restore are atomic (one `D1Database.batch()` with `changes()`-guarded Activity appends via the shared `D1ActivityRecorder`); parent validity is folded into the mutating SQL so no orphan can ever commit. The generic Entity/EntityLink repositories now refuse to mutate reserved spine types (reads still work), keeping the SpineRepository authoritative without any registry singleton. Four side-effect-free module manifests (`areas`, `goals`, `projects`, `tasks`) are discovered automatically. Comprehensive real Workers/D1 integration tests cover schema/integrity, creation, reads, completion, rollups, lifecycle, reservation and concurrency. Accepted via [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics) (concretising [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy)). No UI, and no new dependency. See [`SPINE_MODEL.md`](../development/SPINE_MODEL.md).

### ☑ FND-08 — Markdown pipeline
- **Status: ☑ Done.** One shared, secure Markdown pipeline is implemented and accepted via [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) (the concrete implementation of [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)). A storage- and runtime-independent **Markdown kernel** (`app/kernel/markdown`) defines the durable, branded `MarkdownSource` (validated by `parseMarkdownSource`: strings only, exact source preserved, NUL/control-characters rejected, bounded at **1 MiB of UTF-8 source**), the branded safe-output `SanitizedMarkdownHtml`, the `MarkdownRenderer` contract and typed errors — importing no React, DOM, D1 or parser types. A **rendering implementation** (`app/platform/markdown`) runs one deterministic, stateless `unified` pipeline (`remark-parse` → `remark-gfm` → strip-footnotes → `remark-rehype` with `allowDangerousHtml: false` → image/link safe-content transform → `rehype-sanitize` with a single **frozen allowlist** → `rehype-stringify`): raw HTML is dropped before it can become DOM and sanitised as defence in depth; a restrained CommonMark+GFM profile is supported (headings, emphasis, strong, strikethrough, ordered/unordered/nested lists, blockquotes, inline/fenced code, thematic breaks, line breaks, links, autolinks, tables, task lists) while raw HTML, scripts, SVG/MathML, embeds, media, math, diagrams, syntax highlighting and footnotes are excluded; an allowlist **URL policy** (relative/fragment/`http`/`https`/`mailto`/`tel`, browser-faithful against obfuscation) neutralises unsafe links to plain text; Markdown images **never** emit `<img>` or fetch (they become a labelled safe link or alt text); code is always escaped with no language class; task-list checkboxes are display-only and are **not** Task records; no heading ids are generated. One React boundary (`app/shared/markdown/MarkdownContent`) is the **only** application source using `dangerouslySetInnerHTML`, consuming only the branded output — enforced by a repository test. Proven by a Workers-runtime integration suite importing the production pipeline (functional profile, source preservation, determinism, size limits, and an original XSS/URL/attribute/remote-image/escaping/malformed-input corpus) plus pure source/URL-policy unit tests and React component tests. Runtime dependencies added (all **MIT**, exact-pinned, Workers-compatible, no telemetry): `unified` 11.0.5, `remark-parse` 11.0.0, `remark-gfm` 4.0.1, `remark-rehype` 11.1.2, `rehype-sanitize` 6.0.0, `rehype-stringify` 10.0.1 (+ `@types/hast` dev). The parser stack stays out of the initial client bundle (tree-shaken; later modules lazy-load it). `pnpm run format:check`, `lint`, `typecheck`, `test` (unit + Workers/D1), `build` and the credential-free deploy dry-run are green. **No migration, no database change, no product route, no module, no editor and no persistence** — those belong to Notes/Diary/descriptions later. See [`MARKDOWN_PIPELINE.md`](../development/MARKDOWN_PIPELINE.md).
- **Dependencies.** FND-01.
- **Expected outcome.** Markdown is stored as source, rendered safely through one renderer, reused by Notes/Diary/descriptions. Ref: [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy), [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline).
- **Priority.** P0.

### ☑ FND-09 — App shell, routing & auth
- **Purpose.** The application shell: navigation frame, routing, session/auth (single-user first), theme provider.
- **Dependencies.** FND-01, FND-03, FND-06.
- **Expected outcome.** A navigable shell that loads modules from the registry, with light/dark theming and an authenticated session.
- **Priority.** P0.
- **Status: ☑ Done.** Implemented and accepted via [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing). Cloudflare Access is the identity provider and DalyHub cryptographically validates the `Cf-Access-Jwt-Assertion` token in the Worker (`jose` 6.2.3, MIT) — issuer, audience, RS256, time claims, identity-vs-service token, and independent `OWNER_EMAIL` enforcement — at a request boundary guaranteed to run before every protected loader/action; the validated `sub` becomes the Activity `user` actor while the workspace stays server-derived (`DEFAULT_WORKSPACE_ID`). A responsive, accessible (WCAG 2.2 AA) shell composes registry-driven routes and primary navigation with no central list, over a restrained `system`/`light`/`dark`, flash-free, cookie-backed theme; an explicit, fail-closed development authenticator supports local/CI use. FND-06's lazy route thunk was refined to a declarative build-time `file` reference (ADR-016 §5.10, updating [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery)). No new migration; migrations 0001–0005 unchanged. The Design System (DS-01) and all product experiences were **not** started. FND-01's live Cloudflare deployment remains the explicitly owner-deferred final condition and is unchanged. See [docs/development/APP_SHELL_AUTH.md](../development/APP_SHELL_AUTH.md).

---

## Phase 1 — Shared Design System (`DS`)

*The reusable interaction language from [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md). Every later module consumes these. Build them before the modules that need them.*

### ☐ DS-01 — Design tokens & theming
- **Purpose.** Colour, spacing, typography, radius, shadow, motion, z-index, breakpoints as tokens; light/dark maps.
- **Dependencies.** FND-01.
- **Expected outcome.** All subsequent UI consumes tokens; no hard-coded design values; theme switch works. Ref: [Foundations](../design/DESIGN_SYSTEM.md#foundations).
- **Priority.** P0.

### ☐ DS-02 — Shared Record Layout (Header + Summary + Tabs)
- **Purpose.** The universal record scaffold every entity view uses.
- **Dependencies.** DS-01, FND-07.
- **Expected outcome.** A single Record Layout renders header/summary/tabs for any entity type. Ref: [Record Header](../design/DESIGN_SYSTEM.md#record-header).
- **Priority.** P0.

### ☐ DS-03 — Shared Drawer
- **Purpose.** The side/sheet drawer that opens any record without losing place; stackable, deep-linkable.
- **Dependencies.** DS-02.
- **Expected outcome.** Any entity opens in the Drawer over current context; state restored on close; mobile adaptation. Ref: [Drawer](../design/DESIGN_SYSTEM.md#drawer).
- **Priority.** P0.

### ☐ DS-04 — Shared Cards
- **Purpose.** The one configurable Card component for lists/boards/grids.
- **Dependencies.** DS-01, FND-07.
- **Expected outcome.** All entity types render via one Card; supports selection, quick actions, density. Ref: [Cards](../design/DESIGN_SYSTEM.md#cards).
- **Priority.** P0.

### ☐ DS-05 — Shared Timeline & Activity Feed
- **Purpose.** Render the shared Activity model at record scope (Timeline) and cross-scope (Activity Feed) with one component.
- **Dependencies.** DS-01, FND-05.
- **Expected outcome.** Timeline and Activity Feed render uniform events; grouped, filterable, virtualised. Ref: [Timeline](../design/DESIGN_SYSTEM.md#timeline).
- **Priority.** P0.

### ☐ DS-06 — Shared Forms & field controls
- **Purpose.** One control per field type, inline validation, autosave/explicit-save, the entity-link picker.
- **Dependencies.** DS-01, FND-04, FND-08.
- **Expected outcome.** All create/edit UIs use shared controls; link picker creates EntityLinks. Ref: [Forms](../design/DESIGN_SYSTEM.md#forms).
- **Priority.** P0.

### ☐ DS-07 — Shared Filters
- **Purpose.** The one filter system (bar, chips, saved views, URL-reflected) used by every collection.
- **Dependencies.** DS-04.
- **Expected outcome.** A reusable filter system consumed by Today, Projects, Search, and all lists. Ref: [Filters](../design/DESIGN_SYSTEM.md#filters).
- **Priority.** P1.

### ☐ DS-08 — Shared Search
- **Purpose.** Unified search surface with the per-module search-provider interface.
- **Dependencies.** DS-03, FND-06.
- **Expected outcome.** Global search returns grouped results from all registered modules; opens in Drawer. Ref: [Search](../design/DESIGN_SYSTEM.md#search).
- **Priority.** P1.

### ☐ DS-09 — Command Palette & Quick Actions
- **Purpose.** The keyboard shell (`⌘K`) plus inline quick actions; modules register commands.
- **Dependencies.** DS-08, FND-06.
- **Expected outcome.** Every action reachable by keyboard; context-aware commands; quick actions on cards/headers. Ref: [Command Palette](../design/DESIGN_SYSTEM.md#command-palette).
- **Priority.** P1.

### ☐ DS-10 — Inspector, Settings, and feedback states
- **Purpose.** Shared Inspector, Settings layout, and the [Success/Error/Loading/Empty](../design/DESIGN_SYSTEM.md#success-feedback) states.
- **Dependencies.** DS-06.
- **Expected outcome.** Reusable inspector/settings surfaces and consistent feedback/loading/empty patterns available product-wide.
- **Priority.** P1.

### ☐ DS-11 — Accessibility & responsive baseline
- **Purpose.** Bake WCAG 2.2 AA and responsive behaviour into the shared components; add automated a11y checks.
- **Dependencies.** DS-02…DS-10.
- **Expected outcome.** Shared components pass automated + manual a11y checks and adapt across breakpoints. Ref: [Accessibility](../design/DESIGN_SYSTEM.md#accessibility).
- **Priority.** P1.

---

## Phase 2 — Today / Execution Workspace (`TODAY`)

*Where the user runs their day. The product's daily home. Depends on the Design System and the spine.*

### ☐ TODAY-01 — Execution Workspace
- **Purpose.** The Today surface: what's due, scheduled, and chosen for today, in one focused view.
- **Dependencies.** DS-04, DS-07, FND-07.
- **Expected outcome.** A single view of today's tasks across projects/areas, reorderable, completable inline. **P1.**

### ☐ TODAY-02 — Task Drawer
- **Purpose.** Open any task in the shared Drawer with full detail, links, and activity, without leaving Today.
- **Dependencies.** DS-03, TODAY-01.
- **Expected outcome.** Task opens in Drawer with editable fields, links to project/goal, and its timeline. **P1.**

### ☐ TODAY-03 — Waiting
- **Purpose.** Track tasks blocked on someone/something else ("waiting for").
- **Dependencies.** TODAY-01, FND-04.
- **Expected outcome.** A Waiting view listing delegated/blocked items with who/what they wait on and since when. **P2.**

### ☐ TODAY-04 — Planning
- **Purpose.** Plan the day/week — pull from backlog, schedule, and set intent.
- **Dependencies.** TODAY-01, DS-07.
- **Expected outcome.** A planning surface to move tasks into today/this week and set a daily focus. **P2.**

### ☐ TODAY-05 — Keyboard Workflow
- **Purpose.** Full keyboard operation of Today (capture, complete, reschedule, navigate) via palette + shortcuts.
- **Dependencies.** DS-09, TODAY-01.
- **Expected outcome.** A user can run the entire day without a mouse. **P2.**

### ☐ TODAY-06 — Mobile
- **Purpose.** The mobile-complete Today experience.
- **Dependencies.** DS-11, TODAY-01.
- **Expected outcome.** Today is fully usable on a phone with adapted layout and swipe quick actions. **P2.**

---

## Phase 3 — Projects (`PROJ`)

*Where sustained work is organised.*

### ☐ PROJ-01 — Overview
- **Purpose.** The project home: summary, tasks, key links, and progress via the Record Layout.
- **Dependencies.** DS-02, DS-04, FND-07.
- **Expected outcome.** A project renders with summary, its task list, and rollup progress. **P1.**

### ☐ PROJ-02 — Health
- **Purpose.** Signal whether a project is on track (progress, staleness, blockers, upcoming).
- **Dependencies.** PROJ-01, FND-05.
- **Expected outcome.** A health indicator surfacing at-risk/stale/blocked projects with reasons. **P2.**

### ☐ PROJ-03 — Knowledge
- **Purpose.** The project's notes/documents in one place, using the Markdown pipeline.
- **Dependencies.** PROJ-01, FND-08, NOTES-01.
- **Expected outcome.** Notes linked to the project are browsable/editable within it. **P2.**

### ☐ PROJ-04 — Activity
- **Purpose.** The project's Timeline/Activity from the shared model.
- **Dependencies.** PROJ-01, DS-05.
- **Expected outcome.** The Activity tab shows the project's event history. **P2.**

### ☐ PROJ-05 — Settings
- **Purpose.** Project configuration via the shared Settings pattern.
- **Dependencies.** PROJ-01, DS-10.
- **Expected outcome.** Project settings (area/goal, status, archival) via shared controls. **P2.**

### ☐ PROJ-06 — Mobile
- **Purpose.** Mobile-complete Projects.
- **Dependencies.** DS-11, PROJ-01.
- **Expected outcome.** Projects fully usable on a phone. **P3.**

---

## Phase 4 — Areas & Goals (`AREA`)

### ☐ AREA-01 — Area overview
- **Purpose.** The Area home: its goals, projects, and health, using the Record Layout.
- **Dependencies.** DS-02, FND-07.
- **Expected outcome.** An Area shows its goals/projects and rolled-up momentum. **P1.**

### ☐ AREA-02 — Goals
- **Purpose.** Goal records with target/definition-of-done and progress from linked projects.
- **Dependencies.** AREA-01, FND-07.
- **Expected outcome.** Goals render with completion criteria and roll up project progress. **P2.**

### ☐ AREA-03 — Alignment view
- **Purpose.** Show whether daily action matches stated goals (the intention↔action gap).
- **Dependencies.** AREA-02, TODAY-01.
- **Expected outcome.** A view relating recent task activity to goals, surfacing neglected goals. **P2.**

### ☐ AREA-04 — Mobile
- **Purpose.** Mobile-complete Areas & Goals.
- **Dependencies.** DS-11, AREA-01.
- **Expected outcome.** Areas/Goals usable on a phone. **P3.**

---

## Phase 5 — Notes (`NOTES`)

### ☐ NOTES-01 — Note record & Markdown editor
- **Purpose.** Notes as first-class Markdown records, using the shared pipeline and editor.
- **Dependencies.** FND-08, DS-02, DS-06.
- **Expected outcome.** Create/edit/read Markdown notes with the Record Layout. **P1.**

### ☐ NOTES-02 — Linking & backlinks
- **Purpose.** Link notes to any entity and surface backlinks.
- **Dependencies.** NOTES-01, FND-04.
- **Expected outcome.** Notes link to entities; linked entities show the note as a backlink. **P2.**

### ☐ NOTES-03 — Organisation & search
- **Purpose.** Browse/filter/search notes by area, tag, and content.
- **Dependencies.** NOTES-01, DS-07, DS-08.
- **Expected outcome.** Notes are findable via shared filters and search. **P2.**

### ☐ NOTES-04 — Mobile
- **Purpose.** Mobile-complete Notes.
- **Dependencies.** DS-11, NOTES-01.
- **Expected outcome.** Notes readable/editable on a phone. **P3.**

---

## Phase 6 — Meetings (`MEET`)

### ☐ MEET-01 — Meeting record
- **Purpose.** Meetings capturing attendees (People), agenda, notes, and outcomes, in the Record Layout.
- **Dependencies.** DS-02, FND-04, PEOPLE-01, NOTES-01.
- **Expected outcome.** Create a meeting, attach people and notes, record decisions. **P2.**

### ☐ MEET-02 — Follow-ups → Tasks
- **Purpose.** Turn meeting outcomes into linked tasks (manually; AI-assisted via AI-02).
- **Dependencies.** MEET-01, FND-07.
- **Expected outcome.** Action items become tasks linked back to the meeting. **P2.**

### ☐ MEET-03 — People & history integration
- **Purpose.** A meeting contributes to each attendee's People timeline.
- **Dependencies.** MEET-01, PEOPLE-02, DS-05.
- **Expected outcome.** Meetings appear in the relevant People timelines. **P2.**

### ☐ MEET-04 — Mobile
- **Purpose.** Mobile-complete Meetings (capture during/after a meeting).
- **Dependencies.** DS-11, MEET-01.
- **Expected outcome.** Meetings usable on a phone. **P3.**

---

## Phase 7 — People (`PEOPLE`)

*Care, not CRM (see [relationship philosophy](../../AGENTS.md#5-relationship-philosophy)).*

### ☐ PEOPLE-01 — Person record
- **Purpose.** People as first-class entities with the Record Layout and privacy-sensitive handling.
- **Dependencies.** DS-02, FND-04.
- **Expected outcome.** Create/edit a person; link to meetings/tasks/notes. **P2.**

### ☐ PEOPLE-02 — Relationship timeline
- **Purpose.** A person's accumulated history from the shared Activity model (meetings, commitments, notes).
- **Dependencies.** PEOPLE-01, DS-05.
- **Expected outcome.** A person shows a unified timeline of shared history. **P2.**

### ☐ PEOPLE-03 — Stay-in-touch signals
- **Purpose.** Gentle, calm prompts to reconnect (never nagging).
- **Dependencies.** PEOPLE-02.
- **Expected outcome.** Surfaces "haven't spoken in a while" without guilt mechanics. **P3.**

### ☐ PEOPLE-04 — Mobile
- **Purpose.** Mobile-complete People.
- **Dependencies.** DS-11, PEOPLE-01.
- **Expected outcome.** People usable on a phone. **P3.**

---

## Phase 8 — Assets (`ASSET`)

### ☐ ASSET-01 — Asset record
- **Purpose.** Track things of value (physical/digital/financial) with type-specific metadata, in the Record Layout.
- **Dependencies.** DS-02, FND-04.
- **Expected outcome.** Create/edit assets with metadata and links. **P3.**

### ☐ ASSET-02 — History & renewals
- **Purpose.** Track maintenance, value changes, warranties, and renewal reminders.
- **Dependencies.** ASSET-01, DS-05.
- **Expected outcome.** An asset shows its history and upcoming renewals (calm reminders). **P3.**

### ☐ ASSET-03 — Mobile
- **Purpose.** Mobile-complete Assets.
- **Dependencies.** DS-11, ASSET-01.
- **Expected outcome.** Assets usable on a phone. **P3.**

---

## Phase 9 — Diary (`DIARY`)

### ☐ DIARY-01 — Daily entry
- **Purpose.** Dated Markdown journal entries, private by nature.
- **Dependencies.** FND-08, DS-02.
- **Expected outcome.** Write/read dated diary entries with the Markdown editor. **P3.**

### ☐ DIARY-02 — Day context links
- **Purpose.** Link a diary entry to that day's meetings/tasks/people without forcing structure.
- **Dependencies.** DIARY-01, FND-04.
- **Expected outcome.** Entries optionally surface the day's related records. **P3.**

### ☐ DIARY-03 — Mobile
- **Purpose.** Mobile-complete Diary (capture on the go).
- **Dependencies.** DS-11, DIARY-01.
- **Expected outcome.** Diary usable on a phone. **P3.**

---

## Phase 10 — Review (`REVIEW`)

### ☐ REVIEW-01 — Review ritual framework
- **Purpose.** Daily/weekly/monthly/quarterly review flows operating over the whole system.
- **Dependencies.** TODAY-01, PROJ-01, AREA-02.
- **Expected outcome.** Guided review sessions that surface what to process, celebrate, and re-plan. **P2.**

### ☐ REVIEW-02 — Weekly review
- **Purpose.** The flagship weekly review: inbox to zero, project check, goal alignment.
- **Dependencies.** REVIEW-01, AREA-03.
- **Expected outcome.** A complete weekly review flow with clear close-out. **P2.**

### ☐ REVIEW-03 — Insights & alignment
- **Purpose.** Calm, honest reflection data (what moved, what stalled) — no vanity metrics.
- **Dependencies.** REVIEW-01, FND-05.
- **Expected outcome.** Review shows progress signals drawn from real activity. **P3.**

### ☐ REVIEW-04 — Mobile
- **Purpose.** Mobile-complete Review.
- **Dependencies.** DS-11, REVIEW-01.
- **Expected outcome.** Review usable on a phone. **P3.**

---

## Phase 11 — AI (`AI`)

*Propose, never act (see [AI philosophy](../../AGENTS.md#8-ai-philosophy) & [ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture)).*

### ☐ AI-01 — Proposal architecture & review UI
- **Purpose.** The core proposal engine: AI emits structured, reviewable change proposals; the user accepts/edits/rejects, whole or in part.
- **Dependencies.** FND-07, FND-04, DS-06.
- **Expected outcome.** A working propose→review→apply loop that never mutates data without approval. **P2.**

### ☐ AI-02 — Meeting → tasks/notes proposals
- **Purpose.** From meeting content, propose tasks and notes for the user to approve.
- **Dependencies.** AI-01, MEET-01.
- **Expected outcome.** Meeting notes yield reviewable task/note proposals. **P3.**

### ☐ AI-03 — Planning & review assistance
- **Purpose.** Propose daily/weekly plans and review summaries from real system state.
- **Dependencies.** AI-01, TODAY-04, REVIEW-01.
- **Expected outcome.** Reviewable planning/summary proposals grounded in actual data. **P3.**

### ☐ AI-04 — Privacy controls
- **Purpose.** Per-action opt-in for sensitive entities (People, Diary); clear indication of what's shared.
- **Dependencies.** AI-01.
- **Expected outcome.** Sensitive data never leaves without explicit, per-action consent. **P2.**

---

## Phase 12 — Search, Filters & Cross-cutting (`X`)

*Product-wide capabilities that mature after modules exist.*

### ☐ X-01 — Global search maturity
- **Purpose.** Ranking, previews, and recents across all module providers.
- **Dependencies.** DS-08, all module records.
- **Expected outcome.** Fast, relevant global search across every entity type. **P2.**

### ☐ X-02 — Saved views & cross-module filters
- **Purpose.** Persisted filtered views spanning modules.
- **Dependencies.** DS-07.
- **Expected outcome.** Users save and revisit cross-module filtered views. **P3.**

### ☐ X-03 — Import & sync (Todoist, Notion, calendar)
- **Purpose.** Bring in existing data from external tools (imported content is untrusted until validated — see [security](../../AGENTS.md#17-security-requirements)).
- **Dependencies.** FND-07, NOTES-01, MEET-01.
- **Expected outcome.** Reliable import/sync from named sources into the model. **P3.**

### ☐ X-04 — Export & data portability
- **Purpose.** Full export (Markdown + structured) so the user is never locked in.
- **Dependencies.** FND-02, FND-08.
- **Expected outcome.** One-click export of all data in portable formats. **P2.**

---

## Phase 13 — Settings & Platform (`SET`)

### ☐ SET-01 — App & workspace settings
- **Purpose.** Global and workspace configuration via the shared Settings pattern.
- **Dependencies.** DS-10, FND-03.
- **Expected outcome.** Coherent settings for app and workspace scopes. **P2.**

### ☐ SET-02 — Backup & restore
- **Purpose.** Trustworthy backup/restore of all data (the system is the user's memory — it must be recoverable).
- **Dependencies.** FND-02, X-04.
- **Expected outcome.** Documented, tested backup and restore. **P1.**

### ☐ SET-03 — Account & security
- **Purpose.** Auth, sessions, and security settings.
- **Dependencies.** FND-09.
- **Expected outcome.** Secure account management aligned with [security requirements](../../AGENTS.md#17-security-requirements). **P2.**

---

## Change log for this roadmap

When you complete, split, add, or defer an item, note it here (newest first) so the roadmap's evolution is legible.

- **2026-07-18 — FND-09 → ☑ Done.** Authenticated, registry-driven app shell implemented and accepted via [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing). **Identity:** Cloudflare Access is the identity-aware proxy and session provider; DalyHub itself cryptographically validates the `Cf-Access-Jwt-Assertion` application token on every protected request with `jose` **6.2.3** (MIT, zero-deps, WebCrypto/Workers-compatible, server-only) against the team's JWKS — signature, **RS256** pinned, issuer, audience, `exp`/`nbf`, non-empty `sub`, verified normalised `email`, identity-vs-service-token, and **independent `OWNER_EMAIL`** enforcement — with a storage-independent auth kernel (`app/kernel/auth`: `AuthenticatedUser`/`AuthenticatedSession`/`Authenticator`, typed errors with generic messages, claim validation) that imports no Cloudflare/`jose`/React/RR/D1/env. **Boundary:** authentication runs at the Worker request boundary before any protected loader/action (proven by a spy asserting the handler never runs on failure); `/health` is the only public app route (exact match); the validated session reaches loaders via React Router's typed request context (never a client header) and the raw JWT never enters loader data/logs/bundles. **Composition:** the validated `sub` becomes the Activity actor `{ type: "user", id: sub }` threaded into the entity/EntityLink/spine repositories, while the workspace stays server-derived (`DEFAULT_WORKSPACE_ID`); tests prove `actor_type=user`/`actor_id=<sub>` and that a spoofed actor/workspace input is ignored; the `system` actor remains for system work. **Dev auth:** a separate development authenticator behind the same contract, fail-closed and gated on `AUTH_MODE=development` **and** an explicit development/test `ENVIRONMENT`. **Routing:** registry-driven route composition and primary navigation with no central list; FND-06's lazy route thunk was refined to a declarative build-time `file` reference (ADR-016 §5.10, updating [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery)) because React Router v8 framework mode composes routes from build-time file references; four module placeholder routes (`/areas`, `/goals`, `/projects`, `/tasks`) prove manifest → registry → routes → navigation. **Shell/theme:** a responsive, WCAG 2.2 AA shell (skip link, landmarks, keyboard-complete mobile nav, semantic active state, text-labelled controls) over a restrained `system`/`light`/`dark`, flash-free, cookie-backed theme; baseline security headers (nosniff, referrer, permissions-policy, frame/base-uri/object-src CSP with no `script-src`, private no-store on authenticated responses). Proven by unit (auth validation/errors/config, theme, navigation, route composition, security headers, request boundary), Workers-runtime (real-key JWT verification, authenticated workspace/actor), component/a11y (React Testing Library) and Playwright tests (authenticated dev journey across all four modules + theme persistence + logout URL + `/health`; a production-mode server rejecting unauthenticated requests; a bundle check that no auth/JWT code reaches client assets). `jose` is server-only (absent from the client bundle) and module routes stay code-split. `pnpm run format:check`, `lint`, `typecheck`, `test`, `build`, `test:e2e` and the credential-free deploy dry-run are green. **No new migration; migrations 0001–0005 unchanged; no users/sessions/preferences/theme table; no JWT persisted; no personal email/real AUD/team domain committed.** The Design System ([DS-01](#-ds-01--design-tokens--theming)) and all product functionality were **not** started. FND-01's deferred live Cloudflare deployment status is unchanged. See [`APP_SHELL_AUTH.md`](../development/APP_SHELL_AUTH.md).
- **2026-07-18 — FND-08 → ☑ Done.** Shared secure Markdown pipeline implemented and accepted via [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) (concretising [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)): a storage/runtime-independent **Markdown kernel** (`app/kernel/markdown`: the durable branded `MarkdownSource` + `parseMarkdownSource` — strings only, source preserved byte-for-byte, NUL/control-characters rejected, bounded at **1 MiB UTF-8**; the branded safe-output `SanitizedMarkdownHtml`; the `MarkdownRenderer` contract; typed errors — no React/DOM/D1/parser types leak here) and a **rendering implementation** (`app/platform/markdown`) running one deterministic, stateless `unified` pipeline (`remark-parse` → `remark-gfm` → strip-footnotes → `remark-rehype` `allowDangerousHtml:false` → image/link safe-content transform → `rehype-sanitize` with one **frozen allowlist** → `rehype-stringify`). Raw HTML is dropped before it can become DOM (and sanitised as defence in depth); a restrained CommonMark+GFM profile is supported while raw HTML/scripts/SVG/MathML/embeds/media/math/diagrams/syntax-highlighting/footnotes are excluded; an allowlist **URL policy** (relative/fragment/`http`/`https`/`mailto`/`tel`, browser-faithful against tab/newline/case/entity/percent obfuscation) neutralises unsafe links to text; Markdown images **never** emit `<img>` or fetch (labelled safe link or alt text); code is always escaped with no language class; task-list checkboxes are display-only and are **not** Task records; no heading ids are generated. One React boundary (`app/shared/markdown/MarkdownContent`) is the **only** `dangerouslySetInnerHTML` in `app/`, consuming only the branded output — enforced by a repository test. Proven by a Workers-runtime suite importing the production pipeline (functional profile, source preservation, determinism, size limits, and an original XSS/URL/attribute/remote-image/escaping/malformed corpus) plus pure source + URL-policy unit tests and React component tests (509 unit+kernel tests green). Runtime deps added (all **MIT**, exact-pinned, Workers-compatible, no telemetry): `unified` 11.0.5, `remark-parse` 11.0.0, `remark-gfm` 4.0.1, `remark-rehype` 11.1.2, `rehype-sanitize` 6.0.0, `rehype-stringify` 10.0.1 (+ dev `@types/hast` 3.0.5); the parser stack stays out of the initial client bundle (tree-shaken). `pnpm run format:check`, `lint`, `typecheck`, `test`, `build` and the credential-free deploy dry-run are green. **No migration, no database change, no product route, no module, no editor, no persistence.** [FND-09](#-fnd-09--app-shell-routing--auth), the Design System, Notes and Diary were not started; FND-01's deferred deployment status is unchanged. See [`MARKDOWN_PIPELINE.md`](../development/MARKDOWN_PIPELINE.md).
- **2026-07-18 — FND-07 → ☑ Done.** Area → Goal → Project → Task spine implemented and accepted via [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics) (concretising [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy)): a storage-independent spine kernel (`app/kernel/spine`: shared entity/link/activity identifiers, the `SpineRecord`/rollup contracts, typed errors, boundary validation reusing the entity title rules, a dedicated scope-bound cursor, and the `SpineRepository` interface) plus a D1 adapter (`d1-spine-repository.ts`, `spine-database.ts`). Migration `0005_create_spine_hierarchy.sql` adds a STRICT `spine_records (workspace_id, entity_id, kind, completed_at)` table whose composite foreign key to `entities(workspace_id, id, type)` forces a spine kind to match its entity type, an Area-never-completes CHECK, the `entities(workspace_id, id, type)` parent key, and a **partial unique index** over `entity_links` enforcing exactly one active structural parent per child — additive, no backfill. Structural parentage uses five directed **child → parent** EntityLink types; completion is a single `completedAt` independent of soft-deletion and never cascading; rollups are derived from active descendants with bounded, N+1-free SQL and never stored. Every creation/move/complete/reopen/rename/soft-delete/restore is atomic in one `D1Database.batch()` with `changes()`-guarded Activity appends through the shared `D1ActivityRecorder`, and parent validity is folded into the mutating SQL so no orphan can commit. The generic Entity/EntityLink repositories now refuse to create, mutate lifecycle state on, or structurally mutate reserved spine types (reads still work), keeping the SpineRepository authoritative without a registry singleton; the four production module manifests (`areas`, `goals`, `projects`, `tasks`) are discovered automatically. Proven by comprehensive real Workers/D1 tests (schema/integrity, sequential 0001→0005 migration, creation with atomic rollback, reads/pagination/isolation, completion, exact rollups, lifecycle, reserved-mutation protection, and concurrency) plus pure validation/cursor tests; all prior FND-02–06 tests remain green. `pnpm verify` (format, lint, typecheck, test, build) and the credential-free deploy dry-run are green. **No new dependency, no UI.** [FND-08](#-fnd-08--markdown-pipeline) and [FND-09](#-fnd-09--app-shell-routing--auth) were not started; FND-01's deferred deployment status is unchanged.
- **2026-07-18 — FND-06 → ☑ Done.** Trusted, typed, self-registering module registry implemented and accepted via [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery) (concretising [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry)): a storage-independent module kernel (`app/kernel/modules`: branded `ModuleId`, the declarative `ModuleDefinition` + capability contracts for routes/entity types/EntityLink types/Activity types/commands/search providers/settings, the `defineModule` helper, boundary validation reusing the FND-02/04/05 identifier validators, typed registry errors, the pure discovery collector, and the immutable `ModuleRegistry`/`createModuleRegistry`). Discovery is automatic and build-time via a constrained Vite `import.meta.glob` over the documented `app/modules/<module-id>/module.ts` convention (`app/modules/discover-modules.ts`) — no central switch and no manual module array — with the Vite glob kept out of the kernel. The registry is validated once and immutable (fresh defensive copies, deep-frozen results, deterministic ordering, `null` unknown lookups, no post-construction registration), fails fast on every collision class, reserves kernel lifecycle Activity types, namespaces capability ids under their module, and keeps static declaration separate from runtime execution (command/search handlers receive an explicit `ModuleRuntimeContext`, never invoked to build the registry). A platform adapter (`app/platform/modules/route-contribution-adapter.ts`) resolves route contributions into a nesting tree for FND-09 without eagerly loading page components. No migration, no database enum, no registry singleton coupled to the D1 repositories, no product route or fake module. Proven by focused unit tests (definition/validation, every collision class, registry behaviour/immutability, lazy behaviour, automatic fixture discovery, the production discovery glob, cross-module import boundary) plus the untouched FND-02–05 kernel suite; `pnpm verify`, CI and the credential-free deploy dry-run are green. **No new dependency.** Navigation, route composition, the command palette, global search, settings surfaces and real product modules are out of scope ([FND-09](#-fnd-09--app-shell-routing--auth) and later consume the seams). FND-01's deferred deployment status is unchanged.
- **2026-07-18 — FND-05 → ☑ Done.** Shared append-only Activity model implemented and accepted via [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording) (concretising [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model)): a storage-independent Activity kernel (`app/kernel/activity`: branded `ActivityType`, `ActivityRecord`, actor/subject types, payload rules + shared JSON serialiser, a dedicated versioned cursor, the **read-only** `ActivityRepository`, and the recording seam) with a Cloudflare D1 adapter over prepared statements (no ORM), migration `0004_create_activities.sql` (STRICT `activities` + `activity_subjects`, parent `UNIQUE (workspace_id, id)`, composite foreign keys `ON DELETE RESTRICT`, access-path indexes; additive, **no backfill**). Every successful, meaningful Entity/EntityLink mutation appends exactly one uniform event **atomically** with the domain change via a single `D1Database.batch()`, the append guarded on the domain statement's `changes()` — failed mutations, idempotent no-ops and losing concurrent racers append nothing, and an Activity-insert failure rolls back the domain mutation. Events carry a trusted server-derived actor (`system` today; FND-09 swaps in an authenticated user with no schema change), a validated branded type, a shared UTC timestamp and a bounded/safely-parsed JSON payload; a normalised subject association relates one **or many** entities (an EntityLink event appears in both endpoints' timelines as one event). The workspace feed and per-entity Timeline (anchor active *or* soft-deleted) are workspace-isolated, newest-first, bounded, cursor-paginated (dedicated scope-bound cursor) and N+1-free. The composition boundary now exposes `entities`, `entityLinks` and a read-only `activity`, plus one trusted actor context. Proven by real Workers/D1 integration tests (changes()-across-batch proof, schema, integrity, validation, queries/cursors, entity & link mutation events, atomic rollback and concurrency) plus unit tests; all prior tests remain green. No new dependency. Timeline/Activity-Feed UI and the Module Registry ([FND-06](#-fnd-06--module-registry)) remain out of scope. FND-01's deferred deployment status is unchanged.
- **2026-07-17 — FND-04 → ☑ Done.** Typed, bidirectional EntityLinks implemented and accepted via [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle) (concretising [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)): a storage-independent EntityLink kernel (`app/kernel/entity-links`) with a Cloudflare D1 adapter over prepared statements (no ORM), migration `0003_create_entity_links.sql` (parent `UNIQUE (workspace_id, id)` on `entities`; STRICT `entity_links` with composite foreign keys, self-link CHECK, identity uniqueness index and access-path indexes), a **workspace-bound** `EntityLinkRepository` (no per-call `workspaceId`), one directed row per relationship discoverable from either endpoint, idempotent create with in-place restore, reversible unlink/restore, endpoint soft-delete that **hides but preserves** links (no destructive cascade), a dedicated scope-bound pagination cursor, N+1-free counterpart joins, and real Workers/D1 integration tests proving the bidirectional-query and endpoint delete/restore contracts. The composition boundary now exposes both `entities` and `entityLinks`. No new dependency. Activity ([FND-05](#-fnd-05--shared-activity-model)) and Module Registry link-type governance ([FND-06](#-fnd-06--module-registry)) remain out of scope. FND-01's deferred deployment status is unchanged.
- **2026-07-17 — FND-03 → ☑ Done.** Workspace isolation implemented and accepted via [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context) (concretising [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation)): a persisted `workspaces` table with an enforced `entities.workspace_id` foreign key (`ON DELETE RESTRICT`, migration `0002`, existing rows preserved and back-filled), a storage-independent workspace kernel (`app/kernel/workspaces`), a trusted request-free server-side context resolver + composition boundary (`app/platform/workspaces`), a **workspace-bound** `EntityRepository` (no per-call `workspaceId`), scope-bound versioned pagination cursors, and real D1 integration tests proving cross-workspace isolation and database-level referential integrity. Isolation is independent of authentication ([FND-09](#-fnd-09--app-shell-routing--auth) replaces the resolver behind the same interface). FND-01's deferred deployment status is unchanged.
- **2026-07-17 — FND-02 → ☑ Done.** Entity/D1 storage kernel implemented and accepted via [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage): typed `EntityRepository` contract + Cloudflare D1 adapter over prepared statements (no ORM), first committed migration (`migrations/0001_create_entities.sql`), bounded/deterministic cursor pagination, soft-delete/restore, real Workers/D1 integration tests, updated CI and `pnpm verify`. Full workspace isolation remains [FND-03](#-fnd-03--workspace-isolation).
- **2026-07-17 — FND-01 note updated (still ◐ In progress).** Recorded the owner's sequencing decision that live Cloudflare deployment verification is deferred and does not block continued local implementation. FND-01 stays `◐ In progress`; it is **not** marked done.
- **2026-07-17 — FND-01 → ◐ In progress.** Application platform & toolchain scaffolded and accepted via [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain). Full local quality suite (`pnpm verify`) and CI are green; deployment to Cloudflare Workers is the only remaining external verification item before `☑ Done`.

---

## Related documents
- [`AGENTS.md`](../../AGENTS.md) · [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) · [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) · [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) · [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) · [`IMPLEMENTATION_WORKFLOW.md`](../product/IMPLEMENTATION_WORKFLOW.md) · [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) · [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) · [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) · [`docs/README.md`](../README.md)
