/**
 * DS-06 Shared Forms — the tags control, rebuilt by V2.6 FIND-02 as an ADAPTER
 * OVER THE SHARED PICKER.
 *
 * DHDS-09 §22 recorded why it could not be one at the time: *"a tag picker needs
 * a tag model to pick from, and building a searchable picker over a free-text
 * list would either invent a vocabulary source (a second model, in the UI layer)
 * or be a combobox with nothing to complete against."* FIND-02 built the model,
 * so this is that deferred change, taken exactly as DEBT-182's own desired state
 * describes it: *"`TagsField` becomes an adapter over the shared `Picker` with a
 * create command, which the picker already supports."*
 *
 * ── What the owner does ──────────────────────────────────────────────────────
 *
 * One button opens the ONE searchable picker (a `role="dialog"` holding a
 * `combobox` and its `listbox`, a bottom sheet below `md`). Typing narrows the
 * workspace's own words; choosing one toggles it; typing a word that is not
 * there yet offers to create it. Each chosen tag is a chip with its own
 * keyboard-reachable remove button, so a tag can always be taken off without
 * opening anything.
 *
 * That is the SAME interaction on People, Assets, Notes and Tasks, because it is
 * the same component over the same vocabulary — not four wrappers that behave
 * alike today.
 *
 * ── What this component still is NOT ─────────────────────────────────────────
 *
 * A tags database or a suggestions service. It edits an in-memory array the
 * consumer owns and renders the vocabulary it is handed. It performs no query,
 * holds no cache and knows nothing about workspaces.
 *
 * ── Case ─────────────────────────────────────────────────────────────────────
 *
 * Duplicate detection is ALWAYS canonical here, whatever the caller's
 * constraints say, because a tag now HAS a canonical identity: `Errand` and
 * `errand` are one tag, so a field that let both into one record would be
 * offering the owner a state the storage layer would immediately collapse.
 *
 * ── Accessibility ────────────────────────────────────────────────────────────
 *
 * The field is a labelled group; the trigger states what it opens
 * (`aria-haspopup="dialog"`) and whether it is open; adds, removes and
 * rejections are announced through a polite live region; every chip's remove is
 * a real button with its own accessible name.
 */

import { useId, useRef, useState } from "react";

import { Picker, type PickerOption } from "~/shared/floating";
import { canonicalTagKey, type WorkspaceTag } from "~/kernel/tags";

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
  /** Bounds for the collection. Case comparison is always canonical — see above. */
  readonly constraints?: TagConstraints;
  /**
   * The workspace's tag vocabulary, resolved server-side by ONE bounded query.
   *
   * Empty is a legitimate state, not a failure: a workspace that has never had a
   * tag offers nothing to pick and everything to create, and the picker's empty
   * state says so in the owner's own words rather than showing "No results".
   */
  readonly vocabulary?: readonly WorkspaceTag[];
  /** The trigger's wording when nothing is chosen yet. */
  readonly placeholder?: string;
}

const REJECTION_MESSAGES: Record<TagRejectionReason, string> = {
  empty: "",
  duplicate: "That tag is already added.",
  limit: "You’ve reached the maximum number of tags.",
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
  vocabulary = [],
  placeholder = "Add a tag…",
}: TagsFieldProps) {
  const baseId =
    id ??
    `dh-tags-${label.replace(/\s+/g, " ").trim().replace(/\s/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const invalid = Boolean(error);
  // A tag has ONE identity, so the field compares canonically whatever it is told.
  const resolved = resolveTagConstraints({
    ...constraints,
    caseInsensitive: true,
  });

  const surfaceId = `${useId()}-tags-picker`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");

  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
    extraIds: [hintId],
  });

  const chosenKeys = value.map((tag) => canonicalTagKey(tag));
  const atLimit = value.length >= resolved.maxTags;
  const editable = !readOnly && !disabled;

  const commit = (next: readonly string[]) => {
    onChange(next);
    // Validate against the EXACT committed collection, so adding the first tag
    // cannot leave a stale "required" error against the pre-commit empty array.
    onBlur?.(next);
  };

  const add = (raw: string) => {
    if (!editable) return;
    const result = addTag(value, raw, {
      ...constraints,
      caseInsensitive: true,
    });
    if (result.added) {
      commit(result.tags);
      setAnnounce(`Added ${result.tags[result.tags.length - 1]}.`);
      return;
    }
    if (result.reason && result.reason !== "empty") {
      setAnnounce(REJECTION_MESSAGES[result.reason]);
    }
  };

  const remove = (index: number) => {
    if (!editable) return;
    const removed = value[index];
    commit(removeTagAt(value, index));
    setAnnounce(`Removed ${removed}.`);
  };

  /** Toggle one vocabulary entry: chosen becomes unchosen, and back. */
  const toggle = (key: string) => {
    const index = chosenKeys.indexOf(key);
    if (index >= 0) {
      remove(index);
      return;
    }
    const entry = vocabulary.find((tag) => tag.key === key);
    add(entry?.label ?? key);
  };

  /*
   * The workspace's words, PLUS anything already chosen on this record that the
   * vocabulary does not know about yet.
   *
   * The second half matters: a tag created here is not in the workspace
   * vocabulary until the record is saved, and without it the picker would refuse
   * to show a word the owner can plainly see as a chip — offering to "create" it
   * a second time under another case, and giving no way to un-choose it from the
   * surface that chose it.
   */
  const options: readonly PickerOption[] = [
    ...vocabulary,
    ...value
      .map((label) => ({ key: canonicalTagKey(label), label }))
      .filter((chosen) => !vocabulary.some((tag) => tag.key === chosen.key)),
  ]
    .map((tag) => ({ id: tag.key, label: tag.label }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rootClassName = ["dh-field", "dh-field--tags", className]
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
              <li
                key={`${canonicalTagKey(tag)}-${index}`}
                className="dh-tags__chip"
              >
                <span className="dh-tags__chip-text">{tag}</span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="dh-tags__chip-remove md-state-layer"
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
                <button
                  type="button"
                  id={baseId}
                  className="dh-tags__add md-state-layer"
                  disabled={disabled || atLimit}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  {...(open ? { "aria-controls": surfaceId } : {})}
                  // A button cannot carry `aria-invalid`/`aria-errormessage`
                  // (they are unsupported on the role), so the error reaches the
                  // trigger through `aria-describedby`, which `composeDescribedBy`
                  // already includes the error id in when the field is invalid.
                  aria-describedby={describedBy}
                  ref={(node) => {
                    triggerRef.current = node;
                    controlRef?.(node);
                  }}
                  onClick={() => setOpen((now) => !now)}
                >
                  {atLimit ? "Limit reached" : placeholder}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
        <p id={hintId} className="dh-field__hint">
          Choose a tag the workspace already uses, or type a new one to create
          it.
        </p>
        <span className="dh-visually-hidden" role="status" aria-live="polite">
          {announce}
        </span>
      </div>

      {open ? (
        <Picker
          anchorRef={triggerRef}
          label={label}
          id={surfaceId}
          options={options}
          value={null}
          multiple
          selectedIds={chosenKeys}
          onSelect={(key) => toggle(key)}
          onCreate={(name) => add(name)}
          createLabel={(name) => `Create “${name}”`}
          placeholder="Search tags…"
          onClose={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) triggerRef.current?.focus();
          }}
          data-testid={`${baseId}-picker`}
        />
      ) : null}

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
