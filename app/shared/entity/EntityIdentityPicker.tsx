/**
 * The shared Area/Project/Goal IDENTITY picker — one component, three entities,
 * both breakpoints.
 *
 * There is no `AreaIdentityPicker` and no `ProjectIdentityPicker`, because there
 * is nothing entity-specific to pick: the vocabularies are shared, the ramp is
 * shared, and the only thing that differs is which default glyph shows through
 * when the owner has chosen nothing. That is a prop (`entityType`), not a
 * component.
 *
 * ## Colour and icon are ONE choice
 *
 * IDENTITY-01 turned the icon picker into this. The two could have been two
 * fields, and it would have been wrong: what the owner is choosing is what a
 * record LOOKS like, and a red flame and a blue flame are different answers to
 * that question. So the sheet previews the combination live at the top, the icon
 * grid renders every glyph in the currently-picked hue, and Apply commits both
 * in one mutation. Nothing here can produce a half-applied identity.
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
 * Choosing inside the sheet edits a DRAFT. Nothing reaches the form until Apply.
 * That is deliberate: both grids are browsing surfaces — an owner will click
 * several combinations while deciding — and a live-committing picker would fire
 * a change (and, on an edit form, a save) for every one of them. Cancel discards
 * the draft and restores what was there, which is the behaviour the Cancel
 * button visibly promises.
 *
 * ## Selection is never colour alone
 *
 * This matters twice as much on a grid of colours. Every selected option carries
 * `aria-pressed`, a visible check badge and a heavier border, and every swatch
 * has a NAME as its accessible name ("Teal", "Automatic — currently violet").
 * Any one of the three is enough to perceive the selection, which is what
 * AGENTS.md §15 requires — a tinted background on its own would fail for a
 * forced-colours user and for anyone who cannot distinguish the tint.
 *
 * ## "Automatic" is honest about what it does
 *
 * The no-choice option is not blank and not called "None". It is labelled
 * Automatic, it renders the colour the record ACTUALLY resolves to right now,
 * and its accessible name says which one that is. An owner choosing it is
 * choosing "keep deriving this from where the record sits", and they can see
 * what that currently means.
 *
 * ## The values are a KEY and a SLOT
 *
 * `value` and `onChange` speak in `{ iconKey, colourSlot }`, never in
 * components, catalogue objects or colours. Hidden inputs carry both so an
 * ordinary form POST submits them with no JavaScript involved. `null` means "no
 * choice" and posts as the empty string, which is exactly what
 * `readEntityIconField` and `readIdentityColourField` read as reset-to-default.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";

import {
  isEntityIconKey,
  type EntityIconKey,
} from "~/kernel/entities/entity-icon-keys";
import {
  IDENTITY_COLOUR_SLOTS,
  isIdentityColourSlot,
  type IdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";
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
import { identityAttribute, resolveIdentity } from "./identity-resolution";
import { RecordIcon } from "./RecordIcon";

/** A record's chosen identity, as it travels to and from a form. */
export type EntityIdentityValue = {
  readonly iconKey: string | null;
  readonly colourSlot: string | null;
};

export interface EntityIdentityPickerProps {
  /** The record's entity type: supplies the default glyph. */
  readonly entityType: EntityType;
  /** The identity currently stored, with `null` for either unmade choice. */
  readonly value: EntityIdentityValue;
  /** Called with the new identity when the owner applies a choice. */
  readonly onChange: (identity: {
    readonly iconKey: EntityIconKey | null;
    readonly colourSlot: IdentityColourSlot | null;
  }) => void;
  /**
   * The colour this record resolves to when nothing is chosen — its derived
   * slot, or its Area's for a Goal. It is what the Automatic option shows and
   * names, so the owner can see what "automatic" currently means rather than
   * being asked to trust it.
   */
  readonly derivedSlot?: IdentityColourSlot | null;
  /** Visible field label. */
  readonly label?: string;
  /** The submitted form field names. Match the server's defaults. */
  readonly iconName?: string;
  readonly colourName?: string;
  readonly help?: string;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly id?: string;
}

/** The label shown when no icon has been chosen. */
const DEFAULT_ICON_LABEL = "Default icon";

/** The label shown when no colour has been chosen. */
const AUTOMATIC_LABEL = "Automatic";

/** A slot's human name. The ramp is machine-ordered; this is what a person reads. */
const SLOT_LABELS: Readonly<Record<IdentityColourSlot, string>> = {
  violet: "Violet",
  green: "Green",
  red: "Red",
  orange: "Orange",
  blue: "Blue",
  teal: "Teal",
  purple: "Purple",
  fuchsia: "Fuchsia",
  pink: "Pink",
  rose: "Rose",
  amber: "Amber",
  lime: "Lime",
  emerald: "Emerald",
  cyan: "Cyan",
  sky: "Sky",
  brown: "Brown",
};

export function EntityIdentityPicker({
  entityType,
  value,
  onChange,
  derivedSlot = null,
  label = "Identity",
  iconName = "iconKey",
  colourName = "colourSlot",
  help,
  error,
  disabled = false,
  id,
}: EntityIdentityPickerProps) {
  const generatedId = useId();
  const baseId = id ?? `entity-identity-${generatedId}`;
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;
  const statusId = `${baseId}-status`;

  const [open, setOpen] = useState(false);
  // The staged choice. Seeded from `value` each time the sheet opens, so
  // cancelling and reopening never resurrects a discarded draft.
  const [draftIcon, setDraftIcon] = useState<EntityIconKey | null>(null);
  const [draftSlot, setDraftSlot] = useState<IdentityColourSlot | null>(null);
  const [query, setQuery] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const chosenIcon = entityIconOption(value.iconKey);
  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;
  const results = useMemo(
    () => (searching ? searchEntityIcons(trimmedQuery) : []),
    [searching, trimmedQuery],
  );

  // The ONE resolver, for the two things the picker has to show honestly: what
  // the trigger currently looks like, and what the draft would look like.
  const current = resolveIdentity({
    colourSlot: value.colourSlot,
    iconKey: value.iconKey,
    inherited: { colourSlot: derivedSlot },
  });
  const preview = resolveIdentity({
    colourSlot: draftSlot,
    iconKey: draftIcon,
    inherited: { colourSlot: derivedSlot },
  });

  function openPicker() {
    setDraftIcon(isEntityIconKey(value.iconKey) ? value.iconKey : null);
    setDraftSlot(isIdentityColourSlot(value.colourSlot) ? value.colourSlot : null);
    setQuery("");
    setOpen(true);
  }

  function apply() {
    onChange({ iconKey: draftIcon, colourSlot: draftSlot });
    setOpen(false);
  }

  const currentLabel = `${chosenIcon?.label ?? DEFAULT_ICON_LABEL}, ${
    isIdentityColourSlot(value.colourSlot)
      ? SLOT_LABELS[value.colourSlot]
      : AUTOMATIC_LABEL
  }`;

  return (
    <div
      className="dh-icon-picker"
      data-invalid={error ? "true" : undefined}
    >
      <span className="dh-field__label" id={`${baseId}-label`}>
        {label}
      </span>
      {help ? (
        <span className="dh-field__help" id={helpId}>
          {help}
        </span>
      ) : null}

      {/*
        Both values travel as ordinary form values, so a form that posts without
        JavaScript still carries the choice. `null` becomes "", which the server
        reads as reset-to-default rather than as "field absent".
      */}
      <input type="hidden" name={iconName} value={value.iconKey ?? ""} />
      <input type="hidden" name={colourName} value={value.colourSlot ?? ""} />

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
        <span
          className="dh-icon-picker__preview"
          aria-hidden="true"
          {...identityAttribute(current.slot)}
        >
          <span className="dh-accent-icon" data-size="sm">
            <RecordIcon
              entityType={entityType}
              iconKey={current.iconKey}
              tone="inherit"
            />
          </span>
        </span>
        <span className="dh-icon-picker__current" id={`${baseId}-current`}>
          {currentLabel}
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
          // Not `Choose an ${entityType} identity`: that renders "an project".
          // The entity is named in the description, where it reads properly.
          title="Choose an identity"
          description={`Pick a colour and an icon for this ${entityType}, or keep the defaults.`}
          opener={triggerRef.current}
          onClose={() => setOpen(false)}
          initialFocusRef={searchRef}
          footer={
            <div className="dh-icon-picker__actions">
              <button
                type="button"
                className="dh-btn dh-btn--text"
                onClick={() => {
                  setDraftIcon(null);
                  setDraftSlot(null);
                }}
              >
                Use the defaults
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
              <p
                className="dh-icon-picker__selected"
                {...identityAttribute(preview.slot)}
              >
                {/*
                  The LIVE preview, drawn as the real tile at the size the
                  gallery draws it. It is the whole reason colour and icon are
                  one surface: the owner is choosing a combination, and the only
                  honest way to show a combination is to draw it.
                */}
                <span
                  className="dh-accent-icon"
                  data-size="md"
                  aria-hidden="true"
                >
                  <RecordIcon
                    entityType={entityType}
                    iconKey={preview.iconKey}
                    tone="inherit"
                  />
                </span>
                <span>
                  <span className="dh-icon-picker__selected-name">
                    {entityIconOption(draftIcon)?.label ?? DEFAULT_ICON_LABEL}
                    {" · "}
                    {draftSlot === null
                      ? AUTOMATIC_LABEL
                      : SLOT_LABELS[draftSlot]}
                  </span>
                  {draftIcon === null || draftSlot === null ? (
                    <span className="dh-icon-picker__selected-note">
                      {draftSlot === null
                        ? `Automatic follows where this ${entityType} sits.`
                        : `The icon every ${entityType} uses unless it chooses one.`}
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

            {/* Colour first: it is the smaller decision and it changes how every
                icon below is drawn, so making it second would mean re-reading
                the whole grid. Hidden while searching, because a search is a
                search for an ICON and the swatches would push the results off
                the first screen. */}
            {searching ? null : (
              <SwatchGrid
                draft={draftSlot}
                derivedSlot={derivedSlot}
                onPick={setDraftSlot}
              />
            )}

            {searching ? (
              results.length > 0 ? (
                <IconGrid
                  label={`Search results for ${trimmedQuery}`}
                  options={results}
                  draft={draftIcon}
                  entityType={entityType}
                  slot={preview.slot}
                  onPick={setDraftIcon}
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
                  draft={draftIcon}
                  entityType={entityType}
                  slot={preview.slot}
                  onPick={setDraftIcon}
                />
              ))
            )}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * Arrow-key navigation for a wrapping grid of buttons.
 *
 * A roving focus over the LIVE DOM order rather than a tracked index, because
 * the grids re-render as the search narrows and an index would point at whatever
 * happened to move into that position. Left/Right walk the list; Up/Down step by
 * the number of columns the browser actually laid out, computed from the offset
 * positions so it stays correct at every breakpoint without the component
 * knowing the CSS. Home/End jump to the ends.
 *
 * Enter and Space need no handling: these are real `<button>`s and the browser
 * already activates them.
 */
function useGridKeys() {
  return useCallback((event: React.KeyboardEvent<HTMLUListElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const list = event.currentTarget;
    const items = Array.from(
      list.querySelectorAll<HTMLButtonElement>("button"),
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;

    // The column count, measured: the first item whose top differs from the
    // first item's top starts row two, so its index IS the column count.
    const firstTop = items[0].getBoundingClientRect().top;
    const wrapped = items.findIndex(
      (item) => item.getBoundingClientRect().top > firstTop + 1,
    );
    const columns = wrapped === -1 ? items.length : wrapped;

    let next = index;
    switch (event.key) {
      case "ArrowLeft":
        next = index - 1;
        break;
      case "ArrowRight":
        next = index + 1;
        break;
      case "ArrowUp":
        next = index - columns;
        break;
      case "ArrowDown":
        next = index + columns;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
    }
    if (next < 0 || next >= items.length) return;
    event.preventDefault();
    items[next].focus();
  }, []);
}

/**
 * The sixteen slots, plus Automatic.
 *
 * Automatic is FIRST and is a swatch like any other, drawn in the colour it
 * currently resolves to. Putting it last, or styling it as a reset, would make
 * "no choice" look like an escape hatch rather than what it is: the default
 * every record in the product is already on.
 */
function SwatchGrid({
  draft,
  derivedSlot,
  onPick,
}: {
  readonly draft: IdentityColourSlot | null;
  readonly derivedSlot: IdentityColourSlot | null;
  readonly onPick: (slot: IdentityColourSlot | null) => void;
}) {
  const onKeyDown = useGridKeys();
  const automaticName = derivedSlot
    ? `${AUTOMATIC_LABEL} — currently ${SLOT_LABELS[derivedSlot]}`
    : `${AUTOMATIC_LABEL} — currently no colour`;

  return (
    <section className="dh-icon-picker__category">
      <h3 className="dh-icon-picker__category-title">Colour</h3>
      <ul
        className="dh-icon-picker__swatches"
        aria-label="Identity colour"
        onKeyDown={onKeyDown}
      >
        <li>
          <button
            type="button"
            className="dh-swatch md-state-layer"
            aria-pressed={draft === null}
            data-selected={draft === null ? "true" : undefined}
            onClick={() => onPick(null)}
            {...identityAttribute(derivedSlot)}
          >
            <span className="dh-swatch__chip" aria-hidden="true">
              {draft === null ? <CheckIcon /> : null}
            </span>
            {/* The name is VISIBLE, not a tooltip. Sixteen colours are not
                self-describing to everyone who can see them, and a title
                attribute is invisible to touch entirely. */}
            <span className="dh-swatch__label">{AUTOMATIC_LABEL}</span>
            <span className="dh-visually-hidden">{automaticName}</span>
          </button>
        </li>
        {IDENTITY_COLOUR_SLOTS.map((slot) => {
          const selected = draft === slot;
          return (
            <li key={slot}>
              <button
                type="button"
                className="dh-swatch md-state-layer"
                aria-pressed={selected}
                data-selected={selected ? "true" : undefined}
                onClick={() => onPick(slot)}
                {...identityAttribute(slot)}
              >
                <span className="dh-swatch__chip" aria-hidden="true">
                  {selected ? <CheckIcon /> : null}
                </span>
                <span className="dh-swatch__label">{SLOT_LABELS[slot]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CategorySection({
  category,
  draft,
  entityType,
  slot,
  onPick,
}: {
  readonly category: EntityIconCategory;
  readonly draft: EntityIconKey | null;
  readonly entityType: EntityType;
  readonly slot: IdentityColourSlot | null;
  readonly onPick: (key: EntityIconKey) => void;
}) {
  const options = entityIconOptionsByCategory(category);
  if (options.length === 0) return null;
  return (
    <section className="dh-icon-picker__category">
      <h3 className="dh-icon-picker__category-title">{category}</h3>
      <IconGrid
        label={category}
        options={options}
        draft={draft}
        entityType={entityType}
        slot={slot}
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
  slot,
  onPick,
}: {
  readonly label: string;
  readonly options: readonly EntityIconOption[];
  readonly draft: EntityIconKey | null;
  readonly entityType: EntityType;
  /** The DRAFT's colour, so every glyph is drawn in the hue being chosen. */
  readonly slot: IdentityColourSlot | null;
  readonly onPick: (key: EntityIconKey) => void;
}) {
  const onKeyDown = useGridKeys();
  return (
    <ul
      className="dh-icon-picker__grid"
      aria-label={label}
      onKeyDown={onKeyDown}
      {...identityAttribute(slot)}
    >
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
              {/* Drawn in the hue currently staged, so the owner is choosing the
                  actual combination rather than two abstractions. */}
              <span className="dh-icon-picker__option-icon" aria-hidden="true">
                <RecordIcon
                  entityType={entityType}
                  iconKey={option.key}
                  tone="inherit"
                />
              </span>
              {/* The name is VISIBLE, not a tooltip: ninety glyphs at 24px are
                  not self-describing, and a title attribute is invisible to
                  touch. */}
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
