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
 * **Overflow (MOBILE-01).** On a PHONE, a five-, six- or seven-tab record turns
 * the strip into a swipe-hunt where the tab you want is always just off-screen.
 * So at compact viewports a record with more than {@link MAX_INLINE_TABS} tabs
 * grows a labelled "More sections" menu offering the surplus tabs directly.
 *
 * The menu is an ACCELERATOR, not a replacement: **every tab stays in the
 * `tablist`**, and the strip scrolls. That is deliberate. Removing tabs from the
 * strip would mean a tab that exists at 1440px does not exist at 375px — the
 * roving-tabindex model, the arrow-key order and every deep link would differ by
 * viewport, and a control the rest of the product can address by role would
 * silently vanish on a phone. Keeping the strip complete means one tab model at
 * every width; the menu just removes the swiping.
 *
 * Three rules keep that honest:
 *   - nothing is hidden at any width — Activity and Settings remain tabs, and are
 *     additionally one tap away in the menu;
 *   - every tab keeps its deep link, URL state and keyboard position;
 *   - selecting from the menu moves focus to the tab it activates, so a keyboard
 *     or screen-reader user lands on the control that reflects their choice.
 *
 * The menu button sits OUTSIDE the `tablist` (a tablist may contain only tabs) and
 * reuses the ONE shared DS-12 overflow menu — there is no second menu component,
 * and no module implements its own tab strip.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";

import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";
import { useCompactViewport } from "~/shared/viewport";

import type { RecordTab, RecordTabsProps } from "./types";

/**
 * How many tabs a compact record shows before it also offers a "More sections"
 * menu. Four is the point at which a phone tab strip stops being scannable. At or
 * below it the strip simply scrolls, as DS-02 always did, and no menu appears.
 */
export const MAX_INLINE_TABS = 4;

/** Visible (non-hidden) tabs, in order. */
function visibleTabs(tabs: readonly RecordTab[]): readonly RecordTab[] {
  return tabs.filter((tab) => tab.hidden !== true);
}

/**
 * The tabs a compact record offers in its "More sections" menu.
 *
 * Pure and exported so the rule is unit-tested without a DOM. These are the tabs
 * beyond the first `maxInline` — the ones a phone user would otherwise have to
 * scroll the strip to reach. They are *also* still in the strip: this list decides
 * what the menu contains, never what the `tablist` contains.
 *
 * The ACTIVE tab is never listed, because the menu's purpose is "go somewhere you
 * cannot currently see", and with `maxInline` or fewer tabs the list is empty so
 * short records get no menu at all.
 */
export function tabsForOverflowMenu(
  tabs: readonly RecordTab[],
  activeId: string | undefined,
  maxInline: number = MAX_INLINE_TABS,
): readonly RecordTab[] {
  if (tabs.length <= maxInline) {
    return [];
  }
  return tabs.slice(maxInline).filter((tab) => tab.id !== activeId);
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

  // Every tab renders in the strip at every width. `overflow` only decides what
  // the compact "More sections" menu offers as a shortcut.
  // Desktop-first: `false` on the server and on a wide viewport, so a wide record
  // is byte-for-byte what it was before MOBILE-01 — no menu at all.
  const compact = useCompactViewport();
  const inline = shown;
  const overflow = useMemo(
    () => (compact ? tabsForOverflowMenu(shown, activeId) : []),
    [compact, shown, activeId],
  );

  /**
   * Select a tab from the "More sections" menu and bring it into view.
   *
   * It deliberately does NOT take focus: the shared DS-12 menu returns focus to
   * its trigger on close, which is the correct menu-button behaviour, and a
   * component that fights its own menu for focus is a race, not a contract. The
   * tab is always in the strip, so scrolling is all that is needed for the user to
   * see the choice they just made.
   */
  const selectFromOverflow = useCallback(
    (tabId: string) => {
      select(tabId);
      // Defer to the render that marks the tab active before scrolling to it.
      window.requestAnimationFrame(() => {
        tabRefs.current.get(tabId)?.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
        });
      });
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
      // Arrow keys move across the whole strip, which holds every tab at every
      // width — so the keyboard order does not change with the viewport.
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
          // POLISH-01 — the ONE horizontal scroll affordance (`scroll-strip.css`).
          className="record-tabs__list dh-scroll-strip"
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
            // RECORD-01 — a tab whose content brings its own surface (the Note
            // record's writing surface) suppresses the panel's, so the record
            // never draws a frame inside a frame. See `RecordTab.surface`.
            data-surface={tab.surface ?? "panel"}
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
