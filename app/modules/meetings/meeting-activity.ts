/**
 * MEET-02 — Meeting Activity Timeline model.
 *
 * Names the bounded page size, the JSON-safe serialized item shape, and the
 * Meetings-owned Activity descriptors so the shared DS-05 Timeline renders a warm,
 * human line for each structural meeting event. Kernel lifecycle types
 * (`entity_link.created` from an attendee link, etc.) keep their default
 * descriptors; these layer on top via `createActivityDescriptorMap`. No descriptor
 * ever surfaces private meeting content — the payloads carry only structural
 * metadata (AGENTS.md §17).
 */

import {
  MEETING_ARCHIVED,
  MEETING_CREATED,
  MEETING_FOLLOW_UP_CREATED,
  MEETING_ITEM_CONVERTED_TO_TASK,
  MEETING_RESTORED,
  MEETING_UPDATED,
} from "~/kernel/meetings";
import {
  createActivityDescriptorMap,
  type ActivityDescriptorContext,
  type ActivityDescriptorMap,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

export const MEETING_ACTIVITY_PAGE_SIZE = 30;

export type SerializedMeetingActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

export interface MeetingActivityPage {
  readonly items: readonly SerializedMeetingActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

function meetingEvent(
  label: string,
  verb: string,
  tone: ActivityTypeDescriptor["tone"],
): ActivityTypeDescriptor {
  return {
    label,
    tone,
    entityType: "meeting",
    describe: () => ({
      segments: [{ kind: "actor" }, { kind: "text", text: ` ${verb}` }],
      entityType: "meeting",
    }),
  };
}

/**
 * Describe a conversion event. The follow-up Task is a subject of the event, so we
 * render it as a navigable entity segment when it resolves — never the item text.
 */
function conversionEvent(
  label: string,
  verb: string,
  tone: ActivityTypeDescriptor["tone"],
): ActivityTypeDescriptor {
  return {
    label,
    tone,
    entityType: "task",
    describe: (_base, context: ActivityDescriptorContext) => {
      // The created Task is recorded with the `target` role; fall back to the
      // non-primary subject so this stays total on any anchor.
      const taskSubject =
        context.subjectByRole("target") ??
        context.subjects.find(
          (s) => s.entityId !== context.primarySubject?.entityId,
        ) ??
        null;
      return {
        segments: [
          { kind: "actor" },
          { kind: "text", text: ` ${verb} ` },
          taskSubject
            ? { kind: "entity", entityId: taskSubject.entityId }
            : { kind: "emphasis", text: "a follow-up task" },
        ],
        entityType: "task",
      };
    },
  };
}

/** The Meetings-owned descriptors, merged over the kernel defaults. */
export const MEETING_ACTIVITY_DESCRIPTORS: ActivityDescriptorMap =
  createActivityDescriptorMap({
    [MEETING_CREATED]: meetingEvent(
      "Meeting created",
      "created this meeting",
      "success",
    ),
    [MEETING_UPDATED]: meetingEvent(
      "Meeting updated",
      "updated this meeting",
      "accent",
    ),
    [MEETING_ARCHIVED]: meetingEvent(
      "Archived",
      "archived this meeting",
      "warning",
    ),
    [MEETING_RESTORED]: meetingEvent(
      "Restored",
      "restored this meeting",
      "info",
    ),
    [MEETING_ITEM_CONVERTED_TO_TASK]: conversionEvent(
      "Converted to task",
      "converted a meeting item into",
      "success",
    ),
    [MEETING_FOLLOW_UP_CREATED]: conversionEvent(
      "Follow-up created",
      "created a follow-up task",
      "success",
    ),
  });
