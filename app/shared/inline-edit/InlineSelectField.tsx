/**
 * DS-16 — inline SELECT, as a compact anchored menu.
 *
 * Used for the small closed vocabularies people change constantly: a Project's
 * workflow status, a Task's status and priority. Before this component those
 * three lived as a `<select>` inside a form that had to be submitted, a status
 * `<select>` in the Drawer, and a segmented control that navigated — so
 * "set this to Active" cost a different number of interactions on every surface.
 *
 * It is a WAI-ARIA **menu button**, deliberately the same pattern as the DS-12
 * overflow menu rather than a second one: a trigger with `aria-haspopup="menu"`
 * controlling a `role="menu"` of `role="menuitemradio"` items (radio, because
 * exactly one is chosen and the current one must be announced as such). Roving
 * focus, Arrow/Home/End, printable-character typeahead, Escape-to-close with
 * focus restored to the trigger, outside-pointer dismissal, Tab to leave. It is
 * non-modal, so nothing behind it becomes inert and there is no second focus
 * trap.
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
 *
 * ── EDIT-03 — the menu is in the OVERLAY LAYER, and on a phone it is a sheet ──
 * The menu used to be `position: absolute` inside the field. On a record page
 * that was invisible; in a LIST it made the control unusable, because a task row
 * clips its own overflow (the swipe tray slides under it) and the Project column
 * is a fixed 12rem track that clips too. The menu was painted as a 45px sliver
 * of the row showing the value you already had — see `AnchoredSurface`, which
 * now owns the placement for every inline editor rather than each field
 * reinventing it.
 *
 * Below the `md` breakpoint the same options are presented as the shared phone
 * {@link Sheet} of large option rows — the SAME primitive `SelectSheetControl`,
 * Quick Capture and the collection's sort/density choices already use. A 44px
 * menu item anchored to a 28px trigger is a desktop idea, and a phone has no
 * hover to reveal it with; the vocabulary, the ordering and the separated clear
 * command are identical, so it is one field with two presentations rather than
 * two controls.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { AnchoredSurface } from "~/shared/anchored";
import { ChevronDownIcon } from "~/shared/icons";
import { Sheet, SheetOption, SheetOptionList } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

export interface InlineSelectOption {
  readonly value: string;
  readonly label: string;
  /** Optional supporting text, e.g. what a status means. */
  readonly description?: string;
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
   * every other row. A field with a genuinely closed set (priority, status)
   * passes nothing and the list is unchanged.
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

/** How long a typeahead buffer survives before the next key starts a new search. */
const TYPEAHEAD_RESET_MS = 700;

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
  searchAction,
  className,
  "data-testid": testId,
}: InlineSelectFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;
  const errorId = `${generatedId}-error`;

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const compact = useCompactViewport();

  const open = field.editing;
  const selected = options.find((option) => option.value === value) ?? null;

  /**
   * The rendered item list: the real options, plus the clear command when the
   * field is optional AND currently holds something. It is ONE list because
   * roving focus, Home/End and the ref array all index by position — a command
   * bolted on outside it would be unreachable by keyboard, which is exactly the
   * defect the shared primitive exists to prevent.
   */
  const items = useMemo<readonly InlineSelectOption[]>(() => {
    const base =
      !clearable || value === CLEAR_VALUE
        ? options
        : [
            ...options,
            {
              value: CLEAR_VALUE,
              label: clearLabel ?? `Clear ${label.toLocaleLowerCase()}`,
            },
          ];
    return searchAction === undefined
      ? base
      : [
          ...base,
          {
            value: SEARCH_VALUE,
            label: searchAction.label,
            ...(searchAction.description
              ? { description: searchAction.description }
              : {}),
          },
        ];
  }, [clearable, clearLabel, label, options, searchAction, value]);

  const close = useCallback(() => {
    setActiveIndex(-1);
    field.cancel();
  }, [field]);

  const openMenu = useCallback(() => {
    const index = items.findIndex((option) => option.value === value);
    setActiveIndex(index === -1 ? 0 : index);
    field.begin();
  }, [field, items, value]);

  // Pressing the trigger while the menu is open closes it, the way every other
  // menu button in the product does. Without this the press landed on the
  // anchor, which the overlay layer correctly treats as "inside", and the menu
  // simply stayed open.
  const toggle = useCallback(() => {
    if (open) {
      close();
    } else {
      openMenu();
    }
  }, [close, open, openMenu]);

  useEffect(() => {
    if (!open || compact || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, compact, activeIndex]);

  const step = (delta: number) => {
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  };

  /*
   * Typeahead — the standard menu behaviour, and the answer to a LONG list.
   *
   * The Project chooser is handed up to fifty bounded candidates. Fifty items
   * scroll (the overlay layer clamps and scrolls them), but scrolling is not
   * finding, and a text filter inside a `role="menu"` is not a menu any more —
   * it is a combobox, which is a different pattern with different semantics.
   * Typing letters to jump is what the WAI-ARIA menu pattern already specifies,
   * costs no visible chrome, and works for the keyboard user who needs it most.
   */
  const typeaheadRef = useRef({ buffer: "", at: 0 });
  const typeahead = (character: string) => {
    const now = Date.now();
    const state = typeaheadRef.current;
    state.buffer =
      now - state.at > TYPEAHEAD_RESET_MS
        ? character
        : state.buffer + character;
    state.at = now;

    /*
     * A run of the SAME character CYCLES; a genuine word REFINES.
     *
     * Appending unconditionally was wrong for the first of those: pressing "c"
     * twice inside the window made the query "cc", which matches nothing, so
     * the second press did the opposite of what the pattern promises — walking
     * through the Projects that start with "c" is exactly the case typeahead
     * exists for, and it is the common one in a fifty-item list. A repeated
     * character therefore searches for that ONE character, from the item after
     * the current, and wraps.
     */
    const repeating = [...state.buffer].every(
      (letter) => letter === state.buffer[0],
    );
    const query = (repeating ? character : state.buffer).toLocaleLowerCase();
    const current = activeIndex < 0 ? 0 : activeIndex;
    // A cycling search starts AFTER the current item so it advances. A refining
    // one starts AT it, so typing more of the word the cursor already sits on
    // does not skip past it.
    const from = repeating ? current + 1 : current;
    for (let offset = 0; offset < items.length; offset += 1) {
      const index = (from + offset) % items.length;
      const item = items[index];
      if (item && item.label.toLocaleLowerCase().startsWith(query)) {
        setActiveIndex(index);
        return;
      }
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        setActiveIndex(-1);
        field.cancel();
        break;
      default:
        // A printable character searches. Space is deliberately NOT one: in the
        // menu pattern it ACTIVATES the focused item, and swallowing it into a
        // typeahead buffer would take a standard way of choosing an option away
        // from the keyboard. A leading space is not a search term either.
        if (
          event.key.length === 1 &&
          event.key !== " " &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          event.preventDefault();
          typeahead(event.key);
        }
        break;
    }
  };

  const choose = (option: InlineSelectOption) => {
    if (option.disabled) return;
    setActiveIndex(-1);
    // The search command is a HAND-OFF, not a value. It closes the menu and
    // opens the caller's picker; nothing is written here, so a cancelled search
    // leaves the field exactly as it was.
    if (option.value === SEARCH_VALUE) {
      close();
      searchAction?.onSelect();
      return;
    }
    field.submit(option.value);
  };

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
        <span className="dh-inline-select__value">
          {valueNode}
          <ChevronDownIcon className="dh-inline-select__caret" />
        </span>
      </InlineEditShell>

      {open && compact ? (
        /*
         * The phone presentation. The sheet brings DS-03's focus trap, inert
         * background, scroll lock and focus restoration with it — there is never
         * a second modal system in DalyHub — and the rows bring their own 44px
         * targets and `aria-pressed` selection state.
         */
        <Sheet
          title={label}
          opener={field.triggerRef.current}
          onClose={close}
          className="dh-inline-select-sheet"
          data-testid={testId ? `${testId}-sheet` : undefined}
        >
          <SheetOptionList label={label}>
            {options.map((option) => (
              <SheetOption
                key={option.value}
                label={option.label}
                {...(option.description
                  ? { description: option.description }
                  : {})}
                selected={option.value === value}
                disabled={option.disabled}
                onSelect={() => choose(option)}
              />
            ))}
          </SheetOptionList>
          {clearable && value !== CLEAR_VALUE ? (
            <button
              type="button"
              className="dh-inline-select-sheet__clear"
              onClick={() => choose({ value: CLEAR_VALUE, label: "" })}
            >
              {clearLabel ?? `Clear ${label.toLocaleLowerCase()}`}
            </button>
          ) : null}
          {/*
           * The escape hatch, on a PHONE too.
           *
           * The sheet renders `options` rather than the augmented `items` list —
           * deliberately, because its clear command is its own control rather
           * than a row — so a `searchAction` added to `items` reached the
           * desktop menu and silently never appeared here. On the device most
           * likely to be holding a large workspace, the bounded loader page was
           * the whole of the Project chooser with no way past it.
           */}
          {searchAction ? (
            <button
              type="button"
              className="dh-inline-select-sheet__clear"
              data-search="true"
              onClick={() => {
                close();
                searchAction.onSelect();
              }}
            >
              {searchAction.label}
            </button>
          ) : null}
        </Sheet>
      ) : null}

      {open && !compact ? (
        <AnchoredSurface
          anchorRef={field.triggerRef}
          onDismiss={close}
          matchAnchorWidth
          className="dh-inline-select__menu"
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((option, index) => {
            const isClear = clearable && option.value === CLEAR_VALUE;
            const isSearch = option.value === SEARCH_VALUE;
            return (
              <button
                key={option.value === CLEAR_VALUE ? "__clear" : option.value}
                type="button"
                // The search command is a COMMAND — it opens a picker rather
                // than choosing a value — so it is a plain `menuitem` and takes
                // no place in the radio group. Announcing "not selected" for a
                // row that can never be selected would be a lie about the
                // field's state.
                role={isSearch ? "menuitem" : "menuitemradio"}
                // The clear command IS still a radio in the same group: it is
                // the "none of these" choice, and announcing it as unchecked
                // beside a checked value is exactly the state of the field.
                {...(isSearch
                  ? {}
                  : { "aria-checked": option.value === value })}
                aria-disabled={option.disabled ? true : undefined}
                className="dh-inline-select__option"
                data-clear={isClear ? "true" : undefined}
                data-search={option.value === SEARCH_VALUE ? "true" : undefined}
                data-selected={option.value === value ? "true" : undefined}
                tabIndex={activeIndex === index ? 0 : -1}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
              >
                <span className="dh-inline-select__option-label">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="dh-inline-select__option-description">
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </AnchoredSurface>
      ) : null}
    </div>
  );
}
