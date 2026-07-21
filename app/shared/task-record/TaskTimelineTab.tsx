/**
 * TODAY-02 — the task Drawer's Activity tab: the shared DS-05 Timeline.
 *
 * Feeds the `Timeline` component a `loadPage` that fetches the task's Activity page
 * from `/today/task/:taskId/activity` (mapped server-side to DS-05 items). The one
 * `Date` field, `occurredAt`, is re-hydrated from its ISO string before the page is
 * handed to `Timeline`. This renders the task's REAL shared Activity history — no
 * second history model, no bespoke timeline.
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedActivityItem } from "./contract";

interface TaskTimelineTabProps {
  readonly taskId: string;
  /** The base path of the task resource route. Defaults to `/tasks`. */
  readonly basePath?: string;
}

interface FetchedActivityPage {
  readonly items?: readonly SerializedActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export function TaskTimelineTab({
  taskId,
  basePath = "/tasks",
}: TaskTimelineTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      const url = new URL(
        `${basePath}/${encodeURIComponent(taskId)}/activity`,
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
      const data = (await response.json()) as FetchedActivityPage;
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
    [taskId, basePath],
  );

  return (
    <Timeline
      loadPage={loadPage}
      ariaLabel="Task activity"
      maxHeight="24rem"
      dayHeadingLevel={4}
    />
  );
}
