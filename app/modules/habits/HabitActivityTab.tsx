/**
 * HABITS-01 — the Habit record's Activity tab: the shared DS-05 Timeline.
 *
 * It holds the five events that are the owner CHANGING the record. Check-ins are
 * deliberately absent and live on the Summary tab's history strip instead, where
 * four weeks are visible at once rather than as a scroll of near-identical rows.
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedHabitActivityItem } from "./habit-activity";

interface HabitActivityTabProps {
  readonly habitId: string;
  readonly reloadKey?: string;
}

interface FetchedActivityPage {
  readonly items?: readonly SerializedHabitActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export function HabitActivityTab({
  habitId,
  reloadKey,
}: HabitActivityTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      void reloadKey;
      const url = new URL(
        `/habits/${encodeURIComponent(habitId)}/activity`,
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
    [habitId, reloadKey],
  );

  return (
    <div className="dh-habit-activity">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Habit activity"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
