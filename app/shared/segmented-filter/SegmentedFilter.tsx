/**
 * DS-07-adjacent — a restrained, accessible segmented state filter.
 *
 * A calm alternative to the full DS-07 clause-builder `FilterBar` for a SINGLE
 * mutually-exclusive, server-side state (e.g. Open / Completed / Archived, or
 * Active / Deleted). Originally built for Projects (PROJ-01) and promoted here
 * unchanged when Notes (NOTES-01C) needed the identical Active/Deleted pattern —
 * DESIGN_SYSTEM.md's "add an affordance to the ONE shared system, never fork per
 * module" rule.
 *
 * It is a group of client-navigation links (deep-linkable, shareable, Back/
 * Forward correct), so it needs no JavaScript to work and marks the active
 * option with `aria-current`. Unrelated params (including the DS-03 `drawer`
 * stack) are preserved.
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
