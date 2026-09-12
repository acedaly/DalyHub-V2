/**
 * UNTITLED-09 — Untitled's `SectionLabel.Root`, with a heading LEVEL.
 *
 * A DalyHub OVERRIDE, not vendored source: `scripts/vendor-untitled.mjs` never
 * writes into this directory. It exists for the same reason
 * `labelled-progress-bar` does — upstream is so nearly right, and wrong in
 * exactly one respect for this product.
 *
 * Upstream renders `<h3>` unconditionally. That is fine on a marketing page or a
 * settings form whose surrounding document happens to put an `h2` above it, and
 * it is an actual WCAG 2.2 failure on a DalyHub RECORD: a record's own title is
 * the `h1`, its tab panel introduces no heading of its own, and an `h3` directly
 * beneath an `h1` skips a level. Axe reports it as "Heading order invalid", and
 * it is a real defect rather than a strict rule — a screen-reader user walking
 * the page by heading is told there is a missing rank between the record and its
 * sections.
 *
 * Everything visual is upstream's, copied from
 * `application/section-headers/section-label.tsx`: the two size ramps, the
 * secondary heading role, the tertiary description, the required asterisk and
 * the tooltip trigger. The addition is `level`.
 *
 * The tooltip arm is deliberately NOT reproduced. No DalyHub caller uses it, and
 * a second copy of upstream's tooltip composition would be a second thing to
 * keep in step; a caller that needs one should use `SectionLabel.Root` and live
 * inside an `h2`.
 */

import type { ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

const styles = {
  sm: {
    heading: "text-sm font-semibold gap-0.5",
    subheading: "text-sm",
  },
  md: {
    heading: "text-md font-semibold gap-1",
    subheading: "text-md",
  },
} as const;

export interface SectionHeadingProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly size?: "sm" | "md";
  /**
   * The heading rank. Pick it from the DOCUMENT, not from the look: a section
   * directly inside a record (whose title is the `h1`) is an `h2`.
   */
  readonly level?: 2 | 3 | 4;
  readonly isRequired?: boolean;
  readonly id?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function SectionHeading({
  title,
  description,
  size = "sm",
  level = 3,
  isRequired,
  id,
  className,
  children,
}: SectionHeadingProps) {
  const Heading = `h${level}` as "h2" | "h3" | "h4";

  return (
    <div className={className}>
      <Heading
        id={id}
        className={cx("flex items-center text-secondary", styles[size].heading)}
      >
        {title}
        {isRequired ? (
          <span className="text-brand-tertiary" aria-hidden="true">
            *
          </span>
        ) : null}
      </Heading>

      {description ? (
        <p className={cx("text-tertiary", styles[size].subheading)}>
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}
