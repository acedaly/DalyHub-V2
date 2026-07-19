/**
 * DS-08 Shared Search — deterministic grouping (pure, React-free).
 *
 * Results group primarily by entity type; a result with no entity type falls back
 * to its owning module (AGENTS.md → Search). Groups appear in FIRST-SEEN order
 * over the already-ranked list, so the most relevant group leads and ordering is
 * deterministic without a hard-coded entity switch. Within a group, results keep
 * their ranked order.
 */

import type { RankedSearchResult, SearchResultGroup } from "./types";

/**
 * Group ranked results. `moduleLabels` maps a module id to a human label for
 * module-fallback groups; entity groups carry the entity-type slug as a safe
 * default label (the UI upgrades it via the entity-identity system).
 */
export function groupRankedResults(
  results: readonly RankedSearchResult[],
  moduleLabels: ReadonlyMap<string, string>,
): SearchResultGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, RankedSearchResult[]>();

  for (const result of results) {
    const key =
      result.entityType !== undefined
        ? `entity:${result.entityType}`
        : `module:${result.moduleId}`;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(result);
  }

  return order.map((key) => {
    const bucketResults = buckets.get(key) ?? [];
    if (key.startsWith("entity:")) {
      const entityType = key.slice("entity:".length);
      return {
        id: key,
        kind: "entity" as const,
        label: entityType,
        entityType,
        results: bucketResults,
      };
    }
    const moduleId = key.slice("module:".length);
    return {
      id: key,
      kind: "module" as const,
      label: moduleLabels.get(moduleId) ?? moduleId,
      moduleId,
      results: bucketResults,
    };
  });
}

/** The flat, display-ordered list of results across all groups. */
export function flattenGroups(
  groups: readonly SearchResultGroup[],
): RankedSearchResult[] {
  return groups.flatMap((group) => [...group.results]);
}
