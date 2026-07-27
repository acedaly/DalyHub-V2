/**
 * ASSET-01 — the Asset "Activity" tab.
 *
 * Renders the Asset's accumulated history through the shared DS-05 Timeline, backed
 * by the `/asset/:id/activity` JSON endpoint (create, detail edits, status changes,
 * archive/restore/disposal, plus any linked-record events). Payloads never carry
 * sensitive values, so nothing sensitive is ever rendered here (§17).
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedAssetActivityItem } from "./asset-activity";

interface AssetTimelineTabProps {
  readonly assetId: string;
  /** Bumps to force a re-read after a mutation appends an event. */
  readonly reloadKey: string;
}

export function AssetTimelineTab({
  assetId,
  reloadKey,
}: AssetTimelineTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      void reloadKey;
      const url = new URL(
        `/asset/${encodeURIComponent(assetId)}/activity`,
        window.location.origin,
      );
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("Failed to load activity");
      }
      const data = (await response.json()) as {
        readonly items?: readonly SerializedAssetActivityItem[];
        readonly nextCursor?: string | null;
        readonly hasMore?: boolean;
        readonly error?: string;
      };
      if (data.error || !data.items) {
        throw new Error("Failed to load activity");
      }
      return {
        items: data.items.map((item) => ({
          ...item,
          occurredAt: new Date(item.occurredAt),
        })),
        nextCursor: data.nextCursor ?? null,
        hasMore: data.hasMore ?? false,
      };
    },
    [assetId, reloadKey],
  );

  return (
    <div className="dh-asset-timeline">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Asset activity"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
