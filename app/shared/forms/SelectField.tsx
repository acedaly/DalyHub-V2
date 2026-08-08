/**
 * DS-06 Shared Forms — the select control (single and multi).
 *
 * One control for choosing from a set of options, as an editable combobox with a
 * listbox popup (WAI-ARIA), fully keyboard operable via the shared
 * {@link useCombobox} model. It supports:
 *   - single or multiple selection (multi shows removable chips);
 *   - client-side type-to-filter, or async loading when the consumer supplies an
 *     `onSearch` callback and drives `options`/`loading`;
 *   - a stale/unavailable current value — a selected value with no matching option
 *     is shown plainly and labelled unavailable, never crashing the control.
 *
 * The value is the stable option value(s); labels are display-only.
 *
 * ── DS-16: replacing a selection must not require clearing it first ──────────
 * A single-select reflects its chosen option's LABEL into the input, which is
 * what makes the closed control read as "Career" rather than as an empty box.
 * That text was then also treated as a search query, so reopening a field that
 * already had a value showed exactly one option — the one already chosen. To
 * pick a different Area you first had to clear the field, which is a step no
 * combobox in any reference product asks for and which no user discovers.
 *
 * The fix is to distinguish the two things the input's text can mean. `typed`
 * is true only once the user has actually edited the box; until then the text is
 * a REFLECTION of the selection and the effective query is empty, so the whole
 * list is offered. Focusing also selects the reflected text, so the first
 * keystroke replaces it rather than appending to it.
 *
 * ── ASSET-03: the same select, presented for a phone ─────────────────────────
 * An anchored listbox is the right desktop presentation and the wrong phone one
 * for a LONG vocabulary: it is capped at 16rem, it opens underneath the software
 * keyboard the focused text input just raised, and inside a scrolling sheet body
 * it competes with that scroll. A single-select may therefore opt in to
 * `sheetOnCompact`, which below the `md` breakpoint renders the field as a 44px
 * trigger that opens the SHARED phone `Sheet` of large option rows. This is not
 * a second select: it is one control with a responsive presentation (the same
 * value, options, label, help, error and `controlRef` contract), exactly as the
 * Inspector is one component that docks on desktop and becomes a sheet on a
 * phone. Every other consumer is untouched by construction — the responsive path
 * exists only where a call site asks for it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useCompactViewport } from "~/shared/viewport";

import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import type { BaseControlProps } from "./control-props";
import { SelectSheetControl } from "./SelectSheetControl";
import type { SelectOption } from "./types";
import { useCombobox } from "./use-combobox";

export interface SelectSharedProps {
  readonly options: readonly SelectOption[];
  /** Async search: when provided, the consumer owns filtering + `options`. */
  readonly onSearch?: (query: string) => void;
  /** Whether options are currently loading (async). */
  readonly loading?: boolean;
  readonly placeholder?: string;
  /** Message when there are no options to show. */
  readonly emptyMessage?: string;
  /**
   * SETTINGS-LABEL — the id of a visible label that ALREADY names this setting, from
   * outside the field.
   *
   * When present the field renders no label row of its own and points its ARIA
   * at that element instead, so the control has exactly one visible label and
   * exactly one programmatic name. It exists for `SettingsRow`'s documented
   * "row-owned name" pattern (`~/shared/settings/SettingsRow`), where the row
   * already renders the setting's name beside the control: composing the two
   * without it printed "Default task destination" twice in one row — the
   * duplicated label the August 2026 interaction audit recorded as finding 7.
   *
   * This is NOT a way to hide a label. The name still comes from real, visible
   * text; it simply belongs to the row rather than to the field.
   */
  readonly labelledBy?: string;
  /**
   * Extra `aria-describedby` ids contributed from outside (a `SettingsRow`'s
   * description and status line). Composed with the field's own help/error ids
   * rather than replacing them.
   */
  readonly describedBy?: string;
  /**
   * ASSET-03 — present this select as the shared phone {@link Sheet} below `md`.
   *
   * Opt-in, and single-select only: a multi-select's chips and incremental
   * add/remove are a different interaction that the option sheet does not model.
   * Reach for it when the vocabulary is long enough that an anchored listbox is
   * a poor phone experience, not by default.
   */
  readonly sheetOnCompact?: boolean;
  /** The compact sheet's heading. Defaults to the field's label. */
  readonly sheetTitle?: string;
  /**
   * A DECORATIVE glyph for an option row in the compact sheet. The label always
   * carries the meaning; this is a callback so the shared control never needs to
   * know a module's icon vocabulary.
   */
  readonly renderOptionIcon?: (option: SelectOption) => ReactNode;
}

/** A single-select field — the only shape the compact sheet presentation takes. */
export type SingleSelectFieldProps = BaseControlProps<string> &
  SelectSharedProps & { readonly multiple?: false };

export type SelectFieldProps =
  | SingleSelectFieldProps
  | (BaseControlProps<readonly string[]> &
      SelectSharedProps & { readonly multiple: true });

function clientFilter(
  options: readonly SelectOption[],
  query: string,
): readonly SelectOption[] {
  const q = query.trim().toLocaleLowerCase();
  if (q.length === 0) return options;
  return options.filter(
    (option) =>
      option.label.toLocaleLowerCase().includes(q) ||
      option.value.toLocaleLowerCase().includes(q),
  );
}

/**
 * The ONE select control. A call site that asked for the compact presentation
 * and can use it (single-select) goes through the responsive wrapper; everything
 * else renders the combobox directly, so no existing consumer gains a media
 * listener or a behaviour change.
 */
export function SelectField(props: SelectFieldProps) {
  if (props.sheetOnCompact === true && props.multiple !== true) {
    return <ResponsiveSelect {...props} />;
  }
  return <SelectCombobox {...props} />;
}

/** Below `md` the field is the phone option sheet; above it, the combobox. */
function ResponsiveSelect(props: SelectFieldProps) {
  const compact = useCompactViewport();
  if (compact && props.multiple !== true) {
    return <SelectSheetControl {...props} />;
  }
  return <SelectCombobox {...props} />;
}

function SelectCombobox(props: SelectFieldProps) {
  const {
    id,
    label,
    error,
    help,
    required,
    disabled,
    readOnly,
    showOptionalCue = true,
    controlRef,
    className,
    options,
    onSearch,
    loading = false,
    placeholder = "Select…",
    emptyMessage = "No matches.",
    labelledBy,
    describedBy: externalDescribedBy,
  } = props;
  const multiple = props.multiple === true;

  const baseId = id ?? `dh-select-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  // When an outside label already names this setting, that element IS the label:
  // the field points every association at it and renders no second one.
  const labelId = labelledBy ?? `${baseId}-label`;
  const invalid = Boolean(error);

  const selectedValues: readonly string[] = useMemo(
    () =>
      multiple
        ? (props.value as readonly string[])
        : props.value
          ? [props.value as string]
          : [],
    [multiple, props.value],
  );

  const [query, setQuery] = useState("");
  /**
   * Whether `query` is something the USER typed, as opposed to the label this
   * control reflected back from the current selection. Only a typed query
   * filters — see the note at the top of this file.
   */
  const [typed, setTyped] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Options currently displayed: async consumers own filtering; otherwise filter
  // locally. Already-selected options are hidden in multi mode.
  const displayOptions = useMemo(() => {
    const base = onSearch ? options : clientFilter(options, typed ? query : "");
    return multiple
      ? base.filter((option) => !selectedValues.includes(option.value))
      : base;
  }, [onSearch, options, query, typed, multiple, selectedValues]);

  const commit = (value: string) => {
    if (readOnly || disabled) return;
    if (multiple) {
      const current = props.value as readonly string[];
      if (!current.includes(value)) {
        (props.onChange as (v: readonly string[]) => void)([...current, value]);
      }
      setQuery("");
      setTyped(false);
      if (onSearch) onSearch("");
      if (displayOptions.filter((option) => !option.disabled).length <= 1) {
        combobox.close();
      }
    } else {
      (props.onChange as (v: string) => void)(value);
      const chosen = options.find((option) => option.value === value);
      setQuery(chosen?.label ?? value);
      // The text is now a reflection of the new selection, not a query — so
      // reopening offers every option rather than only the one just chosen.
      setTyped(false);
      combobox.close();
    }
  };

  const combobox = useCombobox({
    options: displayOptions,
    onSelect: commit,
    baseId,
    disabled: disabled || readOnly,
  });

  // For single select, keep the input text in sync with the selected label when
  // the value changes and the popup is closed.
  const selectedSingle = !multiple
    ? options.find((option) => option.value === (props.value as string))
    : undefined;
  useEffect(() => {
    if (!multiple && !combobox.isOpen) {
      setQuery(
        selectedSingle?.label ?? (props.value ? String(props.value) : ""),
      );
      // Closing without committing abandons the typed query, so the text is a
      // reflection again. Leaving `typed` set here would make the NEXT opening
      // filter by an abandoned search the user can no longer see.
      setTyped(false);
    }
  }, [multiple, combobox.isOpen, selectedSingle?.label, props.value]);

  // Close the popup when focus leaves the whole control.
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
      combobox.close();
      props.onBlur?.();
    }
  };

  const removeSelected = (value: string) => {
    if (readOnly || disabled || !multiple) return;
    const current = props.value as readonly string[];
    (props.onChange as (v: readonly string[]) => void)(
      current.filter((v) => v !== value),
    );
  };

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

  const unavailableSingle =
    !multiple && props.value && !selectedSingle ? String(props.value) : null;

  const rootClassName = ["dh-field", "dh-field--select", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      role="group"
      aria-labelledby={labelId}
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

      <div
        className="dh-field__control dh-combobox"
        ref={wrapperRef}
        onBlur={handleBlur}
      >
        {multiple && selectedValues.length > 0 ? (
          <ul className="dh-select__chips">
            {selectedValues.map((value) => {
              const option = options.find((o) => o.value === value);
              return (
                <li key={value} className="dh-select__chip">
                  <span className="dh-select__chip-text">
                    {option?.label ?? value}
                    {option ? null : (
                      <span className="dh-select__unavailable">
                        {" "}
                        (unavailable)
                      </span>
                    )}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="dh-select__chip-remove"
                      disabled={disabled}
                      aria-label={`Remove ${option?.label ?? value}`}
                      onClick={() => removeSelected(value)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="dh-combobox__field">
          <input
            id={baseId}
            className="dh-input dh-combobox__input"
            type="text"
            value={query}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            aria-labelledby={labelId}
            aria-invalid={invalid || undefined}
            aria-errormessage={invalid ? errorId : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            ref={(node) => controlRef?.(node)}
            {...combobox.comboboxProps}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setTyped(true);
              combobox.open();
              if (onSearch) onSearch(next);
            }}
            onFocus={(event) => {
              if (readOnly || disabled) return;
              combobox.open();
              // Select the reflected label so the first keystroke REPLACES the
              // current choice instead of appending to it — and ask an async
              // consumer for its unfiltered list, since its `options` are
              // otherwise still narrowed by whatever was last searched.
              if (!typed) {
                event.target.select();
                if (onSearch) onSearch("");
              }
            }}
            onKeyDown={combobox.onInputKeyDown}
          />
          {!multiple && (props.value || query) && !readOnly ? (
            <button
              type="button"
              className="dh-combobox__clear"
              aria-label="Clear selection"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                (props.onChange as (v: string) => void)("");
                setQuery("");
                setTyped(false);
                if (onSearch) onSearch("");
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>

        {combobox.isOpen ? (
          <ul
            className="dh-listbox"
            id={combobox.listboxId}
            role="listbox"
            aria-label={label}
          >
            {loading ? (
              <li className="dh-listbox__status" role="presentation">
                Loading…
              </li>
            ) : displayOptions.length === 0 ? (
              <li className="dh-listbox__status" role="presentation">
                {emptyMessage}
              </li>
            ) : (
              displayOptions.map((option, index) => {
                const selected = selectedValues.includes(option.value);
                return (
                  // Keyboard selection is handled on the combobox input via
                  // aria-activedescendant (WAI-ARIA combobox); the option's
                  // click/mousedown is the mouse path only.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={option.value}
                    id={combobox.optionId(index)}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    className="dh-listbox__option"
                    data-active={index === combobox.activeIndex || undefined}
                    data-disabled={option.disabled || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => combobox.setActiveIndex(index)}
                    onClick={() => {
                      if (!option.disabled) commit(option.value);
                    }}
                  >
                    <span
                      className="dh-listbox__option-check"
                      aria-hidden="true"
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="dh-listbox__option-body">
                      <span className="dh-listbox__option-label">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="dh-listbox__option-desc">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}

        {unavailableSingle ? (
          <p className="dh-select__unavailable-note">
            Current value <code>{unavailableSingle}</code> is no longer
            available.
          </p>
        ) : null}
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
    </div>
  );
}
