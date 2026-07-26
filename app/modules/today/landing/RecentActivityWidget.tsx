/**
 * TODAY-08 — the Recent Activity widget: the workspace-wide DS-05 Activity Feed.
 *
 * Renders the ONE shared `ActivityFeed` over the SINGLE FND-05 Activity stream via a
 * `loadPage` backed by the `/today/activity` resource route — Today's first product
 * use of `activity.listForWorkspace(…)`. Filtering is the shared DS-07 FilterBar
 * (event type / referenced entity / date), URL-bound so it is shareable and
 * Back/Forward-correct and composes with the drawer stack. A referenced task opens
 * in the SAME shared Task Drawer; other records link to their canonical route. No
 * second history model, no bespoke timeline, no colour-only state.
 */

import { useCallback, useMemo } from "react";

import {
  ActivityFeed,
  createActivityDateFormatter,
  createActivityFilterFields,
  type ActivityStreamPage,
} from "~/shared/activity-feed";
import type { RenderEntityLink } from "~/shared/activity-feed";
import { FilterBar, useFilterUrlState } from "~/shared/filters";

import {
  TODAY_ACTIVITY_ENTITY_OPTIONS,
  TODAY_ACTIVITY_EVENT_OPTIONS,
  type SerializedTodayActivityItem,
} from "./activity";

const FILTER_FIELDS = createActivityFilterFields({
  eventTypeOptions: TODAY_ACTIVITY_EVENT_OPTIONS,
  entityTypeOptions: TODAY_ACTIVITY_ENTITY_OPTIONS,
});

interface FetchedActivityPage {
  readonly items?: readonly SerializedTodayActivityItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}

export interface RecentActivityWidgetProps {
  /** The server's `now` (ISO), so "Today"/"Yesterday" match without a hydration jump. */
  readonly nowIso: string;
  /** Renders a referenced record: task → Drawer, others → canonical link. */
  readonly renderEntityLink: RenderEntityLink;
}

export function RecentActivityWidget({
  nowIso,
  renderEntityLink,
}: RecentActivityWidgetProps) {
  const { expression, setExpression } = useFilterUrlState(FILTER_FIELDS);

  const formatter = useMemo(
    () => createActivityDateFormatter({ now: new Date(nowIso) }),
    [nowIso],
  );

  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      const url = new URL("/today/activity", window.location.origin);
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
    [],
  );

  const clearFilters = useCallback(
    () => setExpression({ mode: "and", clauses: [] }),
    [setExpression],
  );

  return (
    <div className="dh-today-activity">
      <FilterBar
        fields={FILTER_FIELDS}
        expression={expression}
        onChange={setExpression}
      />
      <ActivityFeed
        loadPage={loadPage}
        ariaLabel="Recent activity across DalyHub"
        formatter={formatter}
        filterFields={FILTER_FIELDS}
        filterExpression={expression}
        onClearFilters={clearFilters}
        renderEntityLink={renderEntityLink}
        maxHeight="28rem"
        dayHeadingLevel={3}
      />
    </div>
  );
}
