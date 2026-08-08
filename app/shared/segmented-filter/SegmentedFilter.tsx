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
    <ViewSwitcher
      param={param}
      options={options}
      value={value}
      label={label}
      /*
       * RECORD-01 — a filter is SUBORDINATE to the tabs above it.
       *
       * A record's tab strip answers "where am I in this record"; a segmented
       * filter answers "which subset of this tab". Rendered at the view
       * switcher's full weight — a heavy outlined 44px container with a filled
       * selected segment — the filter was the loudest thing in the panel, and
       * on the Project record it read as a second, competing row of tabs
       * directly under the real ones.
       *
       * The variant changes WEIGHT only: same anatomy, same one implementation,
       * same 44px target, same check glyph, same keyboard behaviour. Applied
       * here rather than per caller because it follows from what a filter IS,
       * so no module can reintroduce a tab-weight filter by forgetting a prop.
       */
      className="dh-segmented--subtle"
    />
  );
}
