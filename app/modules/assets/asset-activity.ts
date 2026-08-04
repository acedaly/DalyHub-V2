/**
 * ASSET-01 — Asset Activity Timeline model.
 *
 * Names the bounded page size, the JSON-safe serialized item shape, and the
 * Asset-owned Activity descriptors (`asset.created` / `.updated` / `.status_changed`
 * / `.archived` / `.restored` / `.disposed`) so the shared Timeline renders a calm,
 * human line for each structural event. Payloads carry ONLY field names and the new
 * status term — never a serial/policy number, price or private note (§17); the
 * descriptions here never read a payload value beyond the status vocabulary term.
 * Kernel lifecycle types (`entity.updated` from a rename, `entity.deleted`) already
 * have default descriptors; these layer on top via `createActivityDescriptorMap`.
 */

import {
  ASSET_ARCHIVED,
  ASSET_CREATED,
  ASSET_DISPOSED,
  ASSET_RESTORED,
  ASSET_STATUS_CHANGED,
  ASSET_UPDATED,
} from "~/kernel/assets";
import {
  buildWorkspaceActivityDescriptors,
  type ActivityDescriptionSegment,
  type ActivityDescriptorContext,
  type ActivityDescriptorMap,
  type ActivityItem,
  type ActivityItemSubject,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

export const ASSET_ACTIVITY_PAGE_SIZE = 30;

export type SerializedAssetActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

export interface AssetActivityPage {
  readonly items: readonly SerializedAssetActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

function subjectSegment(
  subject: ActivityItemSubject | null,
): ActivityDescriptionSegment {
  return subject
    ? { kind: "entity", entityId: subject.entityId }
    : { kind: "emphasis", text: "this asset" };
}

function assetEvent(
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
      entityType: "asset",
    }),
  };
}

/** The Asset-owned descriptors, merged over the kernel defaults. */
export const ASSETS_ACTIVITY_DESCRIPTORS: ActivityDescriptorMap =
  buildWorkspaceActivityDescriptors([], {
    [ASSET_CREATED]: assetEvent("Asset added", "added", "success"),
    [ASSET_UPDATED]: assetEvent(
      "Details updated",
      "updated the details for",
      "accent",
    ),
    [ASSET_STATUS_CHANGED]: assetEvent(
      "Status changed",
      "changed the status of",
      "info",
    ),
    [ASSET_ARCHIVED]: assetEvent("Archived", "archived", "warning"),
    [ASSET_RESTORED]: assetEvent("Restored", "restored", "info"),
    [ASSET_DISPOSED]: assetEvent("Disposed", "marked as disposed", "warning"),
  });
