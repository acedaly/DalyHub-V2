/**
 * NOTES-01B — the Note record's Activity Timeline model.
 *
 * Note creation and rename are already covered by the shared kernel Activity
 * descriptors (`entity.created`, `entity.updated`). `note.content_updated`
 * (registered by the NOTES-01A `notes` module manifest) is the only event
 * whose subject is a Note that the shared defaults don't already render —
 * layered over `DEFAULT_ACTIVITY_DESCRIPTORS`, mirroring
 * `~/modules/goals/goal-activity.ts` exactly. Every other registered type
 * falls through to the shared safe generic fallback — no Notes-only switch
 * statement, no duplicated registry, no raw payload rendering.
 */

import { NOTE_CONTENT_UPDATED } from "~/kernel/notes";
import {
  createActivityDescriptorMap,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

/** How many events a single Note Timeline page loads. Bounded — the Timeline
 * never "loads everything"; the client pages through with the opaque
 * scope-bound cursor. */
export const NOTE_ACTIVITY_PAGE_SIZE = 30;

export const NOTE_ACTIVITY_DESCRIPTORS: Record<string, ActivityTypeDescriptor> =
  {
    [NOTE_CONTENT_UPDATED]: {
      label: "Updated note content",
      entityType: "note",
    },
  };

export const NOTE_ACTIVITY_DESCRIPTOR_MAP = createActivityDescriptorMap(
  NOTE_ACTIVITY_DESCRIPTORS,
);

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedNoteActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of a Note's Activity Timeline (the resource-route payload). */
export interface NoteActivityPage {
  readonly items: readonly SerializedNoteActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
