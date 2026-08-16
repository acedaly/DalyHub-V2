/**
 * MOBILE-01 — the shared Quick Capture model (pure, React-free, unit-tested).
 *
 * "Capture first, organise later" is a product principle, not a phone feature:
 * creating something must ask for the least information that can possibly work,
 * and put every optional classification behind progressive disclosure. This module
 * holds the closed set of capture types and the session-scoped memory of the last
 * one used, so the sheet's behaviour is testable without a DOM.
 *
 * Every type here maps to the module's CANONICAL creation authority — the same
 * trusted route the module's own full form posts to. Quick Capture never gets a
 * second store, a second validator or a second create path (AGENTS.md §9.8):
 *
 *   task    → POST /tasks/new        (TASKS-01, atomic create + planning fields)
 *   diary   → POST /diary/new        (DIARY-01, the reserved DiaryRepository)
 *   meeting → POST /meetings/create  (MEET-01, owner-timezone start conversion)
 *   note    → POST /notes/new        (NOTES-01B, then the canonical Note editor)
 *   asset   → POST /assets/create    (ASSET-01, the reserved AssetRepository)
 */

import type { EntityType } from "~/shared/entity";

/**
 * The capture types the shared sheet offers, in the order it offers them.
 *
 * The four routine record types come first because they are what a life
 * generates hourly. **Asset** (ASSET-03) is last and deliberately included:
 * recording something you own is rarer, but it is exactly the thing you do
 * standing in front of the object with a phone in your hand, and having to
 * navigate to Assets and find a module-specific button to do it was the reason
 * assets went unrecorded.
 */
export const CAPTURE_TYPES = [
  "task",
  "diary",
  "meeting",
  "note",
  "asset",
] as const;

export type CaptureType = (typeof CAPTURE_TYPES)[number];

/** The presentation of a capture choice — label, helper line and entity identity. */
export type CaptureTypeDescriptor = {
  readonly type: CaptureType;
  /** The user-facing name, in the product's nouns (AGENTS.md §7). */
  readonly label: string;
  /** One line explaining what this capture does. */
  readonly description: string;
  /** The entity identity whose icon and accent the row uses (PX-05). */
  readonly entityType: EntityType;
};

export const CAPTURE_TYPE_DESCRIPTORS: readonly CaptureTypeDescriptor[] = [
  {
    type: "task",
    label: "Task",
    description: "Something to do — title is enough.",
    entityType: "task",
  },
  {
    type: "diary",
    label: "Diary entry",
    description: "A note about today.",
    entityType: "diary",
  },
  {
    type: "meeting",
    label: "Meeting",
    description: "Title and a start time.",
    entityType: "meeting",
  },
  {
    type: "note",
    label: "Note",
    description: "Start writing; keep writing in the editor.",
    entityType: "note",
  },
  {
    type: "asset",
    label: "Asset",
    description: "Something you own — a name and a kind.",
    entityType: "asset",
  },
];

/** Narrow an unknown value to a capture type. */
export function isCaptureType(value: unknown): value is CaptureType {
  return (
    typeof value === "string" &&
    (CAPTURE_TYPES as readonly string[]).includes(value)
  );
}

/** The descriptor for a capture type (total — the type set is closed). */
export function captureDescriptor(type: CaptureType): CaptureTypeDescriptor {
  const found = CAPTURE_TYPE_DESCRIPTORS.find(
    (descriptor) => descriptor.type === type,
  );
  // The list above covers every member of CAPTURE_TYPES; the fallback keeps the
  // function total rather than throwing inside a render.
  return found ?? CAPTURE_TYPE_DESCRIPTORS[0];
}

/**
 * The `sessionStorage` key holding the last capture type used.
 *
 * Deliberately SESSION-scoped, not persisted: remembering the last type across a
 * browsing session removes a tap from a repeated capture, but it must not become a
 * sticky preference that quietly makes the other types feel secondary — the
 * chooser is always one tap away from any panel (a "Change type" control), and a
 * new session starts neutral.
 */
export const CAPTURE_TYPE_SESSION_KEY = "dh.capture.lastType";

/**
 * Resolve the type the sheet should open on: an explicitly requested type wins,
 * then the remembered session type, then no type at all (show the chooser).
 */
export function resolveInitialCaptureType(
  requested: CaptureType | undefined,
  remembered: string | null,
): CaptureType {
  if (requested !== undefined) {
    return requested;
  }
  if (isCaptureType(remembered)) {
    return remembered;
  }
  /*
   * MOBILE-02 — capture opens on TASK, it does not ask.
   *
   * It used to return null, which rendered a chooser: pressing the phone's `+`
   * asked "What are you capturing?" and offered five options before showing a
   * field. Capture is the interaction this product is fastest at and the one an
   * owner performs most, and the answer is a Task overwhelmingly often — so the
   * chooser spent a tap, a screen and a decision on a question that already had
   * an answer, every single time, before the keyboard could appear.
   *
   * Nothing is lost: the sheet carries a compact type selector, so the other
   * four types are ONE tap away rather than one tap in. The remembered type
   * still wins, so an owner in the middle of a run of Notes keeps getting Notes.
   */
  return "task";
}

/** Read the remembered capture type. SSR-safe and storage-failure-safe. */
export function readRememberedCaptureType(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage.getItem(CAPTURE_TYPE_SESSION_KEY);
  } catch {
    // Storage can be unavailable (private mode, disabled cookies). Capture must
    // still work — it simply starts from the chooser.
    return null;
  }
}

/** Remember the capture type for this browsing session. Never throws. */
export function rememberCaptureType(type: CaptureType): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(CAPTURE_TYPE_SESSION_KEY, type);
  } catch {
    // Non-fatal: the sheet just starts from the chooser next time.
  }
}

/* -------------------------------------------------------------------------- */
/* Meeting start-time default                                                  */
/* -------------------------------------------------------------------------- */

/** Meetings are scheduled on quarter hours; capture defaults to the next one. */
export const MEETING_ROUNDING_MINUTES = 15;

/**
 * The default start for a captured Meeting: `now` rounded UP to the next quarter
 * hour, expressed as the owner-local wall clock a `datetime-local` control uses.
 * Exactly on a quarter hour stays put rather than jumping forward 15 minutes.
 *
 * The conversion itself is the shared `utcToOwnerLocal` (UX-01) — the owner's
 * timezone, never the browser's — so a capture made on a travelling phone still
 * schedules against the owner's calendar. The server re-derives the UTC instant
 * from this local string using the SAME rules, so the client value is a
 * convenience default, never an authority.
 */
export function defaultMeetingStartLocal(
  now: Date,
  timeZone: string,
  utcToOwnerLocal: (instant: Date, timeZone: string) => string,
): string {
  const stepMs = MEETING_ROUNDING_MINUTES * 60_000;
  const rounded = new Date(Math.ceil(now.getTime() / stepMs) * stepMs);
  // Drop seconds/milliseconds so a value already on the boundary is preserved.
  return utcToOwnerLocal(rounded, timeZone);
}
