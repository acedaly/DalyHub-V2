/**
 * V2.10 LIFE-02 — the Obligation record's Activity Timeline model.
 *
 * Layered over the shared descriptors exactly as the Goal, Project and Habit
 * timelines are: the kernel lifecycle defaults, then the cross-module set, then
 * the obligation-owned events last. Every other registered type falls through to
 * the shared safe generic fallback — no obligations-only switch statement and no
 * raw payload rendering.
 *
 * ── What an obligation's timeline says, and what it never says ──────────────
 * It says what the OWNER did: recorded it, moved it, completed it, set it
 * aside, brought it back. It never carries an amount. A completion's payload is
 * structural by construction (ADR-049 decision 5 keeps a price out of an
 * Activity payload entirely), and these descriptors read only the type — so
 * there is no path by which a figure reaches this timeline, the workspace feed,
 * or a notification.
 */

import {
  OBLIGATION_COMPLETED,
  OBLIGATION_CREATED,
  OBLIGATION_DELETED,
  OBLIGATION_DISMISSED,
  OBLIGATION_REOPENED,
  OBLIGATION_RESCHEDULED,
  OBLIGATION_TASK_LINKED,
} from "~/kernel/obligations";
import {
  buildWorkspaceActivityDescriptors,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

/** How many events a single Obligation Timeline page loads. Bounded. */
export const OBLIGATION_ACTIVITY_PAGE_SIZE = 30;

export const OBLIGATION_ACTIVITY_DESCRIPTORS: Record<
  string,
  ActivityTypeDescriptor
> = {
  [OBLIGATION_CREATED]: { label: "Added obligation", entityType: "obligation" },
  [OBLIGATION_RESCHEDULED]: {
    // Worded as what it IS. An edit that moves the date moves a linked Task
    // with it, and the timeline says "changed" rather than implying the
    // occurrence was replaced.
    label: "Changed the obligation",
    entityType: "obligation",
  },
  [OBLIGATION_COMPLETED]: {
    label: "Recorded it as done",
    entityType: "obligation",
  },
  [OBLIGATION_DISMISSED]: { label: "Set aside", entityType: "obligation" },
  [OBLIGATION_REOPENED]: { label: "Made live again", entityType: "obligation" },
  [OBLIGATION_TASK_LINKED]: {
    label: "Linked a task to carry it",
    entityType: "obligation",
  },
  [OBLIGATION_DELETED]: {
    label: "Deleted obligation",
    entityType: "obligation",
  },
};

export const OBLIGATION_ACTIVITY_DESCRIPTOR_MAP =
  buildWorkspaceActivityDescriptors([], OBLIGATION_ACTIVITY_DESCRIPTORS);

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedObligationActivityItem = Omit<
  ActivityItem,
  "occurredAt"
> & {
  readonly occurredAt: string;
};

/** One bounded page of an obligation's Activity Timeline. */
export interface ObligationActivityPage {
  readonly items: readonly SerializedObligationActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
