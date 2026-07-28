/**
 * DIARY-01 / DIARY-01B — the compact, URL-backed entry-type filter.
 *
 * A calm, single-select row of type chips for one server-side facet (entry type).
 * The full DS-07 clause builder is designed for multi-field composable filtering,
 * whereas navigating a chronological history by type is served better — and more
 * calmly — by a compact control that reads and writes ONE URL parameter, translated
 * to the kernel's bounded `entryTypes` query server-side.
 *
 * This stays module-local rather than adopting the shared `SegmentedFilter` because
 * it must DROP the scope-bound pagination `cursor` when the filter changes — the
 * shared control preserves every other param and would carry a now-invalid cursor
 * into the new scope — and because it presents an OPEN-vocabulary entry TYPE as chips
 * rather than a few mutually-exclusive lifecycle states. See DIARY_MODULE.md §7.4.
 *
 * It is a group of client-navigation links (deep-linkable, shareable, Back/Forward
 * correct) that need no JavaScript, mark the active option with `aria-current`, and
 * DROP the `cursor` param so changing the filter scope resets pagination. "All"
 * clears the filter. Counts render only when they are derived from fully-loaded,
 * unfiltered data (passed by the loader); otherwise the chips show labels alone. The
 * row scrolls horizontally at narrow widths rather than wrapping into a large block.
 */

import { Link, useSearchParams } from "react-router";

import { SubtypeIcon } from "~/shared/entity";

import { entryTypeOptions } from "./diary-view";

export interface DiaryTypeFilterProps {
  /** The active entry type, or null when unfiltered ("All"). */
  readonly activeType: string | null;
  /**
   * Per-type loaded counts, or null when counts would be dishonest (paginated or
   * already type-filtered). When present, each chip shows its real loaded count.
   */
  readonly typeCounts: Readonly<Record<string, number>> | null;
}

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
    <div className="dh-diary-filter" role="group" aria-label="Filter by type">
      <div className="dh-diary-filter__scroll">
        <Link
          to={hrefFor(null)}
          replace
          preventScrollReset
          className="dh-diary-filter__option"
          aria-current={activeType === null ? "true" : undefined}
        >
          <span className="dh-diary-filter__text">All</span>
          {totalCount !== null ? (
            <span className="dh-diary-filter__count">{totalCount}</span>
          ) : null}
        </Link>
        {options.map((option) => {
          const count = typeCounts?.[option.value];
          return (
            <Link
              key={option.value}
              to={hrefFor(option.value)}
              replace
              preventScrollReset
              className="dh-diary-filter__option"
              aria-current={activeType === option.value ? "true" : undefined}
            >
              {/* PX-05: the SAME subtype glyph the capture picker and the timeline
               * node show — the chips were the one Diary surface that omitted it.
               * Decorative; the label beside it carries the meaning. */}
              <SubtypeIcon
                entityType="diary"
                subtype={option.value}
                className="dh-diary-filter__icon"
              />
              <span className="dh-diary-filter__text">{option.label}</span>
              {count !== undefined ? (
                <span className="dh-diary-filter__count">{count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
