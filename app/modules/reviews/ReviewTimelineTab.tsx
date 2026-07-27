import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedReviewActivityItem } from "./review-activity";

interface ReviewTimelineTabProps {
  readonly reviewId: string;
  readonly reloadKey: string;
}

export function ReviewTimelineTab({
  reviewId,
  reloadKey,
}: ReviewTimelineTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      void reloadKey;
      const url = new URL(
        `/reviews/${encodeURIComponent(reviewId)}/activity`,
        window.location.origin,
      );
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to load review activity");
      const data = (await response.json()) as {
        readonly items?: readonly SerializedReviewActivityItem[];
        readonly nextCursor?: string | null;
        readonly hasMore?: boolean;
        readonly error?: string;
      };
      if (data.error || !data.items)
        throw new Error("Failed to load review activity");
      return {
        items: data.items.map((item) => ({
          ...item,
          occurredAt: new Date(item.occurredAt),
        })),
        nextCursor: data.nextCursor ?? null,
        hasMore: data.hasMore ?? false,
      };
    },
    [reviewId, reloadKey],
  );

  return (
    <div className="dh-review-timeline">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Review activity"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
