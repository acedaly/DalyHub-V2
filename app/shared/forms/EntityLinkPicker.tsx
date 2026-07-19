/**
 * DS-06 Shared Forms — the entity-link picker.
 *
 * ONE entity-agnostic control for creating and managing FND-04 EntityLinks. It
 * speaks only in opaque target options and link-type descriptors and delegates
 * ALL data access to callbacks: `searchTargets` (async, workspace-scoped, supplied
 * by the consumer's loader — DS-08 can provide it later without changing this
 * control), `onLink` and `onUnlink` (which go through the FND-04 repository on the
 * server). It never imports a repository, D1 or bindings.
 *
 * It applies the calm client-side reflection of the FND-04 authority: exclude the
 * anchor from its own results, drop already-linked targets, de-duplicate, bound
 * the result size, and never leak an inaccessible entity's title (the loader
 * returns only accessible entities). Search is an accessible combobox; existing
 * links are a keyboard-operable list; selection state is never colour-only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  linkTypeLabel,
  selectableTargets,
  type EntityLinkPickerDirection,
  type EntityLinkSelection,
  type EntityLinkTargetOption,
  type EntityLinkTypeDescriptor,
} from "./entity-link-model";
import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import { useCombobox } from "./use-combobox";

export interface EntityLinkPickerProps {
  readonly id?: string;
  readonly label: string;
  readonly help?: string;
  /** The anchor entity; excluded from its own results. */
  readonly anchorId: string;
  /** Permitted link-type descriptors (typed kernel slug + user label). */
  readonly linkTypes: readonly EntityLinkTypeDescriptor[];
  /** Which end of the link the anchor is on. Defaults to `outgoing`. */
  readonly direction?: EntityLinkPickerDirection;
  /** Allow more than one active link (default true). */
  readonly multiple?: boolean;
  /** The currently active links to display and manage. */
  readonly existingLinks: readonly EntityLinkSelection[];
  /** Async, workspace-scoped target search. Returns ACCESSIBLE entities only. */
  readonly searchTargets: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EntityLinkTargetOption[]>;
  /** Create a link. Rejects on failure (message shown, input preserved). */
  readonly onLink: (params: {
    readonly target: EntityLinkTargetOption;
    readonly linkType: string;
    readonly direction: EntityLinkPickerDirection;
  }) => Promise<void>;
  /** Remove an existing link. Rejects on failure. */
  readonly onUnlink: (link: EntityLinkSelection) => Promise<void>;
  /** Render an identity glyph for a target's entity type (optional). */
  readonly renderTargetIcon?: (type: string) => ReactNode;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly error?: string | null;
  /** Ceiling on async result size. */
  readonly maxResults?: number;
  readonly placeholder?: string;
  readonly className?: string;
}

const SEARCH_DEBOUNCE_MS = 250;

export function EntityLinkPicker({
  id,
  label,
  help,
  anchorId,
  linkTypes,
  direction = "outgoing",
  multiple = true,
  existingLinks,
  searchTargets,
  onLink,
  onUnlink,
  renderTargetIcon,
  disabled = false,
  readOnly = false,
  error,
  maxResults,
  placeholder = "Search to link…",
  className,
}: EntityLinkPickerProps) {
  const baseId = id ?? `dh-link-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const labelId = `${baseId}-label`;
  const invalid = Boolean(error);

  const [linkType, setLinkType] = useState(linkTypes[0]?.type ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly EntityLinkTargetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [pendingUnlinkId, setPendingUnlinkId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Keep the chosen link type valid if the descriptor list changes.
  useEffect(() => {
    if (!linkTypes.some((d) => d.type === linkType)) {
      setLinkType(linkTypes[0]?.type ?? "");
    }
  }, [linkTypes, linkType]);

  const selectable = useMemo(
    () =>
      selectableTargets(results, {
        anchorId,
        existing: existingLinks,
        linkType,
        direction,
        max: maxResults,
      }),
    [results, anchorId, existingLinks, linkType, direction, maxResults],
  );

  const singleLinkFilled = !multiple && existingLinks.length > 0;
  const canSearch = !disabled && !readOnly && !singleLinkFilled;

  const runSearch = (value: string) => {
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    searchTargets(value, controller.signal).then(
      (found) => {
        // Ignore a stale response superseded by a newer search.
        if (!mountedRef.current || searchSeq.current !== seq) return;
        setResults(found);
        setLoading(false);
      },
      () => {
        if (!mountedRef.current || searchSeq.current !== seq) return;
        setResults([]);
        setLoading(false);
      },
    );
  };

  const scheduleSearch = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const createLink = async (target: EntityLinkTargetOption) => {
    if (!canSearch) return;
    // Serialise create actions so a double activation (mouse + keyboard, or a
    // rapid re-click) cannot fire two overlapping link requests.
    if (pendingTargetId !== null) return;
    setActionError(null);
    setPendingTargetId(target.id);
    try {
      await onLink({ target, linkType, direction });
      if (!mountedRef.current) return;
      setAnnounce(`Linked ${target.title}.`);
      setQuery("");
      setResults([]);
      combobox.close();
    } catch {
      if (!mountedRef.current) return;
      setActionError(
        `Couldn't link ${target.title}. It may have changed — try searching again.`,
      );
    } finally {
      if (mountedRef.current) setPendingTargetId(null);
    }
  };

  const removeLink = async (link: EntityLinkSelection) => {
    if (disabled || readOnly) return;
    setActionError(null);
    setPendingUnlinkId(link.linkId);
    try {
      await onUnlink(link);
      if (!mountedRef.current) return;
      setAnnounce(`Removed link to ${link.target.title}.`);
    } catch {
      if (!mountedRef.current) return;
      setActionError(`Couldn't remove the link to ${link.target.title}.`);
    } finally {
      if (mountedRef.current) setPendingUnlinkId(null);
    }
  };

  const comboOptions = useMemo(
    () => selectable.map((target) => ({ value: target.id })),
    [selectable],
  );

  const combobox = useCombobox({
    options: comboOptions,
    onSelect: (value) => {
      const target = selectable.find((option) => option.id === value);
      if (target) void createLink(target);
    },
    baseId,
    disabled: !canSearch,
  });

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
      combobox.close();
    }
  };

  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
  });

  const rootClassName = ["dh-field", "dh-field--entity-link", className]
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
      </div>

      <div className="dh-field__control" ref={wrapperRef} onBlur={handleBlur}>
        {/* Existing links */}
        {existingLinks.length > 0 ? (
          <ul className="dh-link-picker__links">
            {existingLinks.map((link) => (
              <li key={link.linkId} className="dh-link-picker__link">
                {renderTargetIcon ? (
                  <span className="dh-link-picker__icon">
                    {renderTargetIcon(link.target.type)}
                  </span>
                ) : null}
                <span className="dh-link-picker__link-body">
                  <span className="dh-link-picker__link-title">
                    {link.target.title || "Untitled"}
                  </span>
                  <span className="dh-link-picker__link-type">
                    {linkTypeLabel(linkTypes, link.linkType)}
                  </span>
                </span>
                {!readOnly ? (
                  <button
                    type="button"
                    className="dh-link-picker__unlink"
                    disabled={disabled || pendingUnlinkId === link.linkId}
                    aria-label={`Remove link to ${link.target.title || "item"}`}
                    onClick={() => void removeLink(link)}
                  >
                    {pendingUnlinkId === link.linkId ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Search / add row */}
        {!readOnly ? (
          singleLinkFilled ? (
            <p className="dh-link-picker__single-note">
              Remove the current link to choose a different one.
            </p>
          ) : (
            <div className="dh-link-picker__search dh-combobox">
              {linkTypes.length > 1 ? (
                <label className="dh-link-picker__type">
                  <span className="dh-visually-hidden">Link type</span>
                  <select
                    className="dh-input dh-link-picker__type-select"
                    value={linkType}
                    disabled={disabled}
                    onChange={(event) => setLinkType(event.target.value)}
                  >
                    {linkTypes.map((descriptor) => (
                      <option key={descriptor.type} value={descriptor.type}>
                        {descriptor.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="dh-combobox__field">
                <input
                  id={baseId}
                  className="dh-input dh-combobox__input"
                  type="text"
                  value={query}
                  placeholder={placeholder}
                  disabled={disabled}
                  aria-labelledby={labelId}
                  aria-invalid={invalid || undefined}
                  aria-errormessage={invalid ? errorId : undefined}
                  aria-describedby={describedBy}
                  autoComplete="off"
                  {...combobox.comboboxProps}
                  onChange={(event) => {
                    const next = event.target.value;
                    setQuery(next);
                    combobox.open();
                    scheduleSearch(next);
                  }}
                  onFocus={() => {
                    if (canSearch) combobox.open();
                  }}
                  onKeyDown={combobox.onInputKeyDown}
                />
              </div>

              {combobox.isOpen ? (
                <ul
                  className="dh-listbox"
                  id={combobox.listboxId}
                  role="listbox"
                  aria-label={`${label} results`}
                >
                  {loading ? (
                    <li className="dh-listbox__status" role="presentation">
                      Searching…
                    </li>
                  ) : selectable.length === 0 ? (
                    <li className="dh-listbox__status" role="presentation">
                      {query.trim().length === 0
                        ? "Type to search."
                        : "No matching items."}
                    </li>
                  ) : (
                    selectable.map((target, index) => (
                      // Keyboard selection is handled on the combobox input via
                      // aria-activedescendant (WAI-ARIA combobox); the option's
                      // click/mousedown is the mouse path only.
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <li
                        key={target.id}
                        id={combobox.optionId(index)}
                        role="option"
                        aria-selected={false}
                        className="dh-listbox__option"
                        data-active={
                          index === combobox.activeIndex || undefined
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => combobox.setActiveIndex(index)}
                        onClick={() => void createLink(target)}
                      >
                        {renderTargetIcon ? (
                          <span className="dh-listbox__option-icon">
                            {renderTargetIcon(target.type)}
                          </span>
                        ) : null}
                        <span className="dh-listbox__option-body">
                          <span className="dh-listbox__option-label">
                            {target.title || "Untitled"}
                            {pendingTargetId === target.id ? " — linking…" : ""}
                          </span>
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          )
        ) : null}

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
          {actionError ? (
            <p className="dh-field__error">
              <span className="dh-field__error-icon" aria-hidden="true">
                !
              </span>
              {actionError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
