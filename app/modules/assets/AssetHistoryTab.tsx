/**
 * ASSET-02 — the Asset "History" tab.
 *
 * The Asset's life, newest first: every recorded event with its icon, date, cost,
 * meter reading, provider and related records, plus the quick actions that put new
 * entries there in the fewest fields that can work (§13).
 *
 * WHICH SOURCE WINS (§10). The Asset Event is the canonical history entry, and this
 * tab renders events ONLY. The generic Activity stream still records that an event
 * was created — that is the audit trail — but it is shown on the separate Activity
 * tab, so a single service never appears twice as "Service · $489.50" and "Asset
 * event recorded". History is what happened to the thing; Activity is what happened
 * to the record.
 *
 * The list is paged through `/asset/:id/history`, so a decade of service records
 * never loads at once (AGENTS.md §16).
 */

import { useCallback, useEffect, useState } from "react";

import { ASSET_EVENT_CATEGORY_OPTIONS } from "~/kernel/assets";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";

import type { SerializedAssetEvent } from "./asset-history-view";
import type { AssetHistoryPage, AssetHistoryResult } from "./routes/history";

/** The fast-capture actions, in the order an owner reaches for them (§13). */
export type QuickEventAction =
  "service" | "repair" | "meter" | "renewal" | "valuation" | "history";

interface AssetHistoryTabProps {
  readonly assetId: string;
  readonly initialEvents: readonly SerializedAssetEvent[];
  readonly initialCursor: string | null;
  readonly initialHasMore: boolean;
  readonly readOnly: boolean;
  readonly onQuickAction: (action: QuickEventAction) => void;
  readonly onEditEvent: (event: SerializedAssetEvent) => void;
  readonly onChanged: () => void;
  /** Changes when the record reloads, so the list resets to the fresh first page. */
  readonly reloadKey: string;
}

const CATEGORY_FILTERS = [
  { value: "", label: "Everything" },
  ...ASSET_EVENT_CATEGORY_OPTIONS.map((c) => ({
    value: c.value,
    label: c.label,
  })),
];

const QUICK_ACTIONS: readonly {
  readonly id: QuickEventAction;
  readonly label: string;
}[] = [
  { id: "service", label: "Record service" },
  { id: "repair", label: "Record repair" },
  { id: "meter", label: "Update meter" },
  { id: "renewal", label: "Record renewal" },
  { id: "valuation", label: "Record valuation" },
  { id: "history", label: "Add history entry" },
];

export function AssetHistoryTab({
  assetId,
  initialEvents,
  initialCursor,
  initialHasMore,
  readOnly,
  onQuickAction,
  onEditEvent,
  onChanged,
  reloadKey,
}: AssetHistoryTabProps) {
  const feedback = useFeedback();
  const [category, setCategory] = useState("");
  const [events, setEvents] =
    useState<readonly SerializedAssetEvent[]>(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  // A fresh record load, or a category change, replaces the list entirely rather
  // than appending to a page that belonged to a different query.
  useEffect(() => {
    if (category === "") {
      setEvents(initialEvents);
      setCursor(initialCursor);
      setHasMore(initialHasMore);
    }
  }, [category, initialEvents, initialCursor, initialHasMore, reloadKey]);

  /** Load one page. `replace` swaps the list (a filter change); else it appends. */
  const fetchPage = useCallback(
    async (
      nextCursor: string | null,
      forCategory: string,
      replace: boolean,
    ) => {
      setLoading(true);
      try {
        const url = new URL(
          `/asset/${encodeURIComponent(assetId)}/history`,
          window.location.origin,
        );
        if (nextCursor) url.searchParams.set("cursor", nextCursor);
        if (forCategory) url.searchParams.set("category", forCategory);
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("failed");
        const page = (await response.json()) as AssetHistoryPage;
        setEvents((current) =>
          replace ? page.items : [...current, ...page.items],
        );
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch {
        feedback.notifyError("Couldn’t load history. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [assetId, feedback],
  );

  const onFilterChange = useCallback(
    (value: string) => {
      setCategory(value);
      if (value === "") {
        // "Everything" is already loaded server-side: restore it without a fetch.
        setEvents(initialEvents);
        setCursor(initialCursor);
        setHasMore(initialHasMore);
        return;
      }
      // Pass the NEW value explicitly rather than reading the state we just set,
      // so the request can never race its own `setState`.
      void fetchPage(null, value, true);
    },
    [fetchPage, initialEvents, initialCursor, initialHasMore],
  );

  const removeEvent = useCallback(
    async (event: SerializedAssetEvent) => {
      const body = new FormData();
      body.set("intent", "delete-event");
      body.set("eventId", event.id);
      try {
        const response = await fetch(
          `/asset/${encodeURIComponent(assetId)}/history`,
          { method: "POST", body },
        );
        const result = (await response.json()) as AssetHistoryResult;
        if (result.ok) {
          feedback.notifySuccess("History entry removed.");
          onChanged();
          return;
        }
        feedback.notifyError(result.formError ?? "That couldn’t be removed.");
      } catch {
        feedback.notifyError("That couldn’t be removed. Try again.");
      }
    },
    [assetId, feedback, onChanged],
  );

  return (
    <div className="dh-asset-history">
      <h2 className="dh-visually-hidden">History</h2>

      {readOnly || (events.length === 0 && category === "") ? null : (
        <div
          className="dh-asset-history__actions"
          role="group"
          aria-label="Record an entry"
        >
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="dh-btn dh-btn--ghost dh-btn--sm"
              onClick={() => onQuickAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="dh-asset-history__bar">
        <label className="dh-asset-history__filter">
          <span>Show</span>
          <select
            value={category}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            {CATEGORY_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="asset" />}
          title={
            category ? "Nothing of that kind yet" : "No history recorded yet"
          }
          description={
            category
              ? "Try a different category, or record an entry."
              : "Record a service, a repair or a meter reading and this asset starts telling its own story."
          }
          primaryAction={
            readOnly ? undefined : (
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={() => onQuickAction("service")}
              >
                Record service
              </button>
            )
          }
        />
      ) : (
        <ol className="dh-asset-history__list" aria-label="Asset history">
          {events.map((event) => (
            <li
              key={event.id}
              className={`dh-asset-history__item dh-asset-history__item--${event.category}`}
            >
              <div className="dh-asset-history__head">
                <span className="dh-asset-history__category">
                  {event.categoryLabel}
                </span>
                <span className="dh-asset-history__date">
                  {event.dateLabel}
                </span>
              </div>
              <p className="dh-asset-history__title">{event.title}</p>
              <p className="dh-asset-history__facts">
                {[
                  event.provider,
                  event.personName,
                  event.costDisplay,
                  event.valueDisplay,
                  event.meterDisplay,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {event.description ? (
                <p className="dh-asset-history__description">
                  {event.description}
                </p>
              ) : null}
              {event.taskId || event.noteId ? (
                <p className="dh-asset-history__links">
                  {event.taskId ? (
                    <a href={`/task/${event.taskId}`}>
                      {event.taskTitle ?? "Linked task"}
                    </a>
                  ) : null}
                  {event.taskId && event.noteId ? (
                    <span aria-hidden="true"> · </span>
                  ) : null}
                  {event.noteId ? (
                    <a href={`/note/${event.noteId}`}>
                      {event.noteTitle ?? "Linked note"}
                    </a>
                  ) : null}
                </p>
              ) : null}
              {readOnly ? null : (
                <p className="dh-asset-history__item-actions">
                  <button
                    type="button"
                    className="dh-btn dh-btn--ghost dh-btn--sm"
                    onClick={() => onEditEvent(event)}
                  >
                    Edit
                    <span className="dh-visually-hidden"> {event.title}</span>
                  </button>
                  <button
                    type="button"
                    className="dh-btn dh-btn--ghost dh-btn--sm"
                    onClick={() => void removeEvent(event)}
                  >
                    Remove
                    <span className="dh-visually-hidden"> {event.title}</span>
                  </button>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {hasMore ? (
        <p className="dh-asset-history__more">
          <button
            type="button"
            className="dh-btn dh-btn--ghost"
            disabled={loading}
            onClick={() => void fetchPage(cursor, category, false)}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
