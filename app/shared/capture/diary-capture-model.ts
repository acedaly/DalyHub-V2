/**
 * MOBILE-01 — the Diary quick-capture vocabulary and session memory.
 *
 * The entry-type vocabulary is KERNEL-owned (`BUILT_IN_DIARY_ENTRY_TYPES`), so the
 * shared capture sheet reads it directly and never imports the Diary module — the
 * module import boundary holds (AGENTS.md §9.1) and there is no second list of
 * entry types to drift.
 *
 * Capture offers a SUBSET as one-tap chips. That is a capture-ergonomics decision,
 * not a second vocabulary: nine chips do not fit a 320px row without shrinking
 * below the 44px target, and the full set stays available in the Diary module's own
 * capture. The subset is derived from the kernel list (never re-typed), so a
 * renamed or removed built-in type changes here automatically.
 */

import {
  BUILT_IN_DIARY_ENTRY_TYPES,
  DECISION_ENTRY,
  IDEA_ENTRY,
  NOTE_ENTRY,
  REFLECTION_ENTRY,
} from "~/kernel/diary";

/** The default entry type — the neutral built-in kind, matching the server. */
export const DEFAULT_DIARY_CAPTURE_TYPE: string = NOTE_ENTRY;

/**
 * The quick-capture chip set, in the kernel's own order. Four types keep every
 * chip at or above the 44px target on the narrowest supported phone.
 */
const QUICK_TYPES: readonly string[] = [
  NOTE_ENTRY,
  IDEA_ENTRY,
  DECISION_ENTRY,
  REFLECTION_ENTRY,
];

export type DiaryQuickEntryType = {
  readonly value: string;
  readonly label: string;
};

/** The quick-capture types, resolved from the kernel descriptors. */
export const DIARY_QUICK_ENTRY_TYPES: readonly DiaryQuickEntryType[] =
  BUILT_IN_DIARY_ENTRY_TYPES.filter((descriptor) =>
    QUICK_TYPES.includes(descriptor.type),
  ).map((descriptor) => ({
    value: descriptor.type,
    label: descriptor.label,
  }));

/**
 * The remembered entry type, session-scoped like the capture type itself: a
 * repeated capture keeps the kind you were using, but a new session starts from
 * the neutral default rather than inheriting a stale mood.
 */
export const DIARY_CAPTURE_TYPE_SESSION_KEY = "dh.capture.diaryType";

/** True when `value` is one of the offered quick-capture types. */
export function isQuickDiaryType(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DIARY_QUICK_ENTRY_TYPES.some((option) => option.value === value)
  );
}

/** Read the remembered entry type, falling back to the neutral default. */
export function readRememberedDiaryType(): string {
  if (typeof window === "undefined") {
    return DEFAULT_DIARY_CAPTURE_TYPE;
  }
  try {
    const stored = window.sessionStorage.getItem(
      DIARY_CAPTURE_TYPE_SESSION_KEY,
    );
    return isQuickDiaryType(stored) ? stored : DEFAULT_DIARY_CAPTURE_TYPE;
  } catch {
    return DEFAULT_DIARY_CAPTURE_TYPE;
  }
}

/** Remember the entry type for this browsing session. Never throws. */
export function rememberDiaryType(type: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(DIARY_CAPTURE_TYPE_SESSION_KEY, type);
  } catch {
    // Non-fatal — capture simply starts from the default next time.
  }
}
