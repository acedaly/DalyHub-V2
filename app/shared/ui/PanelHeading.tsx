/**
 * DHDS-03 — the heading shared by every contextual depth surface.
 *
 * Drawer, Inspector and Sheet deliberately keep different behaviour: a Drawer
 * is URL-backed and stackable, an Inspector is docked on desktop, and a Sheet
 * is a transient modal. Their heading anatomy is not different. One title and
 * at most one supporting line gives every surface the same reading order,
 * wrapping behaviour and accessible name/description relationship.
 */

export type PanelHeadingProps = {
  readonly title: string;
  readonly titleId: string;
  readonly description?: string;
  readonly descriptionId?: string;
  readonly className?: string;
  /** Host hook for genuinely presentation-specific responsive adjustments. */
  readonly titleClassName?: string;
  /** Host hook for genuinely presentation-specific responsive adjustments. */
  readonly descriptionClassName?: string;
};

export function PanelHeading({
  title,
  titleId,
  description,
  descriptionId,
  className,
  titleClassName,
  descriptionClassName,
}: PanelHeadingProps) {
  return (
    <div className={["dh-panel-heading", className].filter(Boolean).join(" ")}>
      <h2
        id={titleId}
        className={["dh-panel-heading__title", titleClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {title}
      </h2>
      {description ? (
        <p
          id={descriptionId}
          className={["dh-panel-heading__description", descriptionClassName]
            .filter(Boolean)
            .join(" ")}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
