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

import { ChevronRight } from "@untitledui/icons";

import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";
import { UntitledStatusBadge } from "~/shared/pill";
import type { BadgeTone } from "~/shared/ui/Badge";

import { RecordActionButton } from "./RecordAction";
import type { RecordAction, RecordHeaderProps, RecordTone } from "./types";

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

/**
 * The record's three LIFECYCLE tones, in the shared badge vocabulary.
 *
 * `completed`, `waiting` and `on-hold` exist because a task waiting on someone
 * else is not a warning and a paused record is not a failure. Untitled's badge
 * palette has no lifecycle row, so each folds onto the semantic tone that says
 * the same thing without over-claiming: finished is positive, and both forms of
 * "paused, and that is fine" are the absence state.
 */
const LIFECYCLE_TONES: Record<RecordTone, BadgeTone> = {
  neutral: "neutral",
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  completed: "success",
  waiting: "neutral",
  "on-hold": "neutral",
};

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: RecordTone;
}) {
  /*
   * `record-status` survives as the hook journeys address ("what state is this
   * record in?"); its presentation is deleted from `record-layout.css` and the
   * chip is the genuine Untitled badge. The dot is decorative and the label
   * carries the meaning — never colour alone.
   */
  return (
    <UntitledStatusBadge
      tone={LIFECYCLE_TONES[tone] ?? "neutral"}
      dot
      size="sm"
      className="record-status"
    >
      {label}
    </UntitledStatusBadge>
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
    /*
     * UNTITLED-04 — the Untitled Application UI page-header anatomy: a
     * breadcrumb line, then a row whose leading edge is identity (mark, name,
     * state) and whose trailing edge is the action cluster, then the context
     * line. Same regions, same order and same accessible names as the DS-02
     * header this replaces; the drawing is Untitled's tokens and utilities
     * rather than `record-layout.css`, whose rules for this region are deleted.
     *
     * Every `record-*` class name here is a HOOK, not a style: product tests and
     * responsive journeys address them.
     */
    <header className="record-header flex flex-col gap-3">
      {breadcrumb !== undefined && breadcrumb.length > 0 && (
        <nav className="record-breadcrumb" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-tertiary">
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <li key={item.id} className="flex items-center gap-1">
                  {index > 0 ? (
                    <ChevronRight
                      className="size-4 shrink-0 text-fg-quaternary"
                      aria-hidden="true"
                    />
                  ) : null}
                  {item.href !== undefined && !isLast ? (
                    // Deliberately a plain anchor, not a router `Link`: the
                    // shared header is rendered outside a router in unit tests
                    // and in the design-states route, and the breadcrumb's
                    // navigation semantics are unchanged by this migration.
                    <a
                      className="rounded-sm font-medium text-tertiary outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
                      href={item.href}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span
                      className="font-semibold text-secondary"
                      aria-current={isLast ? "page" : undefined}
                    >
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="record-header__bar flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="record-header__identity min-w-0 flex-1">
          <div className="record-header__titlerow flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            {icon !== undefined && (
              <span className="record-type__icon shrink-0" aria-hidden="true">
                {icon}
              </span>
            )}
            <Heading
              id={titleId}
              className="record-title m-0 min-w-0 text-display-xs font-semibold text-primary max-md:text-xl"
            >
              {titleSlot ?? title}
            </Heading>
            {status !== undefined && (
              <StatusPill label={status.label} tone={status.tone} />
            )}
          </div>
        </div>

        {hasActions && (
          <div className="record-header__actions flex shrink-0 items-center gap-2">
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
          className="record-header__context flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-tertiary"
          aria-label="Record context"
          data-dh-action-context="true"
        >
          {typeLabel !== undefined && (
            <li className="record-context-item record-context-item--type flex items-center gap-1.5">
              <span className="record-type__label font-medium text-secondary">
                {typeLabel}
              </span>
            </li>
          )}
          {(metadata ?? []).map((item, index) => (
            <li
              key={item.id}
              className="record-context-item flex min-w-0 items-center gap-1.5"
            >
              {index > 0 || typeLabel !== undefined ? (
                <span className="text-quaternary" aria-hidden="true">
                  ·
                </span>
              ) : null}
              {/* An EMPTY label is a deliberate caller choice, not missing data:
               * some context reads as a phrase rather than a field ("Site
               * foreman · Whitfield Building Co."), and "Role and organisation:"
               * in front of it would be the label saying less than the value.
               * The empty span is skipped so it cannot leave a stray gap. */}
              {item.label !== "" && (
                <span className="record-context-item__label text-tertiary">
                  {item.label}
                </span>
              )}
              <span className="record-context-item__value min-w-0 font-medium text-secondary">
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
