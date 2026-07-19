# MODULES.md — Building a DalyHub Module

> How to author a module: the manifest convention, every capability it can
> contribute, how discovery works, the identifier and namespacing rules,
> collision behaviour, kernel-reserved types, the static-vs-runtime boundary,
> and the rule against cross-module imports.
>
> Decision & rationale: [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery) (module registry contract & discovery), implementing [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry).
> Roadmap item: [FND-06](../roadmap/ROADMAP_V2.md#-fnd-06--module-registry).
> Architecture: [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#module-registry-self-registering-module-capabilities).

---

## What a module is

A **module** is a self-contained feature area of DalyHub (Projects, Notes,
Meetings, People, …) — "userland" built on the small, shared kernel. A module
declares its capabilities through **one declarative manifest**; the shell
discovers every module through the **Module Registry** and composes navigation,
routes, the command palette, global search and settings from it. Adding a module
means adding a directory and a manifest — **never** editing a central switch
statement or a hand-maintained module list.

Modules are **trusted, compiled-in application code**. DalyHub is not a plugin
marketplace: there is no remote module loading, no user-uploaded code, no
runtime `eval`, and no database-controlled module definitions.

> **Scope note.** FND-06 builds the registry and its discovery mechanism only.
> The navigation, app shell, command-palette UI, global-search UI and settings
> UI that consume the registry are [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth)
> and later. No product module exists yet — this document tells you how to write
> one when the time comes.

---

## The layers

| Layer | Location | Responsibility |
| ----- | -------- | -------------- |
| **Module kernel** | `app/kernel/modules` | Storage-independent contract: `ModuleDefinition`, capability types, `defineModule`, validation, typed errors, the immutable `ModuleRegistry`, the pure discovery collector. Imports no Vite/React Router/Cloudflare types. |
| **Discovery (app)** | `app/modules/discover-modules.ts` | The Vite `import.meta.glob` that finds manifests at build time. The one place the glob lives. |
| **Route adapter (platform)** | `app/platform/modules/route-contribution-adapter.ts` | Resolves route contributions into a nesting tree FND-09 maps onto React Router. |
| **A module** | `app/modules/<module-id>/` | The module's own directory: its `module.ts` manifest plus its internal files (routes, handlers, UI). |

Import direction: a module may import **kernel contracts** (`~/kernel/*`) and its
**own** internals; it must never import another module's internals.

---

## The manifest convention

Each module lives in `app/modules/<module-id>/` and exposes exactly one manifest:

```
app/modules/<module-id>/module.ts        ← default-exports defineModule({ … })
```

The manifest **must** expose its definition through a single `default` export.
`defineModule(...)` is a typed identity helper: it gives you full inference on
the definition and returns it unchanged. It performs **no** registration and has
**no** side effects — a manifest becomes part of the app only when it is
discovered and passed to `createModuleRegistry`.

A manifest must be **side-effect free** to evaluate. Do not, at module top level:
access D1, resolve a workspace, read request data, make network requests, mutate
global state, eagerly import heavy UI, or run a command/search. Declare
capabilities; don't execute them.

### Example manifest (illustrative — not a real module)

```ts
// app/modules/widgets/module.ts   (fictional example for documentation only)
import { defineModule } from "~/kernel/modules";

export default defineModule({
  id: "widgets",
  name: "Widgets",
  description: "An example module for the docs.",
  order: 10,

  // Route descriptors are declarative `file` references (ADR-016 §5.10). In a
  // real module these live in `app/modules/widgets/routes.manifest.ts` (pure
  // data, type-only imports) so `app/routes.ts` can compose them at build time;
  // `module.ts` imports that array. Shown inline here for illustration.
  routes: [
    {
      id: "widgets.list",
      path: "widgets",
      file: "routes/widget-list.tsx", // module-relative; resolved to app/modules/widgets/... and code-split by React Router
      meta: { navLabel: "Widgets", navGroup: "make", navOrder: 1 },
    },
    {
      id: "widgets.detail",
      path: ":widgetId",
      parentId: "widgets.list",
      file: "routes/widget-detail.tsx",
    },
  ],

  entityTypes: [{ type: "widget", singular: "Widget", plural: "Widgets" }],

  entityLinkTypes: [
    {
      type: "widget.depends_on",
      sourceLabel: "depends on",
      targetLabel: "required by",
      sourceEntityType: "widget",
      targetEntityType: "widget",
    },
  ],

  activityTypes: [
    { type: "widget.shipped", label: "Widget shipped", description: "A widget was shipped." },
  ],

  commands: [
    // A NAVIGATION command (DS-09): a validated declarative target, no handler.
    {
      id: "widgets.open",
      title: "Go to Widgets",
      keywords: ["widgets"],
      kind: "navigate",
      target: { kind: "route", to: "/widgets" }, // reuses DS-08 SearchResultTarget
    },
    // An EXECUTABLE command (DS-09): runs once through the authenticated server
    // boundary and returns a typed, safe outcome — never `void`, never a raw error.
    {
      id: "widgets.create",
      title: "Create widget",
      keywords: ["new", "widget"],
      shortcut: { key: "w", modifiers: ["mod"] },
      kind: "execute",
      run: async ({ workspace, signal }) => {
        // Explicit runtime context (workspace scope + a cancellation signal).
        // Never captures a global DB/workspace. Not called to build the registry.
        void workspace.workspaceId;
        void signal.aborted;
        return { ok: true, message: "Widget created." };
      },
    },
  ],

  searchProviders: [
    {
      id: "widgets.search",
      label: "Widgets",
      entityTypes: ["widget"],
      search: async (query, context) => {
        void context.workspace.workspaceId;
        // `context.signal` is aborted on the per-provider deadline (or when the
        // search is cancelled). A repository-backed provider should pass it to its
        // data layer and stop early; a fixture provider may ignore it.
        void context.signal;
        // A result declares HOW it opens via a validated `SearchResultTarget`
        // (DS-08/ADR-023): `{ kind: "drawer", drawerKey, canonicalPath? }` to open
        // in the DS-03 Drawer, or `{ kind: "route", to }` to navigate. Shared
        // Search never parses a product path or id.
        return [
          {
            id: "w1",
            title: `Match for ${query.text}`,
            target: { kind: "drawer", drawerKey: "widget:w1", canonicalPath: "/widgets" },
          },
        ];
      },
    },
  ],

  settings: [
    {
      key: "widgets.default_sort",
      label: "Default sort",
      type: "enum",
      options: [
        { value: "recent", label: "Most recent" },
        { value: "name", label: "Name" },
      ],
      default: "recent",
    },
  ],
});
```

---

## The capability contributions

A module declares any subset of these readonly collections. Each is validated at
registry construction; ownership (the declaring `moduleId`) is attached
automatically, so you never repeat the module id on each entry.

- **`routes`** — module-owned routes. Each has a stable namespaced `id`, either a
  `path` **or** `index: true`, an optional `parentId` (same-module), a declarative
  module-relative **`file`** reference (e.g. `file: "routes/index.tsx"`) that is
  stored as plain data and never imported to build the registry, and optional
  `meta` (`navLabel`, `navGroup`, `navOrder`) the shell uses to derive
  navigation. The `file` is validated (`validateRouteFile`) to be relative,
  traversal-free and inside the owning module; the platform React Router adapter
  resolves it to `app/modules/<module-id>/<file>`, which React Router code-splits.
  See the FND-09 refinement note below and [ADR-016 §5.10](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing).
- **`entityTypes`** — entity types this module owns. Each has the stable `type`
  (validated by the FND-02 entity-type contract), a `singular` label and an
  optional `plural`.
- **`entityLinkTypes`** — EntityLink types this module supports (the registration
  FND-04 deferred to here). Each has the stable `type` (FND-04 contract), a
  `sourceLabel`, an optional `targetLabel`, and optional `sourceEntityType` /
  `targetEntityType` **metadata** (not enforced in D1 by FND-06).
- **`activityTypes`** — custom Activity event types this module owns (the
  governance FND-05 deferred to here). Each has the stable `type` (FND-05
  contract), a `label` and optional `description`. Labels live in the registry,
  never in the `activities` table.
- **`commands`** — Command Palette commands, consumed by DS-09
  ([`ModuleRegistry.listCommands()`](../../app/shared/commands); [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action)).
  Each has a namespaced `id`, a `title`, optional `subtitle`/`keywords`/`shortcut`,
  and a `kind`: a `navigate` command carries a validated `target` (reusing DS-08's
  `SearchResultTarget`) and runs on the client; an `execute` command carries a
  `run` handler that receives an explicit `CommandRuntimeContext` (workspace scope +
  a cancellation signal) and returns a typed `CommandExecutionOutcome` — it runs
  once through the authenticated server boundary (see [Static vs runtime](#static-declaration-vs-runtime-execution)
  and [`COMMAND_PALETTE.md`](COMMAND_PALETTE.md)). A command may not reassign a
  reserved global shortcut (`Mod+K`, `/`). Register commands **from day one** so the
  palette lights up for free.
- **`searchProviders`** — global-search providers, consumed by DS-08 Shared Search
  ([`ModuleRegistry.listSearchProviders()`](../../app/shared/search); [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation)).
  Each has a namespaced `id`, a `label`, optional `entityTypes`, and a `search`
  function taking a normalised query and a `SearchRuntimeContext` (the workspace
  scope plus a cancellation `signal`, aborted on the per-provider deadline) and
  returning typed result items. A result item's `id` need only be unique **within
  its own provider** — Shared Search forms the global identity as
  `moduleId::providerId::itemId`, so two providers in one module may reuse an `id`.
  A result item declares **how it opens** via a
  validated
  `SearchResultTarget` (`{ kind: "drawer"; drawerKey; canonicalPath? }` or
  `{ kind: "route"; to }`) — Shared Search never parses a product route or id, and
  unsafe targets are rejected at the boundary. See [`SHARED_SEARCH.md`](SHARED_SEARCH.md).
- **`settings`** — declarative settings. Each has a namespaced `key`, a `label`,
  optional `description`, a value `type` (`boolean`, `string`, `number` or
  single-select `enum`), a `default` that must match the type (and be one of the
  options for `enum`), and optional bounds (`maxLength`, `min`/`max`, `options`).
  FND-06 does **not** persist settings or store secrets — never put a secret or a
  secret default in a manifest.

---

## Identifier & namespacing rules

- **Module id (`id`)** is a branded, validated **lowercase hyphenated slug**:
  starts with a letter; lowercase letters, digits and single hyphens only;
  examples `projects`, `notes`, `day-diary`. Rejected: empty, whitespace,
  uppercase, dots, underscores, slashes, path traversal, leading/trailing/double
  hyphens, and over-length (max 64). **Module identity is stable and machine-readable
  — never derive it from a display label.**
- **Capability ids** (`routes[].id`, `commands[].id`, `searchProviders[].id`,
  `settings[].key`, and any `parentId`) are **namespaced under the module**:
  `"<module-id>.<local>"`, where `<local>` is a lowercase dotted identifier
  (e.g. `projects.create`, `day-diary.capture`, `meetings.schedule.recurring`).
  Namespacing makes them globally unique **and** lets the registry verify each
  contribution belongs to the declaring module.
- **Route paths** are relative, safe path segments (static, `:param`, or `*`).
  Rejected: empty, whitespace, query strings (`?`), hashes (`#`), backslashes,
  leading/trailing slashes, empty segments, and `.`/`..` traversal segments.

---

## Collision behaviour

`createModuleRegistry` validates the whole set once and **fails fast** — it never
silently accepts the first or last of a duplicate. Every collision is a typed
error (see `app/kernel/modules/module-errors.ts`):

| Situation | Error |
| --------- | ----- |
| Invalid module definition / descriptor / setting default | `ModuleDefinitionError` |
| Duplicate module id | `DuplicateModuleError` |
| Duplicate route id, entity type, link type, activity type, command id, search-provider id, or setting key | `DuplicateContributionError` (with a `kind`) |
| Module claims a kernel-reserved Activity type | `ReservedActivityTypeError` |
| Two routes conflict on the same path (or two index routes) under the same parent | `RoutePathConflictError` |
| Route parent is missing, self, cross-module, or forms a cycle | `RouteParentError` |
| A discovered manifest has the wrong export shape | `ModuleDiscoveryError` |

Error messages are developer-useful but never leak environment values, database
paths, secrets or request data — the registry is built from trusted, compiled-in
manifests, so there is no untrusted input to leak.

---

## Kernel-reserved Activity types

The kernel owns these lifecycle event types; a module registering any of them
fails with `ReservedActivityTypeError`:

```
entity.created   entity.updated   entity.deleted   entity.restored
entity_link.created   entity_link.unlinked   entity_link.restored
```

The kernel is **not** a userland module — these are kernel-owned, not a module's
contributions. Your custom Activity types must be namespaced under your module
(e.g. `widget.shipped`).

---

## Static declaration vs runtime execution

Declarative metadata is kept separate from runtime dependencies. A command or
search descriptor **describes** an action; it is executed only when explicitly
invoked through the typed runtime seam:

- Building the registry **never** runs a command handler, executes a search, or
  loads a route module (proven by the lazy-behaviour tests).
- Handlers receive a `ModuleRuntimeContext` **explicitly**. They must **not**
  capture a global D1 binding, a global workspace, mutable request state, a
  caller-supplied workspace id, or a caller-supplied Activity actor. FND-09 and
  later work supply the authenticated, workspace-scoped context behind this seam.

---

## The registry API

`createModuleRegistry(definitions)` returns an **immutable** registry with
deterministic ordering (modules sort by optional `order` then id; contributions
keep authored order) and consistent lookups (every `get*` returns the item or
`null`):

```
listModules / getModule
listRoutes / getRoute
listEntityTypes / getEntityType
listEntityLinkTypes / getEntityLinkType
listActivityTypes / getActivityType
listCommands / getCommand
listSearchProviders / getSearchProvider
listSettings / getSetting
```

The registry is validated once and then frozen: returned arrays and nested
objects are deep-frozen, and mutating a source manifest after construction cannot
change registry state (validators build fresh defensive copies). There is no
mutable global service locator and no registration after construction.

---

## How discovery works

`app/modules/discover-modules.ts` runs a constrained Vite glob:

```ts
const manifestModules = import.meta.glob("./*/module.ts", { eager: true });
```

Vite transforms this into static imports at **build time**, so discovery is
deterministic and works under Vite, React Router and Cloudflare Workers with **no
Node filesystem access in the deployed Worker**. Manifests are eagerly imported
(they are small and side-effect free); the heavy module UI they reference stays
lazy. The pure `collectModuleDefinitions` (export-shape validation, path-sorted
normalisation) and `createModuleRegistry` (full validation, assembly) live in the
kernel, so the kernel carries no Vite dependency.

There is no central module array to edit — the glob is a pattern. Adding a
correctly-shaped `app/modules/<id>/module.ts` makes it discoverable automatically.

---

## The cross-module import rule

A module imports **kernel contracts** and its **own** internals — never another
module's internal files. Cross-module relationships go through **EntityLinks**,
not direct imports. This is enforced by a repository test
(`test/unit/module-registry/module-import-boundary.test.ts`) that resolves import
specifiers under `app/modules` and fails on any import into a sibling module's
directory (via `~/modules/<other>/…` or a relative path that climbs into a
sibling).

---

## Adding a new module (checklist)

1. Create `app/modules/<module-id>/`.
2. Add `app/modules/<module-id>/module.ts` that `export default defineModule({ … })`.
3. Give it a stable slug `id` and a human `name`; declare only the capabilities
   you need. Namespace every capability id under the module.
4. Declare route descriptors in `app/modules/<module-id>/routes.manifest.ts` as a
   default-exported array (pure data, `import type` only) and import it into
   `module.ts`; reference each route module by a declarative module-relative
   **`file`** (e.g. `file: "routes/index.tsx"`) and add the route file itself.
   Give command/search handlers an explicit-context signature.
5. Run `pnpm run typecheck` and `pnpm run test` — discovery, validation, route
   composition and the import-boundary check run automatically. No central file
   (including `app/routes.ts`) needs editing.

---

## What FND-06 deliberately does NOT build

The registry exposes the typed seams these will consume, but does not build them:
navigation, app shell, command-palette UI, global-search UI, settings UI or
persistence, route guards, authentication, search indexing, D1 migrations, and any
dynamic/third-party/remote module loading. Those arrive in later roadmap items.

> **Update (FND-07).** The four spine modules —
> [`areas`, `goals`, `projects`, `tasks`](SPINE_MODEL.md) — now exist as real,
> side-effect-free manifests under `app/modules/`, discovered automatically. They
> register only metadata (entity types, the structural EntityLink types, and the
> completion Activity types) — **no** routes, commands, settings or search
> providers. Hierarchy correctness itself lives in the shared spine kernel and the
> `SpineRepository`, not in these manifests (see
> [`SPINE_MODEL.md`](SPINE_MODEL.md) and
> [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics)).

> **Update (FND-09).** The shell that consumes the registry is now built (routing,
> navigation, authentication, theme — see
> [`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) and
> [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing)).
> The route-module reference changed from FND-06's lazy `() => import(...)` thunk
> to a declarative, module-relative **`file`** string, because React Router v8
> framework mode composes routes from build-time file references (ADR-016 §5.10).
> A route descriptor now lives in `app/modules/<id>/routes.manifest.ts` (pure
> data), is imported by `module.ts`, and is globbed by `app/routes.ts`. Both the
> runtime registry and the build-time `app/routes.ts` composition run the **same
> pure authoritative route validator** (`validateModuleRoutes` in the module
> kernel): the build-time path does not cast folder names and raw descriptors into
> registered routes, it validates them, so the real build fails loudly on an
> invalid module folder/descriptor, a route id outside the module namespace, a
> duplicate id, a duplicate/conflicting path, or a missing/cross-module/cyclic/
> index parent — there is no second, drifting validator. Primary navigation is
> derived from route `meta`. The four spine modules each add one navigable
> placeholder route (`/areas`, `/goals`, `/projects`, `/tasks`); their product
> functionality is still later work.

> **Update (TODAY-01).** The first **product** module ships:
> [`today`](TODAY_DASHBOARD.md) contributes one real route (`/today`) at the top of
> the sidebar (`navOrder 5`) and renders the calm morning dashboard composed from
> the PX-02 frame and DS-04/DS-07 — no placeholder. It is a **view** over the shared
> model, so it declares **no** entity type (a module may not own an entity type
> another module already owns); its nav row therefore uses the shell's documented
> generic-glyph fallback. Its DS-08 search provider and (DS-09) navigation commands
> are now registered (see [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md)).

> **Update (DS-08 / DS-09).** The registry's search and command seams now have real
> consumers. DS-08 built [Shared Search](SHARED_SEARCH.md) over
> `listSearchProviders()`; DS-09 built the [Command Palette](COMMAND_PALETTE.md) over
> `listCommands()` and refined the command contract into a discriminated
> `navigate`/`execute` union with a typed outcome and a cancellation-bearing runtime
> context ([ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action)).
> The command-palette UI, its catalogue transport and its authenticated execution
> boundary are built; only the registry contract lives in the kernel.

---

## Related documents
- [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md#adr-013-module-registry-contract-and-discovery) — the decision and its reasoning.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#module-registry-self-registering-module-capabilities) — how the registry fits the stack.
- [`AGENTS.md §9.1–9.2`](../../AGENTS.md#91-small-kernel-modular-userland) — small kernel, modular userland; the module registry principle.
- [`docs/README.md`](../README.md) — documentation index.
