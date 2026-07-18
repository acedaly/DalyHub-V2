/**
 * FND-06 Module Registry kernel — the module definition contract.
 *
 * A `ModuleDefinition` is the single, lightweight, declarative manifest a module
 * exposes (ADR-013 §4.2). It pairs a small identity header with readonly
 * collections of capability contributions. It is plain data: evaluating it is
 * side-effect free (no D1, no workspace resolution, no request data, no network,
 * no global mutation, no eager UI import, no command/search execution).
 *
 * Ownership of each contribution is attached by the registry when the definition
 * is ingested (producing the `Registered*` views below), so a manifest author
 * declares each capability once, without repeating the module id on every entry.
 *
 * Nothing here imports Cloudflare, D1, React, React Router or Vite types.
 */

import type {
  ActivityTypeContribution,
  CommandContribution,
  EntityLinkTypeContribution,
  EntityTypeContribution,
  RouteContribution,
  SearchProviderContribution,
  SettingContribution,
} from "./module-capabilities";

/**
 * A validated, branded module identifier: a lowercase slug such as `projects`,
 * `notes`, `meetings`, `people` or `day-diary`. The brand means a plain `string`
 * cannot be used where a `ModuleId` is required — a value only becomes a
 * `ModuleId` by passing `parseModuleId` (`module-validation.ts`). Module identity
 * is STABLE and machine-readable; it is never derived from a display label.
 */
declare const moduleIdBrand: unique symbol;
export type ModuleId = string & { readonly [moduleIdBrand]: true };

/**
 * The small identity header every module declares. `order` is an optional hint
 * the registry uses for deterministic cross-module ordering; when omitted the
 * module orders after those that specify one, then alphabetically by id.
 */
export type ModuleIdentity = {
  /** The stable, machine-readable module id (validated to the documented slug). */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Optional longer description. */
  readonly description?: string;
  /** Optional ordering hint for deterministic placement among modules. */
  readonly order?: number;
};

/**
 * One module's complete declarative manifest: its identity plus the capabilities
 * it contributes. Every capability collection is optional and readonly; an empty
 * or capability-less module is valid.
 */
export type ModuleDefinition = ModuleIdentity & {
  /** Module-owned routes (composed into the app route tree by FND-09). */
  readonly routes?: readonly RouteContribution[];
  /** Entity types this module owns. */
  readonly entityTypes?: readonly EntityTypeContribution[];
  /** EntityLink types this module supports. */
  readonly entityLinkTypes?: readonly EntityLinkTypeContribution[];
  /** Custom Activity event types this module owns. */
  readonly activityTypes?: readonly ActivityTypeContribution[];
  /** Commands this module contributes to the future Command Palette. */
  readonly commands?: readonly CommandContribution[];
  /** Search providers this module contributes to future global search. */
  readonly searchProviders?: readonly SearchProviderContribution[];
  /** Settings this module contributes to future Settings surfaces. */
  readonly settings?: readonly SettingContribution[];
};

/**
 * A contribution as stored in the registry: the authored descriptor plus the id
 * of the module that owns it. Ownership is always retained (ADR-013 §15).
 */
export type Owned<T> = T & { readonly moduleId: ModuleId };

/** A registered route (authored contribution + owning module id). */
export type RegisteredRoute = Owned<RouteContribution>;
/** A registered entity type. */
export type RegisteredEntityType = Owned<EntityTypeContribution>;
/** A registered EntityLink type. */
export type RegisteredEntityLinkType = Owned<EntityLinkTypeContribution>;
/** A registered Activity type. */
export type RegisteredActivityType = Owned<ActivityTypeContribution>;
/** A registered command. */
export type RegisteredCommand = Owned<CommandContribution>;
/** A registered search provider. */
export type RegisteredSearchProvider = Owned<SearchProviderContribution>;
/** A registered setting. */
export type RegisteredSetting = Owned<SettingContribution>;

/**
 * A module as seen through the registry: its validated identity plus its
 * registered (ownership-carrying) contributions. All collections are present
 * (possibly empty) and frozen.
 */
export type RegisteredModule = {
  readonly id: ModuleId;
  readonly name: string;
  readonly description: string | null;
  readonly order: number | null;
  readonly routes: readonly RegisteredRoute[];
  readonly entityTypes: readonly RegisteredEntityType[];
  readonly entityLinkTypes: readonly RegisteredEntityLinkType[];
  readonly activityTypes: readonly RegisteredActivityType[];
  readonly commands: readonly RegisteredCommand[];
  readonly searchProviders: readonly RegisteredSearchProvider[];
  readonly settings: readonly RegisteredSetting[];
};
