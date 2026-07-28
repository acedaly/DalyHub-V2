/**
 * MEET-03 — the pure presentation rules for the "Mark as held" record action.
 *
 * Kept React-free and side-effect-free so the rules that decide WHEN the action is
 * offered, what it says, and what it says once it has been done can be proven
 * directly, without mounting a route or touching a database. The record composes
 * this into the shared DS-12 Record Header overflow via `useRecordLifecycle`'s
 * module slot; it never renders a bespoke button.
 *
 * The rules, and why:
 *
 *   - **Offered only where it is contextually valid.** An archived meeting is
 *     read-only, so the action is absent there entirely — never a control that
 *     exists only to reject you.
 *   - **Visibly idempotent.** Once held, the item stays VISIBLE but disabled and
 *     states in words when it was recorded. A user who tries again learns the
 *     answer instead of silently repeating a no-op, and the capability is never
 *     hidden (DESIGN_SYSTEM.md → Shared overflow menu).
 *   - **Never colour-only.** Both states carry their meaning in the label and the
 *     supporting description; the icon is decorative.
 */

/** The instant formatter the record supplies (meeting-timezone aware). */
export type HeldDateFormatter = (isoInstant: string) => string;

/** Mirrored from the kernel so this stays a pure, dependency-light module. */
export { MAX_MEETING_HELD_ATTENDEE_SUBJECTS } from "~/kernel/meetings";

export interface MeetingHeldActionState {
  /** The meeting's `heldAt` instant, or null when it has not been recorded. */
  readonly heldAt: string | null;
  /** True when the meeting is archived (and therefore read-only). */
  readonly archived: boolean;
  /** True while a mark-as-held submission is in flight. */
  readonly pending: boolean;
}

/** The plain, renderer-agnostic description of the action's single menu item. */
export interface MeetingHeldActionItem {
  readonly id: "meeting-mark-held";
  readonly label: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly pending: boolean;
}

/** The stable id, so the record and its tests never spell it twice. */
export const MEETING_HELD_ACTION_ID = "meeting-mark-held";

/**
 * The action's menu item, or `null` when it should not be offered at all.
 * Total: it never throws, and an unparseable instant simply degrades to the plain
 * "already recorded" wording rather than failing the record.
 */
export function meetingHeldActionItem(
  state: MeetingHeldActionState,
  formatDate: HeldDateFormatter,
): MeetingHeldActionItem | null {
  if (state.archived) {
    return null;
  }
  if (state.heldAt) {
    let when: string | null;
    try {
      when = formatDate(state.heldAt);
    } catch {
      when = null;
    }
    return {
      id: MEETING_HELD_ACTION_ID,
      label: "Marked as held",
      description: when
        ? `Recorded on ${when}. A meeting is only recorded as held once.`
        : "Already recorded. A meeting is only recorded as held once.",
      disabled: true,
      pending: false,
    };
  }
  return {
    id: MEETING_HELD_ACTION_ID,
    label: "Mark as held",
    description:
      "Records that this meeting took place, on its own history and on every attendee’s.",
    disabled: false,
    pending: state.pending,
  };
}

/** The response the record's mark-as-held submission expects back. */
export interface MeetingHeldOutcome {
  readonly outcome: "recorded" | "already_held";
  /** Attendees linked at the moment it was marked held. */
  readonly attendeeCount: number;
  /** How many of those actually became Activity subjects (the bounded set). */
  readonly attendeesRecorded: number;
}

/**
 * The success feedback wording — truthful about which outcome actually occurred,
 * and about how many timelines were ACTUALLY reached.
 *
 * The two counts differ only when a meeting exceeds
 * {@link MAX_MEETING_HELD_ATTENDEE_SUBJECTS}; claiming the larger number would
 * tell the owner that people received a history entry when they did not. A cap is
 * disclosed, never applied silently (AGENTS.md §6).
 */
export function meetingHeldSuccessMessage(result: MeetingHeldOutcome): {
  readonly title: string;
  readonly message?: string;
} {
  if (result.outcome === "already_held") {
    // A repeat submission is not a fresh success, and is not reported as one.
    return { title: "This meeting was already marked as held." };
  }
  const recorded = result.attendeesRecorded;
  const total = result.attendeeCount;
  if (total === 0) {
    return {
      title: "Meeting marked as held.",
      message:
        "No attendees are linked yet, so it was recorded on the meeting only.",
    };
  }
  const reached = `Added to the timeline of ${recorded} ${recorded === 1 ? "attendee" : "attendees"}.`;
  return {
    title: "Meeting marked as held.",
    message:
      total > recorded
        ? `${reached} This meeting has ${total} attendees — one event can name ${recorded}, so the rest are not on their own timelines.`
        : reached,
  };
}

/** The calm, non-disclosing failure wording. */
export const MEETING_HELD_ERROR_MESSAGE =
  "That meeting couldn’t be marked as held.";
