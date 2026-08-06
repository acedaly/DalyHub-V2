/**
 * The metric TILE — a number, what it counts, and where to go about it.
 *
 * The four-across summary row on Today, and any other place a card needs to
 * state several figures side by side.
 *
 * The rule this component exists to enforce is that **a metric tile is not a
 * card**. Today's previous summary rendered six individually OUTLINED boxes
 * inside an already-outlined card, which is a grid of boxes rather than a row of
 * facts, and it is why that hero needed 250px to say six numbers. A tile has no
 * border, no shadow and no surface of its own: it is separated from its
 * neighbours by a hairline divider drawn by the row, and by nothing else.
 *
 * Anatomy, top to bottom:
 *
 *     [icon]        small tonal container, 40px
 *     12            the value, large and tabular
 *     Today's tasks the label
 *     8 remaining   ONE supporting line, actionable where there is somewhere to go
 *
 * `supporting` is deliberately singular. A tile that says three more things is a
 * card, and it belongs in one.
 *
 * Honesty: `value` is a string, not a number, so a caller that only has a lower
 * bound can say `"50+"` and a caller with nothing can say `"—"`. The component
 * will not compute, round or infer anything — a figure it invented would be
 * indistinguishable from one it was given.
 */

import type { ReactNode } from "react";

/**
 * The tone of the icon container. `neutral` is the default and the right answer
 * for most metrics; the semantic tones are for figures that genuinely carry
 * state, and they are never the only signal — the label says it too.
 */
export type MetricTileTone =
  "neutral" | "accent" | "success" | "warning" | "danger";

export type MetricTileProps = {
  /** A decorative glyph; the label names the metric. */
  readonly icon?: ReactNode;
  readonly tone?: MetricTileTone;
  /**
   * The figure, as text. A string so "50+", "—" and "0" are all first-class:
   * the tile renders exactly what it is handed.
   */
  readonly value: string;
  /** What the figure counts. */
  readonly label: string;
  /** One supporting line. A node so it can be a link where there is a destination. */
  readonly supporting?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function MetricTile({
  icon,
  tone = "neutral",
  value,
  label,
  supporting,
  className,
  "data-testid": testId,
}: MetricTileProps) {
  const classes = ["dh-metric", `dh-metric--${tone}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} data-testid={testId}>
      {icon ? (
        <span className="dh-metric__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="dh-metric__value">{value}</span>
      <span className="dh-metric__label">{label}</span>
      {supporting ? (
        <span className="dh-metric__supporting">{supporting}</span>
      ) : null}
    </div>
  );
}

/**
 * The row that holds them, and the only thing that draws a separator.
 *
 * A plain `ul`/`li` so the tiles are a list to assistive technology rather than
 * a run of anonymous divs, and so the dividers can be drawn between siblings
 * without any tile knowing where it sits.
 */
export function MetricRow({
  children,
  className,
  "data-testid": testId,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <ul
      className={["dh-metric-row", className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {children}
    </ul>
  );
}

/** One cell of a {@link MetricRow}. */
export function MetricRowItem({ children }: { readonly children: ReactNode }) {
  return <li className="dh-metric-row__item">{children}</li>;
}
