/**
 * CONTROL-01 — Filter & sort, as a DESKTOP control.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * `CollectionControls` had one presentation: the phone bottom sheet MOBILE-01
 * designed. On a 1440px desktop, pressing "Filter & sort" slid a full-width
 * panel up from the bottom of the window with a drag handle at its top and a
 * sticky Reset/Apply footer at its bottom — a modal that covers the list the
 * owner is filtering, over a device that has neither a thumb reach problem nor
 * a bottom edge worth reaching for. Every filter change cost open → choose →
 * Apply → look → open again, because the thing you are trying to see is behind
 * the thing you are changing.
 *
 * ── What this is ─────────────────────────────────────────────────────────────
 * The same controls, anchored beside the trigger that opened them, ~320px wide,
 * with 34px option rows and no footer. It is not a second filter system: it
 * takes the SAME `CollectionControlGroup[]`, reads the SAME committed params
 * and writes through the SAME `applyDraft`, so a collection describes its
 * controls once and gets the right presentation for the device.
 *
 * The one behavioural difference is deliberate and is the point:
 *
 *   **the popover LIVE-APPLIES.** A phone sheet edits a draft because it hides
 *   the list — committing per tap would be a series of invisible changes. A
 *   popover sits beside the list, so a choice can simply take effect and be
 *   SEEN, and the owner can adjust three filters in three clicks instead of
 *   three round trips. There is no draft, so there is nothing to discard: the
 *   popover renders the committed state and Escape means "I'm done", never "undo
 *   the last four things I did".
 *
 * Reset stays, as one quiet row at the end rather than half a sticky footer,
 * and only when there is something to reset.
 *
 * ── Semantics ────────────────────────────────────────────────────────────────
 * A menu of grouped radio choices: `role="menu"` containing a `role="group"` per
 * control with `role="menuitemradio"` options, which is the WAI-ARIA pattern for
 * exactly this shape. Focus moves for real (rather than by
 * `aria-activedescendant`) so the browser's own focus ring is the cursor;
 * ArrowUp/Down roves and wraps, Home/End jump, Escape closes and restores focus
 * to the trigger, Tab closes and lets focus continue past it. An outside press
 * closes it — `AnchoredSurface` owns that, including counting the trigger as
 * inside so pressing an open trigger does not dismiss-then-reopen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { AnchoredSurface } from "~/shared/anchored";

import {
  currentValue,
  currentValues,
  type CollectionControlGroup,
} from "./collection-controls-model";
import { ControlOptionMark } from "./ControlOptionMark";

export type CollectionControlsPopoverProps = {
  /** The control groups — the same ones the phone sheet renders. */
  readonly groups: readonly CollectionControlGroup[];
  /** The COMMITTED parameters the options are checked against. */
  readonly params: URLSearchParams;
  /** The trigger, for placement and focus restoration. */
  readonly anchorRef: RefObject<HTMLButtonElement | null>;
  /** The surface's accessible name. */
  readonly label: string;
  /** Commit one control's value. `null` clears it. */
  readonly onSelect: (group: CollectionControlGroup, value: string) => void;
  /** Clear every managed control at once. Absent when nothing is set. */
  readonly onReset?: (() => void) | undefined;
  /** Close, and restore focus to the trigger. */
  readonly onClose: () => void;
  /** Bespoke controls the collection passes through (a server-backed picker). */
  readonly children?: ReactNode;
  readonly id?: string;
};

export function CollectionControlsPopover({
  groups,
  params,
  anchorRef,
  label,
  onSelect,
  onReset,
  onClose,
  children,
  id,
}: CollectionControlsPopoverProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  /**
   * Every focusable row in DOM order, rebuilt on each render.
   *
   * A ref array rather than a query at keypress time, because the rows are
   * spread across several `role="group"` sections and a live query would have to
   * re-derive the flat order the arrow keys walk — which is the order the
   * *reader* sees, not the order the groups were declared in, if a group ever
   * renders conditionally.
   */
  const rowsRef = useRef<(HTMLButtonElement | null)[]>([]);
  rowsRef.current = [];

  const register = (node: HTMLButtonElement | null) => {
    if (node) rowsRef.current.push(node);
  };

  /*
   * Focus lands on the surface itself, not on the first option.
   *
   * Focusing an option would announce it as the current choice before the owner
   * has read the group it is in. The surface is `tabIndex={-1}` and announces
   * its own label; the first ArrowDown then moves to the first row, which is the
   * menu pattern's own opening move.
   */
  useEffect(() => {
    surfaceRef.current?.focus();
  }, []);

  const move = useCallback((delta: number) => {
    const rows = rowsRef.current;
    if (rows.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const current = rows.findIndex((row) => row === active);
    const next =
      current === -1
        ? delta > 0
          ? 0
          : rows.length - 1
        : (current + delta + rows.length) % rows.length;
    rows[next]?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        rowsRef.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        rowsRef.current[rowsRef.current.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        // Stopped, or a surface inside a Drawer would close the Drawer too.
        event.stopPropagation();
        onClose();
        break;
      case "Tab":
        // Tab is "I am moving on", not "cancel": the choices are already
        // committed, so the popover simply gets out of the way and lets focus
        // continue to whatever follows the trigger.
        onClose();
        break;
      default:
        break;
    }
  };

  return (
    <AnchoredSurface
      anchorRef={anchorRef}
      align="end"
      onDismiss={onClose}
      onKeyDown={onKeyDown}
      className="dh-collection-popover"
      id={id}
      data-testid="collection-popover"
    >
      <div
        ref={(node) => {
          surfaceRef.current = node;
        }}
        /*
         * The MENU is this element, not the surface.
         *
         * A `role="menu"` may contain only menu items, and the surface also
         * carries the `children` slot — the escape hatch a collection uses for a
         * server-backed picker that cannot be a closed set of options. Naming
         * the surface the menu put that arbitrary content inside it. The menu is
         * therefore the box that holds the groups and Reset, and `children` is
         * its sibling.
         *
         * It is also the single TAB STOP. Every row below is `tabIndex={-1}` and
         * reached with the arrow keys, which is the roving half of the menu
         * pattern; without it each option was its own tab stop while Tab was
         * simultaneously bound to close the popover, so tabbing through the
         * options was impossible by construction.
         */
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className="dh-collection-popover__body"
      >
        {groups.map((group) => {
          const selected = currentValues(group, params);
          const multiple = group.multiple === true;
          return (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              className="dh-collection-popover__group"
            >
              <p className="dh-collection-popover__label" aria-hidden="true">
                {group.label}
              </p>
              {group.options.map((option) => {
                const checked =
                  selected.includes(option.value) ||
                  (selected.length === 0 &&
                    option.value === (group.defaultValue ?? ""));
                return (
                  <button
                    key={option.value}
                    type="button"
                    ref={register}
                    /*
                     * SMART-01 — a multi-select group's options are CHECKBOXES,
                     * not radios, so assistive technology announces that more
                     * than one can be chosen. The group's "any" option stays a
                     * radio-like clear: it is the one option that unsets the
                     * others rather than joining them.
                     */
                    role={
                      multiple && option.value !== (group.defaultValue ?? "")
                        ? "menuitemcheckbox"
                        : "menuitemradio"
                    }
                    aria-checked={checked}
                    tabIndex={-1}
                    className="dh-collection-popover__option"
                    onClick={() => onSelect(group, option.value)}
                    data-testid={`collection-popover-${group.param}-${
                      option.value || "default"
                    }`}
                  >
                    <span className="dh-collection-popover__option-label">
                      <ControlOptionMark mark={option.mark} />
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="dh-collection-popover__option-description">
                        {option.description}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* Reset is a row, not a footer. It appears only when something is set,
            because an always-present "clear everything" on a collection with
            nothing to clear is a control that spends its space being disabled. */}
        {onReset ? (
          <div className="dh-collection-popover__foot">
            <button
              type="button"
              ref={register}
              role="menuitem"
              tabIndex={-1}
              className="dh-collection-popover__reset"
              onClick={onReset}
              data-testid="collection-popover-reset"
            >
              Clear all filters
            </button>
          </div>
        ) : null}
      </div>

      {/* Outside the menu: a server-backed picker is not a menu item. */}
      {children ? (
        <div className="dh-collection-popover__custom">{children}</div>
      ) : null}
    </AnchoredSurface>
  );
}

/** True when at least one managed control is set — what gates Reset. */
export function hasActiveControls(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
): boolean {
  return groups.some((group) => currentValue(group, params) !== null);
}

/** The popover's own state, so a host that needs it does not re-derive it. */
export function useCollectionPopover(): {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
} {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
