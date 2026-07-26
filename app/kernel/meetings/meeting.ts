import type { EntityRecord } from "~/kernel/entities";

export const MEETING_ENTITY_TYPE = "meeting";
export const MEETING_CREATED = "meeting.created";
export const MEETING_UPDATED = "meeting.updated";
export const MEETING_ARCHIVED = "meeting.archived";
export const MEETING_RESTORED = "meeting.restored";
export const MEETING_ATTENDEE_LINK = "meeting.attendee";

export type MeetingStatus = "planned" | "completed" | "cancelled";
export type MeetingMode = "in_person" | "phone" | "online";
export type MeetingView = "upcoming" | "recent" | "archived";
export type MeetingItemKind = "decision" | "outcome";

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
