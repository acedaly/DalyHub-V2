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

import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";

import { RecordActionButton } from "./RecordAction";
import type { RecordAction, RecordHeaderProps } from "./types";

/**
 * M3-INT — how many SECONDARY actions a record header shows before it starts
 * competing with the record's own name.
 *
 * One. The header's job is identity first: the title is the largest thing on
 * the page and the reason the page exists, and a row of four evenly-weighted
 * buttons beside it turns the top of every record into a toolbar. M3's own
 * guidance for a top app bar is the same shape — one prominent action, then the
 * overflow — and DalyHub already HAS the overflow, holding lifecycle actions on
 * every record in the product.
 *
 * So the rule is structural rather than editorial: modules keep declaring the
 * actions they have, in priority order, and the shared header shows the first
 * secondary one and folds the rest into the menu that already exists. Nothing
 * is removed, nothing becomes unreachable, and no module can quietly reintroduce
 * a five-button header by editing its own file.
 */
const MAX_VISIBLE_SECONDARY_ACTIONS = 1;

/** Fold a demoted header action into the shared overflow's item model. */
function toOverflowItem(action: RecordAction): OverflowMenuItem {
  return {
    id: action.id,
    label: action.label,
    ariaLabel: action.ariaLabel,
    href: action.href,
    onSelect: action.onSelect,
    disabled: action.disabled,
  };
}

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
  titleSlot,
  titleId,
  headingLevel = 1,
  typeLabel,
  icon,
  status,
  breadcrumb,
  metadata,
  primaryAction,
  secondaryActions,
  overflowActions,
  overflowLabel,
}: RecordHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  /*
   * M3-INT — the visible/overflowed split. The caller's ORDER is the priority:
   * the first secondary action stays in the header, every later one joins the
   * top of the overflow, above the lifecycle group, separated from it by the
   * rule the menu already draws.
   */
  const declaredSecondary = secondaryActions ?? [];
  const visibleSecondary = declaredSecondary.slice(
    0,
    MAX_VISIBLE_SECONDARY_ACTIONS,
  );
  const demotedSecondary = declaredSecondary.slice(
    MAX_VISIBLE_SECONDARY_ACTIONS,
  );
  const lifecycleOverflow = overflowActions ?? [];
  const overflow: readonly OverflowMenuItem[] = [
    ...demotedSecondary.map(toOverflowItem),
    ...lifecycleOverflow.map((item, index) =>
      index === 0 && demotedSecondary.length > 0
        ? { ...item, separatorBefore: true }
        : item,
    ),
  ];

  const hasActions =
    primaryAction !== undefined ||
    visibleSecondary.length > 0 ||
    overflow.length > 0;

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
              {titleSlot ?? title}
            </Heading>
            {status !== undefined && (
              <StatusPill label={status.label} tone={status.tone} />
            )}
          </div>
        </div>

        {hasActions && (
          <div className="record-header__actions">
            {visibleSecondary.map((action) => (
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
            {/* DS-12: the overflow always sits LAST in the action row, on every
             * record, so "where do I archive/delete this?" has one answer. */}
            {overflow.length > 0 && (
              <OverflowMenu
                items={overflow}
                label={overflowLabel ?? `More actions for ${title}`}
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
