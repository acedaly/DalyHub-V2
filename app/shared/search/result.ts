/**
 * DS-08 Shared Search — result validation, identity and deduplication (pure).
 *
 * Provider output is untrusted: a provider could return an empty title, an
 * oversized field, a malformed id, an invalid entity type, an unsafe target, a
 * non-finite score, or a duplicate. This module turns a raw {@link SearchResultItem}
 * into a validated {@link TaggedResult} or drops it — Search never renders an
 * unvalidated result. React-free.
 */

import { type EntityType, validateEntityType } from "~/kernel/entities";

import {
  MAX_RESULT_ID_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
} from "./limits";
import { validateTarget } from "./target";
import type { SearchResultItem, TaggedResult } from "./types";

/** Truncate to a maximum number of code points (never splits a surrogate pair). */
function clampCodePoints(value: string, max: number): string {
  const points = Array.from(value);
  return points.length <= max ? value : points.slice(0, max).join("");
}

/**
 * Reuse the AUTHORITATIVE FND-02 entity-type contract (`validateEntityType`,
 * which enforces `ENTITY_TYPE_PATTERN` + length) rather than a Search-owned
 * grammar — so valid kernel types like `meeting.follow_up` are never silently
 * dropped and the two definitions cannot drift. It is a pure kernel validator (no
 * React, no D1), safe in the React-free model. Malformed values degrade to
 * `undefined` (the field is dropped) rather than throwing.
 */
function normaliseEntityType(value: unknown): EntityType | undefined {
  try {
    return validateEntityType(value);
  } catch {
    return undefined;
  }
}

function normaliseScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Validate one provider result and tag it with its owner. Returns null when the
 * result must be dropped (empty title, malformed id, unsafe target). An invalid
 * entity type or non-finite score degrades (dropped field) rather than dropping
 * the whole result.
 */
export function validateResultItem(
  item: SearchResultItem,
  moduleId: string,
  providerId: string,
): TaggedResult | null {
  if (item === null || typeof item !== "object") {
    return null;
  }

  const { id, title, subtitle } = item;
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    id.length > MAX_RESULT_ID_LENGTH
  ) {
    return null;
  }
  if (typeof title !== "string") {
    return null;
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return null;
  }

  const target = validateTarget(item.target);
  if (target === null) {
    return null;
  }

  let cleanSubtitle: string | undefined;
  if (typeof subtitle === "string") {
    const trimmed = subtitle.trim();
    if (trimmed.length > 0) {
      cleanSubtitle = clampCodePoints(trimmed, MAX_SUBTITLE_LENGTH);
    }
  }

  const entityType = normaliseEntityType(item.entityType);
  const providerScore = normaliseScore(item.score);

  return {
    itemId: id,
    providerId,
    moduleId,
    title: clampCodePoints(trimmedTitle, MAX_TITLE_LENGTH),
    ...(cleanSubtitle === undefined ? {} : { subtitle: cleanSubtitle }),
    ...(entityType === undefined ? {} : { entityType }),
    target,
    ...(providerScore === undefined ? {} : { providerScore }),
  };
}

/**
 * The stable global identity of a result: `${moduleId}::${providerId}::${itemId}`.
 *
 * A provider-local `itemId` is unique only WITHIN its contributing provider
 * (ADR-013), so the identity MUST include the provider — otherwise two providers
 * in the *same* module that each return `id: "1"` would collide and one valid
 * result would be dropped, and the UI's option ids / `indexById` would be
 * ambiguous. `providerId` is globally unique (namespaced under its module), so it
 * alone disambiguates; `moduleId` is kept as the leading, human-legible segment.
 */
export function resultIdentity(result: {
  readonly moduleId: string;
  readonly providerId: string;
  readonly itemId: string;
}): string {
  return `${result.moduleId}::${result.providerId}::${result.itemId}`;
}

/**
 * Drop duplicate identities, keeping the first occurrence (deterministic given the
 * deterministic registry provider order). Deduplication is by the full
 * `moduleId::providerId::itemId` identity ONLY:
 *   - same provider + same `itemId` → duplicate (one kept);
 *   - same module, DIFFERENT providers, same `itemId` → distinct (both kept);
 *   - different modules → distinct (both kept).
 * It never dedupes on title, subtitle, Drawer key, route or entity type — provider-
 * local identity does not establish cross-provider record equivalence.
 */
export function dedupeTagged(results: readonly TaggedResult[]): TaggedResult[] {
  const seen = new Set<string>();
  const unique: TaggedResult[] = [];
  for (const result of results) {
    const identity = resultIdentity(result);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    unique.push(result);
  }
  return unique;
}
