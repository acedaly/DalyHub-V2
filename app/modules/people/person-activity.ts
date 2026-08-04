/**
 * PEOPLE-01 / PEOPLE-02 — the Person Timeline's Activity presentation model.
 *
 * Names the bounded page size, the JSON-safe serialized item shape, the
 * People-owned Activity descriptors (`person.created` / `.updated` / `.archived` /
 * `.restored`), and — since PEOPLE-02 — the way EVERY OTHER module's event types
 * get a readable line on the Person Timeline.
 *
 * The unified relationship history carries events from whichever records a Person
 * is linked to (a Task, a Note, a Diary entry, a Meeting, an Asset …). Those event
 * types are owned by other modules, and People must not reach into their
 * internals, hard-code their labels, or grow a product switch statement over them
 * (AGENTS.md §9.1, DS-05's extension rule). It reads them from the FND-06 MODULE
 * REGISTRY instead: every module already declares its activity types with a human
 * label in its manifest, so `buildPersonTimelineDescriptors` turns those declared
 * contributions into DS-05 descriptors, merged over the kernel lifecycle defaults
 * and under the People-owned ones.
 *
 * That indirection is also the PRIVACY boundary. A registry-derived descriptor has
 * a label but NO `describe`, so DS-05 renders its calm default line — actor,
 * label, and the referenced record as a link — and emits **no payload metadata at
 * all**. No other module's Activity payload fields are surfaced on a Person's
 * timeline, whatever they contain (AGENTS.md §17).
 */

import {
  PERSON_ARCHIVED,
  PERSON_CREATED,
  PERSON_RESTORED,
  PERSON_UPDATED,
} from "~/kernel/people";
import {
  buildWorkspaceActivityDescriptors,
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
  /**
   * How many LINKED records contributed their history to this stream (PEOPLE-02).
   * Structural metadata only — a count, never a title or a snippet.
   */
  readonly relatedRecordCount: number;
  /**
   * True when the Person holds more relationships than one timeline reads at
   * once, so the reader is told the history is partial instead of being shown a
   * silently-capped stream as if it were complete.
   */
  readonly relatedRecordsTruncated: boolean;
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

/**
 * The minimum a registered activity-type contribution has to offer to be given a
 * readable line. Structurally compatible with the FND-06 registry's
 * `RegisteredActivityType`, but stated narrowly so this stays a pure function over
 * plain data — the route passes `registry.listActivityTypes()`.
 */
export interface PersonTimelineActivityTypeContribution {
  readonly type: string;
  readonly label: string;
}

/**
 * Build the descriptor map the Person Timeline renders with: the kernel lifecycle
 * defaults, then every module's DECLARED activity types (label only — no payload
 * exposure, see the file header), then the SHARED cross-module set, then the
 * People-owned descriptors last so a Person's own events keep their warmer,
 * purpose-written line.
 *
 * The registry pass and the shared set now live in ONE place
 * (`buildWorkspaceActivityDescriptors`) that every cross-module surface uses, so
 * the workspace feed and a Person's timeline describe the same event identically.
 * An event type no module has declared still renders, through DS-05's
 * conservative generic fallback. Nothing here needs editing when a module is
 * added.
 */
export function buildPersonTimelineDescriptors(
  contributions: readonly PersonTimelineActivityTypeContribution[],
): ActivityDescriptorMap {
  return buildWorkspaceActivityDescriptors(
    contributions,
    PEOPLE_ACTIVITY_DESCRIPTORS,
  );
}
