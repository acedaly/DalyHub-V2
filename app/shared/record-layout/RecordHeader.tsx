/**
 * DS-02 — the Record Header region.
 *
 * The consistent top of every record: an optional parent breadcrumb, an optional
 * entity icon + type label, the record title (the record's heading, at a
 * configurable level for a correct outline), an optional status pill, optional
 * metadata chips, and optional primary/secondary actions. Entity-agnostic — it
 * renders whatever plain data the caller passes and omits every region it isn't
 * given (DESIGN_SYSTEM.md → Record Header).
 */

import { RecordActionButton } from "./RecordAction";
import type { RecordHeaderProps } from "./types";

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: string;
}) {
  return (
    <span className="record-status" data-tone={tone}>
      {/* The dot is decorative; the label carries the meaning (never colour-only). */}
      <span className="record-status__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function RecordHeader({
  title,
  titleId,
  headingLevel = 1,
  typeLabel,
  icon,
  status,
  breadcrumb,
  metadata,
  primaryAction,
  secondaryActions,
}: RecordHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  const hasActions =
    primaryAction !== undefined ||
    (secondaryActions !== undefined && secondaryActions.length > 0);

  return (
    <header className="record-header">
      {breadcrumb !== undefined && breadcrumb.length > 0 && (
        <nav className="record-breadcrumb" aria-label="Breadcrumb">
          <ol>
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <li key={item.id}>
                  {item.href !== undefined && !isLast ? (
                    <a href={item.href}>{item.label}</a>
                  ) : (
                    <span aria-current={isLast ? "page" : undefined}>
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="record-header__bar">
        <div className="record-header__identity">
          {(icon !== undefined || typeLabel !== undefined) && (
            <span className="record-type">
              {icon !== undefined && (
                <span className="record-type__icon" aria-hidden="true">
                  {icon}
                </span>
              )}
              {typeLabel !== undefined && (
                <span className="record-type__label">{typeLabel}</span>
              )}
            </span>
          )}
          <div className="record-header__titlerow">
            <Heading id={titleId} className="record-title">
              {title}
            </Heading>
            {status !== undefined && (
              <StatusPill label={status.label} tone={status.tone} />
            )}
          </div>
        </div>

        {hasActions && (
          <div className="record-header__actions">
            {secondaryActions?.map((action) => (
              <RecordActionButton
                key={action.id}
                action={action}
                defaultVariant="secondary"
              />
            ))}
            {primaryAction !== undefined && (
              <RecordActionButton
                action={primaryAction}
                defaultVariant="primary"
              />
            )}
          </div>
        )}
      </div>

      {metadata !== undefined && metadata.length > 0 && (
        <ul className="record-header__meta" aria-label="Record metadata">
          {metadata.map((item) => (
            <li key={item.id} className="record-meta-chip">
              <span className="record-meta-chip__label">{item.label}</span>
              <span className="record-meta-chip__value">{item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
