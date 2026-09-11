/**
 * UIX-02 — the shared view TAB RAIL.
 *
 * A lightweight destination rail: text with a 2px indicator under the current
 * one. It is what the redesign reference draws above both Projects and Tasks,
 * and it is what a DESTINATION looks like — each tab changes which records the
 * page shows, so each is an ordinary link to the URL that IS that view.
 *
 * ── Why this exists beside `ViewSwitcher` ────────────────────────────────────
 *
 * `ViewSwitcher` is the M3 SEGMENTED control: an outlined 44px capsule with a
 * filled selected segment and a check glyph. It is the right object for a
 * bounded either/or that lives inside a toolbar, and UIQ-013 was right to
 * consolidate seven bespoke controls onto it.
 *
 * It is the wrong object directly beneath a page title. At the top of a
 * collection the segmented control is the heaviest thing on the calmest band of
 * the screen — a filled chip, a hairline box and inter-segment dividers to say
 * "one of these four" — and the reference draws that band as text. Tasks
 * already had the rail (UIX-01, in `tasks.css`, scoped to Tasks); UIX-02 makes
 * it shared rather than copying it into a second module.
 *
 * Both remain: a rail for a collection's PRINCIPAL mode under its title, a
 * segmented control for a bounded state toggle inside content. What is gone is
 * the third and fourth ways of drawing either.
 *
 * ── UNTITLED-04 — the rail IS Untitled's `application/tabs` ──────────────────
 *
 * `type="underline"`, over React Aria, which is where the roving tabindex, the
 * arrow keys and `aria-selected` now come from. Each tab keeps its `href`, so
 * the URL contract is untouched: middle-click, "copy link address" and
 * Back/Forward behave exactly as they did, and React Aria routes the click
 * through the app's `RouterProvider`.
 *
 * ── Behaviour ────────────────────────────────────────────────────────────────
 *
 * Targets are derived from ONE search param, preserving every unrelated param
 * — including the DS-03 `drawer` stack — so opening a record and changing the
 * view compose instead of clobbering each other.
 */

import { useLocation, useSearchParams } from "react-router";

import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "~/shared/ui/untitled/application/tabs/tabs";

export type ViewTabOption = {
  readonly value: string;
  readonly label: string;
  /**
   * CAL-02 — an explicit destination PATH, for a rail whose tabs are different
   * routes rather than different values of one search param.
   *
   * Today / Tomorrow / Next 7 days are three pages, not three readings of one
   * collection, so the rail that names them has to link to paths. Added here
   * rather than as a second rail component: the object is identical — text with
   * an indicator under the current one, `aria-current="page"`, native link
   * keyboard behaviour — and only where it points differs. When `to` is present
   * `param`/`value` are ignored for that tab.
   */
  readonly to?: string;
};

export type ViewTabsProps = {
  /**
   * The search param the rail drives (e.g. `state`). Ignored by tabs that
   * supply their own `to` path.
   */
  readonly param: string;
  readonly options: readonly ViewTabOption[];
  /** The active value, already resolved by the caller from the URL. */
  readonly value: string;
  /** The rail's accessible name — "Project views". */
  readonly label: string;
  /**
   * The value that means "no param". Selecting it REMOVES the param rather than
   * writing it, so the collection's default URL stays clean and shareable.
   */
  readonly defaultValue?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function ViewTabs({
  param,
  options,
  value,
  label,
  defaultValue,
  className,
  "data-testid": testId,
}: ViewTabsProps) {
  const [searchParams] = useSearchParams();
  // An ABSOLUTE target — see `ViewSwitcher` for why a rail states its own path.
  const { pathname } = useLocation();

  const targets = options.map((option) => {
    const next = new URLSearchParams(searchParams);
    if (defaultValue !== undefined && option.value === defaultValue) {
      next.delete(param);
    } else {
      next.set(param, option.value);
    }
    // A view change starts a new page of results, so any accumulated keyset
    // cursor must not be carried across into a different scope.
    next.delete("cursor");
    const query = next.toString();
    return {
      option,
      to: option.to ?? (query.length > 0 ? `${pathname}?${query}` : pathname),
    };
  });

  // Adapted from Untitled UI React `application/tabs` (`type="underline"`),
  // the rail Untitled's Application UI dashboards draw above a collection.
  // Changes: DalyHub URL-backed view values, so each tab stays a real link.
  return (
    <Tabs
      selectedKey={value}
      // The rail scrolls INSIDE itself rather than widening the document; see
      // `ViewSwitcher` for the same reasoning.
      className={["w-auto max-w-full overflow-x-auto", className]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      data-untitled-source="application/tabs:underline"
    >
      <TabList type="underline" size="sm" aria-label={label}>
        {targets.map(({ option, to }) => (
          <Tab
            key={option.value}
            id={option.value}
            href={to}
            /*
             * UNTITLED-04 — the phone TOUCH FLOOR, restored.
             *
             * `view-tabs.css` pinned the rail at `--app-touch-target-min` on a
             * phone and the floor went with the stylesheet. Untitled's
             * underline tab is 32px, which is the right proportion on a fine
             * pointer and half a thumb on a narrow screen — and this rail is
             * the collection's primary navigation there. Stated on the WIDTH,
             * like the rule it replaces, because a 320px viewport is the case
             * that matters whether or not the pointer reports as coarse.
             */
            className={"max-md:min-h-[var(--app-touch-target-min)] max-md:px-4"}
          >
            {option.label}
          </Tab>
        ))}
      </TabList>
      {/*
       * The panel a tab CONTROLS is the collection below, which is a separate
       * document at a separate URL — so each tab gets a visually hidden panel
       * naming the view instead. ARIA's tab pattern wants a panel for every
       * tab; without one the rail would be a tablist that controls nothing.
       * Same treatment as the Tasks saved-view rail.
       */}
      {targets.map(({ option }) => (
        <TabPanel key={option.value} id={option.value} className="sr-only">
          {option.value === value ? `Viewing ${option.label}` : option.label}
        </TabPanel>
      ))}
    </Tabs>
  );
}
