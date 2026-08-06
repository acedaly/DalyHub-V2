/**
 * The shared Area/Project icon picker — ONE component, both entities, both
 * breakpoints.
 *
 * There is no `AreaIconPicker` and no `ProjectIconPicker`, because there is
 * nothing entity-specific to pick: the vocabulary is shared, the catalogue is
 * shared, and the only thing that differs is which default glyph shows through
 * when the owner has chosen nothing. That is a prop (`entityType`), not a
 * component.
 *
 * ## The surface
 *
 * It opens the shared `Sheet`, which is already the one accessible modal in the
 * product: focus trap, body-scroll lock, inert background, Escape closing only
 * the topmost surface, and focus restored to the opener. `sheet.css` presents it
 * as a bottom sheet on a phone and a centred dialog above 48rem, so "accessible
 * desktop dialog" and "accessible mobile sheet" are one implementation rather
 * than two that drift. Building a second focus trap here would be the mistake
 * DS-03 exists to prevent.
 *
 * ## Staged, not live
 *
 * Choosing an icon inside the sheet edits a DRAFT. Nothing reaches the form
 * until Apply. That is deliberate: the grid is a browsing surface — an owner
 * will click several glyphs while deciding — and a live-committing picker would
 * fire a change (and, on an edit form, a save) for every one of them. Cancel
 * discards the draft and restores what was there, which is the behaviour the
 * Cancel button visibly promises.
 *
 * ## Selection is never colour alone
 *
 * The selected option carries `aria-pressed`, a visible check badge and a
 * heavier border. Any one of the three is enough to perceive it, which is what
 * AGENTS.md §15 requires — a tinted background on its own would fail for a
 * forced-colours user and for anyone who cannot distinguish the tint.
 *
 * ## The value is a KEY
 *
 * `value` and `onChange` speak in `EntityIconKey | null`, never in components or
 * catalogue objects, and a hidden input carries the key so an ordinary form POST
 * submits it with no JavaScript involved. `null` means "no choice" and posts as
 * the empty string, which is exactly what `readEntityIconField` reads as
 * reset-to-default.
 */

import { useId, useMemo, useRef, useState } from "react";

import {
  isEntityIconKey,
  type EntityIconKey,
} from "~/kernel/entities/entity-icon-keys";
import { CheckIcon, SearchIcon } from "~/shared/icons";
import { Sheet } from "~/shared/sheet";

import {
  ENTITY_ICON_CATEGORIES,
  entityIconOption,
  entityIconOptionsByCategory,
  searchEntityIcons,
  type EntityIconCategory,
  type EntityIconOption,
} from "./entity-icon-catalogue";
import type { EntityType } from "./identity";
import { RecordIcon } from "./RecordIcon";

export interface EntityIconPickerProps {
  /** The record's entity type: supplies the default glyph and the accent. */
  readonly entityType: EntityType;
  /** The currently chosen key, or `null` for the entity default. */
  readonly value: string | null;
  /** Called with the new key when the owner applies a choice. */
  readonly onChange: (iconKey: EntityIconKey | null) => void;
  /** Visible field label. */
  readonly label?: string;
  /** The submitted form field name. Matches the server's default. */
  readonly name?: string;
  readonly help?: string;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly id?: string;
}

/** The label shown when no icon has been chosen. */
const DEFAULT_LABEL = "Default icon";

export function EntityIconPicker({
  entityType,
  value,
  onChange,
  label = "Icon",
  name = "iconKey",
  help,
  error,
  disabled = false,
  id,
}: EntityIconPickerProps) {
  const generatedId = useId();
  const baseId = id ?? `entity-icon-${generatedId}`;
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;
  const statusId = `${baseId}-status`;

  const [open, setOpen] = useState(false);
  // The staged choice. Seeded from `value` each time the sheet opens, so
  // cancelling and reopening never resurrects a discarded draft.
  const [draft, setDraft] = useState<EntityIconKey | null>(null);
  const [query, setQuery] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const chosen = entityIconOption(value);
  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;
  const results = useMemo(
    () => (searching ? searchEntityIcons(trimmedQuery) : []),
    [searching, trimmedQuery],
  );

  function openPicker() {
    setDraft(isEntityIconKey(value) ? value : null);
    setQuery("");
    setOpen(true);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <div className="dh-icon-picker" data-invalid={error ? "true" : undefined}>
      <span className="dh-field__label" id={`${baseId}-label`}>
        {label}
      </span>
      {help ? (
        <span className="dh-field__help" id={helpId}>
          {help}
        </span>
      ) : null}

      {/*
        The key travels as an ordinary form value, so a form that posts without
        JavaScript still carries the choice. `null` becomes "", which the server
        reads as reset-to-default rather than as "field absent".
      */}
      <input type="hidden" name={name} value={value ?? ""} />

      <button
        type="button"
        ref={triggerRef}
        className="dh-icon-picker__trigger md-state-layer"
        onClick={openPicker}
        disabled={disabled}
        aria-labelledby={`${baseId}-label ${baseId}-current`}
        aria-describedby={
          [help ? helpId : null, error ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        <span className="dh-icon-picker__preview" aria-hidden="true">
          <RecordIcon entityType={entityType} iconKey={value} variant="badge" />
        </span>
        <span className="dh-icon-picker__current" id={`${baseId}-current`}>
          {chosen?.label ?? DEFAULT_LABEL}
        </span>
        <span className="dh-icon-picker__change" aria-hidden="true">
          Change
        </span>
      </button>

      {error ? (
        <p className="dh-field__error" id={errorId}>
          {error}
        </p>
      ) : null}

      {open ? (
        <Sheet
          // Not `Choose an ${entityType} icon`: that renders "an project".
          // The entity is named in the description, where it reads properly.
          title="Choose an icon"
          description={`Pick an icon for this ${entityType}, or keep the default.`}
          opener={triggerRef.current}
          onClose={() => setOpen(false)}
          initialFocusRef={searchRef}
          footer={
            <div className="dh-icon-picker__actions">
              <button
                type="button"
                className="dh-btn dh-btn--text"
                onClick={() => setDraft(null)}
              >
                Use the default
              </button>
              <span className="dh-icon-picker__actions-spacer" />
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={apply}
              >
                Apply
              </button>
            </div>
          }
        >
          <div className="dh-icon-picker__panel">
            {/* The staged choice and the search stay pinned together as ONE
                opaque band. Sticking them separately left gaps the grid showed
                through as it scrolled underneath. */}
            <div className="dh-icon-picker__header">
              <p className="dh-icon-picker__selected">
                <RecordIcon
                  entityType={entityType}
                  iconKey={draft}
                  variant="badge"
                />
                <span>
                  <span className="dh-icon-picker__selected-name">
                    {entityIconOption(draft)?.label ?? DEFAULT_LABEL}
                  </span>
                  {draft === null ? (
                    <span className="dh-icon-picker__selected-note">
                      The icon every {entityType} uses unless it chooses one.
                    </span>
                  ) : null}
                </span>
              </p>

              <div className="dh-icon-picker__search">
                <span
                  className="dh-icon-picker__search-icon"
                  aria-hidden="true"
                >
                  <SearchIcon />
                </span>
                <input
                  ref={searchRef}
                  type="search"
                  className="dh-icon-picker__search-input"
                  placeholder="Search icons"
                  aria-label="Search icons"
                  aria-describedby={statusId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            {/*
              Announced politely rather than assertively: the count changes on
              every keystroke, and an assertive region would interrupt the
              owner mid-word on each one.
            */}
            <p
              className="dh-visually-hidden"
              id={statusId}
              role="status"
              aria-live="polite"
            >
              {searching
                ? `${results.length} ${results.length === 1 ? "icon" : "icons"} found`
                : ""}
            </p>

            {searching ? (
              results.length > 0 ? (
                <IconGrid
                  label={`Search results for ${trimmedQuery}`}
                  options={results}
                  draft={draft}
                  entityType={entityType}
                  onPick={setDraft}
                />
              ) : (
                <p className="dh-icon-picker__empty">
                  No icons match “{trimmedQuery}”. Try a different word, or keep
                  the default.
                </p>
              )
            ) : (
              ENTITY_ICON_CATEGORIES.map((category) => (
                <CategorySection
                  key={category}
                  category={category}
                  draft={draft}
                  entityType={entityType}
                  onPick={setDraft}
                />
              ))
            )}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function CategorySection({
  category,
  draft,
  entityType,
  onPick,
}: {
  readonly category: EntityIconCategory;
  readonly draft: EntityIconKey | null;
  readonly entityType: EntityType;
  readonly onPick: (key: EntityIconKey) => void;
}) {
  const options = entityIconOptionsByCategory(category);
  return (
    <section className="dh-icon-picker__category">
      <h3 className="dh-icon-picker__category-title">{category}</h3>
      <IconGrid
        label={category}
        options={options}
        draft={draft}
        entityType={entityType}
        onPick={onPick}
      />
    </section>
  );
}

function IconGrid({
  label,
  options,
  draft,
  entityType,
  onPick,
}: {
  readonly label: string;
  readonly options: readonly EntityIconOption[];
  readonly draft: EntityIconKey | null;
  readonly entityType: EntityType;
  readonly onPick: (key: EntityIconKey) => void;
}) {
  return (
    <ul className="dh-icon-picker__grid" aria-label={label}>
      {options.map((option) => {
        const selected = draft === option.key;
        return (
          <li key={option.key}>
            <button
              type="button"
              className="dh-icon-picker__option md-state-layer"
              aria-pressed={selected}
              data-selected={selected ? "true" : undefined}
              onClick={() => onPick(option.key)}
            >
              <span className="dh-icon-picker__option-icon" aria-hidden="true">
                <RecordIcon
                  entityType={entityType}
                  iconKey={option.key}
                  tone="inherit"
                />
              </span>
              {/* The name is VISIBLE, not a tooltip: thirty-four glyphs at
                  24px are not self-describing, and a title attribute is
                  invisible to touch. */}
              <span className="dh-icon-picker__option-label">
                {option.label}
              </span>
              {selected ? (
                <span
                  className="dh-icon-picker__option-check"
                  aria-hidden="true"
                >
                  <CheckIcon />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
