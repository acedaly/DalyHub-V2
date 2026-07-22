/**
 * PROJ-01 — a restrained, accessible segmented state filter.
 *
 * A calm alternative to the DS-07 clause-builder for a SINGLE mutually-exclusive,
 * server-side state (Open / Completed / All). The full DS-07 `FilterBar` is designed
 * for multi-field, composable filtering; a three-way state toggle is served better —
 * and more calmly — by a segment that reads and writes one URL parameter and is
 * translated to the bounded query server-side. Richer, composable project filtering
 * (health, area, goal, dates) arrives with PROJ-02; this stays deliberately small.
 *
 * It is a group of client-navigation links (deep-linkable, shareable, Back/Forward
 * correct), so it needs no JavaScript to work and marks the active option with
 * `aria-current`. Unrelated params (including the DS-03 `drawer` stack) are preserved.
 */

import { Link, useSearchParams } from "react-router";

export interface SegmentedFilterOption {
  readonly value: string;
  readonly label: string;
}

interface SegmentedFilterProps {
  /** The URL search parameter this segment controls (e.g. "state"). */
  readonly param: string;
  /** The options, in order. The first is the default (rendered when absent). */
  readonly options: readonly SegmentedFilterOption[];
  /** The currently-active value. */
  readonly value: string;
  /** Accessible group label (e.g. "Filter projects"). */
  readonly label: string;
}

export function SegmentedFilter({
  param,
  options,
  value,
  label,
}: SegmentedFilterProps) {
  const [searchParams] = useSearchParams();
  const defaultValue = options[0]?.value;

  const hrefFor = (optionValue: string): string => {
    const next = new URLSearchParams(searchParams);
    if (optionValue === defaultValue) {
      next.delete(param);
    } else {
      next.set(param, optionValue);
    }
    const query = next.toString();
    return query.length > 0 ? `?${query}` : "?";
  };

  return (
    <div className="dh-segmented" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Link
            key={option.value}
            to={hrefFor(option.value)}
            replace
            preventScrollReset
            className="dh-segmented__option"
            aria-current={active ? "true" : undefined}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
