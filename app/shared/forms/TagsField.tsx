/**
 * DS-06 Shared Forms — the tags control.
 *
 * A CONTROLLED string collection: type a tag and press Enter (or comma) to add,
 * press Backspace in the empty input to remove the last, and each tag chip has a
 * keyboard-reachable remove button. Normalisation, duplicate prevention and the
 * count/length limits come from the pure tags model. It is NOT a tags database or
 * a suggestions service — it only edits an in-memory array the consumer owns.
 *
 * Accessibility: the field is a labelled group; the input carries the add
 * instruction via `aria-describedby`; adds/removes (and rejections like
 * duplicates or a hit limit) are announced through a polite live region; every
 * chip's remove is a real button.
 */

import { useState } from "react";

import {
  addTag,
  removeTagAt,
  resolveTagConstraints,
  type TagRejectionReason,
} from "./tags";
import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import type { BaseControlProps } from "./control-props";
import type { TagConstraints } from "./types";

export interface TagsFieldProps extends BaseControlProps<readonly string[]> {
  /** Bounds and comparison behaviour for the collection. */
  readonly constraints?: TagConstraints;
  readonly placeholder?: string;
}

const REJECTION_MESSAGES: Record<TagRejectionReason, string> = {
  empty: "",
  duplicate: "That tag is already added.",
  limit: "You've reached the maximum number of tags.",
  "too-long": "That tag is too long.",
};

export function TagsField({
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
  constraints,
  placeholder = "Add a tag…",
}: TagsFieldProps) {
  const baseId = id ?? `dh-tags-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const invalid = Boolean(error);
  const resolved = resolveTagConstraints(constraints);

  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState("");

  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
    extraIds: [hintId],
  });

  // Commit the current draft, returning the resulting tag collection (unchanged
  // when nothing was added). The caller can pass this exact array to the host's
  // blur validation so a just-added tag is not validated against the stale array.
  const commitDraft = (): readonly string[] => {
    if (readOnly || disabled) return value;
    const result = addTag(value, draft, constraints);
    if (result.added) {
      onChange(result.tags);
      setDraft("");
      setAnnounce(`Added ${result.tags[result.tags.length - 1]}.`);
      return result.tags;
    }
    if (result.reason && result.reason !== "empty") {
      setAnnounce(REJECTION_MESSAGES[result.reason]);
    }
    return value;
  };

  const remove = (index: number) => {
    if (readOnly || disabled) return;
    const removed = value[index];
    onChange(removeTagAt(value, index));
    setAnnounce(`Removed ${removed}.`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      event.preventDefault();
      remove(value.length - 1);
    }
  };

  const rootClassName = ["dh-field", "dh-field--tags", className]
    .filter(Boolean)
    .join(" ");
  const atLimit = value.length >= resolved.maxTags;

  return (
    <div
      className={rootClassName}
      role="group"
      aria-labelledby={labelId}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
    >
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

      <div className="dh-field__control">
        <div className="dh-tags">
          <ul className="dh-tags__list">
            {value.map((tag, index) => (
              <li key={`${tag}-${index}`} className="dh-tags__chip">
                <span className="dh-tags__chip-text">{tag}</span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="dh-tags__chip-remove"
                    disabled={disabled}
                    onClick={() => remove(index)}
                    aria-label={`Remove ${tag}`}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                ) : null}
              </li>
            ))}
            {!readOnly ? (
              <li className="dh-tags__input-item">
                <input
                  id={baseId}
                  className="dh-tags__input"
                  type="text"
                  value={draft}
                  placeholder={atLimit ? "Limit reached" : placeholder}
                  disabled={disabled || atLimit}
                  aria-labelledby={labelId}
                  aria-invalid={invalid || undefined}
                  aria-errormessage={invalid ? errorId : undefined}
                  aria-describedby={describedBy}
                  ref={(node) => controlRef?.(node)}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    // Validate against the EXACT committed collection, so adding
                    // the first tag and tabbing away can't leave a false
                    // "required" error against the pre-commit empty array.
                    const committed = commitDraft();
                    onBlur?.(committed);
                  }}
                />
              </li>
            ) : null}
          </ul>
        </div>
        <p id={hintId} className="dh-field__hint">
          Press Enter or comma to add. Backspace removes the last tag.
        </p>
        <span className="dh-visually-hidden" role="status" aria-live="polite">
          {announce}
        </span>
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
