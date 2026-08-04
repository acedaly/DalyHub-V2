/**
 * TODAY-08 / POLISH-02 — the shared chrome around one Today widget.
 *
 * Every widget on the dashboard is the SAME object: a labelled `section` (an `h2`
 * region, so the pane keeps a correct single-level outline under the
 * CollectionLayout `h1`) with one header treatment, one radius, one inset and one
 * hover response. That sameness is the point — POLISH-02's brief was that Today read
 * as "a collection of random cards", and cards only stop reading as random when
 * their chrome is identical and only their CONTENT differs.
 *
 * The header is a three-slot row and nothing else: the disclosure (which IS the
 * heading, and carries `aria-expanded`/`aria-controls` over the body), an optional
 * trailing `action` for the section's one destination link, and — only while the
 * owner has turned on "Customise" — a small `toolbar` of move / pin / hide controls.
 *
 * Two variants, because the dashboard has two kinds of surface:
 *   - `panel` (the default) — a card in one of the two columns;
 *   - `hero` — the full-width orientation band, where the widget title steps back to
 *     a quiet eyebrow so the greeting inside it can lead the page. It is the same
 *     card with the same controls; only the emphasis changes.
 *
 * `reorderable: false` suppresses the move/pin controls for a widget that is alone
 * in its region: a control that can never change anything is noise, and disabling
 * two buttons permanently is worse than not drawing them. Hide always stays.
 */

import type { ReactNode } from "react";

import type { TodayWidgetDefinition, TodayWidgetId } from "./layout";

export type TodayWidgetVariant = "panel" | "hero";

export interface TodayWidgetProps {
  readonly definition: TodayWidgetDefinition;
  readonly count?: number;
  readonly collapsed: boolean;
  readonly pinned: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** Whether the "Customise" controls (move/pin/hide) are revealed. */
  readonly customising: boolean;
  /** The card treatment. Defaults to the column `panel`. */
  readonly variant?: TodayWidgetVariant;
  /**
   * False when the widget is alone in its region, so move/pin would be dead
   * controls. Defaults to true.
   */
  readonly reorderable?: boolean;
  /** The section's one trailing destination ("View all", "Open Diary"). */
  readonly action?: ReactNode;
  readonly onToggleCollapsed: (id: TodayWidgetId) => void;
  readonly onTogglePinned: (id: TodayWidgetId) => void;
  readonly onHide: (id: TodayWidgetId) => void;
  readonly onMove: (id: TodayWidgetId, direction: "up" | "down") => void;
  readonly children: ReactNode;
}

export function TodayWidget({
  definition,
  count,
  collapsed,
  pinned,
  isFirst,
  isLast,
  customising,
  variant = "panel",
  reorderable = true,
  action,
  onToggleCollapsed,
  onTogglePinned,
  onHide,
  onMove,
  children,
}: TodayWidgetProps) {
  const { id, title } = definition;
  const headingId = `today-widget-${id}-label`;
  const bodyId = `today-widget-${id}-body`;
  return (
    <section
      className="dh-region-card dh-today-widget"
      aria-labelledby={headingId}
      data-widget={id}
      data-variant={variant}
      data-collapsed={collapsed ? "true" : undefined}
      data-pinned={pinned ? "true" : undefined}
    >
      <div className="dh-today-widget__header">
        <h2 className="dh-today-widget__heading" id={headingId}>
          <button
            type="button"
            className="dh-today-widget__toggle"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => onToggleCollapsed(id)}
          >
            <span
              className="dh-today-widget__chevron"
              data-collapsed={collapsed ? "true" : "false"}
              aria-hidden="true"
            />
            <span className="dh-today-widget__title">{title}</span>
            {count !== undefined ? (
              <span className="dh-today-widget__count"> {count}</span>
            ) : null}
            {pinned ? (
              <span className="dh-today-widget__pin-flag"> · Pinned</span>
            ) : null}
          </button>
        </h2>

        {/* The section's one destination. Hidden while the body is collapsed —
            a link into a section you have just closed is a loose end. */}
        {action && !collapsed ? (
          <div className="dh-today-widget__action">{action}</div>
        ) : null}

        {customising ? (
          <div
            className="dh-today-widget__controls"
            role="toolbar"
            aria-label={`Customise ${title}`}
          >
            {reorderable ? (
              <>
                <button
                  type="button"
                  className="dh-today-widget__control"
                  onClick={() => onMove(id, "up")}
                  disabled={isFirst}
                  aria-label={`Move ${title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="dh-today-widget__control"
                  onClick={() => onMove(id, "down")}
                  disabled={isLast}
                  aria-label={`Move ${title} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="dh-today-widget__control"
                  aria-pressed={pinned}
                  onClick={() => onTogglePinned(id)}
                  aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
                >
                  {pinned ? "Unpin" : "Pin"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="dh-today-widget__control"
              onClick={() => onHide(id)}
              aria-label={`Hide ${title}`}
            >
              Hide
            </button>
          </div>
        ) : null}
      </div>

      <div id={bodyId} className="dh-today-widget__body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
