import type { EntityRecord } from "~/kernel/entities";

export const MEETING_ENTITY_TYPE = "meeting";
export const MEETING_CREATED = "meeting.created";
export const MEETING_UPDATED = "meeting.updated";
export const MEETING_ARCHIVED = "meeting.archived";
export const MEETING_RESTORED = "meeting.restored";
export const MEETING_ATTENDEE_LINK = "meeting.attendee";

// MEET-02 structural follow-through Activity types. Payloads carry ONLY structural
// metadata (item kind, ids) — never agenda/notes/decision/outcome content (§17).
export const MEETING_ITEM_CONVERTED_TO_TASK = "meeting.item_converted_to_task";
export const MEETING_FOLLOW_UP_CREATED = "meeting.follow_up_created";

/**
 * MEET-03 — the meaning-specific interaction event.
 *
 * `meeting.held` is the ONE new Meeting-owned Activity type: a truthful statement
 * that this meeting took place, recorded against the Meeting AND every active
 * attendee Person as Activity subjects of the SAME event (never one copy per
 * person). Because the Person is a subject in their own right, the event belongs
 * to their history permanently — it survives the attendee link being removed later
 * and stays on a soft-deleted Person's own stream.
 *
 * It is emitted exactly once per meeting, by the explicit "Mark as held" action,
 * atomically with the durable `held_at` state (migration `0020`). The payload
 * carries only structural metadata — never agenda, notes, decision or outcome
 * content, and never a Person's details (AGENTS.md §17).
 */
export const MEETING_HELD = "meeting.held";

/**
 * The Activity subject role an attendee Person carries on a `meeting.held` event.
 * The Meeting itself keeps the generic `subject` role, so the anchor record of the
 * event is unambiguous while an attendee is still a first-class subject.
 */
export const MEETING_ATTENDEE_SUBJECT_ROLE = "attendee";

/**
 * How many attendee People one `meeting.held` event may name as subjects.
 *
 * The Activity kernel bounds a single event at `MAX_SUBJECTS` (32) so no event can
 * fan out without limit; the Meeting occupies one of those, leaving 31 for
 * attendees. A meeting larger than that is recorded honestly rather than silently
 * truncated: the event's payload reports both the FULL attendee count and how many
 * became subjects, and the result of the action tells the caller the same, so the
 * UI can disclose it. Deliberately a cap, never a silent drop (AGENTS.md §6).
 */
export const MAX_MEETING_HELD_ATTENDEE_SUBJECTS = 31;

/**
 * The outcome of marking a meeting as held.
 *
 * `recorded` — this call wrote `held_at` and appended the one `meeting.held` event.
 * `already_held` — the meeting was already held (a retry, a double submission, or a
 * concurrent racer that won). Nothing was written and NO second event exists; the
 * previously-recorded facts are returned unchanged so the caller can report the
 * truth rather than a fresh success.
 */
export type MarkMeetingHeldOutcome = "recorded" | "already_held";

export interface MarkMeetingHeldResult {
  readonly outcome: MarkMeetingHeldOutcome;
  /** The instant the meeting was recorded as held (this call's, or the earlier one's). */
  readonly heldAt: Date;
  /**
   * How many active attendee People were linked to the meeting at the moment it
   * was marked held. `0` for a meeting with no attendees — which is still a valid,
   * truthful `meeting.held` event on the Meeting's own record.
   */
  readonly attendeeCount: number;
  /**
   * How many of those attendees became Activity subjects — equal to
   * `attendeeCount` unless it exceeded {@link MAX_MEETING_HELD_ATTENDEE_SUBJECTS}.
   */
  readonly attendeesRecorded: number;
}

export type MeetingStatus = "planned" | "completed" | "cancelled";
export type MeetingMode = "in_person" | "phone" | "online";
export type MeetingView = "upcoming" | "recent" | "archived";
export type MeetingSort = "start" | "updated" | "title";
// UX-01 keeps preparation/capture notes separate from explicit follow-through work:
// action items are the only structured item kind considered unfinished follow-up by
// default, though any item may still be converted into a canonical Task.
export type MeetingItemKind = "agenda" | "decision" | "outcome" | "action";

export interface MeetingItem {
  readonly id: string;
  readonly kind: MeetingItemKind;
  readonly bodyMarkdown: string;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Meeting extends EntityRecord<"meeting"> {
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly timezone: string;
  readonly location: string | null;
  readonly mode: MeetingMode | null;
  readonly meetingUrl: string | null;
  readonly status: MeetingStatus;
  readonly agendaMarkdown: string;
  readonly notesMarkdown: string;
  readonly archivedAt: Date | null;
  /**
   * MEET-03 — the durable, write-once instant at which the owner recorded that this
   * meeting took place, or `null` when they have not. Independent of both `status`
   * (an operational label) and `archivedAt` (a reversible collection state).
   */
  readonly heldAt: Date | null;
  readonly items: readonly MeetingItem[];
}

export interface CreateMeetingInput {
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly timezone: string;
  readonly location?: string | null;
  readonly mode?: MeetingMode | null;
  readonly meetingUrl?: string | null;
  readonly agendaMarkdown?: string;
}

export interface UpdateMeetingInput {
  readonly title?: string;
  readonly startsAt?: string;
  readonly endsAt?: string | null;
  readonly timezone?: string;
  readonly location?: string | null;
  readonly mode?: MeetingMode | null;
  readonly meetingUrl?: string | null;
  readonly status?: MeetingStatus;
  readonly agendaMarkdown?: string;
  readonly notesMarkdown?: string;
}

export interface MeetingPage {
  readonly items: readonly Meeting[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly total: number;
}

/**
 * MEET-02 — one durable source-item → Task mapping row. `itemId` is the stable
 * `MeetingItem.id` that produced the Task, or `null` for a direct meeting follow-up
 * (source is the Meeting itself). This is the smallest seam that records WHICH item
 * was converted; the navigable relationship is a separate `task.relates_to`
 * EntityLink, never replaced by this table.
 */
export interface MeetingFollowUpLink {
  readonly meetingId: string;
  readonly itemId: string | null;
  readonly taskId: string;
  readonly createdAt: Date;
}

/** Input to durably record a Meeting → Task conversion (MEET-02). */
export interface LinkFollowUpTaskInput {
  readonly meetingId: string;
  readonly itemId: string | null;
  readonly taskId: string;
  /** The source item's kind, recorded only in the structural Activity payload. */
  readonly itemKind?: MeetingItemKind;
}
