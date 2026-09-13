/**
 * DIARY-01 / DIARY-01B — the compact, URL-backed entry-type filter.
 *
 * A calm, single-select row of type options for one server-side facet (entry
 * type). The full DS-07 clause builder is designed for multi-field composable
 * filtering, whereas navigating a chronological history by type is served better
 * — and more calmly — by a compact control that reads and writes ONE URL
 * parameter, translated to the kernel's bounded `entryTypes` query server-side.
 *
 * It is a group of client-navigation links (deep-linkable, shareable,
 * Back/Forward correct) that need no JavaScript, mark the active option with
 * `aria-current`, and DROP the `cursor` param so changing the filter scope resets
 * pagination. "All" clears the filter. Counts render only when they are derived
 * from fully-loaded, unfiltered data (passed by the loader); otherwise the
 * options show labels alone. The row scrolls horizontally at narrow widths rather
 * than wrapping into a large block.
 *
 * ── Why not the shared `ViewSwitcher` ───────────────────────────────────────
 *
 * Because a VIEW is not a FILTER, which is that component's own first rule. The
 * switcher selects a collection's principal MODE — here, Day or Timeline, which
 * `DiaryModeTabs` does use it for. This narrows the record subset WITHIN the
 * current mode, it composes with the selected day, it carries an OPEN vocabulary
 * (a custom entry type is a valid type), and it shows a per-option count. It
 * belongs in the filter row, and it is its own control.
 *
 * ── UNTITLED-12: the APPEARANCE is Untitled's, the semantics are navigation ──
 *
 * The options were `.dh-diary-filter__option` over `md-state-layer` — the M3
 * `currentColor` wash that Phase 5 took off the button, UNTITLED-11 took off the
 * icon button, and this pass takes off the editor's toolbar. Diary was one of
 * only three module surfaces still hosting it.
 *
 * They take `overrides/link-tab-rail`'s `underline` treatment now — the exact
 * class strings from `application/tabs`'s `getHorizontalStyles`, `sizes` and
 * `getTabStyles`, expressed as variants a plain anchor can reach — and each
 * option's count is the genuine Untitled `Badge` that upstream's `Tab` renders
 * for exactly this. What the override deliberately does NOT take is `role="tab"`:
 * these options navigate, and the chronology each one selects is rendered
 * elsewhere in the document, so there is no `tabpanel` here that could hold it.
 * A labelled group of anchors with `aria-current` is what this control always
 * was, and it stays that.
 */

import { Link, useSearchParams } from "react-router";

import { SubtypeIcon } from "~/shared/entity";
import { Badge } from "~/shared/ui";
import {
  LinkTabContent,
  linkTabClassName,
  linkTabRailClassName,
} from "~/shared/ui/untitled/overrides/link-tab-rail";

import { entryTypeOptions } from "./diary-view";

export interface DiaryTypeFilterProps {
  /** The active entry type, or null when unfiltered ("All"). */
  readonly activeType: string | null;
  /**
   * Per-type loaded counts, or null when counts would be dishonest (paginated or
   * already type-filtered). When present, each option shows its real loaded count.
   */
  readonly typeCounts: Readonly<Record<string, number>> | null;
}

/**
 * The rail is a horizontal SCROLLER on a narrow viewport, so the shared strip
 * class is given the overflow rules upstream has no opinion about: a tab rail in
 * Untitled's own examples never holds ten options.
 */
const RAIL = linkTabRailClassName(
  "underline",
  "min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
);

/**
 * One option.
 *
 * `shrink-0` is the rail's, not upstream's, and it is load-bearing: a tab is a
 * flex item, a flex item shrinks by default, and this rail holds ten of them
 * inside a horizontal SCROLLER. MEASURED at 393px without it, every option
 * compressed to 45px while its own `whitespace-nowrap` kept the text at full
 * width, so ten labels overprinted each other into an unreadable smear.
 * Untitled's own rails never hold enough options to meet the case.
 */
const OPTION = linkTabClassName(
  "underline",
  "dh-diary-filter__option shrink-0",
);

export function DiaryTypeFilter({
  activeType,
  typeCounts,
}: DiaryTypeFilterProps) {
  const [searchParams] = useSearchParams();
  const options = entryTypeOptions();

  const totalCount =
    typeCounts === null
      ? null
      : Object.values(typeCounts).reduce((sum, n) => sum + n, 0);

  const hrefFor = (type: string | null): string => {
    const next = new URLSearchParams(searchParams);
    // Changing the filter scope resets pagination: a cursor issued for the old
    // scope is invalid for the new one, so it must not survive the navigation.
    next.delete("cursor");
    next.delete("type");
    if (type !== null) next.set("type", type);
    const query = next.toString();
    return query.length > 0 ? `?${query}` : "?";
  };

  return (
    <div
      className="dh-diary-filter min-w-0"
      role="group"
      aria-label="Filter by type"
    >
      <div className={`dh-diary-filter__scroll ${RAIL}`}>
        <Link
          to={hrefFor(null)}
          replace
          preventScrollReset
          className={OPTION}
          aria-current={activeType === null ? "page" : undefined}
        >
          <LinkTabContent>
            <span className="dh-diary-filter__text">All</span>
            {totalCount !== null ? (
              <Badge tone="neutral" className="dh-diary-filter__count">
                {totalCount}
              </Badge>
            ) : null}
          </LinkTabContent>
        </Link>
        {options.map((option) => {
          const count = typeCounts?.[option.value];
          return (
            <Link
              key={option.value}
              to={hrefFor(option.value)}
              replace
              preventScrollReset
              className={OPTION}
              aria-current={activeType === option.value ? "page" : undefined}
            >
              <LinkTabContent>
                {/* PX-05: the SAME subtype glyph the capture picker and the
                 * timeline row show — the options were the one Diary surface
                 * that omitted it. Decorative; the label beside it carries the
                 * meaning. */}
                <SubtypeIcon
                  entityType="diary"
                  subtype={option.value}
                  className="dh-diary-filter__icon size-4 shrink-0"
                />
                <span className="dh-diary-filter__text">{option.label}</span>
                {count !== undefined ? (
                  <Badge tone="neutral" className="dh-diary-filter__count">
                    {count}
                  </Badge>
                ) : null}
              </LinkTabContent>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
