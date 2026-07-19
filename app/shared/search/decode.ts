/**
 * DS-08 Shared Search — the client response decoder (pure, React-free).
 *
 * The `/search` endpoint is trusted, but a malformed response, a proxy error or a
 * future contract drift must never crash the Search UI. `decodeSearchOutcome`
 * treats the parsed JSON as UNTRUSTED and rebuilds a bounded {@link SearchOutcome}
 * from validated pieces — reusing the SAME pure validators the server uses
 * (`validateTarget`, the FND-02 `validateEntityType`, the shared limits). It never
 * trusts a value merely because TypeScript says it has a type.
 *
 * Individual malformed results/groups degrade away; a structurally unusable
 * response (not an object, bad `status`, non-array `groups`/`providers`) returns
 * null, which the controller turns into a generic request failure.
 */

import { validateEntityType, type EntityType } from "~/kernel/entities";

import {
  MAX_PROVIDERS,
  MAX_QUERY_LENGTH,
  MAX_RESULT_ID_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TOTAL_RESULTS,
} from "./limits";
import { validateTarget } from "./target";
import type {
  MatchRange,
  RankedSearchResult,
  SearchOutcome,
  SearchOutcomeStatus,
  SearchProviderStatus,
  SearchResultGroup,
} from "./types";

const STATUSES: ReadonlySet<string> = new Set(["ok", "partial", "error"]);
const MAX_GROUPS = 64;
const MAX_RANGES = 64;
const MAX_ID_LENGTH = MAX_RESULT_ID_LENGTH * 2 + 8; // "moduleId::itemId"
const MAX_LABEL_LENGTH = 256;

function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function nonEmptyString(value: unknown, max: number): string | null {
  const str = boundedString(value, max);
  return str !== null && str.trim().length > 0 ? str : null;
}

function decodeEntityType(value: unknown): EntityType | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return validateEntityType(value);
  } catch {
    return undefined;
  }
}

function decodeScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function decodeRanges(value: unknown): MatchRange[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ranges: MatchRange[] = [];
  for (const entry of value) {
    if (ranges.length >= MAX_RANGES) {
      break;
    }
    if (
      entry !== null &&
      typeof entry === "object" &&
      Number.isInteger((entry as MatchRange).start) &&
      Number.isInteger((entry as MatchRange).end) &&
      (entry as MatchRange).start >= 0 &&
      (entry as MatchRange).end > (entry as MatchRange).start
    ) {
      ranges.push({
        start: (entry as MatchRange).start,
        end: (entry as MatchRange).end,
      });
    }
  }
  return ranges;
}

function decodeResult(value: unknown): RankedSearchResult | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = nonEmptyString(raw.id, MAX_ID_LENGTH);
  const providerId = nonEmptyString(raw.providerId, MAX_LABEL_LENGTH);
  const moduleId = nonEmptyString(raw.moduleId, MAX_LABEL_LENGTH);
  const title = nonEmptyString(raw.title, MAX_TITLE_LENGTH);
  if (
    id === null ||
    providerId === null ||
    moduleId === null ||
    title === null
  ) {
    return null;
  }
  const target = validateTarget(raw.target);
  if (target === null) {
    return null;
  }
  const subtitle = boundedString(raw.subtitle, MAX_SUBTITLE_LENGTH);
  const entityType = decodeEntityType(raw.entityType);
  return {
    id,
    providerId,
    moduleId,
    title,
    ...(subtitle !== null && subtitle.length > 0 ? { subtitle } : {}),
    ...(entityType === undefined ? {} : { entityType }),
    target,
    score: decodeScore(raw.score),
    titleMatches: decodeRanges(raw.titleMatches),
    subtitleMatches: decodeRanges(raw.subtitleMatches),
  };
}

function decodeProvider(value: unknown): SearchProviderStatus | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const providerId = nonEmptyString(raw.providerId, MAX_LABEL_LENGTH);
  const moduleId = nonEmptyString(raw.moduleId, MAX_LABEL_LENGTH);
  if (providerId === null || moduleId === null || typeof raw.ok !== "boolean") {
    return null;
  }
  return { providerId, moduleId, ok: raw.ok };
}

function decodeGroup(value: unknown, budget: number): SearchResultGroup | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = nonEmptyString(raw.id, MAX_LABEL_LENGTH);
  const label = boundedString(raw.label, MAX_LABEL_LENGTH);
  const kind = raw.kind;
  if (
    id === null ||
    label === null ||
    (kind !== "entity" && kind !== "module") ||
    !Array.isArray(raw.results)
  ) {
    return null;
  }
  const results: RankedSearchResult[] = [];
  for (const entry of raw.results) {
    if (results.length >= budget) {
      break;
    }
    const result = decodeResult(entry);
    if (result !== null) {
      results.push(result);
    }
  }
  const entityType = decodeEntityType(raw.entityType);
  const moduleId = nonEmptyString(raw.moduleId, MAX_LABEL_LENGTH);
  return {
    id,
    kind,
    label,
    ...(entityType === undefined ? {} : { entityType }),
    ...(moduleId === null ? {} : { moduleId }),
    results,
  };
}

/** Decode untrusted JSON into a bounded SearchOutcome, or null if unusable. */
export function decodeSearchOutcome(value: unknown): SearchOutcome | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.query !== "string" ||
    raw.query.length > MAX_QUERY_LENGTH ||
    typeof raw.status !== "string" ||
    !STATUSES.has(raw.status) ||
    !Array.isArray(raw.groups) ||
    !Array.isArray(raw.providers)
  ) {
    return null;
  }

  const groups: SearchResultGroup[] = [];
  let total = 0;
  for (const entry of raw.groups.slice(0, MAX_GROUPS)) {
    if (total >= MAX_TOTAL_RESULTS) {
      break;
    }
    const group = decodeGroup(entry, MAX_TOTAL_RESULTS - total);
    if (group !== null && group.results.length > 0) {
      groups.push(group);
      total += group.results.length;
    }
  }

  const providers: SearchProviderStatus[] = [];
  for (const entry of raw.providers.slice(0, MAX_PROVIDERS)) {
    const provider = decodeProvider(entry);
    if (provider !== null) {
      providers.push(provider);
    }
  }

  return {
    query: raw.query,
    status: raw.status as SearchOutcomeStatus,
    groups,
    totalCount: total, // recomputed from validated groups — never trust the claim
    truncated: raw.truncated === true,
    providers,
  };
}
