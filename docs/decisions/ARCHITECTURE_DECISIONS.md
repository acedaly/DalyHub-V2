# ARCHITECTURE_DECISIONS.md — DalyHub Architecture Decision Records

> The record of **major architectural decisions and their reasoning**. When you need to know *why* the system is built a certain way — before you change it — the answer is here.
>
> These ADRs are load-bearing. The [architecture philosophy in `AGENTS.md §9`](../../AGENTS.md#9-architecture-philosophy) summarises them; this document is the authority on the *why*. The technical *how* is in [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md).

---

## What an ADR is, and how to add one

An **Architecture Decision Record** captures a single significant decision: the context, the choice, and the consequences. ADRs are **append-only** — we don't rewrite history. To change a past decision, add a **new** ADR that supersedes the old one and update the old one's status to `Superseded by ADR-NNN`.

**Add a new ADR whenever** a change: introduces or removes a core concept; changes a kernel contract; picks a foundational technology; or deviates from an existing ADR. Adding the ADR is part of the [Definition of Done](../../AGENTS.md#18-definition-of-done).

**ADR template:**

```markdown
## ADR-NNN: <Title>
- **Status:** Proposed | Accepted | Superseded by ADR-MMM
- **Context.** What forces and constraints are at play?
- **Decision.** What we decided, stated plainly.
- **Consequences.** What this makes easy, what it makes hard, what we accept.
- **Alternatives considered.** What we rejected and why.
```

Statuses below are **Accepted** unless noted. Numbering is stable and permanent.

---

## ADR-001: Area Hierarchy
- **Status:** Accepted.
- **Context.** DalyHub must make a whole life legible. Users need to see how daily action connects to long-term intention. A flat list of tasks cannot express this; an over-deep tree creates bureaucracy.
- **Decision.** Adopt a first-class, kernel-level **Area → Goal → Project → Task** hierarchy with rollup semantics. Areas are permanent domains; Goals are optional outcomes; Projects are finite work; Tasks are atomic actions. This is a kernel concept, not a per-module convention. (See [`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model).)
- **Consequences.** *Easy:* consistent organisation and progress rollup everywhere; the intention↔action view (`AREA-03`) becomes possible. *Hard:* every entity must resolve to an Area; rollup must stay correct and performant. *Accepted:* Goals are optional to avoid forcing structure where it doesn't help.
- **Alternatives considered.** Flat tags-only (rejected: no rollup, no legibility). Deeper hierarchy (rejected: bureaucracy, violates "structure serves clarity"). Per-module hierarchies (rejected: fragmentation).

## ADR-002: EntityLinks
- **Status:** Accepted. Implemented by [ADR-011](#adr-011-entitylink-persistence-and-lifecycle) (persistence & lifecycle).
- **Context.** DalyHub's core value is connection — a meeting produces tasks, a note documents a project, a person recurs everywhere. Per-module foreign keys would make each relationship bespoke and invisible to other modules.
- **Decision.** Provide **typed, bidirectional EntityLinks** as a kernel primitive: any entity may link to any other; links are queryable from both ends and rendered through shared UI (the [link picker](../design/DESIGN_SYSTEM.md#forms) and backlinks). (See [`AGENTS.md §9.5`](../../AGENTS.md#95-entitylinks).)
- **Consequences.** *Easy:* cross-module relationships and backlinks with no per-module work; the connectedness the product promises. *Hard:* referential integrity and cascade behaviour on delete must be handled centrally; link types need governance to avoid sprawl. *Accepted:* a general link table over rigid schema-per-relationship.
- **Alternatives considered.** Foreign keys per relationship (rejected: rigid, not cross-module). Freeform tags only (rejected: untyped, not bidirectional).

## ADR-003: Workspace Isolation
- **Status:** Accepted.
- **Context.** A user may keep distinct contexts (personal life, a side venture) that shouldn't bleed together, and data isolation is also a security boundary.
- **Decision.** Make **Workspace** the top-level isolation boundary. Every entity belongs to a workspace; every query is workspace-scoped **server-side**; search, activity, and permissions are all scoped to it. (See [`AGENTS.md §9.4`](../../AGENTS.md#94-workspace-isolation).)
- **Consequences.** *Easy:* clean separation of contexts; isolation doubles as a security control ([security requirements](../../AGENTS.md#17-security-requirements)). *Hard:* every data path must carry workspace scope; cross-workspace features (if ever needed) require explicit design. *Accepted:* scoping overhead on every query in exchange for a hard boundary.
- **Alternatives considered.** Single global space with tags (rejected: no real isolation, weaker security). Per-module isolation (rejected: inconsistent, leaky).

## ADR-004: AI Proposal Architecture
- **Status:** Accepted.
- **Context.** AI must help without eroding user control or trust, and DalyHub holds highly sensitive data. Autonomous AI mutation would violate the product's core promise that the user is always in control.
- **Decision.** AI is a **proposer, never an autonomous actor**. It emits structured, reviewable **proposals** (suggested creates/links/edits) that the user accepts, edits, or rejects — in whole or in part. Nothing is written without approval. The AI operates over the same model as human actions, with **per-action opt-in** for sensitive entities. (See [`AGENTS.md §8`](../../AGENTS.md#8-ai-philosophy) and roadmap `AI-01`/`AI-04`.)
- **Consequences.** *Easy:* trust, auditability, privacy, and reversibility; AI features can be added safely. *Hard:* every AI capability needs a proposal schema and review UI; no "just do it" shortcuts. *Accepted:* extra friction on AI actions as the price of control.
- **Alternatives considered.** Autonomous agents with undo (rejected: violates control/trust, unsafe with sensitive data). AI writing directly to a staging area only (rejected: still bypasses explicit consent).

## ADR-005: Shared Activity Model
- **Status:** Accepted.
- **Context.** Every module needs history (Timeline) and the product needs a cross-cutting Activity Feed and an audit trail. Per-module event logs would fragment this and duplicate work.
- **Decision.** A **single append-only Activity model**: every meaningful mutation appends a uniform event. Record [Timeline](../design/DESIGN_SYSTEM.md#timeline) and cross-scope [Activity Feed](../design/DESIGN_SYSTEM.md#activity-feed) render this one model at different scopes. It also serves as a security-relevant audit trail. (See [`AGENTS.md §9.6`](../../AGENTS.md#96-shared-activity-model).)
- **Consequences.** *Easy:* uniform history everywhere for free; audit trail; one component to build/maintain. *Hard:* mutations must reliably emit events; the stream needs virtualisation and retention strategy at scale. *Accepted:* write-time cost of appending events.
- **Alternatives considered.** Per-module logs (rejected: fragmentation, duplicated UI). Derive history from diffs on read (rejected: costly, lossy).

## ADR-006: Markdown Strategy
- **Status:** Accepted.
- **Context.** Notes, descriptions, and Diary need rich text that stays portable, exportable, and safe. Proprietary rich-text blobs risk lock-in and XSS.
- **Decision.** Author and store long-form text as **Markdown**, rendered through **one shared, sanitising renderer**. This keeps content portable and diff-able and supports [data portability](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability). Raw HTML is not trusted; rendering sanitises. (See [`AGENTS.md §9.7`](../../AGENTS.md#97-markdown-strategy).)
- **Consequences.** *Easy:* portability, export, safety, one renderer to harden. *Hard:* very rich formatting (complex tables, embeds) is constrained to what the pipeline supports. *Accepted:* format constraints in exchange for ownership and safety.
- **Alternatives considered.** Proprietary block/JSON document model (rejected: lock-in, heavier). Raw HTML (rejected: XSS, not portable).

## ADR-007: Module Registry
- **Status:** Accepted.
- **Context.** DalyHub is many modules on a small kernel. Wiring each module through central switch statements would make the shell a bottleneck and every module addition a merge-conflict magnet.
- **Decision.** Modules **self-register** via a **Module Registry**: routes, entity types, commands (for the [Command Palette](../design/DESIGN_SYSTEM.md#command-palette)), search providers, and settings. The shell discovers modules through the registry; adding a module doesn't require editing central code. (See [`AGENTS.md §9.2`](../../AGENTS.md#92-module-registry).)
- **Consequences.** *Easy:* modules are independent and independently implementable (matches [ROADMAP](../roadmap/ROADMAP_V2.md) structure); search/commands/routes compose automatically. *Hard:* the registry contract must be stable and well-specified; a bad module registration can affect the shell. *Accepted:* an indirection layer for decoupling.
- **Alternatives considered.** Central hard-wired module list (rejected: bottleneck, conflicts). Fully independent micro-frontends (rejected: over-engineered for one product, breaks shared kernel benefits).

## ADR-008: Initial Application Platform and Toolchain
- **Status:** Accepted.
- **Context.** DalyHub V2 is a clean redevelopment ([`ROADMAP_V2` Phase 0](../roadmap/ROADMAP_V2.md#phase-0--foundation-fnd)). Before building the kernel we need a reliable application skeleton: a language, framework, build, test, lint/format, type-check, CI, and a deployment target. Prior ADRs settled the *shape* (small kernel, modular userland) but not the concrete platform; [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) described the platform only as a *proposed direction* oriented around the Cloudflare Developer Platform. DalyHub V1 ran on a Next.js/Docker/VPS stack whose operational weight (self-managed servers, container builds, a fragile and slow end-to-end setup) worked against the product's calm, low-friction ethos. FND-01 must convert the proposed direction into a settled, verifiable foundation without prematurely committing to storage services or product architecture.
- **Decision.** Adopt the following as DalyHub V2's application platform and toolchain, using the official Cloudflare React Router starter (`create-cloudflare`, `--framework=react-router`) as the reference scaffold:
  - **React Router v8 in framework (full-stack) mode** — routing, SSR, loaders/actions, and resource routes in one typed framework.
  - **React 19 + TypeScript (strict)** — the typed component model the Design System will build on.
  - **Vite** with the **official Cloudflare Vite plugin** — one build tool that runs server code in the Workers runtime during dev and preview, so local behaviour matches production.
  - **Cloudflare Workers** as the runtime/deployment target, managed with **Wrangler** (local dev, type generation, deploy).
  - **pnpm via Corepack** — deterministic, lockfile-pinned dependency management.
  - **Vitest + React Testing Library** for unit/component tests; **Playwright** (single Chromium project) for one minimal browser smoke test.
  - **ESLint (flat config) + Prettier** for linting and formatting; **GitHub Actions** for CI.
  - TypeScript is pinned to the 5.9 line (not the newer native TS 7 preview), because the framework's type generation, `typescript-eslint`, and editor tooling target the 5.x language service; adopting TS 7 now would be a material incompatibility for no FND-01 benefit.
- **Why this fits DalyHub.** A single full-stack framework on one runtime keeps the surface small and coherent — the same discipline the kernel demands. SSR-by-default serves the [performance budgets](../../AGENTS.md#16-performance-expectations) (fast first paint, lean payloads). Running the *actual* Workers runtime locally via the Vite plugin means "drive the real thing before claiming done" ([testing philosophy](../../AGENTS.md#14-testing-philosophy)) is cheap and honest. Managed edge compute removes servers-to-babysit, which supports *calm* as an operational property, not just a UI one.
- **Why preferable to rebuilding V1's Next.js/Docker/VPS stack.** The V1 stack coupled the app to self-managed infrastructure: Docker image builds, a VPS to patch and secure, and an E2E suite that was slow and flaky. That is recurring operational tax and a reliability risk with no product payoff for a single-owner product. Workers + Wrangler give zero-server deploys, a local runtime that mirrors production, and a fast, deterministic test path — directly addressing V1's fragility.
- **Consequences.** *Easy:* one command to develop, one to build, one to deploy; production-faithful local runtime; fast CI; a clean base for the kernel. *Hard:* code must respect Workers runtime constraints (no arbitrary Node APIs; `nodejs_compat` where needed); some libraries assuming a full Node/browser environment need care; SSR adds a server render path to reason about. *Accepted:* coupling to the Cloudflare platform for compute in exchange for operational simplicity — mitigated by keeping storage/service choices as separate, later decisions (below) and the kernel abstracted from the platform ([`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md)).
- **Storage is explicitly out of scope here.** This ADR selects compute, framework, and toolchain only. **D1, KV, R2, Durable Objects, and any other storage/service remain later roadmap decisions** (starting at [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage)) unless already accepted in another ADR. No database or bindings are introduced by FND-01.
- **Alternatives considered.**
  - *React SPA + a separate Worker API.* Two deployables, two type boundaries, and manual data-fetching wiring. Rejected: more moving parts and worse first-paint than an integrated SSR framework, for no benefit at this stage.
  - *Next.js on Workers.* Familiar, but a heavier framework whose Workers support is less first-class than React Router's, and closer to the V1 stack we are deliberately leaving. Rejected: weight and fit.
  - *Return to Docker + Postgres on a VPS.* Maximum control and a conventional relational DB. Rejected: reintroduces exactly the operational fragility and slowness V1 suffered; premature to pick a database before the [data kernel](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) is designed.

## ADR-009: Data Kernel Storage
- **Status:** Accepted.
- **Context.** [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) implements the entity substrate every DalyHub record builds on: a uniform record (id, workspace, type, title, timestamps, soft-delete) that must be persisted, migration-managed, strongly typed, and testable in the real runtime. [ADR-008](#adr-008-initial-application-platform-and-toolchain) settled compute (Cloudflare Workers) but deliberately left storage open. [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#platform) named D1 as the *proposed* relational store, to be confirmed by its own ADR before anything relies on it. DalyHub is currently single-user and Cloudflare-native, so the store should add persistence without adding a server to operate.
- **Decision.**
  - **Cloudflare D1** is the initial relational store for the kernel. SQLite-compatible SQL is the storage language.
  - **Schema changes use committed, sequential Cloudflare D1 SQL migrations** in `migrations/` (`0001_create_entities.sql`, …), applied with Wrangler's D1 migration tooling.
  - The kernel uses **a small, DalyHub-owned typed repository over prepared D1 statements** (`EntityRepository` contract in `app/kernel/entities`; D1 adapter in `app/platform/storage/d1`). All data values are bound parameters — never interpolated. **No ORM is introduced in FND-02.**
  - **Domain-specific fields belong to domain tables (or deliberately designed extensions), not to the base entity table.** The `entities` table carries only the shared record header; it is never an unstructured JSON dumping ground. Domain tables arrive with later roadmap items.
  - An ORM may be reconsidered later **only through a new ADR** if real query complexity justifies it.
- **Why this fits DalyHub.** DalyHub is single-user and Cloudflare-native, so D1 provides relational persistence without introducing a separate database server to run, patch and back up — keeping *calm* an operational property, consistent with ADR-008. Plain SQL migrations remain portable, inspectable and easy to recover (aligned with the "own your data" principle). The data kernel is small enough that an ORM would currently add more abstraction than value. A DalyHub-owned repository contract keeps D1-specific APIs from leaking into modules, preserving the small-kernel/portable-adapter boundary; if D1 is ever swapped, only the adapter changes.
- **Consequences.** *Easy:* real relational persistence with zero servers; migrations are legible git-tracked SQL; the typed contract gives modules a stable, storage-agnostic API; integration tests run against real D1 in the Workers runtime. *Hard:* SQLite/D1 constraints apply (no stored procedures, limited ALTER, per-database size/write limits); hand-written SQL must be disciplined as query complexity grows; workspace scoping is carried but not yet *enforced* as a security boundary (that is [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation)). *Accepted:* writing SQL by hand instead of using an ORM, in exchange for a smaller, more transparent kernel.
- **Alternatives considered.**
  - *Drizzle ORM (or another TypeScript ORM/query builder).* Type-safe schema and queries, good D1 support. Rejected for FND-02: adds a dependency and an abstraction layer the current, deliberately-tiny schema does not need; revisit via a new ADR if/when query complexity justifies it.
  - *Another query builder (e.g. Kysely).* Lighter than an ORM but still an abstraction over a single small table with simple access paths. Rejected: the prepared-statement repository is clearer for this surface.
  - *PostgreSQL (Hyperdrive/external).* Mature and powerful, but reintroduces an external server to operate and pay for — exactly the operational weight ADR-008 moved away from — with no payoff for a single-user app at this stage.
  - *Generic JSON-document storage (KV/R2/JSON column).* Would make the entity a schemaless blob. Rejected: loses relational integrity, typed constraints, and efficient indexed queries/pagination; contradicts the decision to keep domain data in real tables.
  - *One independent table per entity type, with no common substrate.* Rejected: fragments the uniform record header, duplicates lifecycle/soft-delete logic per type, and undermines the shared kernel the whole architecture depends on.
  - *Reusing the DalyHub V1 Prisma schema.* Rejected: V1's schema and ORM carry assumptions and debt this greenfield kernel is deliberately leaving behind; the V1 schema is not copied.

## ADR-010: Server-side Workspace Context
- **Status:** Accepted.
- **Context.** [ADR-003](#adr-003-workspace-isolation) established Workspace as DalyHub's top-level isolation *and security* boundary, and [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) carried a `workspace_id` on every entity — but did not yet *enforce* it: the column had no foreign key, and the repository accepted a `workspaceId` argument on every call, so any caller could read or write any workspace. [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) must turn that carried field into a real boundary. This ADR records the concrete implementation of ADR-003; ADR-003 remains the governing principle. Authentication and sessions do not exist yet (single-user), and building isolation must not wait for them ([FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth)).
- **Decision.**
  - **Workspace is a separate kernel/security record, not an ordinary `entities` row.** It lives in its own minimal `workspaces` table (`id`, `created_at`, `updated_at` only — no name, membership, role, billing, theme or settings). Entities *reference* a workspace through a database **foreign key** (`entities.workspace_id → workspaces.id`, `ON DELETE RESTRICT`); the database — not just application code — rejects an orphaned entity.
  - **Workspace context is established at the server composition boundary.** An `environment → resolver → WorkspaceContext → workspace-scoped EntityRepository` flow (`app/platform/workspaces`) wires scope once, server-side.
  - **Module-facing repositories are created already bound to one `WorkspaceContext`.** `createEntityRepository(db, context)` returns a repository whose every method operates only within that workspace. **No module-facing method accepts a `workspaceId`** — module code cannot pass, select or override the scope per operation. Every SQL statement still constrains `workspace_id = ?` with the bound value, always parameterised.
  - **Workspace context is resolved only from trusted server-side state.** The single-user resolver reads a configured `DEFAULT_WORKSPACE_ID` binding, validates it, and confirms the workspace exists in D1. The resolver interface (`WorkspaceContextResolver.resolve()`) **takes no arguments** — there is structurally nowhere to pass a request, header, cookie, query string, route parameter, form field or JSON body, so untrusted input cannot influence scope. It **fails closed**: missing/blank/malformed configuration or a non-existent workspace raises a typed error and never falls back to another workspace or auto-creates one.
  - **Cursors are bound to their scope.** Pagination cursors are versioned and carry the workspace, type filter and include-deleted state that produced them; a cursor replayed under a different scope is rejected as `InvalidCursorError`. Cursors are not signed/encrypted — workspace ids are scope identifiers, not secrets — versioning binds *shape and scope*, which is what correctness needs.
  - **`WorkspaceId` is a validated, branded type** so raw strings cannot drift through the kernel unchecked. It is a **scope identifier, not an authentication secret.**
  - **No global mutable workspace state and no `AsyncLocalStorage`.** Context is passed **explicitly** as a value.
  - **FND-09 may replace the static resolver with an authenticated one** implementing the same `WorkspaceContextResolver` interface, **without changing module repository contracts.**
  - **Administrative cross-workspace operations, if ever needed, use separate, deliberately-named contracts** (e.g. the low-level `WorkspaceRepository` used only at bootstrap), never a bypass on the scoped module repositories.
- **Why explicit context passing, over the alternatives.**
  - *Accepting `workspaceId` in every module call* (the FND-02 shape) makes the safe path and the unsafe path identical: forgetting a filter, or trusting a caller-supplied id, silently crosses the boundary. Binding scope at construction makes cross-workspace access *unrepresentable* in module code rather than merely discouraged.
  - *Trusting an `X-Workspace-ID` header* (or any request field) lets the client choose its own scope — the classic broken-access-control vulnerability. Scope must be derived server-side from trusted state, never from the request. A request-free `resolve()` enforces this structurally.
  - *Accepting workspace from query strings or form data* has the same defect as a header and additionally leaks scope into URLs/caches. Rejected for the same reason.
  - *Global mutable state* (a module-level "current workspace") is a data-race and test-isolation hazard on a request-concurrent runtime, and invites spooky action at a distance. Explicit values are safe under concurrency and trivially testable.
  - *`AsyncLocalStorage`* would thread context implicitly, but it is an ambient, hidden dependency: it hides the boundary the whole feature exists to make explicit, complicates testing, and adds a Workers-runtime footgun. An explicit parameter is clearer and cheaper.
  - *Making Workspace an ordinary entity* would give it soft-delete, arbitrary types and cross-workspace links it must never have, and would make "the boundary" just another row inside the thing it is meant to bound — circular. A dedicated security record with a real foreign key is a genuine boundary the database enforces.
  - *Postponing isolation until authentication is built* would leave every later foundation item (links, activity, the spine) built on an unscoped kernel, to be retrofitted dangerously later. Isolation is separable from *who* the user is: resolve *which* scope from trusted config now; swap in *authenticated* resolution at FND-09 behind the same interface.
- **Consequences.** *Easy:* modules get a repository that is correct-by-construction — there is no unscoped path to misuse; the database guarantees referential integrity even against raw SQL; swapping in authenticated resolution later touches only the resolver. *Hard:* every entity now requires its workspace to exist first (creates fail closed otherwise), and cursors from before this change are invalidated (acceptable — no released consumers). *Accepted:* a small `workspaces` table and a resolution step on the server path, in exchange for a real, enforced boundary.
- **Alternatives considered.** Covered inline above (per-call `workspaceId`, trusted header, query/form scope, global state, `AsyncLocalStorage`, Workspace-as-entity, defer-until-auth) — all rejected. Signed/encrypted cursors were also considered and rejected: workspace ids are not secrets, and versioned scope-binding already gives the correctness guarantee without key management.

## ADR-011: EntityLink Persistence and Lifecycle
- **Status:** Accepted.
- **Context.** [ADR-002](#adr-002-entitylinks) established **typed, bidirectional EntityLinks** as a kernel primitive but left the concrete persistence and lifecycle open. [FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks) must make links real on the existing kernel: the [entity substrate](#adr-009-data-kernel-storage) (FND-02) and the [enforced, server-derived workspace boundary](#adr-010-server-side-workspace-context) (FND-03). The hard questions ADR-002 flagged — how a relationship is stored, how referential integrity and deletion behave, and how link types are governed — are answered here. This ADR **implements** ADR-002; it does not replace it. Activity events ([FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model)) and link-type registration via the Module Registry ([FND-06](../roadmap/ROADMAP_V2.md#-fnd-06--module-registry)) are deliberately out of scope.
- **Decision.**
  - **One row per relationship — direction preserved.** A relationship is stored **once** as a single `entity_links` row carrying `source_entity_id`, `target_entity_id` and `type`. "Bidirectional" means **discoverable and navigable from both ends**, not two rows: querying the source sees an *outgoing* link, querying the target sees the *same row* as an *incoming* link. Endpoint ids are **never reordered** — `meeting --produced_task--> task` and its reverse are different relationships and must not be conflated. There is deliberately no undirected "canonical pair".
  - **EntityLinks are NOT entities.** A link is a kernel relationship record, not a row in `entities`. It has no title, entity type, search entry, Record Header, module or user-facing page. It lives in its own `entity_links` table with only justified fields: `id`, `workspace_id`, `source_entity_id`, `target_entity_id`, `type`, `created_at`, `updated_at`, `deleted_at`.
  - **Link types are validated, branded identifiers — governed, not free text.** `EntityLinkType` is a branded string validated to a documented structural format (lowercase dotted segments, e.g. `meeting.produced_task`), stored verbatim after validation. It is an **open, reusable contract** — no database enum, no hard-coded list of every future type — so future modules register link types without a schema migration (FND-06 will connect this to the Module Registry). There is no user-facing label in the kernel.
  - **Workspace-bound repository (no per-call `workspaceId`).** The module-facing `EntityLinkRepository` is constructed already bound to one `WorkspaceContext` (`createEntityLinkRepository(db, context)`), exactly like the entity repository. No method accepts a `workspaceId`; both endpoints of every link are constrained to the bound workspace in SQL, values always bound. Links **cannot cross workspace boundaries**.
  - **Database-enforced same-workspace endpoints.** A parent `UNIQUE (workspace_id, id)` key on `entities` lets `entity_links` use **composite foreign keys** `(workspace_id, source/target_entity_id) → entities (workspace_id, id)` — so a cross-workspace endpoint is impossible at the database level, not merely discouraged in code. All foreign keys use `ON DELETE RESTRICT`; a `CHECK` forbids self-links; a `UNIQUE (workspace_id, source, target, type)` index gives each directed relationship one stable identity.
  - **Idempotent create with in-place restore.** Creating a relationship that does not exist inserts it (`created`); one that exists and is active is an idempotent `already_exists`; one that exists but was unlinked is **restored in place** (`restored`) — **never a new id**. The uniqueness index is the final backstop against concurrent duplicate inserts (a losing racer re-reads and reconciles).
  - **Unlink is reversible soft deletion; endpoint deletion does NOT cascade.** Unlinking sets `deleted_at` (idempotent; endpoints untouched). Crucially, **soft-deleting an endpoint entity does not delete or soft-delete its link rows**. Instead, normal link queries exclude a link when *either* endpoint is soft-deleted; restoring the endpoint makes still-active links visible again with their **original id**; and a relationship explicitly unlinked before/during entity deletion **stays unlinked** after restoration. There is no public hard-delete.
  - **Dedicated, scope-bound cursor.** Link pagination uses its **own versioned cursor** (not the entity cursor), bound to `(version, workspaceId, anchorEntityId, direction filter, type filter, createdAt, linkId)`. A cursor from another workspace, anchor, direction or type filter is rejected as a typed invalid-cursor error; ordering is deterministic on `(created_at, id)`. Cursors are treated as untrusted input and are neither signed nor encrypted — ids are scope identifiers, not secrets (consistent with ADR-010).
  - **No N+1 counterpart lookup.** `listForEntity` returns each link with its `direction` and the **active counterpart entity**, fetched via a single joined query, so a caller can render/navigate without a second unscoped read.
- **Why soft-hide over destructive cascade on entity soft-delete.** Cascading a soft-delete from an entity onto every one of its links would **destroy relationship information the product exists to preserve**: after restoring the entity we could not tell which links were genuinely unlinked by the user from which were merely swept up by the cascade, so restoration could not faithfully rebuild the graph. Hiding links whose endpoint is inactive (a read-time filter) keeps the relationship data intact and makes entity delete/restore **losslessly reversible**, while still ensuring a "dangling" link to a hidden entity never surfaces. It also keeps entity soft-delete O(1) instead of fanning out writes across the link graph, and it leaves `EntityRepository.softDelete()` unchanged — deletion behaviour stays centralised in link queries rather than smeared across every module's mutations.
- **Consequences.** *Easy:* any active entity links to any other in its workspace; the same row is queryable from either end; duplicates are impossible; cross-workspace links are structurally impossible; entity delete/restore is reversible and lossless; modules get a correct-by-construction, workspace-scoped repository with no unscoped path. *Hard:* the both-direction listing is a `UNION ALL` of an outgoing and an incoming join that must stay index-backed; the parent `UNIQUE (workspace_id, id)` key is an extra index on the hot `entities` table; link-type governance currently lives only in kernel validation until FND-06 adds registration. *Accepted:* a read-time "either endpoint inactive → hidden" filter on every link query, in exchange for lossless, centrally-governed deletion behaviour and no cascade writes.
- **Atomicity & the FND-05 boundary.** FND-04 creates and mutates only EntityLink records; it introduces **no** Activity events and **no** generic mutation/transaction coordinator. [FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) will introduce the shared Activity model and define how entity/link mutations and activity appends are coordinated atomically; entity mutations are deliberately **not** pre-modified for Activity here.
- **Alternatives considered.**
  - *Bespoke foreign-key columns per module.* Rejected (ADR-002): rigid, invisible to other modules, no shared lifecycle — the exact fragmentation the kernel primitive removes.
  - *Two rows per relationship (A→B and B→A).* Rejected: duplicates every write and invites the two rows to drift out of sync; "bidirectional" is a *query* property, achievable from one row.
  - *Undirected canonical pair with sorted endpoint ids.* Rejected: erases direction, which is meaningful (`produced_task` is not its own inverse); a reversed relationship may mean something different and must stay distinct.
  - *Free-form tags instead of typed links.* Rejected: untyped and not governable; link types must be stable machine identifiers, not uncontrolled labels.
  - *Embedding links as JSON arrays on entities.* Rejected: not queryable from the other end without scanning, no referential integrity, no shared lifecycle — contradicts the relational, integrity-enforced kernel (ADR-009).
  - *Destructive cascade when an entity is soft-deleted.* Rejected (see "Why soft-hide" above): lossy and irreversible.
  - *Treating links as ordinary entities.* Rejected: a link would gain a title, type, soft-delete-as-entity and even cross-links to itself, and "the relationship" would become a row inside the thing it relates — circular; a dedicated relationship record with database-enforced composite keys is a genuine boundary.
  - *Adding link behaviour directly to each module.* Rejected: duplicates integrity/lifecycle logic per module and re-creates bespoke relationships; links are a kernel primitive precisely so a link made in one module is visible in every other with no extra work.

---

## Superseded / historical decisions

*(none yet)*

---

## Related documents
- [`AGENTS.md §9`](../../AGENTS.md#9-architecture-philosophy) — the architecture philosophy these ADRs justify.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) — how these decisions are realised technically.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the foundation items (`FND-*`) that implement these ADRs.
- [`docs/README.md`](../README.md) — documentation index.
