/**
 * DS-02 — the record Tabs (tablist + panels), with the MOBILE-01 overflow menu.
 *
 * ── UNTITLED-04 — the strip is Untitled's `application/tabs` ─────────────────
 *
 * The WAI-ARIA tabs behaviour this file used to implement by hand — `tablist` /
 * `tab` / `tabpanel`, roving `tabindex`, arrow keys with Home/End, wrapping,
 * skipping disabled tabs, `aria-selected`, the tab↔panel association — is now
 * React Aria's, through the genuine vendored Untitled `Tabs`, `TabList`, `Tab`
 * and `TabPanel` (`type="underline"`). That is the single largest piece of
 * hand-rolled accessibility in the shared layout, and it is exactly what the
 * library is for.
 *
 * `keyboardActivation="automatic"` is set deliberately: Untitled's default is
 * manual (arrow moves focus, Enter selects) and DalyHub's record tabs have
 * always activated on focus. Both are valid ARIA; changing it would change the
 * behaviour of every record in the product, which is not this migration's job.
 *
 * What stays DalyHub's, because Untitled has no opinion about it:
 *
 * **Overflow (MOBILE-01).** On a PHONE, a five-, six- or seven-tab record turns
 * the strip into a swipe-hunt where the tab you want is always just off-screen.
 * So at compact viewports a record with more than {@link MAX_INLINE_TABS} tabs
 * grows a labelled "More sections" menu offering the surplus tabs directly.
 *
 * The menu is an ACCELERATOR, not a replacement: **every tab stays in the
 * `tablist`**, and the strip scrolls. That is deliberate. Removing tabs from the
 * strip would mean a tab that exists at 1440px does not exist at 375px — the
 * keyboard order and every deep link would differ by viewport, and a control the
 * rest of the product can address by role would silently vanish on a phone.
 *
 * Three rules keep that honest:
 *   - nothing is hidden at any width — Activity and Settings remain tabs, and are
 *     additionally one tap away in the menu;
 *   - every tab keeps its deep link, URL state and keyboard position;
 *   - selecting from the menu scrolls the strip to the tab it activates.
 *
 * The menu button sits OUTSIDE the `tablist` (a tablist may contain only tabs) and
 * reuses the ONE shared DS-12 overflow menu.
 *
 * **Lazy panels.** Only the selected tab's content is mounted. A record's
 * Activity, Knowledge and Evidence tabs each perform their own reads on mount,
 * so force-mounting every panel would turn opening a record into seven requests.
 * React Aria renders exactly the selected panel, which is the behaviour this
 * component already had.
 *
 * **The panel surface.** `RecordTab.surface` decides whether the panel draws the
 * contained record surface or gets out of the way for content that brings its
 * own (the Note record's writing surface).
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";

import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "~/shared/ui/untitled/application/tabs/tabs";
import { useCompactViewport } from "~/shared/viewport";

import type { RecordTab, RecordTabsProps } from "./types";

/**
 * How many tabs a compact record shows before it also offers a "More sections"
 * menu. Four is the point at which a phone tab strip stops being scannable. At or
 * below it the strip simply scrolls, as DS-02 always did, and no menu appears.
 */
export const MAX_INLINE_TABS = 4;

/** The `selectedKey` that means "no tab is active" — see the note at its use. */
const NO_ACTIVE_TAB = "__dh-no-active-tab__";

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

  /*
   * The strip element, so the overflow menu can scroll a tab into view.
   *
   * A ref per tab is not available: upstream's `Tab` is a plain function
   * component and React Aria's `TabProps` declares no `ref`, so the tab is
   * addressed by the `data-tab-id` it carries instead. One lookup, on a
   * container this component already owns.
   */
  const stripRef = useRef<HTMLDivElement | null>(null);

  const select = useCallback(
    (tabId: string) => {
      if (!isControlled) {
        setUncontrolledId(tabId);
      }
      onTabChange?.(tabId);
    },
    [isControlled, onTabChange],
  );

  // Every tab renders in the strip at every width. `overflow` only decides what
  // the compact "More sections" menu offers as a shortcut.
  // Desktop-first: `false` on the server and on a wide viewport, so a wide record
  // is byte-for-byte what it was before MOBILE-01 — no menu at all.
  const compact = useCompactViewport();
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
        stripRef.current
          ?.querySelector(`[data-tab-id="${CSS.escape(tabId)}"]`)
          ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
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

  const disabledKeys = useMemo(
    () => shown.filter((tab) => tab.disabled === true).map((tab) => tab.id),
    [shown],
  );

  // Only a genuinely empty (all-hidden) tab set collapses the strip. If tabs are
  // present but ALL disabled, `activeId` is undefined — we still render the
  // disabled tabs (per the contract that disabled tabs stay visible) with no
  // active panel, rather than hiding the record's sections entirely.
  if (shown.length === 0) {
    return null;
  }

  const activeTab = shown.find((tab) => tab.id === activeId);

  return (
    <Tabs
      className="record-tabs flex w-full flex-col gap-4"
      // DalyHub's record tabs have always activated on focus. See the note above.
      keyboardActivation="automatic"
      /*
       * A record whose tabs are ALL disabled has no active tab, and the strip
       * still renders — sections are never hidden. React Aria selects the first
       * key when it is left uncontrolled, so the absence is stated explicitly
       * with a key no tab carries.
       */
      selectedKey={activeId ?? NO_ACTIVE_TAB}
      disabledKeys={disabledKeys}
      onSelectionChange={(key) => select(String(key))}
      data-untitled-source="application/tabs:underline"
    >
      {/* The strip wraps the tablist and the overflow trigger so the trigger
          stays pinned while the tablist scrolls. The trigger is deliberately
          OUTSIDE the tablist — a tablist may contain only tabs. */}
      <div ref={stripRef} className="record-tabs__strip flex items-end gap-2">
        <TabList
          type="underline"
          size="sm"
          aria-label={label}
          // POLISH-01 — the ONE horizontal scroll affordance (`scroll-strip.css`).
          className="record-tabs__list dh-scroll-strip min-w-0 flex-1"
        >
          {shown.map((tab) => {
            const selected = tab.id === activeId;
            return (
              <Tab
                key={tab.id}
                id={tab.id}
                /*
                 * UNTITLED-05 — the phone TOUCH FLOOR, on the WIDTH.
                 *
                 * Untitled's underline tab is 32px, which is the right
                 * proportion on a fine pointer and three-quarters of a thumb on
                 * a narrow screen. UNTITLED-04 stated the floor in
                 * `record-layout.css` under `@media (hover: none)`, nested in a
                 * container query — and `project-activity.spec.ts` resizes the
                 * viewport WITHOUT emulating touch, so neither condition
                 * matched and the Activity tab measured 32px against the
                 * repository's 44px floor. A 320px viewport is the case that
                 * matters whether or not the pointer reports as coarse, which
                 * is how `ViewTabs` and `ViewSwitcher` already state it.
                 * The desktop height is untouched.
                 */
                className="record-tab shrink-0 max-md:min-h-[var(--app-touch-target-min)]"
                // A non-colour hook for the active tab, so "which section am I
                // in?" is never answered by the underline's colour alone.
                // Spread because upstream's `Tab` props do not declare an index
                // signature for `data-*`, and the vendored file is regenerated.
                {...({
                  "data-tab-id": tab.id,
                  "data-active": selected ? "true" : "false",
                  "data-disabled": tab.disabled ? "true" : "false",
                } as Record<string, string>)}
              >
                <span className="record-tab__label">{tab.label}</span>
                {tab.badge !== undefined && tab.badge !== null && (
                  <span
                    className="record-tab__badge rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary tabular-nums"
                    aria-hidden="true"
                  >
                    {tab.badge}
                  </span>
                )}
              </Tab>
            );
          })}
        </TabList>

        {overflowItems.length > 0 ? (
          <OverflowMenu
            items={overflowItems}
            label={`More sections in ${label}`}
            triggerClassName="record-tabs__more"
            data-testid="record-tabs-more"
          />
        ) : null}
      </div>

      {/*
       * Exactly the SELECTED panel is mounted — see the note above about a
       * record's tabs each performing their own reads.
       */}
      {activeTab !== undefined ? (
        <TabPanel
          key={activeTab.id}
          id={activeTab.id}
          /*
           * The active panel is the record's working surface: Untitled's
           * bounded card boundary, the same one the migrated collection tables
           * and Project cards carry, so the header, strip and content read as
           * one deliberate record workspace instead of the content dissolving
           * into the page canvas.
           *
           * `surface="plain"` suppresses it for content that already IS a
           * surface — the Note record's writing surface draws ONE outline
           * around its toolbar and its text, and a panel around that is a frame
           * inside a frame with two left edges 21px apart.
           */
          className={
            (activeTab.surface ?? "panel") === "plain"
              ? "record-tabs__panel min-w-0"
              : "record-tabs__panel min-w-0 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary max-md:p-4"
          }
          // RECORD-01 — a tab whose content brings its own surface (the Note
          // record's writing surface) suppresses the panel's, so the record
          // never draws a frame inside a frame. See `RecordTab.surface`.
          data-surface={activeTab.surface ?? "panel"}
          data-prefix={prefix}
        >
          {activeTab.content}
        </TabPanel>
      ) : null}
    </Tabs>
  );
}
