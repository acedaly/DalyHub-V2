/**
 * UNTITLED-04 — Untitled's table head, with an accessible NAME.
 *
 * ── What upstream does, and why it is not enough ─────────────────────────────
 *
 * `application/table`'s `TableCard`/`Table.Head` renders its label inside an
 * `AriaGroup` for layout — a `role="group"`. A `columnheader` takes its name
 * from its CONTENTS, and the accessible-name algorithm does not descend into a
 * child whose role does not itself support name-from-content: `group` is one of
 * those. So every column in the Projects table drew its heading and announced
 * nothing, and a screen reader reading a cell ("Kitchen fit-out, 38%") got the
 * value with no column to hang it on.
 *
 * Measured in Chromium: `getByRole("columnheader", { name: "Progress" })`
 * resolved to zero elements against a `<th>` whose visible text is "Progress".
 *
 * ── What this changes, and what it deliberately does not ─────────────────────
 *
 * The label moves OUT of the group and the group keeps only what it is for —
 * the tooltip and the sort affordance, neither of which should be part of the
 * column's name. Every class is upstream's, copied rather than reinvented, so
 * the head is pixel-identical. Sorting, focus behaviour, selection and the
 * `TableContext` size are React Aria's and Untitled's, untouched.
 *
 * This lives in `overrides/` rather than as an edit to the vendored file
 * because `scripts/vendor-untitled.mjs` regenerates that file on every sync.
 */

import type { ReactNode } from "react";

import { Column as AriaColumn } from "react-aria-components";
import type { ColumnProps as AriaColumnProps } from "react-aria-components";

import { cx } from "~/shared/ui/untitled/utils/cx";

export interface LabelledTableHeadProps
  extends Omit<AriaColumnProps, "children" | "className"> {
  /** The column's heading. Drawn, and the column's accessible name. */
  readonly label: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function LabelledTableHead({
  label,
  className,
  children,
  ...props
}: LabelledTableHeadProps) {
  return (
    <AriaColumn
      {...props}
      className={cx(
        "relative p-0 px-6 py-2 outline-hidden focus-visible:z-1 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-bg-primary focus-visible:ring-inset",
        className,
      )}
    >
      {/*
       * Directly in the header, with no `group` between it and the `<th>`, so
       * the name-from-content algorithm reaches it.
       */}
      <span className="text-xs font-semibold whitespace-nowrap text-quaternary">
        {label}
      </span>
      {children}
    </AriaColumn>
  );
}
