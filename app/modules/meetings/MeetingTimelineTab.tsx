/**
 * MEET-02 — the Meeting "Activity" tab.
 *
 * Renders the meeting's structural history through the shared DS-05 Timeline, backed
 * by the `/meeting/:id/activity` JSON endpoint. Replaces MEET-01's placeholder
 * paragraph. Meeting lifecycle, attendee links and follow-up conversions all append
 * to this one stream; no private meeting content is ever shown.
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedMeetingActivityItem } from "./meeting-activity";

interface MeetingTimelineTabProps {
  readonly meetingId: string;
  /** Bumps to force a re-read after a mutation appends an event. */
  readonly reloadKey: string;
}

export function MeetingTimelineTab({
  meetingId,
  reloadKey,
}: MeetingTimelineTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      void reloadKey;
      const url = new URL(
        `/meeting/${encodeURIComponent(meetingId)}/activity`,
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
        readonly items?: readonly SerializedMeetingActivityItem[];
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
    [meetingId, reloadKey],
  );

  return (
    <div className="dh-meeting-timeline">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Meeting timeline"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
