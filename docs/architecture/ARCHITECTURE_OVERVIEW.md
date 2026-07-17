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
| **EntityLinks** | Typed, bidirectional links between any entities | [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) | [FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks) |
| **Activity** | Append-only uniform event stream | [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model) | [FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) |
| **Module Registry** | Self-registration of modules' capabilities | [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry) | [FND-06](../roadmap/ROADMAP_V2.md#-fnd-06--module-registry) |
| **Area spine** | Area→Goal→Project→Task + rollup | [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy) | [FND-07](../roadmap/ROADMAP_V2.md#-fnd-07--area--goal--project--task-hierarchy) |
| **Markdown pipeline** | One authoring/storage/sanitising renderer | [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) | [FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline) |
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

One boundary that FND-02 left open is now closed by **[FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) / [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context)** (see [Workspace isolation](#workspace-isolation-persisted-boundary--server-derived-context) below). The remaining kernel primitives — EntityLinks/Activity/the spine tables ([FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks)/[FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model)/[FND-07](../roadmap/ROADMAP_V2.md#-fnd-07--area--goal--project--task-hierarchy)) — build on this substrate later.

### Workspace isolation: persisted boundary & server-derived context

Workspace is DalyHub's top-level isolation *and security* boundary ([ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation)). [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) makes it real and enforced, with the concrete design recorded in [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context):

- **Persisted Workspace boundary.** A workspace is a **separate kernel/security record** in its own minimal `workspaces` table (`id`, `created_at`, `updated_at` only), *not* a row in `entities`. The workspace kernel (`app/kernel/workspaces`) defines a validated, branded `WorkspaceId`, the `WorkspaceRecord`, the `WorkspaceContext`, and a low-level `WorkspaceRepository` used only at bootstrap.
- **Foreign-key relationship.** `entities.workspace_id` has an enforced foreign key to `workspaces.id` with `ON DELETE RESTRICT` (migration `0002`). The **database** rejects an entity whose workspace does not exist — even against raw SQL — and refuses to delete a workspace that still owns entities. There is no public hard-delete of a workspace.
- **Server-derived `WorkspaceContext`.** Scope is established at the **server composition boundary** (`app/platform/workspaces`): `environment → resolver → WorkspaceContext → workspace-scoped EntityRepository`. The single-user resolver reads a trusted `DEFAULT_WORKSPACE_ID` binding, validates it and confirms it exists, and **fails closed** otherwise. Its `resolve()` takes **no request argument**, so no header, cookie, query string, route param, form field or JSON body can select or override scope.
- **Workspace-scoped repository construction.** Module code receives a repository *already bound* to one context (`createEntityRepository(db, context)`). **No module-facing method accepts a `workspaceId`**; every query and mutation is workspace-scoped in SQL, and a cross-workspace read/update/delete/restore is indistinguishable from "not found" — it never discloses that a record exists elsewhere. Pagination cursors are bound to the workspace and query shape that produced them.
- **Future authenticated resolver (FND-09).** [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth) will replace the static resolver with an authenticated session resolver implementing the **same `WorkspaceContextResolver` interface**, without changing module repository contracts.
- **Isolation is separate from authentication.** A `WorkspaceId` is a **scope identifier, not an authentication secret**. FND-03 resolves *which* scope from trusted server-side configuration; *who* the user is (sessions, login, Cloudflare Access) is deliberately out of scope and belongs to FND-09.

---

## Modules (userland)

A module is a self-contained feature area (Today, Projects, Notes, …). Each one, via the [Module Registry](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry), declares:

- **Routes** — the surfaces it owns in the shell.
- **Entity types** — the records it manages (built on the kernel entity substrate).
- **Commands** — actions exposed to the [Command Palette](../design/DESIGN_SYSTEM.md#command-palette).
- **Search providers** — how its records appear in [global Search](../design/DESIGN_SYSTEM.md#search).
- **Settings** — its configuration, rendered through the shared [Settings](../design/DESIGN_SYSTEM.md#settings) pattern.

**Module rules:**
- A module never imports another module's internals. Cross-module relationships go through **EntityLinks**.
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
- **Markdown & editor:** a Markdown-native editor feeding the shared sanitising renderer ([ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)).
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
