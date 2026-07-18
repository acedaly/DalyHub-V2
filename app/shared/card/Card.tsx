/**
 * DS-04 — the one Shared Card.
 *
 * A single, entity-agnostic card configured entirely by data. It renders in list,
 * board and grid contexts and in comfortable/compact density with the SAME
 * component — presentation changes spacing/placement but never removes essential
 * information or actions. Structure and accessibility live here; every visual value
 * comes from DS-01 tokens (card.css).
 *
 * Accessibility contract (DESIGN_SYSTEM.md → Cards, AGENTS.md §15):
 *   - the card is a labelled `article`; it is NOT itself a button/link, so there is
 *     no inaccessible `div onClick` and no nested-interactive violation;
 *   - the TITLE is the primary open target (a real link and/or button with an
 *     accessible name) — mouse and keyboard both open the record;
 *   - selection is a native checkbox and never opens the record;
 *   - quick actions stop propagation and never open the record;
 *   - status/date carry text (never colour alone); progress has a text equivalent.
 */

import type { MouseEvent } from "react";
import { useId } from "react";

import { CardActionButton } from "./CardAction";
import type { CardProps } from "./types";
import { normaliseProgress, primaryOpenIsModifiedClick } from "./types";

function OverflowGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="13" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function Card(props: CardProps) {
  const {
    id,
    typeLabel,
    icon,
    accent = "neutral",
    title,
    subtitle,
    status,
    metadata,
    progress,
    context,
    dateLabel,
    selection,
    quickActions,
    overflowAction,
    href,
    onOpen,
    openAriaLabel,
    density = "comfortable",
    presentation = "list",
    reorderHandle,
    className,
  } = props;

  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const selectionId = `${generatedId}-select`;

  const handleOpenClick = (event: MouseEvent<HTMLElement>) => {
    // With both href and onOpen, let a modified/middle click follow the link
    // (open in a new tab); an unmodified click opens in-app via onOpen.
    if (onOpen) {
      if (href !== undefined && primaryOpenIsModifiedClick(event)) {
        return;
      }
      event.preventDefault();
      onOpen();
    }
  };

  const openAccessibleName = openAriaLabel ?? title;

  const titleContent = <span className="dh-card__title-text">{title}</span>;

  let titleNode;
  if (href !== undefined) {
    titleNode = (
      <a
        className="dh-card__open"
        href={href}
        aria-label={openAriaLabel}
        onClick={handleOpenClick}
      >
        {titleContent}
      </a>
    );
  } else if (onOpen) {
    titleNode = (
      <button
        type="button"
        className="dh-card__open"
        aria-label={openAriaLabel}
        onClick={handleOpenClick}
      >
        {titleContent}
      </button>
    );
  } else {
    // No open action supplied — render an accessible static title.
    titleNode = (
      <span className="dh-card__open dh-card__open--static">
        {titleContent}
      </span>
    );
  }

  const normalisedProgress = progress ? normaliseProgress(progress) : null;

  const rootClasses = [
    "dh-card",
    `dh-card--${density}`,
    `dh-card--${presentation}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={rootClasses}
      aria-labelledby={titleId}
      data-card-id={id}
      data-accent={accent}
      data-selected={selection?.selected ? "true" : "false"}
      data-density={density}
      data-presentation={presentation}
      data-testid={props["data-testid"]}
    >
      {reorderHandle ? (
        <div className="dh-card__handle-slot">{reorderHandle}</div>
      ) : null}

      {selection ? (
        <div className="dh-card__select">
          <input
            id={selectionId}
            className="dh-card__select-input"
            type="checkbox"
            checked={selection.selected}
            disabled={selection.disabled}
            aria-label={selection.label ?? `Select ${title}`}
            onChange={(event) =>
              selection.onSelectedChange(event.target.checked)
            }
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      <div className="dh-card__body">
        <div className="dh-card__heading">
          <div className="dh-card__type">
            {icon ? (
              <span className="dh-card__icon" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            {typeLabel ? (
              <span className="dh-card__type-label">{typeLabel}</span>
            ) : null}
          </div>
          {status ? (
            <span
              className="dh-card__status"
              data-tone={status.tone ?? "neutral"}
            >
              {status.label}
            </span>
          ) : null}
        </div>

        <h3 id={titleId} className="dh-card__title">
          {titleNode}
        </h3>

        {subtitle ? <p className="dh-card__subtitle">{subtitle}</p> : null}

        {context ? (
          <p className="dh-card__context">
            <span className="dh-visually-hidden">In </span>
            {context.href ? (
              <a
                className="dh-card__context-link"
                href={context.href}
                onClick={(event) => event.stopPropagation()}
              >
                {context.label}
              </a>
            ) : (
              <span>{context.label}</span>
            )}
          </p>
        ) : null}

        {normalisedProgress ? (
          <div className="dh-card__progress">
            <div
              className="dh-card__progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={normalisedProgress.percent}
              aria-valuetext={normalisedProgress.text}
              aria-label="Progress"
            >
              <div
                className="dh-card__progress-fill"
                style={{ inlineSize: `${normalisedProgress.percent}%` }}
              />
            </div>
            <span className="dh-card__progress-text">
              {normalisedProgress.text}
            </span>
          </div>
        ) : null}

        {metadata && metadata.length > 0 ? (
          <ul className="dh-card__metadata">
            {metadata.map((item) => (
              <li key={item.id} className="dh-card__meta">
                {item.label ? (
                  <span className="dh-card__meta-label">{item.label}: </span>
                ) : null}
                <span className="dh-card__meta-value">{item.value}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {dateLabel ? (
          <p className="dh-card__date" data-tone={dateLabel.tone ?? "neutral"}>
            {dateLabel.label}
          </p>
        ) : null}
      </div>

      {(quickActions && quickActions.length > 0) || overflowAction ? (
        <div
          className="dh-card__actions"
          role="group"
          aria-label={`Actions for ${openAccessibleName}`}
        >
          {quickActions?.map((action) => (
            <CardActionButton key={action.id} action={action} />
          ))}
          {overflowAction ? (
            <CardActionButton
              action={{
                ...overflowAction,
                iconOnly: overflowAction.iconOnly ?? true,
                icon: overflowAction.icon ?? <OverflowGlyph />,
              }}
              className="dh-card__action--overflow"
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
