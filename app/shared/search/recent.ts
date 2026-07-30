import { validateEntityType, type EntityType } from "~/kernel/entities";

import {
  MAX_RESULT_ID_LENGTH,
  MAX_SUBTITLE_LENGTH,
  MAX_TITLE_LENGTH,
} from "./limits";
import { validateTarget } from "./target";
import type {
  RankedSearchResult,
  SearchResultSignal,
  SearchResultSignalTone,
  SearchResultTarget,
} from "./types";

const STORAGE_KEY = "dalyhub.search.recent.v1";
const MAX_RECENT_RESULTS = 8;
const SENSITIVE_SUBTITLE_TYPES = new Set([
  "asset",
  "diary",
  "meeting",
  "person",
  "review",
]);
const SIGNAL_TONES: ReadonlySet<SearchResultSignalTone> = new Set([
  "neutral",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
]);
const MAX_SIGNALS = 4;
const MAX_SIGNAL_FIELD = 64;

export type RecentSearchResult = {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly entityType?: EntityType;
  readonly target: SearchResultTarget;
  readonly signals?: readonly SearchResultSignal[];
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function clamp(value: string, max: number): string {
  const points = Array.from(value.trim());
  return points.length <= max ? value.trim() : points.slice(0, max).join("");
}

function signalString(value: unknown, max = MAX_SIGNAL_FIELD): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
    ? value.trim()
    : null;
}

function signalTone(value: unknown): SearchResultSignalTone | undefined {
  return typeof value === "string" &&
    SIGNAL_TONES.has(value as SearchResultSignalTone)
    ? (value as SearchResultSignalTone)
    : undefined;
}

function decodeRecentSignals(value: unknown): SearchResultSignal[] {
  if (!Array.isArray(value)) return [];
  const signals: SearchResultSignal[] = [];
  for (const entry of value) {
    if (signals.length >= MAX_SIGNALS) break;
    if (entry === null || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = signalString(raw.id);
    const kind = signalString(raw.kind);
    const label = signalString(raw.label, MAX_SUBTITLE_LENGTH);
    if (id === null || kind === null || label === null) continue;
    const value = signalString(raw.value);
    const tone = signalTone(raw.tone);
    const icon = signalString(raw.icon);
    const accessibleLabel = signalString(
      raw.accessibleLabel,
      MAX_SUBTITLE_LENGTH,
    );
    signals.push({
      id,
      kind,
      label,
      ...(value === null ? {} : { value }),
      ...(tone === undefined ? {} : { tone }),
      ...(icon === null ? {} : { icon }),
      ...(accessibleLabel === null ? {} : { accessibleLabel }),
    });
  }
  return signals;
}

export function targetIdentity(target: SearchResultTarget): string {
  return target.kind === "route"
    ? `route:${target.to}`
    : `drawer:${target.canonicalPath ?? ""}:${target.drawerKey}`;
}

function safeSubtitle(result: RankedSearchResult): string | undefined {
  if (
    result.subtitle === undefined ||
    result.entityType === undefined ||
    SENSITIVE_SUBTITLE_TYPES.has(result.entityType)
  ) {
    return undefined;
  }
  return clamp(result.subtitle, MAX_SUBTITLE_LENGTH);
}

function decodeEntityType(value: unknown): EntityType | undefined {
  try {
    return validateEntityType(value);
  } catch {
    return undefined;
  }
}

export function toRecentSearchResult(
  result: RankedSearchResult,
): RecentSearchResult {
  const subtitle = safeSubtitle(result);
  return {
    id: clamp(targetIdentity(result.target), MAX_RESULT_ID_LENGTH),
    title: clamp(result.title, MAX_TITLE_LENGTH),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(result.entityType === undefined
      ? {}
      : { entityType: result.entityType }),
    target: result.target,
    ...(result.signals === undefined ? {} : { signals: result.signals }),
  };
}

function decodeRecent(value: unknown): RecentSearchResult | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.title !== "string" || raw.title.trim().length === 0)
    return null;
  const target = validateTarget(raw.target);
  if (target === null) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim().length > 0
      ? clamp(raw.id, MAX_RESULT_ID_LENGTH)
      : clamp(targetIdentity(target), MAX_RESULT_ID_LENGTH);
  const subtitle =
    typeof raw.subtitle === "string" && raw.subtitle.trim().length > 0
      ? clamp(raw.subtitle, MAX_SUBTITLE_LENGTH)
      : undefined;
  const entityType = decodeEntityType(raw.entityType);
  const signals = decodeRecentSignals(raw.signals);
  return {
    id,
    title: clamp(raw.title, MAX_TITLE_LENGTH),
    ...(subtitle === undefined ||
    entityType === undefined ||
    SENSITIVE_SUBTITLE_TYPES.has(entityType)
      ? {}
      : { subtitle }),
    ...(entityType === undefined ? {} : { entityType }),
    target,
    ...(signals.length === 0 ? {} : { signals }),
  };
}

export function loadRecentSearchResults(
  store: StorageLike | null = storage(),
): RecentSearchResult[] {
  if (store === null) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const results: RecentSearchResult[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const result = decodeRecent(entry);
      if (result === null) continue;
      const identity = targetIdentity(result.target);
      if (seen.has(identity)) continue;
      seen.add(identity);
      results.push(result);
      if (results.length >= MAX_RECENT_RESULTS) break;
    }
    return results;
  } catch {
    return [];
  }
}

export function saveRecentSearchResult(
  result: RankedSearchResult,
  store: StorageLike | null = storage(),
): RecentSearchResult[] {
  if (store === null) return [];
  try {
    const next = toRecentSearchResult(result);
    const deduped = [
      next,
      ...loadRecentSearchResults(store).filter(
        (entry) => targetIdentity(entry.target) !== targetIdentity(next.target),
      ),
    ].slice(0, MAX_RECENT_RESULTS);
    store.setItem(STORAGE_KEY, JSON.stringify(deduped));
    return deduped;
  } catch {
    return [];
  }
}

export function clearRecentSearchResults(
  store: StorageLike | null = storage(),
): RecentSearchResult[] {
  if (store === null) return [];
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    return [];
  }
  return [];
}

export function recentToRankedResult(
  result: RecentSearchResult,
  index: number,
): RankedSearchResult {
  return {
    id: `recent:${index}`,
    providerId: "recent.search",
    moduleId: "recent",
    title: result.title,
    ...(result.subtitle === undefined ? {} : { subtitle: result.subtitle }),
    ...(result.entityType === undefined
      ? {}
      : { entityType: result.entityType }),
    target: result.target,
    ...(result.signals === undefined ? {} : { signals: result.signals }),
    score: 0,
    titleMatches: [],
    subtitleMatches: [],
  };
}
