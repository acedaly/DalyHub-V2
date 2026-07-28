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
