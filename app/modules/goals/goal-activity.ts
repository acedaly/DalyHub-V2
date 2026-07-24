/**
 * AREA-02 — the Goal record's Activity Timeline model.
 *
 * Goal create/rename/structural-link events are already covered by the shared
 * kernel Activity descriptors. `goal.completed`/`goal.reopened` (spine) and
 * `goal.details_updated` (this module's own detail slice) are the only three
 * events whose subject is the Goal that the shared defaults don't already
 * render — layered over `DEFAULT_ACTIVITY_DESCRIPTORS`, mirroring
 * `~/modules/projects/project-activity.ts` exactly. Every other registered type
 * falls through to the shared safe generic fallback — no Goals-only switch
 * statement, no duplicated registry, no raw payload rendering.
 */

import { GOAL_COMPLETED, GOAL_REOPENED } from "~/kernel/spine";
import { GOAL_DETAILS_UPDATED } from "~/kernel/goals";
import {
  createActivityDescriptorMap,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

/** How many events a single Goal Timeline page loads. Bounded — the Timeline
 * never "loads everything"; the client pages through with the opaque
 * scope-bound cursor. */
export const GOAL_ACTIVITY_PAGE_SIZE = 30;

export const GOAL_ACTIVITY_DESCRIPTORS: Record<string, ActivityTypeDescriptor> =
  {
    [GOAL_COMPLETED]: {
      label: "Completed goal",
      entityType: "goal",
      tone: "success",
    },
    [GOAL_REOPENED]: {
      label: "Reopened goal",
      entityType: "goal",
    },
    [GOAL_DETAILS_UPDATED]: {
      label: "Updated goal details",
      entityType: "goal",
    },
  };

export const GOAL_ACTIVITY_DESCRIPTOR_MAP = createActivityDescriptorMap(
  GOAL_ACTIVITY_DESCRIPTORS,
);

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedGoalActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of a Goal's Activity Timeline (the resource-route payload). */
export interface GoalActivityPage {
  readonly items: readonly SerializedGoalActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
