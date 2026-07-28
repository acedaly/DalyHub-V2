/**
 * PEOPLE-01 / PEOPLE-02 — the Person "Timeline" tab: the ONE Person history
 * surface.
 *
 * It renders the shared DS-05 `Timeline` (never a People-specific fork of it) over
 * the ONE `/person/:id/activity` endpoint, which since PEOPLE-02 serves the
 * unified relationship history: the Person's own record events PLUS the events of
 * the records they are linked to — commitments made, notes written, diary entries,
 * conversations — always as links to the canonical record, never as copies of it.
 *
 * The tab adds exactly two things around the shared component: the DS-07 `FilterBar`
 * bound to the People-owned relationship CATEGORIES (`person-timeline.ts`), and an
 * honest note when a Person holds more relationships than one timeline reads at
 * once. Filtering, grouping, ordering, pagination, virtualisation, the empty /
 * loading / error states and the accessibility contract all remain the shared
 * system's (ACTIVITY_TIMELINE.md).
 *
 * As MEET-03 adds meaning-specific meeting events with the attendee as a subject,
 * they append to this same stream with NO change here (AGENTS.md §5 — history is
 * the point).
 */

import { useCallback, useState } from "react";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { FilterBar, useFilterUrlState } from "~/shared/filters";
import { EMPTY_EXPRESSION } from "~/shared/filters/model";

import type { PersonActivityPage } from "./person-activity";
import { PERSON_TIMELINE_FILTER_FIELDS } from "./person-timeline";

interface PersonTimelineTabProps {
  readonly personId: string;
  /** Bumps to force a re-read after a mutation appends an event. */
  readonly reloadKey: string;
}

/** What the last loaded first page said about the Person's relationships. */
interface RelationshipReach {
  readonly relatedRecordCount: number;
  readonly truncated: boolean;
}

export function PersonTimelineTab({
  personId,
  reloadKey,
}: PersonTimelineTabProps) {
  const { expression, setExpression } = useFilterUrlState(
    PERSON_TIMELINE_FILTER_FIELDS,
  );
  const [reach, setReach] = useState<RelationshipReach | null>(null);

  const clearFilters = useCallback(() => {
    setExpression(EMPTY_EXPRESSION);
  }, [setExpression]);

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
      const data = (await response.json()) as Partial<PersonActivityPage> & {
        readonly error?: string;
      };
      if (data.error || !data.items) {
        throw new Error("Failed to load activity");
      }
      setReach({
        relatedRecordCount: data.relatedRecordCount ?? 0,
        truncated: data.relatedRecordsTruncated ?? false,
      });
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
      <p className="dh-person-timeline__lede">
        Everything you share with this person, newest first — their record, the
        records you have linked to them, and how those changed over time.
      </p>
      <FilterBar
        fields={PERSON_TIMELINE_FILTER_FIELDS}
        expression={expression}
        onChange={setExpression}
        label="Timeline filters"
      />
      {reach?.truncated ? (
        <p className="dh-person-timeline__note">
          This person has more linked records than one timeline reads at once.
          History here covers {reach.relatedRecordCount} of them, most recently
          linked first — open the Linked tab to see every relationship.
        </p>
      ) : null}
      <Timeline
        loadPage={loadPage}
        ariaLabel="Person timeline"
        maxHeight="32rem"
        dayHeadingLevel={3}
        filterFields={PERSON_TIMELINE_FILTER_FIELDS}
        filterExpression={expression}
        onClearFilters={clearFilters}
        emptyState={
          <EmptyState
            icon={<EntityIcon type="person" />}
            title="No shared history yet"
            description="Link a task, note, meeting or diary entry to this person from the Linked tab and it will appear here."
            headingLevel={3}
          />
        }
      />
    </div>
  );
}
