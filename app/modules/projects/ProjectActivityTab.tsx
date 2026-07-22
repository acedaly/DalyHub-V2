/**
 * PROJ-04 — the project record's Activity tab: the shared DS-05 Timeline.
 *
 * Feeds the ONE shared `Timeline` component a `loadPage` that fetches the project's
 * Activity page from `/projects/:projectId/activity` (mapped server-side to DS-05
 * items). The one `Date` field, `occurredAt`, is re-hydrated from its ISO string
 * before the page is handed to `Timeline`. This renders the project's REAL shared
 * FND-05 Activity history through the shared virtualised `ActivityStream` — no second
 * history model, no Projects-only list, no bespoke timeline.
 *
 * `reloadKey` participates in the loader identity: when a relevant project mutation
 * revalidates the record (rename, complete, reopen — all bump the project's
 * `updatedAt`), the key changes, so the stream cleanly resets and re-reads its first
 * page and the new event appears at the top with NO hard reload and no duplicate
 * rows. A drawer-only URL change (opening a referenced task, Back/Forward) leaves the
 * key untouched, so already-loaded Activity pages are preserved.
 *
 * A visually-hidden section heading (`h2 "Activity"`) sits above the feed so the bare
 * project record keeps a non-skipping heading outline (record `h1` → section `h2` →
 * the Timeline's day-group `h3`s) — see DEBT-21.
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedProjectActivityItem } from "./project-activity";

interface ProjectActivityTabProps {
  readonly projectId: string;
  /**
   * A value that changes when a relevant project mutation revalidates the record
   * (e.g. the project's `updatedAt`). Changing it re-reads the Timeline's first page.
   */
  readonly reloadKey?: string;
  /** The base path of the project resource route. Defaults to `/projects`. */
  readonly basePath?: string;
}

interface FetchedActivityPage {
  readonly items?: readonly SerializedProjectActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export function ProjectActivityTab({
  projectId,
  reloadKey,
  basePath = "/projects",
}: ProjectActivityTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      // `reloadKey` is a genuine input to the loader identity: reading it here makes
      // the dependency real (a mutation changes it → the stream re-reads page one).
      void reloadKey;
      const url = new URL(
        `${basePath}/${encodeURIComponent(projectId)}/activity`,
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
    [projectId, basePath, reloadKey],
  );

  return (
    <div className="dh-project-activity">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Project activity"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
