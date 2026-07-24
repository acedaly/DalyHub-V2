/**
 * NOTES-01B — the Note record's Activity tab: the shared DS-05 Timeline.
 *
 * Mirrors `~/modules/goals/GoalActivityTab.tsx` exactly.
 */

import { useCallback } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";

import type { SerializedNoteActivityItem } from "./note-activity";

interface NoteActivityTabProps {
  readonly noteId: string;
  readonly reloadKey?: string;
}

interface FetchedActivityPage {
  readonly items?: readonly SerializedNoteActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export function NoteActivityTab({ noteId, reloadKey }: NoteActivityTabProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      void reloadKey;
      const url = new URL(
        `/notes/${encodeURIComponent(noteId)}/activity`,
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
    [noteId, reloadKey],
  );

  return (
    <div className="dh-note-activity">
      <h2 className="dh-visually-hidden">Activity</h2>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Note activity"
        maxHeight="32rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
