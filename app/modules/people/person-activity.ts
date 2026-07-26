/**
 * PEOPLE-01 — Person Activity Timeline model.
 *
 * Names the bounded page size, the JSON-safe serialized item shape, and the
 * People-owned Activity descriptors (`person.created` / `.updated` / `.archived`
 * / `.restored`) so the shared Timeline renders a warm, human line for each
 * relationship event. Kernel lifecycle types (`entity.updated` from a rename,
 * `entity.deleted`/`entity.restored`) already have default descriptors; these
 * layer on top via `createActivityDescriptorMap`.
 */

import {
  PERSON_ARCHIVED,
  PERSON_CREATED,
  PERSON_RESTORED,
  PERSON_UPDATED,
} from "~/kernel/people";
import {
  createActivityDescriptorMap,
  type ActivityDescriptionSegment,
  type ActivityDescriptorContext,
  type ActivityDescriptorMap,
  type ActivityItem,
  type ActivityItemSubject,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

export const PERSON_ACTIVITY_PAGE_SIZE = 30;

export type SerializedPersonActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

export interface PersonActivityPage {
  readonly items: readonly SerializedPersonActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

function subjectSegment(
  subject: ActivityItemSubject | null,
): ActivityDescriptionSegment {
  return subject
    ? { kind: "entity", entityId: subject.entityId }
    : { kind: "emphasis", text: "this person" };
}

function personEvent(
  label: string,
  verb: string,
  tone: ActivityTypeDescriptor["tone"],
): ActivityTypeDescriptor {
  return {
    label,
    tone,
    describe: (_base, context: ActivityDescriptorContext) => ({
      segments: [
        { kind: "actor" },
        { kind: "text", text: ` ${verb} ` },
        subjectSegment(context.primarySubject),
      ],
      entityType: "person",
    }),
  };
}

/** The People-owned descriptors, merged over the kernel defaults. */
export const PEOPLE_ACTIVITY_DESCRIPTORS: ActivityDescriptorMap =
  createActivityDescriptorMap({
    [PERSON_CREATED]: personEvent("Person added", "added", "success"),
    [PERSON_UPDATED]: personEvent(
      "Details updated",
      "updated the details for",
      "accent",
    ),
    [PERSON_ARCHIVED]: personEvent("Archived", "archived", "warning"),
    [PERSON_RESTORED]: personEvent("Restored", "restored", "info"),
  });
