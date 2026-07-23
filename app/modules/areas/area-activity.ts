/**
 * AREA-01 — Area Activity Timeline model.
 *
 * Area create/rename/structural-link events are already covered by the shared
 * kernel Activity descriptors. Areas have no completion events, so this module
 * only names the bounded page size and JSON-safe payload shape.
 */

import type { ActivityItem } from "~/shared/activity-feed/model";

export const AREA_ACTIVITY_PAGE_SIZE = 30;

export type SerializedAreaActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

export interface AreaActivityPage {
  readonly items: readonly SerializedAreaActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
