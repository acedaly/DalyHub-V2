/**
 * ASSET-03 — the COMPACT presentation of the one shared select.
 *
 * Below the `md` breakpoint a single-select that opted in with `sheetOnCompact`
 * renders as a 44px trigger which opens the shared phone {@link Sheet} of large
 * option rows (`SheetOptionList`) — the SAME primitive Quick Capture's chooser
 * and the collection's sort/density choices use. Nothing here is a new modal, a
 * new focus trap or a second selection vocabulary: the sheet brings DS-03's
 * focus, inert-background, scroll-lock and focus-restoration machinery with it,
 * and the rows bring their own 44px targets and `aria-pressed` selection state.
 *
 * The contract is deliberately identical to the combobox presentation, because
 * it is the same field:
 *   - the value is the option's stable `value`; an empty value is genuinely
 *     empty and renders the `placeholder` — never a selectable "Choose…" row
 *     and never a preselected first option (DS-16);
 *   - `controlRef` points at the trigger, so `useForm`'s first-invalid focus and
 *     the error summary's "jump to field" reach it;
 *   - label, required cue, help and error markup are the shared field anatomy,
 *     with the same derived ids;
 *   - choosing an option commits it and closes the sheet, returning focus to the
 *     trigger — so a selection can be replaced by opening the sheet again, with
 *     the whole list offered every time.
 *
 * `group` on an option is PRESENTATION ONLY: it sorts a long vocabulary into
 * scannable headings and is never stored or submitted.
 */

import { useRef, useState } from "react";

import { ChevronDownIcon } from "~/shared/icons";
import { Sheet, SheetOption, SheetOptionList } from "~/shared/sheet";

import { clearControlLabel } from "./clear-label";
import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import type { SingleSelectFieldProps } from "./SelectField";
import type { SelectOption } from "./types";

/** Options in presentation order, partitioned by their optional group heading. */
export function groupSelectOptions(options: readonly SelectOption[]): readonly {
  readonly group: string | null;
  readonly options: SelectOption[];
}[] {
  const groups: { group: string | null; options: SelectOption[] }[] = [];
  for (const option of options) {
    const key = option.group ?? null;
    const existing = groups.find((candidate) => candidate.group === key);
    if (existing) {
      existing.options.push(option);
    } else {
      groups.push({ group: key, options: [option] });
    }
  }
  return groups;
}

export function SelectSheetControl({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  required,
  disabled,
  readOnly,
  showOptionalCue = true,
  controlRef,
  className,
  options,
  placeholder = "Select…",
  emptyMessage = "No options.",
  labelledBy,
  describedBy: externalDescribedBy,
  sheetTitle,
  renderOptionIcon,
}: SingleSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const baseId = id ?? `dh-select-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const labelId = labelledBy ?? `${baseId}-label`;
  const invalid = Boolean(error);

  const selected = options.find((option) => option.value === value) ?? null;
  const describedBy =
    [
      composeDescribedBy({
        helpId: help ? helpId : null,
        errorId: invalid ? errorId : null,
      }),
      externalDescribedBy,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const groups = groupSelectOptions(options);

  const close = () => {
    setOpen(false);
    onBlur?.();
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    onBlur?.(option.value);
  };

  return (
    <div
      className={[
        "dh-field",
        "dh-field--select",
        "dh-field--select-sheet",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      /*
       * No labelled group around a single control — see the same note in
       * `SelectField`. The trigger already names itself with the field's label,
       * so a group carrying that label as well would put one accessible name on
       * two nested elements.
       */
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
    >
      {labelledBy ? null : (
        <div className="dh-field__label-row">
          <span id={labelId} className="dh-field__label-text">
            {label}
          </span>
          {required ? (
            <span className="dh-field__required">
              <span aria-hidden="true">*</span>
              <span className="dh-visually-hidden"> (required)</span>
            </span>
          ) : showOptionalCue ? (
            <span className="dh-field__optional">Optional</span>
          ) : null}
        </div>
      )}

      <div className="dh-field__control">
        {/*
          The trigger names itself with the field's label PLUS its own text, so
          it is announced as "Type, Vehicle" (or "Type, Choose a type…") rather
          than as a bare value with no idea what it belongs to.
        */}
        <button
          type="button"
          id={baseId}
          className="dh-select-trigger"
          ref={(node) => {
            triggerRef.current = node;
            controlRef?.(node);
          }}
          aria-labelledby={`${labelId} ${baseId}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          /*
            The trigger is a real `button`, and the button role supports neither
            `aria-invalid` nor `aria-errormessage`. The error is therefore part
            of the control's DESCRIPTION (`composeDescribedBy` puts help first,
            then the current problem), which is announced on focus and is what a
            button can honestly carry. The required cue stays in the visible
            label row exactly as it does for the combobox presentation.
          */
          aria-describedby={describedBy}
          disabled={disabled || readOnly}
          onClick={() => setOpen(true)}
          data-placeholder={selected ? undefined : true}
        >
          <span className="dh-select-trigger__value">
            {selected ? selected.label : placeholder}
          </span>
          <span className="dh-select-trigger__icon" aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </button>
      </div>

      <div className="dh-field__messages">
        {help ? (
          <p id={helpId} className="dh-field__help">
            {help}
          </p>
        ) : null}
        <div className="dh-field__error-slot" aria-live="polite">
          {invalid ? (
            <p id={errorId} className="dh-field__error">
              <span className="dh-field__error-icon" aria-hidden="true">
                !
              </span>
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {open ? (
        <Sheet
          title={sheetTitle ?? label}
          opener={triggerRef.current}
          onClose={close}
          className="dh-select-sheet"
          data-testid={`${baseId}-sheet`}
        >
          {options.length === 0 ? (
            <p className="dh-select-sheet__empty">{emptyMessage}</p>
          ) : (
            groups.map((group) => (
              <div className="dh-select-sheet__group" key={group.group ?? "—"}>
                {group.group ? (
                  <h3 className="dh-select-sheet__group-title">
                    {group.group}
                  </h3>
                ) : null}
                <SheetOptionList label={group.group ?? label}>
                  {group.options.map((option) => (
                    <SheetOption
                      key={option.value}
                      label={option.label}
                      {...(option.description
                        ? { description: option.description }
                        : {})}
                      {...(renderOptionIcon
                        ? { icon: renderOptionIcon(option) }
                        : {})}
                      selected={option.value === value}
                      disabled={option.disabled}
                      onSelect={() => choose(option)}
                      data-testid={`${baseId}-option-${option.value}`}
                    />
                  ))}
                </SheetOptionList>
              </div>
            ))
          )}
          {/*
            An OPTIONAL field must be able to return to genuinely empty. A
            required one has no such state, so it is not offered a way to create
            one — the prompt lives in the placeholder, never as a pickable row.

            DS-17 — the row names the FIELD it clears ("Clear due date"), not the
            act of clearing, so two selects on one surface are two distinguishable
            commands rather than two rows reading "Clear selection". The wording
            is shared with `SelectField` and `InlineSelectField`.
          */}
          {!required && value ? (
            <button
              type="button"
              className="dh-select-sheet__clear"
              onClick={() => {
                onChange("");
                setOpen(false);
                onBlur?.("");
              }}
              data-testid={`${baseId}-clear`}
            >
              {clearControlLabel(label)}
            </button>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
