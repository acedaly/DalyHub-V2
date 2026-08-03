/**
 * TODAY-08 — the shared chrome around one personalisable Today widget.
 *
 * Every landing widget is a labelled `section` (an `h2` region, so the pane keeps a
 * correct single-level outline under the CollectionLayout `h1`) with a calm
 * `xs`-muted heading in the established Today rhythm. Two always-available
 * affordances: a collapse/expand disclosure (the heading button owns
 * `aria-expanded`/`aria-controls` over the content region) and, when the owner
 * turns on "Customise", a small `toolbar` of move / pin / hide controls. No bespoke
 * modal, menu focus-trap or new visual language — buttons reuse the shared Today
 * button treatments and the content is the shared cards/lists each widget composes.
 */

import type { ReactNode } from "react";

import type { TodayWidgetDefinition, TodayWidgetId } from "./layout";

export interface TodayWidgetProps {
  readonly definition: TodayWidgetDefinition;
  readonly count?: number;
  readonly collapsed: boolean;
  readonly pinned: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** Whether the "Customise" controls (move/pin/hide) are revealed. */
  readonly customising: boolean;
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

        {customising ? (
          <div
            className="dh-today-widget__controls"
            role="toolbar"
            aria-label={`Customise ${title}`}
          >
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
