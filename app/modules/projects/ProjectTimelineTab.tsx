/** PROJ-04 — the project record's shared DS-05 Activity Timeline. */
import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";
import type { SerializedActivityItem } from "~/shared/task-record/contract";

interface FetchedActivityPage {
  readonly items?: readonly SerializedActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export function ProjectTimelineTab({
  projectId,
}: {
  readonly projectId: string;
}) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      const url = new URL(
        `/projects/${encodeURIComponent(projectId)}/activity`,
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
    [projectId],
  );

  return (
    <Timeline
      loadPage={loadPage}
      ariaLabel="Project activity"
      maxHeight="24rem"
      dayHeadingLevel={4}
    />
  );
}
