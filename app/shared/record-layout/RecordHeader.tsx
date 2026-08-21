/**
 * DS-02 — the Record Header region.
 *
 * The consistent top of every record: an optional parent breadcrumb, the record
 * title (the record's heading, at a configurable level for a correct outline)
 * with its entity glyph and status pill beside it, an optional context line, and
 * optional primary/secondary actions. Entity-agnostic — it renders whatever
 * plain data the caller passes and omits every region it isn't given
 * (DESIGN_SYSTEM.md → Record Header).
 *
 * ── RECORD-01 (PR #131) — identity is ONE block ──────────────────────────────
 *
 * The header previously stacked three separate bands: a type line (glyph + "
 * Project"), then the title row, then a detached metadata row separated from the
 * tabs by the layout's own gap. On a Project at 1280×800 that cost 158px before
 * the record had said anything, and the type line said what the breadcrumb
 * directly above it already said.
 *
 * So identity is now one line — glyph, title, status — and the caller's
 * `metadata` renders as a tight CONTEXT LINE underneath it rather than a band of
 * its own. `typeLabel` still exists and still renders, but as the first entry in
 * that context line, because the labels that survived the convergence are
 * genuine SUBTYPES ("Vehicle" on an Asset) rather than the entity type the
 * breadcrumb already carries.
 *
 * The glyph keeps its `record-type__icon` hook. #130 put the record's chosen
 * identity colour there, and moving the element must not move the contract that
 * addresses it.
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
          <div className="record-header__titlerow">
            {icon !== undefined && (
              <span className="record-type__icon" aria-hidden="true">
                {icon}
              </span>
            )}
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

      {(typeLabel !== undefined ||
        (metadata !== undefined && metadata.length > 0)) && (
        /*
         * DHDS-10 — the context line is a REVEAL CONTEXT.
         *
         * A record's context line is a run of small facts being scanned, and
         * DHDS-10 makes several of them directly editable (a Project's status,
         * an Asset's state, a Goal's target date). Declaring the DHDS-08 action
         * context here is what lets every one of those fields hold its caret
         * back at rest and show it when the owner engages with the line — one
         * contract, the same one the row's overflow button uses, rather than a
         * per-record decision about how loud an editable fact should look.
         *
         * It affects nothing that is not a `.dh-action-reveal`, so a context
         * line of plain facts and links is byte-identical with it.
         */
        <ul
          className="record-header__context"
          aria-label="Record context"
          data-dh-action-context="true"
        >
          {typeLabel !== undefined && (
            <li className="record-context-item record-context-item--type">
              <span className="record-type__label">{typeLabel}</span>
            </li>
          )}
          {(metadata ?? []).map((item) => (
            <li key={item.id} className="record-context-item">
              {/* An EMPTY label is a deliberate caller choice, not missing data:
               * some context reads as a phrase rather than a field ("Site
               * foreman · Whitfield Building Co."), and "Role and organisation:"
               * in front of it would be the label saying less than the value.
               * The empty span is skipped so it cannot leave a stray gap. */}
              {item.label !== "" && (
                <span className="record-context-item__label">{item.label}</span>
              )}
              <span className="record-context-item__value">{item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
