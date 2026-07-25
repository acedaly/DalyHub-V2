/**
 * DIARY-01 — the Diary Timeline view model (pure, React-free, server-safe).
 *
 * Turns the kernel's `DiaryEntry` records into JSON-safe display data for the
 * Timeline and the entry editor, and resolves an entry type's human label
 * through the built-in registry with a SAFE fallback for a syntactically valid
 * but unregistered custom type (so a `custom.workout` entry renders as
 * "Workout" rather than crashing or disappearing — ADR-041's open vocabulary).
 *
 * Day grouping is delegated ENTIRELY to the kernel's pure `groupEntriesByDay`
 * (no grouping logic is re-implemented here); this module only serialises the
 * groups it returns. `occurredAt` is a UTC instant — the display time and the
 * backdated marker are resolved in an EXPLICIT display time zone (never UTC,
 * never machine-local) so an entry at 23:30 local files under its local day.
 */

import type { DiaryEntry } from "~/kernel/diary";
import {
  createDiaryEntryTypeRegistry,
  groupEntriesByDay,
  parseDiaryEntryType,
  toLocalDayKey,
  type DiaryEntryTypeRegistry,
} from "~/kernel/diary";

import { formatZonedTime } from "./occurred-time";

/** How long a body must be before the Timeline collapses it behind a toggle. */
const LONG_BODY_CHARS = 280;
/** How many lines a body must span before the Timeline collapses it. */
const LONG_BODY_LINES = 4;

/** A single Timeline entry, serialised for the client. */
export type SerializedDiaryEntry = {
  readonly id: string;
  /** The raw, validated entry-type identifier (open vocabulary). */
  readonly entryType: string;
  /** The resolved human label for the type (registry label or safe fallback). */
  readonly entryTypeLabel: string;
  readonly title: string;
  /** The EXACT Markdown source, or null when the entry has no body. */
  readonly bodySource: string | null;
  /** Whether the body is long enough to collapse behind a "Show more" toggle. */
  readonly bodyIsLong: boolean;
  /** The occurred instant as a UTC ISO-8601 string. */
  readonly occurredAtIso: string;
  /** The local `HH:MM` occurred time in the display zone. */
  readonly occurredTimeLabel: string;
  /** True when the moment occurred on an earlier local day than it was recorded. */
  readonly backdated: boolean;
};

/** A contiguous run of Timeline entries sharing a local calendar day. */
export type SerializedDayGroup = {
  /** The local `YYYY-MM-DD` day key in the display zone. */
  readonly day: string;
  readonly entries: readonly SerializedDiaryEntry[];
};

/** An entry-type option for the capture/edit selector and the Timeline filter. */
export type EntryTypeOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * Resolve an entry type's human label: the registry's label when the type is
 * registered, otherwise a readable fallback derived from the identifier itself
 * (last dot-segment, underscores to spaces, title-cased). Never throws for a
 * syntactically valid custom type.
 */
export function resolveEntryTypeLabel(
  entryType: string,
  registry: DiaryEntryTypeRegistry,
): string {
  const descriptor = registry.get(entryType);
  if (descriptor) return descriptor.label;
  return humaniseEntryType(entryType);
}

/** A readable label for an unregistered but syntactically valid entry type. */
export function humaniseEntryType(entryType: string): string {
  const segment = entryType.split(".").at(-1) ?? entryType;
  const words = segment.split("_").filter((word) => word.length > 0);
  if (words.length === 0) return entryType;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Whether a body should collapse by default in the Timeline. */
export function bodyIsLong(source: string | null): boolean {
  if (source === null) return false;
  if (source.length > LONG_BODY_CHARS) return true;
  const lines = source.split("\n").length;
  return lines > LONG_BODY_LINES;
}

/** Serialise a single entry for the Timeline, resolved in `timeZone`. */
export function serializeDiaryEntry(
  entry: DiaryEntry,
  timeZone: string,
  registry: DiaryEntryTypeRegistry,
): SerializedDiaryEntry {
  const occurredDay = toLocalDayKey(entry.occurredAt, timeZone);
  const createdDay = toLocalDayKey(entry.createdAt, timeZone);
  return {
    id: entry.id,
    entryType: entry.entryType,
    entryTypeLabel: resolveEntryTypeLabel(entry.entryType, registry),
    title: entry.title,
    bodySource: entry.body,
    bodyIsLong: bodyIsLong(entry.body),
    occurredAtIso: entry.occurredAt.toISOString(),
    occurredTimeLabel: formatZonedTime(entry.occurredAt, timeZone),
    // "Backdated" is only surfaced when it is genuinely useful: the moment
    // occurred on an EARLIER local day than it was recorded (Memory Mode),
    // not merely a few minutes before the row was written.
    backdated: occurredDay < createdDay,
  };
}

/**
 * Serialise a Timeline page into local-day groups, delegating the grouping to
 * the kernel's pure `groupEntriesByDay` (called once per page — grouping logic
 * is never re-implemented in the module).
 */
export function serializeTimelinePage(
  entries: readonly DiaryEntry[],
  timeZone: string,
): SerializedDayGroup[] {
  const registry = createDiaryEntryTypeRegistry();
  return groupEntriesByDay(entries, timeZone).map((group) => ({
    day: group.day,
    entries: group.entries.map((entry) =>
      serializeDiaryEntry(entry, timeZone, registry),
    ),
  }));
}

/** The built-in entry types as selector/filter options, in their stable order. */
export function entryTypeOptions(): EntryTypeOption[] {
  return createDiaryEntryTypeRegistry()
    .list()
    .map((descriptor) => ({
      value: descriptor.type,
      label: descriptor.label,
    }));
}

/**
 * Parse the `type` URL parameter(s) into a validated entry-type filter. Unknown
 * or malformed values are dropped (a stale link never breaks the Timeline);
 * duplicates are removed. Returns `undefined` when no valid type is named.
 */
export function parseEntryTypeFilter(
  values: readonly string[],
): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value.length === 0) continue;
    try {
      const parsed = parseDiaryEntryType(value);
      if (!seen.has(parsed)) {
        seen.add(parsed);
        out.push(parsed);
      }
    } catch {
      // Ignore a malformed/unknown type rather than failing the whole load.
    }
  }
  return out.length > 0 ? out : undefined;
}
