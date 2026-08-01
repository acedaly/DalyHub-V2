/**
 * NOTES-05 §5 — the writing editor's RECORD-LINK picker.
 *
 * Inserting `[Project: DalyHub V2](dalyhub://project/9f1c…)` by hand is not a
 * thing anyone will do: nobody knows a record's id. This is the affordance that
 * makes id-stable internal links practical — search the workspace, choose a
 * record, and the editor writes the link.
 *
 * ## Why not the DS-06 `EntityLinkPicker`
 *
 * That control creates and removes FND-04 EntityLinks: its contract is
 * `existingLinks` + `linkTypes` + `onLink`/`onUnlink`, and it renders the
 * relationships it manages. This picker does something different — it inserts
 * TEXT into a document. Bending a link-mutation control into a text-insertion
 * control would mean feeding it empty link sets and no-op mutators, which reads
 * as reuse but is really a second meaning smuggled into one component.
 *
 * So this reuses the MECHANISM instead of the control: the same headless
 * `useCombobox` keyboard model DS-06's picker itself composes. The WAI-ARIA
 * interaction (Arrow/Home/End move the active option, Enter selects, Escape
 * closes without choosing, `aria-activedescendant` wiring) is therefore written
 * once and shared, while this stays a small, honest presentation of its own job.
 *
 * ## The relationship follows the text
 *
 * Choosing a record here does NOT create an EntityLink. It writes a record link
 * into the Markdown, and the next save reconciles that link into a real, typed
 * `note.references` relationship — the same path a `[[Wiki Link]]` takes. That is
 * deliberate: the note's source stays the single authority for what the note
 * says, so undoing the insertion (⌘Z) also undoes the relationship, and there is
 * never a relationship the text cannot explain.
 *
 * ## Trust boundary
 *
 * Options — including the `dalyhub://` destination — are supplied whole by the
 * caller's workspace-scoped server search. The client never mints a link
 * destination and never learns of a record outside the workspace (§28).
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { useCombobox } from "~/shared/forms/use-combobox";

/** How long typing settles before a search request is issued. */
const SEARCH_DEBOUNCE_MS = 250;

/** One record the author can link to, as supplied by the server. */
export interface RecordLinkOption {
  /** The record's stable id — the option's combobox value. */
  readonly id: string;
  /** The entity type slug, e.g. `project`. Shown so ambiguous titles are told apart. */
  readonly type: string;
  /** The record's title, used as the default link label. */
  readonly title: string;
  /**
   * The `dalyhub://type/id` destination, formatted by the SERVER. The client
   * never builds this: the destination of a link is a trust-relevant value, and
   * having exactly one producer is what keeps it that way.
   */
  readonly url: string;
}

export interface RecordLinkPickerProps {
  /** Search the workspace for linkable records. Bounded and workspace-scoped. */
  readonly search: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly RecordLinkOption[]>;
  /** The author chose a record — insert the link. */
  readonly onChoose: (option: RecordLinkOption) => void;
  /** Dismiss without choosing (Escape, the Cancel button, or a click away). */
  readonly onCancel: () => void;
  /** Render an identity glyph for a record type (optional). */
  readonly renderIcon?: (type: string) => ReactNode;
  /** Human label for a record type, e.g. `project` → "Project". */
  readonly typeLabel?: (type: string) => string;
}

export function RecordLinkPicker({
  search,
  onChoose,
  onCancel,
  renderIcon,
  typeLabel,
}: RecordLinkPickerProps) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly RecordLinkOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Hold the latest search in a ref so an inline arrow at the call site does not
  // restart the query on every render (the same guard `useOptionSearch` uses).
  const searchRef = useRef(search);
  searchRef.current = search;

  // Debounced, abortable search. An in-flight request is always superseded by a
  // newer query, so results can never arrive out of order and overwrite a later
  // search's options with an earlier search's.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void searchRef
        .current(query.trim(), controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setOptions(next);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setFailed(true);
          setOptions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Focus the search field on open, so the picker is usable from the keyboard
  // the instant it appears and a screen reader announces what it is for.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const choose = useCallback(
    (id: string) => {
      const option = options.find((candidate) => candidate.id === id);
      if (option) onChoose(option);
    },
    [onChoose, options],
  );

  // Memoised: `useCombobox` keeps its active option in range via an effect on
  // this array, so a fresh identity every render would re-run that effect on
  // every keystroke for no reason.
  const comboboxOptions = useMemo(
    () => options.map((option) => ({ value: option.id })),
    [options],
  );

  const combobox = useCombobox({
    options: comboboxOptions,
    onSelect: choose,
    baseId,
  });
  // The listbox is always open here — this surface exists to show results, so
  // there is nothing to expand or collapse, unlike a combobox inside a form.
  const { open } = combobox;
  useEffect(() => {
    open();
  }, [open, options]);

  // A click outside dismisses, matching every other transient surface.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const node = containerRef.current;
      if (
        node &&
        event.target instanceof Node &&
        !node.contains(event.target)
      ) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onCancel]);

  const describeType = (type: string): string =>
    typeLabel?.(type) ?? type.charAt(0).toUpperCase() + type.slice(1);

  const statusMessage = failed
    ? "Records couldn’t be searched just now. Try again."
    : loading
      ? "Searching…"
      : options.length === 0
        ? query.trim() === ""
          ? "Start typing to find a record."
          : "No records match that."
        : `${options.length} ${options.length === 1 ? "record" : "records"} found.`;

  return (
    <div
      ref={containerRef}
      className="dh-record-link-picker"
      role="group"
      aria-label="Link a record"
    >
      <label
        className="dh-record-link-picker__label"
        htmlFor={`${baseId}-input`}
      >
        Link a record
      </label>
      <input
        ref={inputRef}
        id={`${baseId}-input`}
        className="dh-record-link-picker__input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search projects, people, meetings…"
        value={query}
        aria-describedby={`${baseId}-status`}
        {...combobox.comboboxProps}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Escape dismisses the picker and returns the caret to the document.
          // It is handled on the INPUT (which always holds focus while the
          // picker is open, per the combobox model) rather than on the
          // container, so no non-interactive element carries a key listener.
          // `stopPropagation` keeps it from also reaching the record's Drawer.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
            return;
          }
          combobox.onInputKeyDown(event);
        }}
      />

      <ul
        className="dh-record-link-picker__list"
        id={combobox.listboxId}
        role="listbox"
        aria-label="Matching records"
      >
        {options.map((option, index) => (
          // Keyboard selection is handled on the combobox input via
          // aria-activedescendant (the WAI-ARIA combobox model); the option's
          // click/mousedown is the MOUSE path only, so it needs no key handler
          // of its own. Same rationale as the DS-06 `EntityLinkPicker`.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={option.id}
            id={combobox.optionId(index)}
            role="option"
            className="dh-record-link-picker__option"
            aria-selected={index === combobox.activeIndex}
            data-active={index === combobox.activeIndex ? "true" : undefined}
            // Keep the editor's selection intact: the caret must still be where
            // the author left it when the link is spliced in.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => combobox.setActiveIndex(index)}
            onClick={() => onChoose(option)}
          >
            {renderIcon ? (
              <span className="dh-record-link-picker__icon" aria-hidden="true">
                {renderIcon(option.type)}
              </span>
            ) : null}
            <span className="dh-record-link-picker__title">{option.title}</span>
            {/* The type is stated in WORDS, never by icon alone — it is often the
                only thing distinguishing two records that share a title (§4). */}
            <span className="dh-record-link-picker__type">
              {describeType(option.type)}
            </span>
          </li>
        ))}
      </ul>

      <p
        id={`${baseId}-status`}
        className="dh-record-link-picker__status"
        role="status"
        aria-live="polite"
      >
        {statusMessage}
      </p>

      <div className="dh-record-link-picker__actions">
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
