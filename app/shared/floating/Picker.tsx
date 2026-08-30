/**
 * DHDS-09 — the ONE searchable picker.
 *
 * **A picker chooses a VALUE from a potentially large set**, without leaving the
 * surface the owner is already on. Project, Area, Goal, Person, a tag — anything
 * where the option list may be long, where typing is materially faster than
 * scanning, and where the answer is a record rather than a command.
 *
 * The distinction from {@link Menu} is behavioural rather than cosmetic, and it
 * is the one DHDS-09 exists to make legible: a menu has a small closed set and
 * announces itself as a menu; a picker has an open set, a search field and
 * listbox semantics. They are not interchangeable ARIA patterns and are not
 * treated as one here.
 *
 * ── Semantics ───────────────────────────────────────────────────────────────
 * A `role="dialog"` surface containing a `role="combobox"` text field and the
 * `role="listbox"` it controls. The field keeps DOM focus throughout and the
 * active option is carried by `aria-activedescendant`, which is what makes
 * typing and arrowing work at the same time — the whole point of the pattern.
 * The host's trigger declares `aria-haspopup="dialog"`, because a dialog is
 * what it opens.
 *
 * ── Speed ───────────────────────────────────────────────────────────────────
 * The surface opens IMMEDIATELY, with whatever the caller already has. A picker
 * that waits for a request before painting its own shell is a picker that feels
 * slow on every use to save a flash on the first. When options genuinely have
 * to load, three placeholder rows hold the panel's height so it does not resize
 * under the pointer as they arrive (DHDS-09 §39).
 *
 * ── Empty means something ───────────────────────────────────────────────────
 * "No results" is not useful. The empty state names what was searched for, and
 * offers to create it only when creation is genuinely supported — a create
 * affordance that cannot create is worse than none (DHDS-09 §38).
 *
 * ── Desktop → phone ─────────────────────────────────────────────────────────
 * Below `md` the same picker is the shared bottom {@link Sheet}: more width for
 * the search field, full-width rows for a thumb, and the sheet's own scroll
 * rather than a 22rem box competing with the page behind it. The search field
 * is sticky at the top of the sheet body so the software keyboard cannot push
 * it out of view while it is being typed into (§31).
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { AnchoredSurface } from "~/shared/anchored";
import { SearchIcon } from "~/shared/icons";
import { Sheet } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import { OptionContent } from "./OptionContent";
import type {
  FloatingAlign,
  FloatingOption,
  FloatingPresentation,
} from "./types";

/** An option with the group it belongs to, when the picker groups its list. */
export interface PickerOption extends FloatingOption {
  /**
   * A heading this option sits under — "Recent", "All projects". Options are
   * rendered in the order given; a heading is drawn whenever it CHANGES, so a
   * caller orders its list and the grouping follows, rather than the picker
   * re-sorting what it was handed.
   */
  readonly group?: string;
}

export interface PickerProps {
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** The picker's accessible name — "Project", "Assignee". */
  readonly label: string;
  readonly options: readonly PickerOption[];
  /** The current value's id, or `null` when the field is unset. */
  readonly value: string | null;
  /** Commit a choice. The picker closes unless `multiple` is set. */
  readonly onSelect: (id: string) => void;
  readonly onClose: (restoreFocus: boolean) => void;
  /**
   * Async search: when provided, the CALLER owns filtering and drives
   * `options`. Otherwise the picker filters what it was given, locally, on
   * label and supporting text.
   */
  readonly onSearch?: (query: string) => void;
  readonly loading?: boolean;
  readonly placeholder?: string;
  /**
   * Offer to create the searched-for record. Present only when creation is
   * genuinely supported — see the note above.
   */
  readonly onCreate?: (name: string) => void;
  /** The create command's wording. Defaults to `Create "<query>"`. */
  readonly createLabel?: (name: string) => string;
  /**
   * A "none of these" command at the foot of the list — Clear, Move to Inbox,
   * No project. Present only when there is something to clear.
   */
  readonly clear?: { readonly label: string; readonly onSelect: () => void };
  /**
   * Stay open after a choice. For a multi-select, where committing one value
   * is a step rather than the answer (DHDS-09 §32).
   */
  readonly multiple?: boolean;
  /**
   * DHDS-10 — keep the surface open after a SINGLE choice, and let the host
   * close it.
   *
   * The dismissal contract (§32) is that a single-choice picker closes on
   * choosing, and that is right for a caller whose `onSelect` is synchronous.
   * It is exactly wrong for one whose `onSelect` starts a SAVE: the host's
   * state machine only accepts a result while the field is open, so closing
   * first drops the pending state and — the part that matters — the REFUSAL,
   * leaving the owner with a surface that shut and a change that never
   * happened. `InlineSelectField` has the same rule for its menu, stated at
   * length there, and solves it the same way.
   *
   * The host must then close on the answer: on success, and never on a refusal.
   * It does not change what a choice MEANS, and it is not multi-select — one
   * value is still committed and `value` still reflects one id.
   */
  readonly keepOpenOnSelect?: boolean;
  /** Which ids are currently chosen, when `multiple`. */
  readonly selectedIds?: readonly string[];
  readonly align?: FloatingAlign;
  readonly matchAnchorWidth?: boolean;
  readonly presentation?: FloatingPresentation;
  readonly id?: string;
  /** Replace an option's rendered body with the caller's own composition. */
  readonly renderOption?: (option: PickerOption) => ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** How many placeholder rows hold the panel's height while options load. */
const SKELETON_ROWS = 3;

function localFilter(
  options: readonly PickerOption[],
  query: string,
): readonly PickerOption[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return options;
  return options.filter(
    (option) =>
      option.label.toLocaleLowerCase().includes(needle) ||
      (option.support ?? "").toLocaleLowerCase().includes(needle),
  );
}

export function Picker({
  anchorRef,
  label,
  options,
  value,
  onSelect,
  onClose,
  onSearch,
  loading = false,
  placeholder,
  onCreate,
  createLabel,
  clear,
  multiple = false,
  keepOpenOnSelect = false,
  selectedIds,
  align = "start",
  matchAnchorWidth = false,
  presentation = "auto",
  id,
  renderOption,
  className,
  ...rest
}: PickerProps) {
  const compact = useCompactViewport() && presentation === "auto";
  const generatedId = useId();
  const surfaceId = id ?? `${generatedId}-picker`;
  const listboxId = `${generatedId}-listbox`;
  const inputId = `${generatedId}-search`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const visible = useMemo(
    () => (onSearch ? options : localFilter(options, query)),
    [onSearch, options, query],
  );

  const chosen = useMemo(
    () => new Set(selectedIds ?? (value === null ? [] : [value])),
    [selectedIds, value],
  );

  /*
   * The commands at the foot of the list are ROWS IN THE SAME LISTBOX, not
   * buttons bolted on outside it. Anything outside would be unreachable by the
   * arrow keys, unannounced by the listbox's own count, and skipped by every
   * keyboard user — the exact defect a shared primitive exists to prevent.
   */
  type Row =
    | { readonly kind: "option"; readonly option: PickerOption }
    | { readonly kind: "create"; readonly name: string }
    | { readonly kind: "clear"; readonly label: string }
    /** A group heading. Rendered, never focusable, never announced as a choice. */
    | { readonly kind: "heading"; readonly label: string };

  const rows = useMemo<readonly Row[]>(() => {
    const list: Row[] = [];
    /*
     * Headings are emitted whenever the group CHANGES, in the order the caller
     * gave — so "Recent" then "All projects" is the caller's ordering decision
     * rather than a sort this component imposes on records it does not
     * understand.
     */
    let group: string | undefined;
    for (const option of visible) {
      if (option.group !== undefined && option.group !== group) {
        list.push({ kind: "heading", label: option.group });
      }
      group = option.group;
      list.push({ kind: "option", option });
    }
    const trimmed = query.trim();
    if (
      onCreate &&
      trimmed.length > 0 &&
      // Never offer to create something that is already in the list under
      // exactly that name — two records called "Training" is not what was asked
      // for, and the existing one is one row above the command.
      !visible.some(
        (option) =>
          option.label.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      )
    ) {
      list.push({ kind: "create", name: trimmed });
    }
    if (clear && trimmed.length === 0) {
      list.push({ kind: "clear", label: clear.label });
    }
    return list;
  }, [clear, onCreate, query, visible]);

  /** A heading is not a destination, and neither is a disabled option. */
  const focusable = useCallback(
    (row: Row | undefined): boolean =>
      row !== undefined &&
      row.kind !== "heading" &&
      (row.kind !== "option" || row.option.disabled !== true),
    [],
  );

  // The active row must stay inside the list as it is filtered. Clamping rather
  // than resetting keeps the cursor near where the reader left it when a
  // keystroke merely narrows the list.
  useEffect(() => {
    setActiveIndex((current) => {
      if (rows.length === 0) return 0;
      const clamped = Math.min(current, rows.length - 1);
      if (focusable(rows[clamped])) return clamped;
      // The row it landed on is a heading (or has become disabled). Walk
      // forward to the first real choice, then backward, so a list whose only
      // focusable rows are above the clamp still gets a cursor.
      for (let index = clamped; index < rows.length; index += 1) {
        if (focusable(rows[index])) return index;
      }
      for (let index = clamped; index >= 0; index -= 1) {
        if (focusable(rows[index])) return index;
      }
      return clamped;
    });
  }, [focusable, rows]);

  // The search field owns focus for the whole life of the surface (the combobox
  // pattern), so it takes it as soon as the surface exists. The phone Sheet
  // owns its own initial focus, so only the anchored presentation reaches in.
  useEffect(() => {
    if (compact) return;
    inputRef.current?.focus();
  }, [compact]);

  const rowId = useCallback(
    (index: number) => `${generatedId}-row-${index}`,
    [generatedId],
  );

  const commit = useCallback(
    (row: Row) => {
      switch (row.kind) {
        case "heading":
          return;
        case "option":
          if (row.option.disabled === true) return;
          onSelect(row.option.id);
          // A single-choice picker is finished the moment a choice is made
          // (DHDS-09 §32). A multi-select stays open, and clears the query so
          // the next value is searched for from the whole list. A host that is
          // SAVING keeps it open too and closes on the server's answer — see
          // `keepOpenOnSelect`.
          if (multiple) {
            setQuery("");
            onSearch?.("");
          } else if (!keepOpenOnSelect) {
            onClose(true);
          }
          return;
        case "create":
          onCreate?.(row.name);
          /*
           * Creating is a CHOICE, so it ends the same way choosing does.
           *
           * A single-choice picker is finished — the created record is the
           * answer. A MULTI-SELECT is not: V2.6 FIND-02 gave the picker its
           * first `multiple` + `onCreate` host (the tags field), and closing on
           * a create there would mean re-opening the surface between every new
           * tag while an existing tag could be chosen without leaving it. Two
           * behaviours for one gesture, decided by whether the word happened to
           * exist already. So the multi-select branch matches the option branch
           * exactly, including clearing the query for the next search.
           */
          if (multiple) {
            setQuery("");
            onSearch?.("");
          } else {
            onClose(true);
          }
          return;
        case "clear":
          clear?.onSelect();
          // Clearing is a save like any other, so it follows the same rule.
          if (!keepOpenOnSelect) onClose(true);
          return;
      }
    },
    [clear, keepOpenOnSelect, multiple, onClose, onCreate, onSearch, onSelect],
  );

  const step = (delta: number) => {
    if (rows.length === 0) return;
    setActiveIndex((current) => {
      for (let hop = 1; hop <= rows.length; hop += 1) {
        const next = (current + delta * hop + rows.length * hop) % rows.length;
        if (focusable(rows[next])) return next;
      }
      return current;
    });
  };

  const edge = (from: number, direction: 1 | -1) => {
    for (let offset = 0; offset < rows.length; offset += 1) {
      const index = from + direction * offset;
      if (index < 0 || index >= rows.length) break;
      if (focusable(rows[index])) {
        setActiveIndex(index);
        return;
      }
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        return;
      case "Home":
        event.preventDefault();
        edge(0, 1);
        return;
      case "End":
        event.preventDefault();
        edge(Math.max(rows.length - 1, 0), -1);
        return;
      case "Enter": {
        const row = rows[activeIndex];
        if (row === undefined) return;
        event.preventDefault();
        commit(row);
        return;
      }
      case "Escape":
        event.preventDefault();
        // Only this picker closes — Escape never reaches an enclosing Drawer
        // while the picker owns focus (DHDS-09 §34).
        event.stopPropagation();
        onClose(true);
        return;
      case "Tab":
        onClose(false);
        return;
      default:
        return;
    }
  };

  const body = (
    <>
      {/*
        The search field is part of the surface, not a control sitting on it:
        one hairline separates it from the options it filters, and it carries no
        border or radius of its own. A bordered input inside a bordered panel is
        the stock component-library look DHDS-01 §6 rules out.
      */}
      <div className="dh-picker__search">
        <SearchIcon className="dh-picker__search-icon" aria-hidden="true" />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className="dh-picker__search-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            rows.length > 0 ? rowId(activeIndex) : undefined
          }
          aria-label={`Search ${label.toLocaleLowerCase()}`}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? `Search ${label.toLocaleLowerCase()}…`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            onSearch?.(event.target.value);
          }}
          onKeyDown={onInputKeyDown}
        />
      </div>

      <ul
        className="dh-picker__options"
        id={listboxId}
        role="listbox"
        aria-label={label}
      >
        {loading && rows.length === 0
          ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
              // `presentation` removes these from the listbox's owned children,
              // so a placeholder is never announced as a choosable option.
              <li key={index} role="presentation" aria-hidden="true">
                <div className="dh-picker__skeleton" />
              </li>
            ))
          : null}

        {!loading && rows.length === 0 ? (
          <li role="presentation">
            <p className="dh-picker__empty">
              {query.trim().length > 0 ? (
                <>
                  No {label.toLocaleLowerCase()} matches{" "}
                  <span className="dh-picker__empty-query">
                    “{query.trim()}”
                  </span>
                </>
              ) : (
                `No ${label.toLocaleLowerCase()} to choose from yet.`
              )}
            </p>
          </li>
        ) : null}

        {rows.map((row, index) => {
          const active = index === activeIndex;
          if (row.kind === "heading") {
            return (
              <li
                key={`heading-${row.label}`}
                // `presentation` keeps a heading out of the listbox's owned
                // children: it is a label for the rows beneath it, not a choice.
                role="presentation"
                className="dh-floating__heading"
              >
                {row.label}
              </li>
            );
          }
          if (row.kind !== "option") {
            const text =
              row.kind === "create"
                ? (createLabel?.(row.name) ?? `Create “${row.name}”`)
                : row.label;
            return (
              // Keyboard operation is on the combobox INPUT via
              // `aria-activedescendant` (the WAI-ARIA combobox pattern); the
              // option's click is the pointer path only, and giving the row its
              // own key handler would put a second, unreachable tab stop in a
              // list the arrow keys already walk.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={row.kind}
                id={rowId(index)}
                role="option"
                aria-selected={false}
                className="dh-option"
                data-tone="quiet"
                data-active={active || undefined}
                data-option-id={`__${row.kind}`}
                onMouseEnter={() => setActiveIndex(index)}
                // The combobox pattern keeps DOM focus in the text field, so
                // the pointer path is a click and `mousedown` must not steal it.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(row)}
              >
                <OptionContent label={text} />
              </li>
            );
          }

          const option = row.option;
          const selected = chosen.has(option.id);
          const supportId = option.support
            ? `${generatedId}-support-${option.id}`
            : undefined;
          return (
            // Keyboard operation is on the combobox input — see the note above.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={option.id}
              id={rowId(index)}
              role="option"
              /*
               * DHDS-09's own rule, finally true (DEBT-185): the supporting
               * line is "never part of the accessible NAME (it is referenced
               * separately)". It was — `aria-describedby` does NOT remove a
               * descendant from the name computation, so an option read as
               * "Home & Property Area" and then announced the qualifier a
               * second time as its description. It was also unmatchable by the
               * words it visibly shows, which is what a screen-reader user
               * navigates a list of options by.
               *
               * The name is the LABEL, explicitly. `Menu` was already correct;
               * this makes the two floating surfaces agree.
               */
              aria-label={option.ariaLabel ?? option.label}
              aria-selected={selected}
              aria-disabled={option.disabled || undefined}
              aria-describedby={supportId}
              className="dh-option"
              data-tone={option.tone ?? "default"}
              data-active={active || undefined}
              data-option-id={option.id}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(row)}
            >
              {renderOption ? (
                renderOption(option)
              ) : (
                <OptionContent
                  mark={option.mark}
                  label={option.label}
                  support={option.support}
                  supportId={supportId}
                  shortcut={option.shortcut}
                  selected={selected}
                  showCheck
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  /*
   * The surface's own attributes, applied to whichever element IS the surface.
   *
   * Anchored, that element is the `AnchoredSurface` itself rather than a child
   * of it: `.dh-anchored` clamps and scrolls, so a bordered, shadowed box inside
   * it would have its shadow clipped by its own wrapper and its bottom border
   * scrolled away with the last option.
   *
   * The DIALOG role goes with it — except on a phone, where the Sheet already
   * is one. Declaring both put two dialogs with the same accessible name in the
   * document, which is exactly the ambiguity the naming rule below exists to
   * prevent: anything resolving "Choose project" then had two candidates.
   */
  const surfaceProps = {
    className: ["dh-floating", "dh-picker", className]
      .filter(Boolean)
      .join(" "),
    id: surfaceId,
    ...(compact
      ? {}
      : {
          role: "dialog",
          // "Choose a project", not "Project": the dialog and the field it edits
          // are two different things, and giving them one name makes "the
          // project" ambiguous to anything navigating by name.
          "aria-label": `Choose ${label.toLocaleLowerCase()}`,
        }),
    "data-presentation": compact ? ("sheet" as const) : ("anchored" as const),
    "data-testid": rest["data-testid"],
  };

  if (compact) {
    return (
      <Sheet
        title={`Choose ${label.toLocaleLowerCase()}`}
        opener={anchorRef.current}
        onClose={() => onClose(true)}
        initialFocusRef={inputRef}
        className="dh-picker-sheet"
        data-testid={
          rest["data-testid"] ? `${rest["data-testid"]}-sheet` : undefined
        }
      >
        <div {...surfaceProps}>{body}</div>
      </Sheet>
    );
  }

  return (
    <AnchoredSurface
      {...surfaceProps}
      anchorRef={anchorRef}
      align={align}
      matchAnchorWidth={matchAnchorWidth}
      onDismiss={() => onClose(false)}
    >
      {body}
    </AnchoredSurface>
  );
}
