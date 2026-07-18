/**
 * DS-02 — the record Tabs (tablist + panels).
 *
 * A reusable, accessible tab contract implementing the WAI-ARIA Tabs pattern:
 * `role="tablist"`/`tab`/`tabpanel`, roving `tabindex`, arrow-key navigation with
 * Home/End, and automatic activation on focus. The active tab is communicated
 * accessibly (`aria-selected`) AND visually with weight + an underline bar — never
 * by colour alone. Hidden tabs are omitted; disabled tabs are visible but skipped
 * by keyboard navigation and not selectable.
 *
 * Controlled (`activeTabId` + `onTabChange`) or uncontrolled (`defaultTabId`).
 * The tab strip scrolls horizontally on narrow screens rather than overflowing
 * the page (DESIGN_SYSTEM.md → Tabs, Responsive behaviour).
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";

import type { RecordTab, RecordTabsProps } from "./types";

/** Visible (non-hidden) tabs, in order. */
function visibleTabs(tabs: readonly RecordTab[]): readonly RecordTab[] {
  return tabs.filter((tab) => tab.hidden !== true);
}

/** The first selectable (visible, enabled) tab id, or undefined. */
function firstSelectableId(tabs: readonly RecordTab[]): string | undefined {
  return visibleTabs(tabs).find((tab) => tab.disabled !== true)?.id;
}

export function RecordTabs({
  tabs,
  label = "Sections",
  activeTabId,
  defaultTabId,
  onTabChange,
  idPrefix,
}: RecordTabsProps) {
  const reactId = useId();
  const prefix = idPrefix ?? `rt-${reactId}`;
  const shown = useMemo(() => visibleTabs(tabs), [tabs]);

  const isControlled = activeTabId !== undefined;
  const [uncontrolledId, setUncontrolledId] = useState<string | undefined>(
    () => defaultTabId ?? firstSelectableId(tabs),
  );

  // Resolve the active tab, falling back to the first selectable tab if the
  // requested id is missing, hidden or disabled.
  const requestedId = isControlled ? activeTabId : uncontrolledId;
  const activeId =
    shown.find((tab) => tab.id === requestedId && tab.disabled !== true)?.id ??
    firstSelectableId(tabs);

  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = useCallback(
    (tabId: string) => {
      if (!isControlled) {
        setUncontrolledId(tabId);
      }
      onTabChange?.(tabId);
    },
    [isControlled, onTabChange],
  );

  const focusAndSelect = useCallback(
    (tabId: string) => {
      tabRefs.current.get(tabId)?.focus();
      select(tabId);
    },
    [select],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentId: string) => {
      const selectable = shown.filter((tab) => tab.disabled !== true);
      if (selectable.length === 0) {
        return;
      }
      const currentIndex = selectable.findIndex((tab) => tab.id === currentId);

      let nextIndex: number;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % selectable.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex =
            (currentIndex - 1 + selectable.length) % selectable.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = selectable.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      focusAndSelect(selectable[nextIndex].id);
    },
    [shown, focusAndSelect],
  );

  if (shown.length === 0 || activeId === undefined) {
    return null;
  }

  return (
    <div className="record-tabs">
      <div
        className="record-tabs__list"
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
      >
        {shown.map((tab) => {
          const selected = tab.id === activeId;
          const tabId = `${prefix}-tab-${tab.id}`;
          const panelId = `${prefix}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId}
              className="record-tab"
              aria-selected={selected}
              aria-controls={panelId}
              aria-disabled={tab.disabled ? true : undefined}
              tabIndex={selected ? 0 : -1}
              data-active={selected ? "true" : "false"}
              data-disabled={tab.disabled ? "true" : "false"}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(tab.id, node);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              onClick={() => {
                if (!tab.disabled) {
                  select(tab.id);
                }
              }}
              onKeyDown={(event) => onKeyDown(event, tab.id)}
            >
              <span className="record-tab__label">{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && (
                <span className="record-tab__badge" aria-hidden="true">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {shown.map((tab) => {
        const selected = tab.id === activeId;
        const tabId = `${prefix}-tab-${tab.id}`;
        const panelId = `${prefix}-panel-${tab.id}`;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId}
            className="record-tabs__panel"
            aria-labelledby={tabId}
            hidden={!selected}
            tabIndex={0}
          >
            {selected && tab.content}
          </div>
        );
      })}
    </div>
  );
}
