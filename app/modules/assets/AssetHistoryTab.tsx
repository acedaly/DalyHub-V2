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
import { OverflowMenu } from "~/shared/overflow-menu";
import { UntitledStatusBadge } from "~/shared/pill";

import type { SerializedAssetEvent } from "./asset-history-view";
import type { AssetHistoryPage, AssetHistoryResult } from "./routes/history";
import { buttonClassName } from "~/shared/ui";

/** The fast-capture actions, in the order an owner reaches for them (§13). */
export type QuickEventAction =
  "service" | "repair" | "meter" | "renewal" | "valuation" | "history";

/**
 * RECORD-01 — which capture is this asset's PRIMARY one.
 *
 * The six captures rendered as six ghost buttons at one weight, floating in a
 * row above the filter. That is a list of options, not a hierarchy: nothing
 * told the owner which one they were most likely to want, and six equal
 * controls read as chrome rather than as actions.
 *
 * The asset's own TYPE already answers it, so no context engine is needed and
 * nothing is guessed: a thing that is serviced leads with "Record service"; a
 * document, licence, policy or subscription is never serviced and leads with
 * "Record renewal". Everything else moves into the shared overflow, one press
 * away, in the same menu affordance every record in the product uses.
 *
 * Exported and pure so the rule is unit-tested without a DOM.
 */
const RENEWABLE_ASSET_TYPES = new Set([
  "document",
  "licence",
  "insurance",
  "subscription",
  "software",
]);

export function primaryHistoryAction(assetType: string): QuickEventAction {
  return RENEWABLE_ASSET_TYPES.has(assetType) ? "renewal" : "service";
}

interface AssetHistoryTabProps {
  readonly assetId: string;
  /** The asset's type — decides which capture is this asset's primary one. */
  readonly assetType: string;
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
  assetType,
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
  const primaryId = primaryHistoryAction(assetType);
  const primary =
    QUICK_ACTIONS.find((action) => action.id === primaryId) ?? QUICK_ACTIONS[0];
  const secondary = QUICK_ACTIONS.filter((action) => action.id !== primary.id);
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

      {/*
        RECORD-01 — the shared record toolbar: the filter on the leading edge,
        this asset's primary capture and the overflow on the trailing edge. Same
        row, same measurements and same edges as the Project's task toolbar and
        the Area's Goals toolbar.
      */}
      <div className="dh-record-toolbar">
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

        {readOnly ? null : (
          <>
            <button
              type="button"
              className={buttonClassName({ variant: "subtle" })}
              onClick={() => onQuickAction(primary.id)}
            >
              {primary.label}
            </button>
            <OverflowMenu
              items={secondary.map((action) => ({
                id: action.id,
                label: action.label,
                onSelect: () => onQuickAction(action.id),
              }))}
              label="More ways to record an entry"
            />
          </>
        )}
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
          // No action here: the quick-action row above already offers all six
          // captures, and a second "Record service" button would be the same
          // control twice on one empty screen.
        />
      ) : (
        /*
          UNTITLED-16 — a bounded DIVIDED LIST, not a card per service record.
          
          Each entry was its own bordered, radiused box with a per-category
          painted arm, two permanent buttons (one of them Remove), and a head row
          that put the category and the date at opposite ends of the card. Ten
          years of servicing was ten years of boxes.

          It is Untitled's card anatomy now: ONE surface, hairline rows, the DATE
          leading in a fixed column because a history is read by when, the
          category as the shared badge, and the two actions in the shared
          overflow — Remove behind a separator in the destructive tone, which is
          the same rule the obligation row and the meeting attendee list follow.
        */
        <div
          /*
           * No ring and no shadow: this list is the body of a record TAB, which
           * already draws a boundary. See `AssetDatesTab` for the argument.
           */
          className="overflow-hidden rounded-lg bg-primary"
          data-untitled-source="application/table:table-card"
        >
          <ol
            className="m-0 flex list-none flex-col divide-y divide-secondary p-0"
            aria-label="Asset history"
          >
            {events.map((event) => (
              <li
                key={event.id}
                className="flex min-w-0 flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:gap-4 md:px-5"
                data-category={event.category}
              >
                {/*
                  The fixed leading date column, so a run of entries reads as a
                  chronology rather than as a stack of independent boxes. It
                  wraps under the body on a phone, where a fixed column would
                  take a third of the width.
                */}
                <span className="shrink-0 text-sm whitespace-nowrap text-tertiary tabular-nums md:w-32">
                  {event.dateLabel}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="m-0 flex flex-wrap items-center gap-2">
                    <UntitledStatusBadge tone="neutral" type="modern">
                      {event.categoryLabel}
                    </UntitledStatusBadge>
                    <span className="text-sm font-medium break-words text-primary">
                      {event.title}
                    </span>
                  </p>
                  {(() => {
                    const facts = [
                      event.provider,
                      event.personName,
                      event.costDisplay,
                      event.valueDisplay,
                      event.meterDisplay,
                    ].filter(Boolean);
                    return facts.length === 0 ? null : (
                      <p className="m-0 text-xs break-words text-tertiary tabular-nums">
                        {facts.join(" · ")}
                      </p>
                    );
                  })()}
                  {event.description ? (
                    <p className="m-0 text-sm break-words text-tertiary">
                      {event.description}
                    </p>
                  ) : null}
                  {event.taskId || event.noteId ? (
                    <p className="m-0 text-xs break-words text-tertiary">
                      {event.taskId ? (
                        <a
                          className="font-medium text-brand-secondary underline-offset-2 hover:underline"
                          href={`/tasks?drawer=task%3A${encodeURIComponent(event.taskId)}`}
                        >
                          {event.taskTitle ?? "Linked task"}
                        </a>
                      ) : null}
                      {event.taskId && event.noteId ? (
                        <span aria-hidden="true"> · </span>
                      ) : null}
                      {event.noteId ? (
                        <a
                          className="font-medium text-brand-secondary underline-offset-2 hover:underline"
                          href={`/notes/${event.noteId}`}
                        >
                          {event.noteTitle ?? "Linked note"}
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                </div>

                {readOnly ? null : (
                  <div className="shrink-0 max-md:self-start">
                    <OverflowMenu
                      items={[
                        {
                          id: "edit",
                          label: "Edit",
                          ariaLabel: `Edit ${event.title}`,
                          onSelect: () => onEditEvent(event),
                        },
                        {
                          id: "remove",
                          label: "Remove",
                          ariaLabel: `Remove ${event.title}`,
                          tone: "danger",
                          separatorBefore: true,
                          onSelect: () => void removeEvent(event),
                        },
                      ]}
                      label={`More actions for ${event.title}`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {hasMore ? (
        <p className="dh-asset-history__more">
          <button
            type="button"
            className={buttonClassName({ variant: "subtle" })}
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
