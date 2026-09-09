/**
 * V2.16 CONSOL-04 — the V3-readiness REGISTRY AUDIT.
 *
 * ## What it is for
 *
 * DalyHub's kernel is a set of registries: a module registers its routes, its
 * entity types, its commands, its search providers and its settings, and the
 * shell, the palette, Search, the archive and Activity all read those
 * registrations rather than a central list. That is what lets five new entity
 * kinds arrive between V2.10 and V2.13 without a kernel change.
 *
 * The failure mode it creates is a domain that is **half-wired**: registered
 * where somebody remembered and absent where they did not. Nothing catches it,
 * because every registry is individually satisfiable and no test looks across
 * them. V2.16 measured exactly that class of defect three times over — a
 * navigation group nobody could hear, two palette commands pointing at nothing,
 * a touch floor with no consumer — so this is the check that makes the next one
 * fail rather than ship.
 *
 * ## What it asserts
 *
 * For every durable entity type the product has, that it is registered
 * everywhere it MUST be, and that every absence is **named** rather than
 * missing. An exception with a stated reason is a decision; an exception
 * without one is a hole.
 *
 * ## What it deliberately does not do
 *
 * It does not restate a boundary that already has its own test. There are nine
 * of those in this directory (one obligation domain, one attachment surface,
 * one proposal apply authority, the Finance boundaries, the grounded-AI
 * boundaries, the history window reads …), and duplicating them here would mean
 * two places to update when one of them changes. What this adds is the check
 * ACROSS registries that none of them can make alone.
 */

import { describe, expect, it } from "vitest";

import { ENTITY_TYPES, getEntityIdentity } from "~/shared/entity";
import { DESTINATION_ENTITY_TYPES } from "~/shared/entity/destination";
import { RECENCY_EXCLUDED_TYPES } from "~/kernel/recent-records";
import { discoverModuleRegistry } from "~/modules/discover-modules";
import { buildNavigationModel } from "~/platform/modules/navigation-adapter";
import { isNavigationGroupKey } from "~/shared/shell/navigation-groups";
import { WORKSPACE_TABLES } from "~/platform/storage/d1";

const registry = discoverModuleRegistry();

/** Every entity type any module registers, with the module that owns it. */
const REGISTERED = new Map<string, string>(
  registry
    .listModules()
    .flatMap((module) =>
      module.entityTypes.map(
        (entry) => [entry.type, module.id as string] as const,
      ),
    ),
);

/**
 * The entity types that are deliberately NOT visually identified.
 *
 * `ENTITY_TYPES` (`app/shared/entity/identity.ts`) is the list of types with an
 * icon and an accent, and it is smaller than the registry's on purpose: a light
 * entity with no record page of its own has nothing to identify. Each absence
 * is named here with the reason, so the difference between the two lists is a
 * decision rather than an oversight.
 */
const NO_VISUAL_IDENTITY: Readonly<Record<string, string>> = {
  finance_transaction:
    "A LIGHT entity (ADR-120 decision 2): an `entities` row for links, no Activity per edit and no record page. It is drawn as a row inside Finance, which owns its own presentation, so an accent of its own would be a second identity for one surface.",
  project_template:
    "An entity that is deliberately not a spine record (ADR-105): a reusable SHAPE, presented inside Projects rather than as a record with an identity of its own.",
};

describe("V2.16 CONSOL-04 — every durable domain is wired everywhere it must be", () => {
  it("has entity types to check, and every one is owned by exactly one module", () => {
    const owners = new Map<string, string[]>();
    for (const module of registry.listModules()) {
      for (const entry of module.entityTypes) {
        owners.set(entry.type, [
          ...(owners.get(entry.type) ?? []),
          module.id as string,
        ]);
      }
    }
    expect(owners.size).toBeGreaterThan(10);
    for (const [type, modules] of owners) {
      expect(
        modules,
        `${type} is claimed by more than one module`,
      ).toHaveLength(1);
    }
  });

  it("gives every VISUALLY IDENTIFIED type an icon, an accent and a label", () => {
    for (const type of ENTITY_TYPES) {
      const identity = getEntityIdentity(type);
      expect(identity, `${type} has no identity`).not.toBeNull();
      expect(identity!.label.length, type).toBeGreaterThan(0);
      expect(identity!.pluralLabel.length, type).toBeGreaterThan(0);
      expect(identity!.accentVar.startsWith("--"), type).toBe(true);
      expect(identity!.Icon, type).toBeTruthy();
    }
  });

  it("names every registered type that has NO visual identity", () => {
    // The audit's whole point: an absence must be a decision. A type registered
    // by a module, absent from the identity list and absent from the exception
    // table below is a domain somebody wired halfway.
    const identified = new Set<string>(ENTITY_TYPES);
    for (const type of REGISTERED.keys()) {
      if (identified.has(type)) continue;
      expect(
        NO_VISUAL_IDENTITY[type],
        `${type} has no visual identity and no recorded reason. Give it one, or ` +
          `name the reason in NO_VISUAL_IDENTITY.`,
      ).toBeDefined();
      expect(NO_VISUAL_IDENTITY[type]!.length).toBeGreaterThan(40);
    }
  });

  it("names no exception for a type that no module registers", () => {
    // The other direction, so the exception table cannot rot into a list of
    // types that no longer exist.
    for (const type of Object.keys(NO_VISUAL_IDENTITY)) {
      expect(
        REGISTERED.has(type),
        `${type} is excepted but registered nowhere`,
      ).toBe(true);
    }
  });

  it("gives every identified type a DESTINATION, so a link to it can open", () => {
    /*
     * A record with an accent, an icon and a name, and no way to open it, is
     * the worst of the half-wired states: it renders as dead text inside every
     * Linked items panel and every search result in the product.
     */
    for (const type of ENTITY_TYPES) {
      expect(
        DESTINATION_ENTITY_TYPES,
        `${type} is identified but has no destination`,
      ).toContain(type);
    }
  });

  it("keeps every recency exclusion inside the destination set", () => {
    // An exclusion for a type that has no destination anyway is a rule about
    // nothing, and the empty-query privacy boundary it belongs to deserves to
    // be checkable.
    for (const type of RECENCY_EXCLUDED_TYPES) {
      expect(
        DESTINATION_ENTITY_TYPES,
        `${type} is excluded from recency`,
      ).toContain(type);
    }
    // Diary is the privacy boundary FIND-01 recorded, and it must not quietly
    // leave: an empty query never volunteers the owner's most private records.
    expect([...RECENCY_EXCLUDED_TYPES]).toContain("diary");
  });

  it("gives every module that owns an entity type a SEARCH provider", () => {
    /*
     * A durable record the owner cannot find is a record they have lost. The
     * exception is a module whose types are all light or template-shaped, and
     * there is none today — every entity-owning module registers a provider.
     */
    for (const module of registry.listModules()) {
      if (module.entityTypes.length === 0) continue;
      expect(
        module.searchProviders.length,
        `${module.id} owns an entity type and registers no search provider`,
      ).toBeGreaterThan(0);
    }
  });

  it("gives every navigable destination a KNOWN group", () => {
    const navigation = buildNavigationModel(registry.listRoutes());
    for (const item of navigation) {
      expect(
        isNavigationGroupKey(item.group),
        `${item.label} declares navGroup "${item.group ?? "(none)"}"`,
      ).toBe(true);
    }
  });

  it("gives every entity-owning module a table that is classified for RECOVERY", () => {
    /*
     * The clause that stops a new domain arriving with no way out. Every module
     * that owns an entity type stores something, and everything stored is in
     * `workspace-data-map.ts` — which `test/kernel/workspace-data-map.test.ts`
     * checks against the real schema. This is the module-side half: a domain
     * whose store is unclassified fails there; a domain with no store at all
     * fails here.
     */
    const exportedTables = WORKSPACE_TABLES.filter(
      (entry) => entry.dataClass === "exported",
    ).map((entry) => entry.table);
    expect(exportedTables.length).toBeGreaterThan(40);

    // Each entity-owning module's own detail table, by the naming convention
    // every one of them follows. Named exceptions are the light entities that
    // share another domain's table.
    const SHARES_ANOTHER_TABLE: Readonly<Record<string, string>> = {
      finance_transaction: "finance_transaction_details",
      finance_account: "finance_account_details",
      finance_category: "finance_categories",
      diary: "diary_entry_details",
      obligation: "obligation_details",
      project_template: "project_template_details",
      habit: "habit_details",
    };
    for (const type of REGISTERED.keys()) {
      const table = SHARES_ANOTHER_TABLE[type] ?? `${type}_details`;
      expect(
        exportedTables,
        `${type} stores into ${table}, which is not classified as exported owner data`,
      ).toContain(table);
    }
  });
});
