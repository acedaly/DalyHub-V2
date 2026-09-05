/**
 * V2.10 LIFE-02 — the Obligation record's Activity tab: the shared DS-05
 * Timeline.
 *
 * It holds the events that are the owner CHANGING the record — recorded, moved,
 * completed, set aside, brought back. No amount reaches it: the payloads are
 * structural by construction (ADR-049 decision 5) and these descriptors read
 * only the event type.
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedObligationActivityItem } from "./obligation-activity";

interface ObligationActivityTabProps {
  readonly obligationId: string;
  readonly reloadKey?: string;
}

interface FetchedActivityPage {
  readonly items?: readonly SerializedObligationActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export function ObligationActivityTab({
  obligationId,
  reloadKey,
}: ObligationActivityTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      void reloadKey;
      const url = new URL(
        `/obligations/${encodeURIComponent(obligationId)}/activity`,
        window.location.origin,
      );
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to load activity");
      const data = (await response.json()) as FetchedActivityPage;
      if (data.error || !data.items) throw new Error("Failed to load activity");
      return {
        items: data.items.map((item) => ({
          ...item,
          occurredAt: new Date(item.occurredAt),
        })),
        nextCursor: data.nextCursor ?? null,
        hasMore: data.hasMore ?? false,
      };
    },
    [obligationId, reloadKey],
  );

  return (
    <div className="dh-obligation-activity">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Obligation activity"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
