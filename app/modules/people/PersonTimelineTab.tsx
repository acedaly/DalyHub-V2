/**
 * PEOPLE-01 — the Person "Timeline" tab.
 *
 * Renders the person's accumulated relationship history through the shared DS-05
 * Timeline, backed by the `/person/:id/activity` JSON endpoint. As Meetings,
 * Calls, Emails and diary links arrive in later PRs, their events append to this
 * same stream with no change here (AGENTS.md §5 — history is the point).
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedPersonActivityItem } from "./person-activity";

interface PersonTimelineTabProps {
  readonly personId: string;
  /** Bumps to force a re-read after a mutation appends an event. */
  readonly reloadKey: string;
}

export function PersonTimelineTab({
  personId,
  reloadKey,
}: PersonTimelineTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      // `reloadKey` participates so a save re-creates this loader and the Timeline
      // re-reads its first page with the new event visible.
      void reloadKey;
      const url = new URL(
        `/person/${encodeURIComponent(personId)}/activity`,
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
        readonly items?: readonly SerializedPersonActivityItem[];
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
    [personId, reloadKey],
  );

  return (
    <div className="dh-person-timeline">
      <h2 className="dh-visually-hidden">Timeline</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Person timeline"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
