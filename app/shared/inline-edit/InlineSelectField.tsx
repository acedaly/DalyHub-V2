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
 * focus, Arrow/Home/End, Escape-to-close with focus restored to the trigger,
 * outside-pointer dismissal, Tab to leave. It is non-modal, so nothing behind it
 * becomes inert and there is no second focus trap.
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

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { ChevronDownIcon } from "~/shared/icons";

import { InlineEditShell } from "./InlineEditShell";
import { useAnchoredAlignment } from "./use-anchored-alignment";
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
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** The sentinel the clear command submits. Never a real option value. */
const CLEAR_VALUE = "";

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
  className,
  "data-testid": testId,
}: InlineSelectFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const menuId = `${generatedId}-menu`;
  const errorId = `${generatedId}-error`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const open = field.editing;
  const selected = options.find((option) => option.value === value) ?? null;
  const alignment = useAnchoredAlignment(menuRef, open);

  /**
   * The rendered item list: the real options, plus the clear command when the
   * field is optional AND currently holds something. It is ONE list because
   * roving focus, Home/End and the ref array all index by position — a command
   * bolted on outside it would be unreachable by keyboard, which is exactly the
   * defect the shared primitive exists to prevent.
   */
  const items = useMemo<readonly InlineSelectOption[]>(() => {
    if (!clearable || value === CLEAR_VALUE) return options;
    return [
      ...options,
      {
        value: CLEAR_VALUE,
        label: clearLabel ?? `Clear ${label.toLocaleLowerCase()}`,
      },
    ];
  }, [clearable, clearLabel, label, options, value]);

  const close = useCallback(() => {
    setActiveIndex(-1);
    field.cancel();
  }, [field]);

  const openMenu = useCallback(() => {
    const index = items.findIndex((option) => option.value === value);
    setActiveIndex(index === -1 ? 0 : index);
    field.begin();
  }, [field, items, value]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        // An outside press dismisses WITHOUT pulling focus back — the user is
        // already on their way somewhere else.
        setActiveIndex(-1);
        field.cancel();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, field]);

  const step = (delta: number) => {
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
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
        break;
    }
  };

  const valueNode = renderValue ? renderValue(selected) : selected?.label;

  return (
    <div className="dh-inline-select" ref={containerRef}>
      <InlineEditShell
        label={label}
        valueText={selected?.label ?? emptyLabel}
        isEmpty={selected === null}
        emptyLabel={emptyLabel}
        editing={false}
        onActivate={openMenu}
        triggerRef={field.triggerRef}
        triggerProps={{
          id: triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": open ? menuId : undefined,
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

      {open ? (
        <div
          className="dh-inline-select__menu"
          id={menuId}
          ref={menuRef}
          data-align={alignment}
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((option, index) => {
            const isClear = clearable && option.value === CLEAR_VALUE;
            return (
              <button
                key={option.value === CLEAR_VALUE ? "__clear" : option.value}
                type="button"
                role="menuitemradio"
                // The clear command is still a radio in the same group: it is
                // the "none of these" choice, and announcing it as unchecked
                // beside a checked value is exactly the state of the field.
                aria-checked={option.value === value}
                aria-disabled={option.disabled ? true : undefined}
                className="dh-inline-select__option"
                data-clear={isClear ? "true" : undefined}
                tabIndex={activeIndex === index ? 0 : -1}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  if (option.disabled) return;
                  setActiveIndex(-1);
                  field.submit(option.value);
                }}
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
        </div>
      ) : null}
    </div>
  );
}
