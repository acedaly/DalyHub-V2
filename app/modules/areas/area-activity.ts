/**
 * AREA-01 / AREA-05 — Area Activity Timeline model.
 *
 * Area create/rename/structural-link events are already covered by the shared
 * kernel Activity descriptors. AREA-05 adds the two reversible Area lifecycle
 * events a live Area is a subject of (`area.archived` / `area.restored`) as
 * descriptors layered over the kernel defaults — mirroring `PROJECT_ACTIVITY_
 * DESCRIPTORS`. The permanent-deletion event (`area.deleted`) is a subject-less
 * workspace audit fact, so it never appears on an Area's own Timeline (the Area is
 * gone); its label is still registered on the module manifest for the workspace
 * feed and filters, and the shared safe generic fallback renders it there.
 */

import { AREA_ARCHIVED, AREA_RESTORED } from "~/kernel/area-settings";
import {
  buildWorkspaceActivityDescriptors,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

export const AREA_ACTIVITY_PAGE_SIZE = 30;

export const AREA_ACTIVITY_DESCRIPTORS: Record<string, ActivityTypeDescriptor> =
  {
    [AREA_ARCHIVED]: {
      label: "Archived area",
      entityType: "area",
    },
    [AREA_RESTORED]: {
      label: "Restored area",
      entityType: "area",
    },
  };

/** The frozen descriptor map the Area Timeline resolves against: the kernel
 * lifecycle defaults with the two Area lifecycle events merged on top. */
export const AREA_ACTIVITY_DESCRIPTOR_MAP = buildWorkspaceActivityDescriptors(
  [],
  AREA_ACTIVITY_DESCRIPTORS,
);

export type SerializedAreaActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

export interface AreaActivityPage {
  readonly items: readonly SerializedAreaActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
