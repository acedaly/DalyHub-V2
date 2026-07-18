# ARCHITECTURE_OVERVIEW.md — How DalyHub Fits Together

> The technical map of the system: how the kernel, modules, data, and platform fit together. Where [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) explains *why*, this document explains *how the pieces relate*.
>
> **Status of this document.** DalyHub V2 is a redevelopment; some of what's described here is the *intended* target realised progressively through the [Foundation phase of `ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md#phase-0--foundation-fnd). Where a choice is a proposed direction rather than settled fact, it is flagged. Treat specific technology names as the current recommendation, revisable via a new ADR — the *shape* (small kernel, modular userland) is the settled part.

---

## The big picture

```
┌─────────────────────────────────────────────────────────────┐
│                         App Shell                            │
│   navigation · routing · theme · command palette · search    │
│                  (discovers modules via registry)             │
├─────────────────────────────────────────────────────────────┤
│                        Modules (userland)                     │
│  Today · Projects · Areas/Goals · Notes · Meetings · People   │
│        Assets · Diary · Review · AI · Settings                │
│   each registers: routes · entity types · commands ·          │
│                   search providers · settings                 │
├─────────────────────────────────────────────────────────────┤
│                     Shared Design System                      │
│  Record Layout · Drawer · Cards · Timeline/Activity · Forms   │
│  Filters · Search · Command Palette · Inspector · Settings ·  │
│                     feedback/loading/empty                    │
├─────────────────────────────────────────────────────────────┤
│                       Kernel (small, stable)                  │
│  Entities · EntityLinks · Activity · Workspaces ·             │
│  Area→Goal→Project→Task spine · Markdown pipeline ·           │
│                    Module Registry · AI proposals             │
├─────────────────────────────────────────────────────────────┤
│                          Platform                             │
│    storage · auth · background work · file/asset storage      │
└─────────────────────────────────────────────────────────────┘
```

**Reading the stack:** dependencies point downward. Modules depend on the Design System and Kernel; the Kernel depends only on the Platform. Nothing lower reaches up; modules never reach sideways into each other — they compose through kernel contracts and the module registry. This is the "small kernel, modular userland" principle from [`AGENTS.md §9.1`](../../AGENTS.md#91-small-kernel-modular-userland).

---

## The kernel

The kernel is deliberately small and rarely changes. Each concept below maps to an ADR and a Foundation roadmap item.

| Kernel concept | What it provides | ADR | Roadmap |
|---|---|---|---|
| **Entities** | Uniform record substrate (id, type, workspace, timestamps, soft-delete) + D1 storage | [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage) | [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) |
| **Workspaces** | Top-level isolation & security boundary (persisted record; server-derived context; scoped repositories) | [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation), [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context) | [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) |
| **EntityLinks** | Typed, bidirectional links between any entities (one directed row; composite-FK, workspace-bound) | [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks), [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle) | [FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks) |
| **Activity** | Append-only uniform event stream (workspace-scoped; atomic with each mutation; subjects associate one or many entities) | [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model), [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording) | [FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) |
| **Module Registry** | Self-registration of modules' capabilities | [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry) | [FND-06](../roadmap/ROADMAP_V2.md#-fnd-06--module-registry) |
| **Area spine** | Area→Goal→Project→Task + rollup | [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy), [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics) | [FND-07](../roadmap/ROADMAP_V2.md#-fnd-07--area--goal--project--task-hierarchy) ✓ ([SPINE_MODEL.md](../development/SPINE_MODEL.md)) |
| **Markdown pipeline** | One shared storage/sanitising renderer (durable branded `MarkdownSource`; deterministic Workers-safe `unified` pipeline; strict allowlist; branded `SanitizedMarkdownHtml`; one React sink) | [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy), [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) | [FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline) ✓ ([MARKDOWN_PIPELINE.md](../development/MARKDOWN_PIPELINE.md)) |
| **AI proposals** | Propose→review→apply engine | [ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture) | [AI-01](../roadmap/ROADMAP_V2.md#phase-11--ai-ai) |

### The entity model in one picture

```
Workspace
  └── Area (permanent)
        ├── Goal (optional outcome)
        │     └── Project ── Task
        └── Project ── Task           (project may sit directly under an Area)

Any entity ──EntityLink──> any entity     (Notes, Meetings, People, Assets, Diary attach via links)
Any mutation ──appends──> Activity         (rendered as Timeline / Activity Feed)
```

Supporting entities (Note, Meeting, Person, Asset, Diary, Review) are full entities that connect to the spine through **EntityLinks** rather than being children of it. This keeps the spine clean while letting everything relate to everything (see [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md#how-these-fit-together-the-shape-of-a-day)).

### Entity storage: the kernel contract and its D1 adapter

The entity substrate ([FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) / [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage)) is built as a **storage-independent contract with a swappable adapter**:

- **Kernel contract** (`app/kernel/entities`) — the typed `EntityRecord`, input types, domain errors, and the `EntityRepository` interface (`create`, `getById`, `update`, `list`, `softDelete`, `restore`). It speaks only in domain terms (camelCase, `Date`s, typed errors) and imports **no** D1 or Cloudflare types. Every operation requires a `workspaceId`.
- **D1 adapter** (`app/platform/storage/d1`) — the only place SQL, snake_case rows, and SQLite timestamp strings exist. It implements the contract over prepared, parameterised D1 statements and converts rows to domain records at the boundary. Modules depend on the contract, never on the adapter.

The **base `entities` table** holds only the shared record header — `id`, `workspace_id`, `type`, `title`, `created_at`, `updated_at`, `deleted_at` — with soft-delete (`deleted_at`) excluded from ordinary reads/lists, deterministic `(created_at, id)` cursor pagination, and application-generated UTC ISO-8601 timestamps. **Domain-specific fields (status, dates, progress, body, …) are NOT added here; they arrive in later roadmap items as domain tables or deliberately designed extensions**, never as an unstructured JSON blob on the base table.

One boundary that FND-02 left open is now closed by **[FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) / [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context)** (see [Workspace isolation](#workspace-isolation-persisted-boundary--server-derived-context) below); the relationship primitive on top of it is built (see [EntityLinks](#entitylinks-typed-directed-relationships)); and the shared history/audit primitive is built too (see [Activity](#activity-append-only-history--audit-trail)). The first domain model on this substrate — the Area→Goal→Project→Task **spine** ([FND-07](../roadmap/ROADMAP_V2.md#-fnd-07--area--goal--project--task-hierarchy) / [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics)) — is now built: spine records stay ordinary entities, parentage is EntityLinks (exactly one active parent, enforced by a partial unique index), completion is a single `completedAt`, and rollups are derived. See [`SPINE_MODEL.md`](../development/SPINE_MODEL.md).

### Workspace isolation: persisted boundary & server-derived context

Workspace is DalyHub's top-level isolation *and security* boundary ([ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation)). [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) makes it real and enforced, with the concrete design recorded in [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context):

- **Persisted Workspace boundary.** A workspace is a **separate kernel/security record** in its own minimal `workspaces` table (`id`, `created_at`, `updated_at` only), *not* a row in `entities`. The workspace kernel (`app/kernel/workspaces`) defines a validated, branded `WorkspaceId`, the `WorkspaceRecord`, the `WorkspaceContext`, and a low-level `WorkspaceRepository` used only at bootstrap.
- **Foreign-key relationship.** `entities.workspace_id` has an enforced foreign key to `workspaces.id` with `ON DELETE RESTRICT` (migration `0002`). The **database** rejects an entity whose workspace does not exist — even against raw SQL — and refuses to delete a workspace that still owns entities. There is no public hard-delete of a workspace.
- **Server-derived `WorkspaceContext`.** Scope is established at the **server composition boundary** (`app/platform/workspaces`): `environment → resolver → WorkspaceContext → workspace-scoped EntityRepository`. The single-user resolver reads a trusted `DEFAULT_WORKSPACE_ID` binding, validates it and confirms it exists, and **fails closed** otherwise. Its `resolve()` takes **no request argument**, so no header, cookie, query string, route param, form field or JSON body can select or override scope.
- **Workspace-scoped repository construction.** Module code receives a repository *already bound* to one context (`createEntityRepository(db, context)`). **No module-facing method accepts a `workspaceId`**; every query and mutation is workspace-scoped in SQL, and a cross-workspace read/update/delete/restore is indistinguishable from "not found" — it never discloses that a record exists elsewhere. Pagination cursors are bound to the workspace and query shape that produced them.
- **Future authenticated resolver (FND-09).** [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth) will replace the static resolver with an authenticated session resolver implementing the **same `WorkspaceContextResolver` interface**, without changing module repository contracts.
- **Isolation is separate from authentication.** A `WorkspaceId` is a **scope identifier, not an authentication secret**. FND-03 resolves *which* scope from trusted server-side configuration; *who* the user is (sessions, login, Cloudflare Access) is deliberately out of scope and belongs to FND-09.

### EntityLinks: typed, directed relationships

Any active entity can link to any other active entity in the same workspace through **typed EntityLinks** ([FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks) / [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle), implementing [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)). Links are a **kernel primitive**, not per-module foreign keys, so a link created in one module is visible in every other with no extra work.

- **The EntityLink kernel.** A storage-independent contract (`app/kernel/entity-links`) defines the branded `EntityLinkType`, the `EntityLinkRecord`, the `EntityLinkView` (a link plus its `direction` and the counterpart entity), the domain errors, validation, a dedicated cursor, and the workspace-bound `EntityLinkRepository` interface (`create`, `getById`, `listForEntity`, `unlink`, `restore`). The D1 adapter (`app/platform/storage/d1`) implements it. An EntityLink is a **relationship record, not an entity** — no title, type-as-entity, search entry, Record Header, module or page.
- **One directed row per relationship.** A relationship is stored **once** as an `entity_links` row (`source_entity_id`, `target_entity_id`, `type`). "Bidirectional" means **discoverable from both ends**, not two rows: the source sees it as *outgoing*, the target sees the same row as *incoming*. Endpoint ids are never reordered — direction is meaningful.
- **Workspace-bound repository.** Like entities, the link repository is constructed already bound to a `WorkspaceContext` (`createEntityLinkRepository(db, context)`); no method accepts a `workspaceId`. The composition boundary (`resolveWorkspaceScope`) now returns **both** `entities` and `entityLinks`, bound to the same context.
- **Composite foreign-key enforcement.** A parent `UNIQUE (workspace_id, id)` key on `entities` lets `entity_links` use composite FKs `(workspace_id, source/target_entity_id) → entities (workspace_id, id)` with `ON DELETE RESTRICT`, so a **cross-workspace endpoint is impossible at the database level**. A `CHECK` forbids self-links and a `UNIQUE (workspace_id, source, target, type)` index gives each directed relationship one stable identity (idempotent create; in-place restore keeps the id).
- **Lifecycle & endpoint deletion.** Unlink is reversible soft deletion. Soft-deleting an endpoint entity does **not** delete its link rows; instead link queries hide a link whenever *either* endpoint is inactive, and restoring the endpoint reveals still-active links with their original id. Explicitly unlinked relationships stay unlinked through endpoint delete/restore. This keeps entity delete/restore **lossless and reversible** and is why there is no destructive cascade in `EntityRepository.softDelete()`.
- **Activity integration ([FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model)).** Every successful, meaningful link mutation now appends one Activity event atomically, with both endpoints as subjects — see [Activity](#activity-append-only-history--audit-trail) below.
- **Future governance ([FND-06](../roadmap/ROADMAP_V2.md#-fnd-06--module-registry)).** Link types are validated, branded identifiers stored verbatim — an open contract with no database enum — so modules can register link types without a migration; FND-06 will connect link-type registration to the Module Registry.

### Activity: append-only history & audit trail

Every meaningful entity and EntityLink mutation appends one uniform event to a single, workspace-scoped **Activity** stream ([FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) / [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording), implementing [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model)). This one model is the source of the record **Timeline**, the workspace **Activity Feed** and the security **audit trail** — there are no per-module history or event tables.

- **The Activity kernel.** A storage-independent contract (`app/kernel/activity`) defines the branded `ActivityType`, the `ActivityRecord` (`id`, `workspaceId`, `type`, `actor`, `occurredAt`, `payload`, `subjects`), the `ActivityActor`/`ActivitySubject` value types, the payload rules and shared JSON serialiser, a dedicated versioned cursor, the domain errors, and the **read-only** `ActivityRepository` (`getById`, `listForWorkspace`, `listForEntity`). The D1 adapter (`app/platform/storage/d1`) implements the reads and the internal recording seam. No SQL, D1 type, storage row or JSON string ever crosses the kernel boundary.
- **Two tables, one stream.** A STRICT `activities` table holds the event header; a STRICT `activity_subjects` association table records which entities each event relates to and in what role (`subject`, `source`, `target`). An event can relate to **one or many** entities — a single `entity_link.*` event carries a `source` and a `target` subject, so the same event appears in **both** endpoints' timelines while remaining one event. Composite foreign keys keep subjects same-workspace and preserve a deleted entity's Timeline; `ON DELETE RESTRICT` everywhere.
- **Append-only semantics.** The module-facing contract exposes reads only — no update, delete, soft-delete or restore. `activities` has no `updated_at`/`deleted_at`. Events are appended solely as the atomic side effect of a domain mutation. Retention/archival/purge are out of scope.
- **Actor context.** Each event carries a trusted, server-derived `actor` (`{ type, id }`) established at the composition boundary and threaded into the mutation repositories — never accepted through a module method parameter. Today it is the `system` actor (`id: null`); [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth) swaps in an authenticated `user` actor behind the same seam with no schema change.
- **Event types & payloads.** Types are validated, branded, lowercase dotted identifiers stored verbatim (`entity.created`, `entity.updated`, `entity.deleted`, `entity.restored`, `entity_link.created`, `entity_link.unlinked`, `entity_link.restored`) — no database enum, so modules add types without a migration. Each event has a small JSON-object payload, recursively validated, bounded in nesting depth and encoded byte size, serialised once and re-validated on read.
- **Atomic mutation & event recording.** A domain mutation and its Activity append are ONE `D1Database.batch()` (a single transaction that rolls back entirely on any failure). The domain statement is first and `RETURNING`; the event insert is guarded `WHERE changes() > 0` and each subject insert `WHERE EXISTS` the event — so the append happens **iff the domain statement actually changed a row**. Failed mutations, idempotent no-ops and losing concurrent racers append nothing; an Activity-insert failure rolls back the domain change. The `changes()`-across-a-batch and per-statement `meta.changes` behaviour is proven against real D1.
- **Workspace & entity query scopes.** `listForWorkspace` is the whole-workspace feed; `listForEntity` is one entity's Timeline (the events it is a subject of, anchor active *or* soft-deleted). Both are workspace-isolated, newest-first by `(occurredAt, id)`, bounded and cursor-paginated with a dedicated versioned cursor bound to workspace + scope-kind + anchor + type filter, and free of N+1 subject lookups. A cross-workspace entity is indistinguishable from a nonexistent one.
- **Composition boundary.** `resolveWorkspaceScope` now returns `entities`, `entityLinks` and a read-only `activity`, all bound to the same `WorkspaceContext`, and constructs one trusted actor context used by both mutation repositories.
- **Future UI & governance.** The Timeline and Activity Feed **UI** are later Design System work; FND-05 builds the model only. Custom event types and their registration are governed by the [Module Registry](#module-registry-self-registering-module-capabilities) below — the kernel accepts them as validated identifiers, and a module now declares which custom Activity types it owns.

### Module registry: self-registering module capabilities

Modules self-register their capabilities through the **Module Registry** ([FND-06](../roadmap/ROADMAP_V2.md#-fnd-06--module-registry) / [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery), implementing [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry)). Adding a module means adding a directory and a manifest — never editing a central switch statement. FND-06 builds the registry and its discovery mechanism only; the shell that consumes them is [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth).

- **The module kernel.** A storage-independent contract (`app/kernel/modules`) defines the branded `ModuleId`, the declarative `ModuleDefinition` (a small identity header plus readonly capability collections), the capability contracts (routes, entity types, EntityLink types, Activity event types, commands, search providers, settings), the `defineModule` authoring helper, boundary validation, typed registry errors, the pure discovery collector, and the immutable `ModuleRegistry` with `createModuleRegistry`. It imports **no** Vite, React Router, Cloudflare or D1 types.
- **Declarative, side-effect-free manifests.** Each module exposes one `module.ts` that default-exports `defineModule({ … })`. A manifest is plain data: evaluating it touches no D1, workspace, request, network or global state, imports no heavy UI, and runs no command/search. `defineModule` is a typed identity function with no hidden registration — there is no mutable global service locator.
- **Automatic build-time discovery.** A constrained Vite `import.meta.glob("./*/module.ts", { eager: true })` (`app/modules/discover-modules.ts`) discovers every manifest under `app/modules/<module-id>/`. Vite transforms it into static imports at build time, so discovery is deterministic and works under Vite, React Router and Workers with no Node filesystem access in the deployed Worker. The Vite glob lives in the app layer; the pure `collectModuleDefinitions`/`createModuleRegistry` live in the kernel.
- **Immutable, validated-once registry.** `createModuleRegistry` validates every manifest and descriptor, fails fast on any collision (duplicate module id, route id, route path, entity type, link type, Activity type, command id, search-provider id, setting key, invalid/self/cross-module route parent, kernel-reserved Activity type, invalid setting default, malformed discovery export), builds lookup maps once, and returns a **frozen** registry. Ordering is deterministic and independent of filesystem enumeration; unknown lookups return `null`; there is no registration after construction, and no source-manifest/returned-array/nested-object mutation can change registry state.
- **Governance, not enums.** The registry reuses the FND-02/04/05 identifier validators (`validateEntityType`, `parseEntityLinkType`, `parseActivityType`) rather than duplicating them — no database enum, no migration, and the D1 repositories are **not** coupled to a registry singleton. Registry membership is not yet a precondition for low-level persistence. Command/route/search/setting ids are namespaced under their module; the kernel lifecycle Activity types are reserved.
- **Static declaration vs runtime execution.** Command and search handlers carry an explicit `ModuleRuntimeContext` seam and are never invoked to build the registry; route contributions reference their page module lazily and are never loaded during construction. FND-09 supplies the authenticated, workspace-scoped runtime context. A platform adapter (`app/platform/modules/route-contribution-adapter.ts`) resolves route contributions into a nesting tree for FND-09 without eagerly loading page components.
- **Module development guide.** [`docs/development/MODULES.md`](../development/MODULES.md) documents the manifest convention, every contribution type, discovery, id/namespacing rules, collision behaviour, kernel-reserved types, and how to add a module.

---

## Modules (userland)

A module is a self-contained feature area (Today, Projects, Notes, …). Each one, via the [Module Registry](#module-registry-self-registering-module-capabilities) ([ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery)), declares in its manifest:

- **Routes** — the surfaces it owns in the shell (lazily referenced page modules).
- **Entity types** — the records it manages (built on the kernel entity substrate).
- **EntityLink types** — the relationships it supports (built on the kernel link primitive).
- **Activity event types** — the custom history/audit events it emits (kernel lifecycle types are reserved).
- **Commands** — actions exposed to the [Command Palette](../design/DESIGN_SYSTEM.md#command-palette).
- **Search providers** — how its records appear in [global Search](../design/DESIGN_SYSTEM.md#search).
- **Settings** — its configuration, rendered through the shared [Settings](../design/DESIGN_SYSTEM.md#settings) pattern.

**Module rules:**
- A module never imports another module's internals — enforced by a repository import-boundary test ([`MODULES.md`](../development/MODULES.md)). Cross-module relationships go through **EntityLinks**.
- A module builds its UI from the **shared Design System** — no bespoke duplicates ([`AGENTS.md §9.8`](../../AGENTS.md#98-shared-over-bespoke)).
- A module is independently implementable, matching the [ROADMAP](../roadmap/ROADMAP_V2.md) structure — one item, one PR.

---

## Shared Design System layer

The Design System sits between modules and the kernel: reusable, kernel-aware UI (a Card knows how to render any entity; the Drawer opens any record; Timeline renders the Activity model). Its patterns and rules are specified in [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) and built in [ROADMAP Phase 1 (`DS-*`)](../roadmap/ROADMAP_V2.md#phase-1--shared-design-system-ds). Modules consume it; they do not fork it.

---

## Platform

> **Application platform & toolchain: settled.** The compute runtime, framework, and toolchain are now an accepted decision — see [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain), implemented by [FND-01](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold).
>
> **Relational storage: settled for the entity kernel.** **Cloudflare D1 (SQLite) is the accepted initial relational store** for the data kernel — see [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage), implemented by [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage). The other storage services below (KV, R2, Durable Objects) remain a *proposed direction*, deferred to later roadmap items and to be confirmed via their own ADR before anything relies on them.

- **Client (settled — ADR-008):** React 19 + TypeScript (strict), rendered through **React Router v8 in framework mode** (SSR by default), built with **Vite** and the official **Cloudflare Vite plugin**. The Design System (Phase 1) will build on accessible primitives and utility styling; see [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) and [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) for candidate libraries (command palette, editor, drag-and-drop, dates).
- **Compute runtime (settled — ADR-008):** **Cloudflare Workers**, developed and deployed with **Wrangler**; server code runs in the Workers runtime locally via the Vite plugin so local behaviour matches production.
- **Storage:** **Cloudflare D1 (SQLite) is accepted for the relational entity kernel** ([ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage) / [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage)): entities persist in D1 through a DalyHub-owned typed repository over prepared statements, with schema managed by committed SQL migrations and no ORM. The remaining services — KV for fast config/cache, R2 for [Asset](../roadmap/ROADMAP_V2.md#phase-8--assets-asset) files, Durable Objects where strong coordination is needed — remain **proposed and deferred**; each is a later, separately-accepted decision.
- **Markdown & editor:** the shared, sanitising Markdown renderer is **accepted and built** ([ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) / [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) / [FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline)): Markdown source is the durable representation, rendered through one deterministic, Workers-safe `unified` pipeline with a strict allowlist and a single React sink ([`MARKDOWN_PIPELINE.md`](../development/MARKDOWN_PIPELINE.md)). A Markdown-native **editor** that still saves Markdown source is later work ([NOTES-01](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor)).
- **Auth:** single-user first (the owner), designed so multi-user isn't precluded. Workspace scoping is a **persisted, enforced** isolation seam as of [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) / [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context): scope is resolved server-side today from configuration and, at [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth), from an authenticated session behind the same resolver interface. Workspace isolation is independent of authentication — a workspace id is a scope identifier, not a credential.
- **Background work:** for reminders (renewals, stay-in-touch), review cadences, and import/sync — scheduled/queued jobs on the platform.
- **External integrations:** Todoist, Notion, and calendars as **import/sync sources** ([X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar)); imported data is untrusted until validated ([security](../../AGENTS.md#17-security-requirements)).

---

## Cross-cutting concerns

- **Security & privacy.** Workspace scoping is enforced server-side on every request; sensitive entities (People, Diary) are excluded from external/AI context without per-action opt-in. See [`AGENTS.md §17`](../../AGENTS.md#17-security-requirements) and [ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture).
- **Performance.** Virtualise Activity/Timeline/search; optimistic UI for mutations; lean payloads and lazy-loaded modules. Budgets in [`AGENTS.md §16`](../../AGENTS.md#16-performance-expectations).
- **Data portability & backup.** Markdown + structured export ([X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability)) and tested backup/restore ([SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore)) — the system is the user's memory and must be recoverable.
- **Observability.** The Activity model provides a functional/audit history; operational logging must never contain sensitive entity content.

---

## Where to make changes

| If you're changing… | Do this |
|---|---|
| A kernel contract or core concept | Write a new **ADR**, then implement; expect broad impact. |
| A shared UI pattern | Update [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) and the shared component in the same PR. |
| One module's behaviour | Stay within the module; relate to others via EntityLinks only. |
| A platform/technology choice | New **ADR** documenting the change and its consequences. |

---

## Related documents
- [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) — the *why* behind every structure here.
- [`AGENTS.md §9`](../../AGENTS.md#9-architecture-philosophy) — architecture philosophy.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the Foundation items that build this.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the shared layer.
- [`docs/README.md`](../README.md) — documentation index.
