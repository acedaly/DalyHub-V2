/**
 * REDESIGN-04 — the MEASURED row.
 *
 * `mockup3.png` draws the same object twice: once in the Goals workspace's left
 * list, and again in the compact Goals section on the Projects page and its
 * phone frame. It is a row, not a card:
 *
 *     ┌────────────────────────────────────────────────────────────┐
 *     │ [tile]  Reach 70 kg                            60.0 / 70 kg│
 *     │         Health                                             │
 *     │         ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
 *     └────────────────────────────────────────────────────────────┘
 *
 * Three rules make it different from `EntityRow` (which is what an Area is, and
 * deliberately carries NO bar because an Area never completes) and from
 * `ProjectCard` (a gallery object with room for a foot):
 *
 * 1. **The value is the row's honest end, not a percentage.** `60.0 / 70 kg`,
 *    `12 / 24`, `75% complete` — whatever the record's own arithmetic produces.
 *    The caller passes the string it derived; this component never computes,
 *    formats or rounds a measure, so a row can never disagree with the record
 *    it opens.
 * 2. **The bar is optional, and its ABSENCE is a state.** A goal with no
 *    measurement configuration has no bar and no value — it is not at 0%. The
 *    row renders what it is given and fabricates nothing.
 * 3. **Selection is a first-class state.** The Goals workspace is a
 *    master–detail, so one row is the current one. `selected` marks it with
 *    `aria-current` as well as a tint — never a tone alone.
 *
 * Presentation only: it resolves no icons, no colours and no arithmetic. The
 * caller hands it a rendered mark and already-derived display strings.
 */

import type { ReactNode } from "react";
import { Children } from "react";
import { Link } from "react-router";

import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";
import { meterStatusAttribute, type MeterStatus } from "~/shared/progress";

export type ProgressRowProps = {
  /** The record's identity mark — a rendered node. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly headingLevel?: 2 | 3 | 4;
  /** The context beneath the name — the Area, or "Health · Personal". */
  readonly context?: string | null;
  /**
   * The bounded measure. OMITTED where the record has none — an absent bar is
   * an honest "not measured", and a 0% bar would be a lie about the same state.
   */
  readonly progress?: {
    readonly percent: number;
    /** The complete sentence for assistive tech — "60 of 70 kg, 60% complete". */
    readonly valueText: string;
    /**
     * POLISH-01 — how the measure is GOING, from the caller's own evaluator.
     *
     * The bar used to take the record's identity hue, so a Goal reading "60.0 /
     * 70 kg · Ahead" drew a red bar if red was that Goal's chosen colour.
     * Absent is `neutral`, which is what an unmeasured or just-started Goal
     * honestly is.
     */
    readonly status?: MeterStatus;
  };
  /**
   * The honest figure at the row's end — "60.0 / 70 kg", "12 / 24",
   * "75% complete". Already formatted by the caller's own evaluator.
   */
  readonly value?: string | null;
  /** The record's stable identity rank, painting the mark and the bar alike. */
  readonly accent?: number | null;
  /**
   * IDENTITY-01 — the record's OWN chosen colour slot, when it has one.
   *
   * A chosen slot beats the derived rank, and the two are folded together by the
   * one resolver rather than by this component. Passing neither is the NEUTRAL
   * identity, which is a designed outcome for a record that genuinely has none.
   */
  readonly colourSlot?: string | null;
  /** Master–detail selection. Adds `aria-current`, never a tint alone. */
  readonly selected?: boolean;
  readonly href: string;
  readonly openAriaLabel?: string;
  readonly muted?: boolean;
  readonly "data-testid"?: string;
};

export function ProgressRow({
  icon,
  title,
  headingLevel = 3,
  context,
  progress,
  value,
  accent,
  colourSlot = null,
  selected = false,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: ProgressRowProps) {
  const Heading = `h${headingLevel}` as const;

  // The ONE resolver. This component never maps a rank to a colour itself — a
  // card and the tile inside it agreeing depends on there being one mapping.
  const identity = resolveIdentity({ colourSlot, colourRank: accent ?? null });

  return (
    <article
      className={["dh-mrow", muted ? "dh-mrow--muted" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      data-selected={selected ? "true" : undefined}
      {...identityAttribute(identity.slot)}
      data-testid={testId}
    >
      {icon ? (
        <span className="dh-mrow__mark" aria-hidden="true">
          {icon}
        </span>
      ) : null}

      <div className="dh-mrow__body">
        <div className="dh-mrow__line">
          <Heading className="dh-mrow__title">
            <Link
              className="dh-mrow__open"
              to={href}
              // The row IS the current record of a master–detail pane, which is
              // what `page` means. It rides on the link rather than the article
              // so assistive tech announces it where the destination is.
              aria-current={selected ? "page" : undefined}
              aria-label={openAriaLabel ?? title}
              preventScrollReset
            >
              {title}
            </Link>
          </Heading>
          {value ? <p className="dh-mrow__value">{value}</p> : null}
        </div>
        {context ? <p className="dh-mrow__context">{context}</p> : null}
        {progress ? (
          <span
            className="dh-mrow__track"
            {...meterStatusAttribute(progress.status)}
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={progress.valueText}
            aria-label={`${title} progress`}
          >
            <span
              className="dh-mrow__fill"
              style={{ inlineSize: `${progress.percent}%` }}
            />
          </span>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The single surface the measured rows sit in — a labelled `<ul>`/`<li>`, so a
 * screen reader announces "Goals, list, 6 items" before any row is read. The
 * hairlines belong to the list, exactly as in `EntityRowList`, so no row has to
 * know where it sits.
 */
export function ProgressRowList({
  children,
  label,
  className,
  "data-testid": testId,
}: {
  readonly children: ReactNode;
  readonly label?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <ul
      className={["dh-mrow-list", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <li className="dh-mrow-list__item">{child}</li>
        ),
      )}
    </ul>
  );
}
