/**
 * DS-07-adjacent — a restrained, accessible segmented state FILTER.
 *
 * The same M3 segmented-button anatomy as the shared view switcher — it renders
 * through `~/shared/view-switcher`, so there is exactly ONE implementation of
 * the control — kept as its own named entry because the SEMANTIC is different
 * (UIQ-013's documented view-vs-filter distinction):
 *
 *   - A **view switcher** changes the collection's presentation or principal
 *     mode and lives in the Pane Header's `viewSwitcher` slot. Use
 *     `ViewSwitcher` directly.
 *   - A **segmented filter** narrows the data subset shown INSIDE a surface —
 *     a record tab's Open/All tasks toggle — and lives beside the content it
 *     filters, never in the collection header.
 *
 * It is a group of client-navigation links driven by one URL search param
 * (deep-linkable, shareable, Back/Forward correct, no JavaScript required),
 * marking the active option with `aria-current`. Unrelated params (including
 * the DS-03 `drawer` stack) are preserved.
 */

import { ViewSwitcher } from "~/shared/view-switcher";

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
  /** Accessible group label (e.g. "Filter tasks"). */
  readonly label: string;
}

export function SegmentedFilter({
  param,
  options,
  value,
  label,
}: SegmentedFilterProps) {
  return (
    <ViewSwitcher param={param} options={options} value={value} label={label} />
  );
}
