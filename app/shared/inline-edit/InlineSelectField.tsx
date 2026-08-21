/**
 * DS-16 — inline SELECT, as a compact contextual menu.
 *
 * Used for the small closed vocabularies people change constantly: a Project's
 * workflow status, a Task's status and priority. Before this component those
 * three lived as a `<select>` inside a form that had to be submitted, a status
 * `<select>` in the Drawer, and a segmented control that navigated — so
 * "set this to Active" cost a different number of interactions on every surface.
 *
 * ── DHDS-09 — the menu is now the SHARED menu ───────────────────────────────
 * This file used to carry its own roving-focus loop, its own typeahead, its own
 * Escape/Tab contract and its own phone-sheet swap, all of which `OverflowMenu`
 * and `CollectionControlsPopover` also carried. It now composes
 * `~/shared/floating` → `Menu`, so there is ONE menu-button implementation in
 * DalyHub. What is left here is the field: the trigger, the read state, the
 * save, and the two commands the option list ends with.
 *
 * The DOM contract is unchanged in every respect a consumer can observe — the
 * trigger, `aria-haspopup`, `aria-expanded`, `role="menuitemradio"` on the
 * values, the separated clear command, the search hand-off — with one
 * deliberate convergence: the PHONE presentation is now the same `role="menu"`
 * inside the shared sheet that the overflow menu already used, rather than a
 * second option-row vocabulary (`SheetOption`) with `aria-pressed` selection.
 * One field, one set of roles, two containers.
 *
 * Choosing an option saves immediately: a menu that then required a Save button
 * would be a form, and this exists precisely so that a status change is one
 * gesture. A REFUSED save leaves the field showing the previous value with the
 * server's message beside it — the menu is not reopened and nothing is silently
 * applied.
 *
 * ── An optional value is EMPTY, not "No priority" (EDIT-02) ──────────────────
 * The pattern this replaces put the unset state in the options list, as a real
 * choice labelled `No priority` / `No project` / `Not set`. Two things go wrong
 * with that, and the August interaction audit found both:
 *
 *   1. it reads as a SELECTED DEFAULT. A task nobody has triaged is not "set to
 *      No priority" — the field has simply not been filled in, and saying
 *      otherwise makes an absence look like a decision;
 *   2. it competes with the real values for the first item in the menu, which is
 *      where the eye and the keyboard both start.
 *
 * So `options` carries only REAL values, an unset field renders `emptyLabel` in
 * the shell's quiet empty style, and clearing — where the data model permits it
 * — is one separated command at the END of the menu, present only when there is
 * something to clear. Changing `Current value → New value` therefore stays what
 * it always should have been: open, choose, done. Never "clear it first".
 */

import { useCallback, useId, useMemo } from "react";

import { Menu } from "~/shared/floating";
import type { FloatingMenuOption } from "~/shared/floating";
import { ChevronDownIcon } from "~/shared/icons";
import { useCompactViewport } from "~/shared/viewport";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

export interface InlineSelectOption {
  readonly value: string;
  readonly label: string;
  /** Optional supporting text, e.g. what a status means. */
  readonly description?: string;
  /**
   * DHDS-09 — a leading identity MARK for the option row: a priority flag, a
   * Project's accent tile, a status dot.
   *
   * It replaces the `renderOption` escape hatch for the case that hatch was
   * actually used for, and fixes what the hatch cost: replacing the whole row
   * also replaced the trailing CHECK, so the two surfaces that drew a priority
   * flag were the two where the menu did not say which priority was current.
   * The mark slots into the shared option anatomy instead, so the row is
   * mark + label + check like every other row in the product.
   *
   * Decorative by construction — the label carries the meaning.
   */
  readonly mark?: React.ReactNode;
  readonly disabled?: boolean;
}

export interface InlineSelectFieldProps {
  readonly label: string;
  /** The stored value, or `""` when the (optional) field is unset. */
  readonly value: string;
  /** The REAL values only — never an "unset" pseudo-option (see above). */
  readonly options: readonly InlineSelectOption[];
  /** Persist. `""` is passed when the clear command is chosen. */
  readonly onSave: (next: string) => Promise<InlineSaveOutcome>;
  readonly emptyLabel?: string;
  readonly readOnly?: boolean;
  /**
   * Offer a clear command for an OPTIONAL field. It appears only when a value is
   * actually set, because "clear" with nothing to clear is a dead control.
   */
  readonly clearable?: boolean;
  /** Wording for that command. Defaults to `Clear <label>`. */
  readonly clearLabel?: string;
  /** Render the current value with the caller's own chip/pill. */
  readonly renderValue?: (option: InlineSelectOption | null) => React.ReactNode;
  /** Render an option row with the caller's own visual language. */
  readonly renderOption?: (option: InlineSelectOption) => React.ReactNode;
  /**
   * DS-04 — the ESCAPE HATCH at the end of a bounded option set.
   *
   * The Project chooser is handed the loader's bounded candidates, never "all
   * projects", so for a large workspace the menu is a page of the answer rather
   * than the answer. Typeahead searches what is IN the menu; this searches what
   * is not, by handing the choice to the shared searchable picker.
   *
   * It is an ordinary item in the same roving-focus list, so it is reachable by
   * keyboard, announced by a screen reader and typeahead-matchable, exactly like
   * every other row — but as a `menuitem` rather than a `menuitemradio`, because
   * it is a command rather than one of the field's values. A field with a
   * genuinely closed set (priority, status) passes nothing and the list is
   * unchanged.
   */
  readonly searchAction?: {
    readonly label: string;
    readonly description?: string;
    readonly onSelect: () => void;
  };
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** The sentinel the clear command submits. Never a real option value. */
const CLEAR_VALUE = "";

/**
 * The sentinel the search command carries. It never reaches `onSave` — choosing
 * it hands off to the caller's picker and closes the menu — so it must be a
 * value no real option can hold.
 */
const SEARCH_VALUE = "__dh-search";

export function InlineSelectField({
  label,
  value,
  options,
  onSave,
  emptyLabel = "Not set",
  readOnly = false,
  clearable = false,
  clearLabel,
  renderValue,
  renderOption,
  searchAction,
  className,
  "data-testid": testId,
}: InlineSelectFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;
  const errorId = `${generatedId}-error`;
  const compact = useCompactViewport();

  const open = field.editing;
  const selected = options.find((option) => option.value === value) ?? null;

  /**
   * The rendered item list: the real options, plus the clear command when the
   * field is optional AND currently holds something, plus the search hand-off.
   * It is ONE list because roving focus, Home/End and typeahead all walk it —
   * a command bolted on outside would be unreachable by keyboard, which is
   * exactly the defect the shared primitive exists to prevent.
   */
  const items = useMemo<readonly FloatingMenuOption[]>(() => {
    const base: FloatingMenuOption[] = options.map((option) => ({
      id: option.value,
      label: option.label,
      ...(option.description ? { support: option.description } : {}),
      ...(option.mark ? { mark: option.mark } : {}),
      ...(option.disabled ? { disabled: option.disabled } : {}),
    }));
    if (clearable && value !== CLEAR_VALUE) {
      base.push({
        id: CLEAR_VALUE,
        label: clearLabel ?? `Clear ${label.toLocaleLowerCase()}`,
        tone: "quiet",
        separatorBefore: true,
      });
    }
    if (searchAction !== undefined) {
      base.push({
        id: SEARCH_VALUE,
        label: searchAction.label,
        ...(searchAction.description
          ? { support: searchAction.description }
          : {}),
        isCommand: true,
        tone: "quiet",
        separatorBefore: clearable && value !== CLEAR_VALUE ? false : true,
      });
    }
    return base;
  }, [clearable, clearLabel, label, options, searchAction, value]);

  /**
   * Dismissal without a choice. `cancel` returns focus to the trigger on the
   * render after the field closes, on every path, which is the DS-16 focus
   * contract — so this deliberately does not also move focus itself.
   */
  const close = useCallback(() => {
    field.cancel();
  }, [field]);

  // Pressing the trigger while the menu is open closes it, the way every other
  // menu button in the product does. Without this the press landed on the
  // anchor, which the overlay layer correctly treats as "inside", and the menu
  // simply stayed open.
  const toggle = useCallback(() => {
    if (open) {
      field.cancel();
    } else {
      field.begin();
    }
  }, [field, open]);

  const choose = useCallback(
    (id: string) => {
      // The search command is a HAND-OFF, not a value. It closes the menu and
      // opens the caller's picker; nothing is written here, so a cancelled
      // search leaves the field exactly as it was.
      if (id === SEARCH_VALUE) {
        searchAction?.onSelect();
        return;
      }
      field.submit(id);
    },
    [field, searchAction],
  );

  /*
   * Choosing a VALUE deliberately does not close the menu; the SAVE does.
   *
   * `useInlineEdit` is a state machine whose `submit` is only legal while the
   * field is open — a submission dispatched from `view` is dropped, and with it
   * the pending state and, worse, the REFUSAL. So the shared menu's default
   * "close first, then run the handler" (which is right for a command, because
   * it keeps a dialog's opener alive) is exactly wrong here. The field closes
   * when the server says yes, and stays open with the server's message when it
   * says no.
   *
   * The search command is not a value and keeps the default: it closes, and
   * then hands off to the caller's picker.
   */
  const menuItems = useMemo<readonly FloatingMenuOption[]>(
    () =>
      items.map((item) => ({
        ...item,
        ...(item.id === SEARCH_VALUE ? {} : { keepOpen: true }),
        onSelect: () => choose(item.id),
      })),
    [choose, items],
  );

  const valueNode = renderValue ? renderValue(selected) : selected?.label;

  return (
    <div className="dh-inline-select">
      <InlineEditShell
        label={label}
        valueText={selected?.label ?? emptyLabel}
        isEmpty={selected === null}
        emptyLabel={emptyLabel}
        editing={false}
        onActivate={toggle}
        triggerRef={field.triggerRef}
        triggerProps={{
          id: triggerId,
          "aria-haspopup": compact ? "dialog" : "menu",
          "aria-expanded": open,
          /*
           * `menuId` belongs to the anchored MENU, so it may only be referenced
           * while the menu is what opened. The phone presentation is a `Sheet`,
           * which owns its own generated ids and never carries this one — so on
           * a phone the attribute pointed at an element that does not exist,
           * which is a broken relationship rather than a missing one. The sheet
           * needs no `aria-controls`: it is a modal dialog that takes focus, and
           * the trigger's `aria-expanded` already says it is open.
           */
          "aria-controls": open && !compact ? menuId : undefined,
        }}
        pending={field.pending}
        error={field.error}
        errorId={errorId}
        readOnly={readOnly}
        variant="text"
        className={className}
        data-testid={testId}
      >
        {/*
         * POLISH-01 — the value is WRAPPED, so it can be truncated without
         * taking the caret with it.
         *
         * `__value` is an inline-flex box, and an inline-level box sizes to its
         * max-content and then overflows a narrower parent rather than
         * shrinking into it. On a Tasks row between 820 and 1100px the Project
         * cell is 4rem and a real Project name is 130–190px, so the value ran
         * straight out of the cell, out of the row and out of the document —
         * a page-level horizontal scrollbar on the product's most-used screen.
         *
         * Bounding `__value` alone would clip the chevron off the end of a long
         * name, which is worse than the overflow: the field would stop looking
         * editable exactly when it is too narrow to read. So the label is its
         * own element that takes the ellipsis, and the caret stays `flex: none`
         * beside it.
         */}
        <span className="dh-inline-select__value">
          <span className="dh-inline-select__label">{valueNode}</span>
          <ChevronDownIcon className="dh-inline-select__caret" />
        </span>
      </InlineEditShell>

      {open ? (
        <Menu
          anchorRef={field.triggerRef}
          label={label}
          items={menuItems}
          value={value}
          onClose={close}
          matchAnchorWidth
          id={menuId}
          className="dh-inline-select__menu"
          {...(renderOption
            ? {
                renderOption: (item: FloatingMenuOption) =>
                  /*
                   * Only the field's real VALUES get the caller's rendering. A
                   * clear or search command is not one of them, and handing
                   * `renderValue`-shaped data to a priority flag renderer would
                   * ask it to draw a priority that does not exist.
                   */
                  item.tone === "quiet"
                    ? item.label
                    : renderOption({
                        value: item.id,
                        label: item.label,
                        ...(item.support ? { description: item.support } : {}),
                      }),
              }
            : {})}
          {...(testId ? { "data-testid": `${testId}-menu` } : {})}
        />
      ) : null}
    </div>
  );
}
