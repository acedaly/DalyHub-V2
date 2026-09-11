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
 * ── UNTITLED-05 — Untitled's LOOK, navigation's SEMANTICS ────────────────────
 *
 * The rail takes `application/tabs`'s `type="underline"` appearance through
 * `overrides/link-tab-rail`, and stays a labelled `navigation` landmark of
 * ordinary anchors with `aria-current="page"` on the current one.
 *
 * UNTITLED-04 built it on `application/tabs` itself, which made every option a
 * `role="tab"`. ARIA's tab pattern requires each tab to control a `tabpanel`,
 * and the thing this rail selects is a COLLECTION the router renders elsewhere
 * in the document, across a route boundary this component does not own. The
 * panel each tab got was therefore a visually hidden placeholder reading
 * "Viewing …" — syntactically valid `aria-controls` pointing at the wrong
 * content. That is worse than the dangling reference it replaced, and this
 * component is shared, so it propagated product-wide. The override's header
 * carries the full reasoning.
 *
 * The URL contract is untouched either way: middle-click, "copy link address"
 * and Back/Forward behave exactly as they always have.
 *
 * ── Behaviour ────────────────────────────────────────────────────────────────
 *
 * Targets are derived from ONE search param, preserving every unrelated param
 * — including the DS-03 `drawer` stack — so opening a record and changing the
 * view compose instead of clobbering each other.
 */

import { Link, useLocation, useSearchParams } from "react-router";

import {
  LinkTabContent,
  linkTabClassName,
  linkTabRailClassName,
} from "~/shared/ui/untitled/overrides/link-tab-rail";

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

  // Untitled UI React `application/tabs` (`type="underline"`) is the rail
  // Untitled's Application UI dashboards draw above a collection. Its
  // appearance, through `overrides/link-tab-rail`; its `role="tab"` semantics
  // deliberately not, because these options navigate. See the file header.
  return (
    <nav
      aria-label={label}
      // The rail scrolls INSIDE itself rather than widening the document; see
      // `ViewSwitcher` for the same reasoning.
      className={linkTabRailClassName(
        "underline",
        ["w-auto max-w-full overflow-x-auto", className]
          .filter(Boolean)
          .join(" "),
      )}
      data-testid={testId}
      data-untitled-source="application/tabs:underline"
    >
      {targets.map(({ option, to }) => (
        <Link
          key={option.value}
          to={to}
          aria-current={option.value === value ? "page" : undefined}
          className={linkTabClassName("underline")}
        >
          <LinkTabContent>{option.label}</LinkTabContent>
        </Link>
      ))}
    </nav>
  );
}
