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

import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useId } from "react";

import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";

import { CardActionButton } from "./CardAction";
import { CardSwipeTray } from "./CardSwipeTray";
import { useCardLongPress } from "./useCardLongPress";
import { useCardSwipe } from "./useCardSwipe";
import type { CardAction, CardProps } from "./types";
import { normaliseProgress, primaryOpenIsModifiedClick } from "./types";

/** The legacy single `overflowAction` is just a one-item menu (DS-12). */
function toOverflowItem(action: CardAction): OverflowMenuItem {
  return {
    id: action.id,
    label: action.label,
    ariaLabel: action.ariaLabel,
    icon: action.icon,
    description: action.description,
    href: action.href,
    onSelect: action.onSelect,
    disabled: action.disabled,
    pending: action.pending,
  };
}

export function Card(props: CardProps) {
  const {
    id,
    typeLabel,
    icon,
    identity,
    leadingControl,
    accent = "neutral",
    title,
    titleEditor,
    headingLevel = 3,
    subtitle,
    status,
    metadata,
    progress,
    context,
    dateLabel,
    selection,
    quickActions,
    overflowActions,
    overflowAction,
    overflowLabel,
    swipeActions,
    onLongPress,
    href,
    onOpen,
    openAriaLabel,
    density = "comfortable",
    presentation = "list",
    rovingTabIndex,
    reorderHandle,
    completed = false,
    className,
  } = props;

  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const selectionId = `${generatedId}-select`;

  // Touch swipe-to-reveal (TODAY-06). Structural (the wrapper renders whenever
  // `swipeActions` are given, SSR-safe); the hook only responds to pointers on a
  // touch-first device, so mouse/keyboard behaviour is unchanged.
  const hasSwipe = swipeActions !== undefined && swipeActions.length > 0;
  const swipe = useCardSwipe({ hasActions: hasSwipe });

  // Touch long-press → the consumer's selection entry point (TASKS-08). Inert unless
  // `onLongPress` is supplied AND the device is touch-first, so mouse/keyboard
  // behaviour and every existing consumer are untouched.
  const longPress = useCardLongPress({ onLongPress });

  // Roving-focus membership: ONLY the primary open control carries the roving
  // tabindex (0 for the active card, -1 for the rest), so the collection is exactly
  // ONE tab stop. The card's SECONDARY controls (selection checkbox, quick/overflow
  // actions) are taken out of the tab order entirely (`-1`) — they stay operable by
  // pointer and, on the focused card, by the collection's keyboard model (Space
  // selects) or the shared contextual commands / Command Palette (each action has a
  // keyboard equivalent), never as extra tab stops. Undefined leaves natural tabbing.
  const secondaryTabIndex = rovingTabIndex === undefined ? undefined : -1;

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

  // DS-12: one overflow rendering. `overflowActions` is the contract; the legacy
  // single `overflowAction` normalises into the same one-item menu.
  const overflowItems: readonly OverflowMenuItem[] =
    overflowActions && overflowActions.length > 0
      ? overflowActions
      : overflowAction
        ? [toOverflowItem(overflowAction)]
        : [];
  const TitleHeading = `h${headingLevel}` as const;

  // DHDS-08 — the shared completion grammar: the strike is always present and
  // transparent, so completing transitions a COLOUR rather than switching a
  // text decoration on. See `motion.css` → `.dh-complete-strike`.
  const titleContent = (
    <span className="dh-card__title-text dh-complete-strike">{title}</span>
  );

  // While an inline editor is supplied the title cell becomes that editor; the rest
  // of the time the card keeps its ordinary open control, so a row is never left
  // without a way into its record (TASKS-04).
  let titleNode;
  if (titleEditor !== undefined) {
    titleNode = titleEditor;
  } else if (href !== undefined) {
    titleNode = (
      <a
        className="dh-card__open"
        href={href}
        aria-label={openAriaLabel}
        tabIndex={rovingTabIndex}
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
        tabIndex={rovingTabIndex}
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
    completed ? "dh-card--completed" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const article = (
    <article
      ref={hasSwipe ? swipe.surfaceRef : undefined}
      className={rootClasses}
      aria-labelledby={titleId}
      data-card-id={id}
      data-accent={accent}
      data-selected={selection?.selected ? "true" : "false"}
      data-completed={completed ? "true" : undefined}
      data-card-density={density}
      data-presentation={presentation}
      /*
       * DHDS-10 — the card is a REVEAL CONTEXT.
       *
       * A card's metadata run is exactly the "run of values being scanned" the
       * `meta` presentation exists for, and DHDS-10 puts inline editors in it
       * (a Task's priority and due date on a Project's Tasks tab). Declaring
       * DHDS-08's action context here is what lets those fields hold their
       * caret back until the card is engaged with — the same contract, the same
       * curve, one place. It affects nothing that is not a `.dh-action-reveal`,
       * so a card of plain facts is byte-identical with it.
       */
      data-dh-action-context="true"
      data-testid={props["data-testid"]}
      {...(hasSwipe || longPress.enabled
        ? {
            ...(hasSwipe
              ? {
                  "data-swipe-open": swipe.isOpen ? "true" : "false",
                  "data-swipe-dragging": swipe.dragging ? "true" : "false",
                }
              : {}),
            // Both gestures observe the SAME pointer sequence: swipe claims a
            // horizontal drag, long press claims a stationary hold, and movement
            // cancels the hold — so they are mutually exclusive by construction
            // rather than by racing each other.
            onPointerDown: (event: ReactPointerEvent) => {
              if (hasSwipe) swipe.onPointerDown(event);
              longPress.onPointerDown(event);
            },
            onPointerMove: (event: ReactPointerEvent) => {
              if (hasSwipe) swipe.onPointerMove(event);
              longPress.onPointerMove(event);
            },
            onPointerUp: (event: ReactPointerEvent) => {
              if (hasSwipe) swipe.onPointerUp(event);
              longPress.onPointerUp(event);
            },
            onPointerCancel: (event: ReactPointerEvent) => {
              if (hasSwipe) swipe.onPointerCancel(event);
              longPress.onPointerCancel(event);
            },
            onClickCapture: (event: MouseEvent<HTMLElement>) => {
              longPress.onClickCapture(event);
              if (hasSwipe) swipe.onClickCapture(event);
            },
          }
        : {})}
    >
      {reorderHandle ? (
        <div className="dh-card__handle-slot" data-no-swipe>
          {reorderHandle}
        </div>
      ) : null}

      {/* The record's own control comes FIRST — before identity and before the
       * list's selection cell. `data-no-swipe` so a touch drag over it reveals
       * the swipe tray rather than being eaten by the control. */}
      {leadingControl ? (
        <div className="dh-card__leading" data-no-swipe>
          {leadingControl}
        </div>
      ) : null}

      {identity ? <div className="dh-card__identity">{identity}</div> : null}

      {selection ? (
        // A `label` wrapping the checkbox so the whole cell is a 44px touch target
        // on touch devices (the input stays visually compact) — TODAY-06 selection
        // targets. Clicking the cell toggles selection and never opens the card.
        <label className="dh-card__select" data-no-swipe>
          <input
            id={selectionId}
            className="dh-card__select-input"
            type="checkbox"
            checked={selection.selected}
            disabled={selection.disabled}
            tabIndex={secondaryTabIndex}
            aria-label={selection.label ?? `Select ${title}`}
            onChange={(event) =>
              // TASKS-06 — Shift-click extends a RANGE. The modifier is read from the
              // native event and reported to the collection, which is the only place
              // that knows what order the rows are in.
              selection.onSelectedChange(event.target.checked, {
                shift: (event.nativeEvent as PointerEvent | MouseEvent)
                  .shiftKey,
              })
            }
            onClick={(event) => event.stopPropagation()}
          />
        </label>
      ) : null}

      <div className="dh-card__body">
        {/*
         * DS-14 — the PRIMARY line and the SUPPORTING run.
         *
         * The two wrappers exist so a Collection region can lay a card out as a
         * dense ROW without the module changing anything: the primary line is
         * what the owner scans (type cue, title, state), the supporting run is
         * everything that qualifies it. In a Reading region they stack exactly
         * as they did before, so the wrappers cost nothing where a card is
         * still a card. No information moves between them and none is dropped —
         * this is grouping, not editing.
         */}
        <div className="dh-card__line">
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

          <TitleHeading id={titleId} className="dh-card__title">
            {titleNode}
          </TitleHeading>
        </div>

        {subtitle ? <p className="dh-card__subtitle">{subtitle}</p> : null}

        <div className="dh-card__support">
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
                aria-valuetext={normalisedProgress.valueText}
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
                // MOBILE-01: the module's declared scanning priority. Low-priority
                // detail is de-emphasised on a narrow card, never removed — it stays
                // in the DOM and the accessibility tree at every width.
                <li
                  key={item.id}
                  className="dh-card__meta"
                  // UIX-01 — the module's own field name, so a collection's
                  // stylesheet can address one fact ("the Project mark drops
                  // below 480px") without matching on its position in the run.
                  data-field={item.id}
                  data-priority={item.priority ?? "high"}
                >
                  {item.label ? (
                    <span className="dh-card__meta-label">{item.label}: </span>
                  ) : null}
                  <span className="dh-card__meta-value">{item.value}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {dateLabel ? (
            <p
              className="dh-card__date"
              data-tone={dateLabel.tone ?? "neutral"}
            >
              {dateLabel.label}
            </p>
          ) : null}
        </div>
      </div>

      {(quickActions && quickActions.length > 0) || overflowItems.length > 0 ? (
        <div
          className="dh-card__actions"
          role="group"
          aria-label={`Actions for ${openAccessibleName}`}
          data-no-swipe
        >
          {quickActions?.map((action) => (
            <CardActionButton
              key={action.id}
              action={action}
              tabIndex={secondaryTabIndex}
            />
          ))}
          {overflowItems.length > 0 ? (
            <OverflowMenu
              items={overflowItems}
              label={overflowLabel ?? `More actions for ${openAccessibleName}`}
              triggerClassName="dh-card__action--overflow"
              tabIndex={secondaryTabIndex}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );

  if (!hasSwipe) {
    return article;
  }

  // Swipe-enabled: a clip/position wrapper holds the revealed action tray behind
  // the translated card surface (the article). The article keeps its exact internal
  // structure — the wrapper is purely additive, so desktop rendering is unchanged
  // (the tray stays fully hidden at reveal 0). The tray is an aria-hidden duplicate
  // of the accessible quick actions above.
  return (
    <div
      ref={swipe.rootRef}
      className="dh-card-swipe"
      data-swipe-open={swipe.isOpen ? "true" : "false"}
    >
      <CardSwipeTray
        actions={swipeActions ?? []}
        trayRef={swipe.trayRef}
        onActionFired={swipe.close}
      />
      {article}
    </div>
  );
}
