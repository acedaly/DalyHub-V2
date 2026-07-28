/**
 * DS-02 — the record Tabs (tablist + panels), with the MOBILE-01 overflow menu.
 *
 * A reusable, accessible tab contract implementing the WAI-ARIA Tabs pattern:
 * `role="tablist"`/`tab`/`tabpanel`, roving `tabindex`, arrow-key navigation with
 * Home/End, and automatic activation on focus. The active tab is communicated
 * accessibly (`aria-selected`) AND visually with weight + an underline bar — never
 * by colour alone. Hidden tabs are omitted; disabled tabs are visible but skipped
 * by keyboard navigation and not selectable.
 *
 * Controlled (`activeTabId` + `onTabChange`) or uncontrolled (`defaultTabId`).
 *
 * **Overflow (MOBILE-01).** Up to {@link MAX_INLINE_TABS} tabs render inline and
 * the strip scrolls horizontally — the established DS-02 behaviour. BEYOND that
 * the strip stops being scannable on a phone: a six- or seven-tab record turns
 * into a swipe-hunt where the tab you want is always just off-screen. So a record
 * with more tabs shows its most important ones inline and moves the rest into a
 * labelled "More sections" menu.
 *
 * Three rules keep that honest:
 *   - the ACTIVE tab is always inline, swapping into the last inline slot when it
 *     lives in the overflow, so you can always see where you are;
 *   - nothing is hidden permanently — Activity and Settings are reachable in one
 *     tap from the menu, and every tab keeps its deep link and URL state;
 *   - selecting from the menu moves focus to the now-inline tab, so a keyboard or
 *     screen-reader user lands on the control that reflects their choice.
 *
 * The menu button sits OUTSIDE the `tablist` (a tablist may contain only tabs) and
 * reuses the ONE shared DS-12 overflow menu — there is no second menu component,
 * and no module implements its own tab strip.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";

import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";

import type { RecordTab, RecordTabsProps } from "./types";

/**
 * How many tabs render inline before the rest move into the "More sections" menu.
 * Four is the point at which a phone tab strip stops being scannable; below it the
 * strip simply scrolls, as DS-02 always did.
 */
export const MAX_INLINE_TABS = 4;

/** Visible (non-hidden) tabs, in order. */
function visibleTabs(tabs: readonly RecordTab[]): readonly RecordTab[] {
  return tabs.filter((tab) => tab.hidden !== true);
}

/**
 * Split the visible tabs into the inline strip and the overflow menu.
 *
 * Pure and exported so the split — especially the active-tab swap — is unit-tested
 * without a DOM. With `MAX_INLINE_TABS` or fewer tabs the overflow is empty and
 * every tab is inline, so short records are completely unaffected.
 */
export function splitTabsForOverflow(
  tabs: readonly RecordTab[],
  activeId: string | undefined,
  maxInline: number = MAX_INLINE_TABS,
): {
  readonly inline: readonly RecordTab[];
  readonly overflow: readonly RecordTab[];
} {
  if (tabs.length <= maxInline) {
    return { inline: tabs, overflow: [] };
  }
  // One inline slot is reserved for the active tab when it would otherwise be in
  // the overflow, so the strip always shows where you are.
  const head = tabs.slice(0, maxInline - 1);
  const tail = tabs.slice(maxInline - 1);
  const activeInTail = tail.find((tab) => tab.id === activeId);
  if (activeInTail) {
    return {
      inline: [...head, activeInTail],
      overflow: tail.filter((tab) => tab.id !== activeInTail.id),
    };
  }
  return { inline: [...head, tail[0]], overflow: tail.slice(1) };
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

  // The inline strip and the "More sections" overflow. Computed from the RESOLVED
  // active id so the active tab is always inline.
  const { inline, overflow } = useMemo(
    () => splitTabsForOverflow(shown, activeId),
    [shown, activeId],
  );

  /**
   * Select a tab from the overflow menu and move focus onto it. The tab becomes
   * inline in the same render (it is now active), so focus lands on a control the
   * user can see — never on a button that just disappeared.
   */
  const selectFromOverflow = useCallback(
    (tabId: string) => {
      select(tabId);
      // Defer to the render that promotes the tab into the inline strip.
      window.requestAnimationFrame(() => tabRefs.current.get(tabId)?.focus());
    },
    [select],
  );

  const overflowItems = useMemo<readonly OverflowMenuItem[]>(
    () =>
      overflow.map((tab) => ({
        id: tab.id,
        label: tab.label,
        disabled: tab.disabled === true,
        onSelect: () => selectFromOverflow(tab.id),
      })),
    [overflow, selectFromOverflow],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentId: string) => {
      // Arrow keys move within the INLINE strip (the visible composite widget).
      // Overflow tabs are reached through the menu, which has its own keyboard
      // model — so there is no invisible focus stop.
      const selectable = inline.filter((tab) => tab.disabled !== true);
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
    [inline, focusAndSelect],
  );

  // Only a genuinely empty (all-hidden) tab set collapses the strip. If tabs are
  // present but ALL disabled, `activeId` is undefined — we still render the
  // disabled tabs (per the contract that disabled tabs stay visible) with no
  // active panel, rather than hiding the record's sections entirely.
  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="record-tabs">
      {/* The strip wraps the tablist and the overflow trigger so the trigger
          stays pinned while the tablist scrolls. The trigger is deliberately
          OUTSIDE the tablist — a tablist may contain only tabs. */}
      <div className="record-tabs__strip">
        <div
          className="record-tabs__list"
          role="tablist"
          aria-label={label}
          aria-orientation="horizontal"
        >
          {inline.map((tab) => {
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

        {overflowItems.length > 0 ? (
          <OverflowMenu
            items={overflowItems}
            label={`More sections in ${label}`}
            triggerClassName="record-tabs__more"
            data-testid="record-tabs-more"
          />
        ) : null}
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
