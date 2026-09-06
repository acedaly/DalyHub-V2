/**
 * V2.10 LIFE-02 — choosing what an obligation is ABOUT.
 *
 * The subject is an optional FIELD, not a parent, and this control is written to
 * say so: it opens empty, "About nothing in particular" is the state it starts
 * in and returns to with one press, and nothing is required to save.
 *
 * ── Why a combobox and not a select ─────────────────────────────────────────
 * The candidate set is every record in the workspace. A select would either be
 * an unbounded list or a lie about what can be chosen, so this searches — over
 * the SAME bounded, workspace-scoped, accessible-only search the link picker
 * uses (`searchLinkTargets`), through the module's own resource route. Reusing
 * that search is what guarantees this control and the link picker can never
 * disagree about which records exist.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 * It does not create a link. `obligation.subject` is written by the repository
 * as the projection of the foreign key (ADR-118 decision 1), inside the same
 * transaction; a picker that also wrote a link would be the second writer that
 * decision exists to prevent. This control produces a value for a form field
 * and nothing else.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { AnchoredSurface } from "~/shared/anchored";
import { EntityIcon, isEntityType } from "~/shared/entity";
import { Field } from "~/shared/forms";
import { useCombobox } from "~/shared/forms/use-combobox";
import { OptionContent } from "~/shared/floating";

/** One candidate subject, as the module's search route returns it. */
export interface ObligationSubjectOption {
  readonly id: string;
  readonly type: string;
  readonly title: string;
}

export interface SubjectPickerProps {
  readonly id?: string;
  readonly label?: string;
  readonly help?: string;
  /** The chosen subject, or null for "about nothing in particular". */
  readonly value: ObligationSubjectOption | null;
  readonly onChange: (subject: ObligationSubjectOption | null) => void;
  /** Async, workspace-scoped candidate search. Accessible records only. */
  readonly searchSubjects: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly ObligationSubjectOption[]>;
  readonly disabled?: boolean;
  readonly error?: string | null;
}

const SEARCH_DEBOUNCE_MS = 250;

export function SubjectPicker({
  id,
  label = "About",
  help = "A vehicle, a person, a project — or nothing at all, which is the ordinary case.",
  value,
  onChange,
  searchSubjects,
  disabled = false,
  error,
}: SubjectPickerProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly ObligationSubjectOption[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const select = useCallback(
    (optionId: string) => {
      const found = options.find((option) => option.id === optionId);
      if (!found) return;
      onChange(found);
      setQuery("");
      setOptions([]);
    },
    [onChange, options],
  );

  const combobox = useCombobox({
    options: options.map((option) => ({ value: option.id })),
    onSelect: select,
    baseId,
    disabled,
  });

  const { close } = combobox;

  useEffect(() => {
    const text = query.trim();
    if (text.length === 0) {
      setOptions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchSubjects(text, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setOptions(found);
        })
        .catch(() => {
          if (!controller.signal.aborted) setOptions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, searchSubjects]);

  return (
    <Field
      id={baseId}
      label={label}
      help={help}
      error={error}
      disabled={disabled}
    >
      {(control) => (
        <div className="dh-subject-picker">
          {value ? (
            <p className="dh-subject-picker__chosen">
              <span className="dh-subject-picker__glyph" aria-hidden="true">
                <EntityIcon
                  type={isEntityType(value.type) ? value.type : "obligation"}
                />
              </span>
              <span className="dh-subject-picker__title">{value.title}</span>
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                disabled={disabled}
                onClick={() => {
                  onChange(null);
                  setQuery("");
                }}
              >
                Clear
                <span className="dh-visually-hidden"> {value.title}</span>
              </button>
            </p>
          ) : (
            <>
              <input
                id={control.id}
                ref={inputRef}
                className="dh-input"
                type="text"
                value={query}
                placeholder="Search your records…"
                autoComplete="off"
                disabled={control.disabled}
                aria-describedby={control.describedBy}
                aria-invalid={control.invalid || undefined}
                {...combobox.comboboxProps}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (!combobox.isOpen) combobox.open();
                }}
                onKeyDown={combobox.onInputKeyDown}
                onBlur={() => window.setTimeout(close, 120)}
              />
              {/* The absence is STATED, so "about nothing" reads as a choice
                  rather than as an empty field the owner forgot to fill in. */}
              <p className="dh-subject-picker__none">
                About nothing in particular.
              </p>
            </>
          )}
          {combobox.isOpen && !value && query.trim().length > 0 ? (
            <AnchoredSurface anchorRef={inputRef} matchAnchorWidth>
              <ul
                className="dh-floating dh-listbox"
                id={combobox.listboxId}
                role="listbox"
                aria-label={`${label} results`}
              >
                {searching && options.length === 0 ? (
                  <li className="dh-floating__status" role="presentation">
                    Searching…
                  </li>
                ) : null}
                {!searching && options.length === 0 ? (
                  <li className="dh-floating__status" role="presentation">
                    No records match.
                  </li>
                ) : null}
                {options.map((option, index) => (
                  // Keyboard selection is handled on the combobox input via
                  // aria-activedescendant (WAI-ARIA combobox); the option's
                  // mouse handlers are the pointer path only.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={option.id}
                    id={combobox.optionId(index)}
                    role="option"
                    aria-selected={false}
                    className="dh-option"
                    data-active={index === combobox.activeIndex || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => combobox.setActiveIndex(index)}
                    onClick={() => select(option.id)}
                  >
                    <OptionContent
                      mark={
                        <EntityIcon
                          type={
                            isEntityType(option.type)
                              ? option.type
                              : "obligation"
                          }
                        />
                      }
                      label={option.title || "Untitled"}
                    />
                  </li>
                ))}
              </ul>
            </AnchoredSurface>
          ) : null}
        </div>
      )}
    </Field>
  );
}
