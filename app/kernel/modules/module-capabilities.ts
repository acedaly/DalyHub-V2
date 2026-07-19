/**
 * FND-06 Module Registry kernel — the capability contribution contracts.
 *
 * A module declares its capabilities through the small, DECLARATIVE descriptors
 * defined here: routes, entity types, EntityLink types, Activity event types,
 * commands, search providers and settings. These are plain data — they carry no
 * runtime dependency, access no storage, and are safe to evaluate while merely
 * constructing the registry (ADR-013 §4.2).
 *
 * Runtime behaviour (running a command, executing a search) is kept SEPARATE
 * from this static metadata (ADR-013 §4.5). A command or search descriptor holds
 * a handler function, but the handler is NEVER invoked to build the registry —
 * it runs only when explicitly called through a typed runtime seam, and it
 * receives its dependencies EXPLICITLY as a context argument rather than
 * capturing a global workspace, database binding or request state. FND-09 and
 * later work supply that authenticated, workspace-scoped context.
 *
 * Nothing here imports Cloudflare, D1, React, React Router or Vite types — this
 * is storage-independent kernel contract. Reused identifier types (`EntityType`,
 * `EntityLinkType`, `ActivityType`) come from the existing FND-02/04/05 kernels.
 */

import type { EntityType } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";

/**
 * The trusted runtime dependencies a module handler receives when explicitly
 * invoked. It is a SEAM: FND-06 defines only the workspace scope every handler
 * needs; FND-09 and later work extend it with authenticated actor context and
 * the workspace-scoped repositories/navigation a handler is allowed to use.
 *
 * Handlers must depend ONLY on what they are given here. They must never capture
 * a global D1 binding, a global workspace, mutable request state, a
 * caller-supplied workspace id or a caller-supplied Activity actor (ADR-013 §4.5).
 */
export type ModuleRuntimeContext = {
  /** The authenticated, server-derived workspace scope for this invocation. */
  readonly workspace: WorkspaceContext;
};

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A module-relative reference to a route module's source file (e.g.
 * `routes/index.tsx`), resolved by the platform adapter to
 * `app/modules/<module-id>/<file>` (ADR-013 §8, refined by ADR-016 §5.10).
 *
 * FND-06 originally modelled this as a lazy `() => import(...)` THUNK. FND-09's
 * compatibility spike proved that React Router 8 framework mode composes its
 * route tree from BUILD-TIME file references (`app/routes.ts` returns
 * `RouteConfigEntry`s whose `file` the toolchain uses for per-route type
 * generation, SSR and production code splitting) and offers no way to register a
 * runtime import thunk. A thunk therefore cannot drive framework-mode routing, so
 * the contract is a declarative file string instead. This is STILL fully lazy:
 * the string is plain data, so constructing the registry never loads a page
 * component, and React Router code-splits each referenced module. The string is
 * constrained (module-relative, no traversal, no absolute path) by
 * `validateRouteFile` (`module-validation.ts`) so it can never reference another
 * module or escape the owning module directory. See ADR-016 §5.10.
 */
export type RouteModuleFile = string;

/** Optional metadata a route can expose for later shell discovery (FND-09). */
export type RouteMeta = {
  /** Human-readable navigation label, if this route should appear in navigation. */
  readonly navLabel?: string;
  /** Optional grouping key the shell may use to cluster navigation entries. */
  readonly navGroup?: string;
  /** Optional ordering hint within a navigation group. */
  readonly navOrder?: number;
};

/**
 * A module-owned route contribution — the minimum a module declares so the app
 * shell composes it into the application's React Router route tree. It is purely
 * declarative: the page component is referenced by a module-relative `file`
 * string and is never loaded to build the registry (React Router code-splits it).
 */
export type RouteContribution = {
  /**
   * Stable, globally-unique route id, namespaced under the declaring module
   * (e.g. `projects.detail`). Used as the parent reference target and as the
   * shell's stable handle for the route.
   */
  readonly id: string;
  /**
   * The route's path segment(s) relative to its parent (e.g. `projects` or
   * `projects/:projectId`). Required unless `index` is true. May not contain a
   * query string, hash, whitespace or a `..` traversal segment.
   */
  readonly path?: string;
  /**
   * True for an index route (renders at its parent's path and therefore has no
   * `path` of its own). A route is either an index route or a path route.
   */
  readonly index?: boolean;
  /**
   * Optional id of the route this one nests under. Must resolve to another
   * registered route; by default a parent must be owned by the same module.
   */
  readonly parentId?: string;
  /**
   * Module-relative path to the route module's source file (e.g.
   * `routes/index.tsx`). The platform adapter resolves it to
   * `app/modules/<module-id>/<file>` and it can never traverse out of the owning
   * module (see `validateRouteFile`). Plain data — never imported to build the
   * registry; React Router loads and code-splits it at run time (ADR-016 §5.10).
   */
  readonly file: RouteModuleFile;
  /** Optional metadata for future navigation/shell discovery. */
  readonly meta?: RouteMeta;
};

/* -------------------------------------------------------------------------- */
/* Entity types                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A module's declaration that it OWNS an entity type. The registry governs
 * discoverability and ownership of the identifier; it does NOT make the type a
 * database enum, add a domain table, or make entity persistence consult the
 * registry (ADR-013 §4.6, §9). The `type` reuses the FND-02 `EntityType`
 * contract and its validator.
 */
export type EntityTypeContribution = {
  /** The stable entity type identifier this module owns (e.g. `project`). */
  readonly type: EntityType;
  /** Human-readable singular label (e.g. `Project`). */
  readonly singular: string;
  /** Human-readable plural label (e.g. `Projects`), when useful. */
  readonly plural?: string;
};

/* -------------------------------------------------------------------------- */
/* EntityLink types                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A module's declaration of a supported EntityLink type, reusing the FND-04
 * `EntityLinkType` contract and validator. Source/target entity-type constraints
 * are optional METADATA only — FND-06 does not enforce them in D1 and does not
 * change the open database representation (ADR-013 §10).
 */
export type EntityLinkTypeContribution = {
  /**
   * The stable link type identifier (e.g. `project.supporting_note`). Authored as
   * a plain string and validated+branded internally by the FND-04
   * `parseEntityLinkType` — so a manifest author writes a literal, not a
   * pre-branded value, while the registry still enforces the link-type contract.
   */
  readonly type: string;
  /** Label describing the relationship from the source's side. */
  readonly sourceLabel: string;
  /** Label describing the relationship from the target's/inverse side, if useful. */
  readonly targetLabel?: string;
  /** Optional metadata: the entity type expected on the source endpoint. */
  readonly sourceEntityType?: EntityType;
  /** Optional metadata: the entity type expected on the target endpoint. */
  readonly targetEntityType?: EntityType;
};

/* -------------------------------------------------------------------------- */
/* Activity types                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A module's declaration of a custom Activity event type, reusing the FND-05
 * `ActivityType` contract and validator. Display labels live here in the
 * registry, NEVER in the `activities` table (ADR-013 §11). A module may not
 * claim a kernel-reserved lifecycle type.
 */
export type ActivityTypeContribution = {
  /**
   * The stable Activity event type (e.g. `project.completed`). Authored as a
   * plain string and validated+branded internally by the FND-05
   * `parseActivityType`; a module may not claim a kernel-reserved lifecycle type.
   */
  readonly type: string;
  /** Concise human-readable label for future Timeline/Activity Feed rendering. */
  readonly label: string;
  /** Optional longer description. */
  readonly description?: string;
};

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** Declarative keyboard-shortcut metadata for a command. Not a live listener. */
export type CommandShortcut = {
  /** The primary key (e.g. `k`, `Enter`). */
  readonly key: string;
  /** Modifier keys required alongside `key`. */
  readonly modifiers?: readonly ("mod" | "shift" | "alt" | "ctrl" | "meta")[];
};

/**
 * The trusted runtime context an EXECUTABLE command's handler receives when it is
 * explicitly invoked at the authenticated server boundary (DS-09, ADR-024). It
 * extends {@link ModuleRuntimeContext} with a cancellation `signal`, exactly as
 * {@link SearchRuntimeContext} does for search providers: the execution boundary
 * enforces a bounded deadline and aborts the signal when it elapses (or when the
 * caller cancels). A well-behaved handler observes `signal.aborted` and stops
 * early; even one that ignores it cannot hold the boundary open past the deadline.
 * `AbortSignal` is a standard web primitive — this stays React-free, D1-free and
 * Cloudflare-free.
 */
export type CommandRuntimeContext = ModuleRuntimeContext & {
  /** Aborted when the command's execution deadline elapses or it is cancelled. */
  readonly signal: AbortSignal;
};

/**
 * The typed, safe result an executable command returns. A handler NEVER throws a
 * raw error, returns SQL, a stack trace or an infrastructure code across this
 * boundary: it returns one of these display-ready shapes (ADR-024). On success it
 * may carry a short message and an optional post-success navigation `target`
 * (validated like any other navigation target); on failure it names a recovery
 * class and a bounded, display-ready message. Message and target bounds are
 * enforced by the shared execution model / the server boundary, not here.
 */
export type CommandExecutionOutcome =
  | {
      readonly ok: true;
      /** Optional, bounded, display-ready confirmation. */
      readonly message?: string;
      /** Optional validated navigation to run after the command succeeds. */
      readonly target?: SearchResultTarget;
    }
  | {
      readonly ok: false;
      /**
       * The recovery class. `unavailable` — the command cannot run right now;
       * `conflict` — the world changed under it; `failed` — it tried and could not
       * complete. A timeout is reported honestly as `failed` (the side effect may
       * or may not have completed — see ADR-024), never as "cancelled".
       */
      readonly reason: "unavailable" | "conflict" | "failed";
      /** A bounded, display-ready explanation. Never a raw error or stack trace. */
      readonly message: string;
    };

/**
 * The runtime handler for an EXECUTABLE command. It receives its dependencies
 * EXPLICITLY via the {@link CommandRuntimeContext} (workspace scope + cancellation
 * signal) and returns a typed {@link CommandExecutionOutcome}. It is never called
 * to construct the registry (ADR-013 §12); it runs only through the authenticated
 * command-execution boundary (ADR-024).
 */
export type CommandHandler = (
  context: CommandRuntimeContext,
) => CommandExecutionOutcome | Promise<CommandExecutionOutcome>;

/** Fields common to every command kind — the serialisable palette metadata. */
type CommandContributionBase = {
  /** Stable, globally-unique id, namespaced under the module (e.g. `notes.capture`). */
  readonly id: string;
  /** Palette title. */
  readonly title: string;
  /** Optional palette subtitle. */
  readonly subtitle?: string;
  /** Optional search keywords the palette can match against. */
  readonly keywords?: readonly string[];
  /** Optional declarative keyboard-shortcut metadata. */
  readonly shortcut?: CommandShortcut;
};

/**
 * A NAVIGATION command: a trusted, declarative command that opens an app route or
 * a DS-03 Drawer target. It carries NO handler — it is pure serialisable metadata,
 * and it reuses the validated DS-08 {@link SearchResultTarget} contract rather than
 * inventing a second navigation-target type (ADR-024). The palette executes it on
 * the client by navigating; it never crosses the server execution boundary.
 */
export type NavigationCommandContribution = CommandContributionBase & {
  /** Discriminant: this command navigates. */
  readonly kind: "navigate";
  /** The validated, module-owned navigation target (reused from DS-08). */
  readonly target: SearchResultTarget;
};

/**
 * An EXECUTABLE command: one that must run through the authenticated server
 * boundary via its `run` handler. The registry STORES the handler but never
 * invokes it; the handler is never shipped to the browser (only this command's
 * metadata, minus `run`, is serialised into the palette catalogue — ADR-024).
 */
export type ExecutableCommandContribution = CommandContributionBase & {
  /** Discriminant: this command executes server-side. */
  readonly kind: "execute";
  /** The explicit runtime handler. Stored, never invoked by the registry. */
  readonly run: CommandHandler;
};

/**
 * A command contribution for the Command Palette. A command is EITHER a
 * declarative navigation OR a server-executed action — never both, never neither
 * (the `kind` discriminant is validated at registry construction, ADR-024). All
 * fields except `run` are serialisable metadata safe to ship to the browser.
 */
export type CommandContribution =
  NavigationCommandContribution | ExecutableCommandContribution;

/* -------------------------------------------------------------------------- */
/* Search providers                                                           */
/* -------------------------------------------------------------------------- */

/** A normalised search query handed to a provider at execution time. */
export type SearchQuery = {
  /** The normalised query text. */
  readonly text: string;
  /** A bounded maximum number of results the provider should return. */
  readonly limit: number;
};

/**
 * How a search result opens, described by the owning module so the shared Search
 * surface can route to it WITHOUT understanding product-specific paths or ids
 * (DS-08, ADR-023). Search never parses a result to discover how it opens; it
 * dispatches on `kind`, validates the target at the trusted boundary, and rejects
 * unsafe schemes (`javascript:`, protocol-relative `//…`, external absolute URLs).
 *
 * This replaces FND-06's opaque `navigateTo` string, which forced a consumer to
 * parse an arbitrary path to guess whether it was a drawer key or a route — the
 * exact central-switch coupling ADR-013 forbids. A discriminated union keeps the
 * mapping module-owned and the surface entity-agnostic.
 */
export type SearchResultTarget =
  | {
      /** Open the record in the shared DS-03 Drawer. */
      readonly kind: "drawer";
      /**
       * The opaque, module-owned Drawer key (e.g. `task:t-1`). Search never parses
       * it; the module's own `renderDrawer` resolves it (ADR-018 §18.1).
       */
      readonly drawerKey: string;
      /**
       * Optional in-app path of the route whose `DrawerProvider` can render this
       * key. When the surface is on another route, Search navigates here (with the
       * drawer key appended) so the Drawer opens over the record's home surface.
       * Must be an app-relative path (`/today`) — never an absolute or external URL.
       */
      readonly canonicalPath?: string;
    }
  | {
      /** Navigate to an in-app route. */
      readonly kind: "route";
      /** App-relative destination path (`/projects/alpha`); never external. */
      readonly to: string;
    };

/**
 * A single typed search result a provider returns. The module describes HOW the
 * result opens via a typed `target` (validated at the Search boundary); it never
 * hands Search an arbitrary string to parse (ADR-023).
 */
export type SearchResultItem = {
  /** Stable id of the result item, unique within the contributing provider. */
  readonly id: string;
  /** Human-readable title. */
  readonly title: string;
  /** Optional secondary text (a concise subtitle or preview). */
  readonly subtitle?: string;
  /** How this result opens — a validated, module-owned navigation target. */
  readonly target: SearchResultTarget;
  /** Optional entity type the result corresponds to. */
  readonly entityType?: EntityType;
  /**
   * Optional provider-supplied relevance, expected in `[0, 1]`. The shared Search
   * ranker treats it only as a bounded tie-breaker after its own title/preview
   * ranking, and normalises it — a provider's raw score range never dominates
   * global ranking (DS-08). Non-finite or out-of-range values are ignored.
   */
  readonly score?: number;
};

/**
 * The runtime context a search provider receives: the workspace-scoped
 * {@link ModuleRuntimeContext} plus an `AbortSignal` the runtime uses to CANCEL a
 * provider (on a per-provider deadline, or when the caller/client cancels the
 * search). A well-behaved provider observes `signal.aborted` and stops early, but
 * even one that ignores it cannot block outcome assembly past the deadline — the
 * runtime stops waiting on it (DS-08, ADR-023). This is React-free, D1-free and
 * Cloudflare-free: `AbortSignal` is a standard web primitive.
 */
export type SearchRuntimeContext = ModuleRuntimeContext & {
  /** Aborted when the provider's deadline elapses or the search is cancelled. */
  readonly signal: AbortSignal;
};

/**
 * The runtime execution function for a search provider. It receives the
 * normalised query and its dependencies EXPLICITLY via the workspace-scoped
 * {@link SearchRuntimeContext} (which also carries a cancellation `signal`); it is
 * never run to construct the registry, and it never searches across workspaces
 * (ADR-013 §13).
 */
export type SearchExecutor = (
  query: SearchQuery,
  context: SearchRuntimeContext,
) => Promise<readonly SearchResultItem[]>;

/** A search-provider contribution for future global search. */
export type SearchProviderContribution = {
  /** Stable, globally-unique id, namespaced under the module (e.g. `notes.search`). */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Optional entity types this provider searches over. */
  readonly entityTypes?: readonly EntityType[];
  /** The explicit runtime search function. Stored, never invoked by the registry. */
  readonly search: SearchExecutor;
};

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/** The small set of clearly-typed setting value shapes FND-06 supports. */
export type SettingValueType = "boolean" | "string" | "number" | "enum";

/** Fields shared by every setting contribution. */
type SettingContributionBase = {
  /** Stable, globally-unique key, namespaced under the module (e.g. `notes.default_view`). */
  readonly key: string;
  /** Human-readable label. */
  readonly label: string;
  /** Optional description. */
  readonly description?: string;
};

/** A boolean setting. */
export type BooleanSettingContribution = SettingContributionBase & {
  readonly type: "boolean";
  readonly default: boolean;
};

/** A string setting with an optional bounded maximum length. */
export type StringSettingContribution = SettingContributionBase & {
  readonly type: "string";
  readonly default: string;
  /** Optional inclusive maximum length for the value. */
  readonly maxLength?: number;
};

/** A number setting with optional inclusive bounds. */
export type NumberSettingContribution = SettingContributionBase & {
  readonly type: "number";
  readonly default: number;
  /** Optional inclusive minimum. */
  readonly min?: number;
  /** Optional inclusive maximum. */
  readonly max?: number;
};

/** A single option of an enum setting. */
export type SettingEnumOption = {
  /** The stored value. */
  readonly value: string;
  /** Human-readable label for the option. */
  readonly label: string;
};

/** A single-select enum setting. `default` must be one of the option values. */
export type EnumSettingContribution = SettingContributionBase & {
  readonly type: "enum";
  readonly options: readonly SettingEnumOption[];
  readonly default: string;
};

/**
 * A declarative module-setting contribution. FND-06 defines only the shape and
 * validates that each default matches its declared type — it does NOT persist
 * settings, render forms or store secrets (ADR-013 §14). Never place a secret or
 * a secret default in a manifest.
 */
export type SettingContribution =
  | BooleanSettingContribution
  | StringSettingContribution
  | NumberSettingContribution
  | EnumSettingContribution;
