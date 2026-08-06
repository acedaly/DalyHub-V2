/**
 * The dashboard CARD — a titled container, not a record.
 *
 * The shared `Card` is a RECORD card: it has a title that opens something, a
 * status, metadata, selection and an overflow of actions on that record. Today,
 * Reviews and every summary surface need the other thing — a titled panel that
 * holds arbitrary content, with an action in its header and one in its footer.
 * Lacking it, `today.css` grew ten bespoke card blocks over 2,236 lines and
 * `settings.css` another eight, each with its own padding, radius and header
 * rhythm. This is that panel, once.
 *
 * Anatomy:
 *
 *     ┌──────────────────────────────────────────┐
 *     │ Title            supporting   [ action ] │   header
 *     ├──────────────────────────────────────────┤
 *     │ children                                 │   body
 *     ├──────────────────────────────────────────┤
 *     │ footer                                   │   footer (optional)
 *     └──────────────────────────────────────────┘
 *
 * It renders a `section` with its heading as the accessible name, so a dashboard
 * of these is navigable by landmark and by heading rather than being one
 * undifferentiated wall. The heading level is the caller's, because only the
 * caller knows what it nests under.
 *
 * States are properties rather than the caller's problem: `isLoading` renders
 * the shared skeleton in the body, and `isEmpty` renders `emptyState` — so the
 * three states of every dashboard panel look the same in every module instead of
 * each one inventing its own.
 *
 * What it does NOT do: own its own colour, decide its own width, or know what it
 * contains. Width comes from the grid it is placed in.
 */

import type { ReactNode } from "react";

/** How much air the card gives its content. */
export type DashboardCardDensity = "standard" | "compact";

export type DashboardCardProps = {
  /** The panel's title, and its accessible name. */
  readonly title: string;
  /** Heading level, so the document outline stays valid. Defaults to 2. */
  readonly headingLevel?: 2 | 3 | 4;
  /** A quiet supporting label beside the title — a count, a period, a source. */
  readonly supporting?: ReactNode;
  /**
   * One action in the header: a "View all" link, a filter control, an overflow
   * menu. One, not a toolbar — the body is what the card is for.
   */
  readonly headerAction?: ReactNode;
  /** A footer action row, separated from the body. */
  readonly footer?: ReactNode;
  /** `standard` (20px) or `compact` (16px). */
  readonly density?: DashboardCardDensity;
  /**
   * Paint the card on the subtle rung instead of the card rung. For a panel that
   * is context rather than content — never for the majority of a page.
   */
  readonly tone?: "default" | "subtle";
  /** Render the shared skeleton in the body instead of `children`. */
  readonly isLoading?: boolean;
  /** Render `emptyState` in the body instead of `children`. */
  readonly isEmpty?: boolean;
  readonly emptyState?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function DashboardCard({
  title,
  headingLevel = 2,
  supporting,
  headerAction,
  footer,
  density = "standard",
  tone = "default",
  isLoading = false,
  isEmpty = false,
  emptyState,
  children,
  className,
  "data-testid": testId,
}: DashboardCardProps) {
  const Heading = `h${headingLevel}` as const;
  const classes = [
    "dh-dcard",
    `dh-dcard--${density}`,
    tone === "subtle" ? "dh-dcard--subtle" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} data-testid={testId}>
      <div className="dh-dcard__header">
        <div className="dh-dcard__titles">
          <Heading className="dh-dcard__title">{title}</Heading>
          {supporting ? (
            <span className="dh-dcard__supporting">{supporting}</span>
          ) : null}
        </div>
        {headerAction ? (
          <div className="dh-dcard__header-action">{headerAction}</div>
        ) : null}
      </div>

      <div className="dh-dcard__body">
        {isLoading ? (
          // `aria-busy` on the card rather than a live region: a dashboard panel
          // loading is not an announcement, it is a state of the panel.
          <div className="dh-dcard__loading" aria-busy="true">
            <span className="dh-skeleton dh-skeleton--line" />
            <span className="dh-skeleton dh-skeleton--line" />
            <span className="dh-skeleton dh-skeleton--line" />
            <span className="dh-visually-hidden">Loading {title}</span>
          </div>
        ) : isEmpty ? (
          <div className="dh-dcard__empty">{emptyState}</div>
        ) : (
          children
        )}
      </div>

      {footer && !isLoading ? (
        <div className="dh-dcard__footer">{footer}</div>
      ) : null}
    </section>
  );
}
