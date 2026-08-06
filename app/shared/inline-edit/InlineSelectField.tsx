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
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { ChevronDownIcon } from "~/shared/icons";

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
  readonly value: string;
  readonly options: readonly InlineSelectOption[];
  readonly onSave: (next: string) => Promise<InlineSaveOutcome>;
  readonly emptyLabel?: string;
  readonly readOnly?: boolean;
  /** Render the current value with the caller's own chip/pill. */
  readonly renderValue?: (option: InlineSelectOption | null) => React.ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function InlineSelectField({
  label,
  value,
  options,
  onSave,
  emptyLabel = "Not set",
  readOnly = false,
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
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const open = field.editing;
  const selected = options.find((option) => option.value === value) ?? null;

  const close = useCallback(() => {
    setActiveIndex(-1);
    field.cancel();
  }, [field]);

  const openMenu = useCallback(() => {
    const index = options.findIndex((option) => option.value === value);
    setActiveIndex(index === -1 ? 0 : index);
    field.begin();
  }, [field, options, value]);

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
      if (next < 0) return options.length - 1;
      if (next >= options.length) return 0;
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
        setActiveIndex(options.length - 1);
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
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              aria-disabled={option.disabled ? true : undefined}
              className="dh-inline-select__option"
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
          ))}
        </div>
      ) : null}
    </div>
  );
}
