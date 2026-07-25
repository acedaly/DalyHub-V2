/**
 * DIARY-01 — the restrained, URL-backed entry-type filter.
 *
 * A calm, single-select segment for one server-side facet (entry type), in the
 * spirit of the Projects module's `SegmentedFilter`: the full DS-07 clause
 * builder is designed for multi-field composable filtering, whereas navigating a
 * growing chronological history by type is served better — and more calmly — by a
 * compact segment that reads and writes ONE URL parameter and is translated to
 * the kernel's bounded `entryTypes` query server-side. (When NOTES-01C's shared
 * segmented-filter extraction lands, this can adopt it; until then it stays a
 * small, module-local control so this slice does not depend on in-flight work.)
 *
 * It is a group of client-navigation links (deep-linkable, shareable,
 * Back/Forward correct) that need no JavaScript, mark the active option with
 * `aria-current`, and DROP the `cursor` param so changing the filter scope resets
 * pagination. "All" clears the filter. Unrelated params (including the DS-03
 * `drawer` stack) are preserved.
 */

import { Link, useSearchParams } from "react-router";

import { entryTypeOptions } from "./diary-view";

export interface DiaryTypeFilterProps {
  /** The active entry type, or null when unfiltered ("All"). */
  readonly activeType: string | null;
}

export function DiaryTypeFilter({ activeType }: DiaryTypeFilterProps) {
  const [searchParams] = useSearchParams();
  const options = entryTypeOptions();

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
      <span className="dh-diary-filter__label" aria-hidden="true">
        Type
      </span>
      <div className="dh-diary-filter__options">
        <Link
          to={hrefFor(null)}
          replace
          preventScrollReset
          className="dh-diary-filter__option"
          aria-current={activeType === null ? "true" : undefined}
        >
          All
        </Link>
        {options.map((option) => (
          <Link
            key={option.value}
            to={hrefFor(option.value)}
            replace
            preventScrollReset
            className="dh-diary-filter__option"
            aria-current={activeType === option.value ? "true" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
