/**
 * NOTES-05 / EDIT-01 — the shared writing-editor formatting toolbar.
 *
 * It drives ANY writing surface through a single `onAction` callback (the live
 * CodeMirror editor, or the same fallback textarea when scripting is
 * unavailable). It is NOT a rich-text editor — each button asks the host to
 * apply one of the pure `markdown-transforms.ts` splices to the Markdown source.
 *
 * ── EDIT-01: what changed and why ────────────────────────────────────────────
 * The toolbar was a row of WORDS in bordered tiles. It was unambiguous and
 * accessible, and it was also the single loudest piece of chrome in the product:
 * eleven word-buttons wrapped over two lines on a laptop and scrolled off the
 * screen on a phone, and the strip's own border-plus-fill made it read as a
 * panel sitting on top of the note rather than as part of it.
 *
 * It is now a compact ICON row, and three things carry the weight the words used
 * to:
 *
 *   - `aria-label` on every button (the word is still the accessible name, so
 *     nothing is icon-only to assistive tech — AGENTS.md §15);
 *   - the shared tooltip (`~/shared/tooltip`), carrying what the control does
 *     and the keyboard shortcut where there is one;
 *   - `aria-pressed` from `formatting-state.ts`, so a control shows whether the
 *     formatting is ALREADY applied — the thing the word-buttons could never do.
 *
 * ── M3-TIP: this toolbar is the tooltip primitive's reference adoption ───────
 * It used to carry `title` on all thirteen controls, which is why the August
 * 2026 interaction audit named it: `title` never appears on keyboard focus, so
 * the shortcut hint — the one thing a keyboard user actually wants — was
 * visible only to a mouse. Every control here now composes the ONE shared
 * tooltip instead, shown on hover AND on `:focus-visible`, with the shortcut
 * rendered by the same formatter the Command Palette uses. The tooltip attaches
 * through a ref and adds no wrapper element, so the roving-tabindex model, the
 * disabled states and the 44px targets below are all untouched by it.
 *
 * Related controls are grouped and divided by a hairline separator instead of by
 * a border around every button, and the strip itself is attached to the writing
 * surface rather than floating above it as a second panel.
 *
 * ── Accessibility (WCAG 2.2 AA), unchanged in structure ──────────────────────
 * A WAI-ARIA `toolbar` with roving-tabindex keyboard navigation (Arrow/Home/End
 * move between controls; the toolbar is a single Tab stop), 44px touch targets
 * on coarse pointers, visible focus, and no meaning carried by colour alone (the
 * pressed state is `aria-pressed` plus a filled container, not a tint).
 *
 * Secondary actions stay INSIDE this toolbar rather than moving to a menu: the
 * toolbar therefore remains exactly ONE Tab stop, the roving model simply spans
 * whatever is currently rendered, and every action stays reachable by Arrow keys
 * with no second focus surface. "More" is an ordinary toolbar button carrying
 * `aria-expanded`.
 */

import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { MoreIcon, RedoIcon, UndoIcon } from "~/shared/icons";
import { Tooltip, composeRefs } from "~/shared/tooltip";

import {
  MARKDOWN_FORMATTING_ACTIONS,
  PRIMARY_FORMATTING_ACTIONS,
  SECONDARY_FORMATTING_ACTIONS,
  type MarkdownFormattingAction,
} from "./formatting-actions";

/**
 * An extra, host-supplied toolbar command that is not a pure source transform —
 * it opens something (the record-link picker is the first and only one). It
 * renders as an ordinary toolbar button INSIDE the same roving model, so it
 * costs no extra Tab stop and needs no second focus surface.
 */
export interface EditorToolbarCommand {
  readonly id: string;
  /** Accessible name — a plain, unambiguous word. */
  readonly label: string;
  /** Longer tooltip/help text. */
  readonly hint: string;
  /** The glyph. Decorative; `label` names the control. */
  readonly icon: ReactNode;
  /** Whether the command currently owns an expanded surface (`aria-expanded`). */
  readonly expanded?: boolean;
  readonly onSelect: () => void;
}

/**
 * Undo/redo, supplied by the host because they belong to the editing SURFACE's
 * history rather than to the Markdown source.
 *
 * Optional as a whole: the SSR/no-JS `<textarea>` fallback has the browser's own
 * undo stack, which cannot be queried, and a permanently-enabled button that may
 * do nothing is exactly the non-functional control this toolbar refuses to show.
 */
export interface EditorHistoryCommands {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export interface EditorToolbarProps {
  /** Apply a formatting action to the host editor's Markdown source. */
  readonly onAction: (action: MarkdownFormattingAction) => void;
  /** Accessible-name context, e.g. so screen-reader users know these controls
   * format the "Note" editor. */
  readonly label?: string;
  /** Disable the whole toolbar (e.g. while saving). */
  readonly disabled?: boolean;
  /** Host-supplied commands, rendered after the formatting actions. */
  readonly commands?: readonly EditorToolbarCommand[];
  /**
   * Which formatting currently applies at the selection, from
   * `activeFormattingIds`. Omitted (or empty) simply means nothing is pressed.
   */
  readonly activeIds?: ReadonlySet<string>;
  /** Undo/redo, when the live surface can both perform and report them. */
  readonly history?: EditorHistoryCommands;
}

const NO_COMMANDS: readonly EditorToolbarCommand[] = [];
const NO_ACTIVE: ReadonlySet<string> = new Set();

/** One rendered toolbar entry: a focusable control, or a decorative divider. */
type ToolbarEntry =
  | { readonly kind: "separator"; readonly key: string }
  | {
      readonly kind: "control";
      readonly key: string;
      /**
       * Whether this control can currently take focus. The roving model has to
       * know: a `disabled` button is not tabbable, so parking the single tab
       * stop on one removes the entire toolbar from the Tab order — and, because
       * the row is a horizontally scrollable region, it also leaves that region
       * with no focusable content, which is a WCAG failure in its own right
       * (axe `scrollable-region-focusable`).
       */
      readonly enabled: boolean;
      readonly render: (index: number) => ReactNode;
    };

export function EditorToolbar({
  onAction,
  label = "Formatting",
  disabled = false,
  commands = NO_COMMANDS,
  activeIds = NO_ACTIVE,
  history,
}: EditorToolbarProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving tabindex: exactly one control is a Tab stop; Arrow/Home/End move it.
  // It must always be an ENABLED control — see `ToolbarEntry.enabled`.
  const [activeIndex, setActiveIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  /**
   * The Arrow/Home/End handler, reached through a ref.
   *
   * It has to wrap around the number of controls currently on screen, and that
   * number is derived from the entry list below — which in turn needs the
   * handler. A ref breaks the cycle without making the entry list rebuild on
   * every keystroke.
   */
  const onKeyDownRef = useRef<
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void
  >(() => {});

  /**
   * The control index that currently holds the tab stop, read by every button's
   * `tabIndex` during render.
   *
   * A ref rather than the raw state, because the resolved value depends on which
   * controls are ENABLED — and that is only known after the entry list has been
   * built. The ref is assigned below, before any `render()` runs.
   */
  const activeIndexRef = useRef(0);

  const registerButton = useCallback(
    (index: number) => (node: HTMLButtonElement | null) => {
      buttonsRef.current[index] = node;
    },
    [],
  );

  const focusControl = useCallback((index: number) => {
    const button = buttonsRef.current[index];
    if (button) {
      setActiveIndex(index);
      button.focus();
    }
  }, []);

  /**
   * Build the toolbar as DATA first, then assign roving indices to the controls
   * in render order. Doing the arithmetic by hand (as this file used to) meant
   * every new control shifted three separate offset expressions; a list that
   * numbers itself cannot fall out of step with what is on screen.
   */
  const entries = useMemo<readonly ToolbarEntry[]>(() => {
    const built: ToolbarEntry[] = [];

    const pushAction = (action: MarkdownFormattingAction) => {
      const Glyph = action.icon;
      const pressed = action.stateful ? activeIds.has(action.id) : undefined;
      built.push({
        kind: "control",
        key: action.id,
        enabled: !disabled,
        render: (index) => (
          <Tooltip label={action.hint} shortcut={action.shortcut}>
            {(tip) => (
              <button
                ref={composeRefs(registerButton(index), tip.ref)}
                type="button"
                className="dh-md-toolbar__button"
                data-action={action.id}
                aria-label={action.label}
                aria-describedby={tip.describedBy}
                aria-pressed={pressed}
                disabled={disabled}
                tabIndex={index === activeIndexRef.current ? 0 : -1}
                onKeyDown={(event) => onKeyDownRef.current(event, index)}
                onFocus={() => setActiveIndex(index)}
                // Keep the editor focused and its selection intact when a button
                // is clicked — the format applies to what the user had selected,
                // the caret stays in the document, and (on a phone) the software
                // keyboard is not dismissed and re-raised on every formatting
                // tap.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onAction(action)}
              >
                <Glyph />
              </button>
            )}
          </Tooltip>
        ),
      });
    };

    if (history) {
      built.push({
        kind: "control",
        key: "undo",
        enabled: !disabled && history.canUndo,
        render: (index) => (
          <Tooltip label="Undo" shortcut="Mod-z">
            {(tip) => (
              <button
                ref={composeRefs(registerButton(index), tip.ref)}
                type="button"
                className="dh-md-toolbar__button"
                data-action="undo"
                aria-label="Undo"
                aria-describedby={tip.describedBy}
                disabled={disabled || !history.canUndo}
                tabIndex={index === activeIndexRef.current ? 0 : -1}
                onKeyDown={(event) => onKeyDownRef.current(event, index)}
                onFocus={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={history.onUndo}
              >
                <UndoIcon />
              </button>
            )}
          </Tooltip>
        ),
      });
      built.push({
        kind: "control",
        key: "redo",
        enabled: !disabled && history.canRedo,
        render: (index) => (
          <Tooltip label="Redo" shortcut="Mod-Shift-z">
            {(tip) => (
              <button
                ref={composeRefs(registerButton(index), tip.ref)}
                type="button"
                className="dh-md-toolbar__button"
                data-action="redo"
                aria-label="Redo"
                aria-describedby={tip.describedBy}
                disabled={disabled || !history.canRedo}
                tabIndex={index === activeIndexRef.current ? 0 : -1}
                onKeyDown={(event) => onKeyDownRef.current(event, index)}
                onFocus={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={history.onRedo}
              >
                <RedoIcon />
              </button>
            )}
          </Tooltip>
        ),
      });
      built.push({ kind: "separator", key: "sep-history" });
    }

    // Primary actions, with a separator wherever the GROUP changes — spacing and
    // a hairline instead of a box around every control.
    let previousGroup: string | null = null;
    for (const action of PRIMARY_FORMATTING_ACTIONS) {
      if (previousGroup !== null && action.group !== previousGroup) {
        built.push({ kind: "separator", key: `sep-${action.group}` });
      }
      previousGroup = action.group;
      pushAction(action);
    }

    for (const command of commands) {
      built.push({
        kind: "control",
        key: command.id,
        enabled: !disabled,
        render: (index) => (
          <Tooltip label={command.hint}>
            {(tip) => (
              <button
                ref={composeRefs(registerButton(index), tip.ref)}
                type="button"
                className="dh-md-toolbar__button"
                data-action={command.id}
                aria-label={command.label}
                aria-describedby={tip.describedBy}
                aria-expanded={command.expanded}
                disabled={disabled}
                tabIndex={index === activeIndexRef.current ? 0 : -1}
                onKeyDown={(event) => onKeyDownRef.current(event, index)}
                onFocus={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={command.onSelect}
              >
                {command.icon}
              </button>
            )}
          </Tooltip>
        ),
      });
    }

    built.push({ kind: "separator", key: "sep-more" });
    built.push({
      kind: "control",
      key: "more",
      enabled: !disabled,
      render: (index) => (
        <Tooltip
          label={
            moreOpen
              ? "Hide the less-used formatting commands"
              : "Show the less-used formatting commands"
          }
        >
          {(tip) => (
            <button
              ref={composeRefs(registerButton(index), tip.ref)}
              type="button"
              className="dh-md-toolbar__button dh-md-toolbar__more"
              data-action="more"
              aria-label={
                moreOpen
                  ? "Fewer formatting options"
                  : "More formatting options"
              }
              aria-describedby={tip.describedBy}
              disabled={disabled}
              aria-expanded={moreOpen}
              tabIndex={index === activeIndexRef.current ? 0 : -1}
              onKeyDown={(event) => onKeyDownRef.current(event, index)}
              onFocus={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <MoreIcon />
            </button>
          )}
        </Tooltip>
      ),
    });

    if (moreOpen) {
      previousGroup = null;
      for (const action of SECONDARY_FORMATTING_ACTIONS) {
        if (previousGroup !== null && action.group !== previousGroup) {
          built.push({ kind: "separator", key: `sep-more-${action.group}` });
        }
        previousGroup = action.group;
        pushAction(action);
      }
    }

    return built;
  }, [
    activeIds,
    commands,
    disabled,
    history,
    moreOpen,
    onAction,
    registerButton,
  ]);

  /**
   * The controls, in render order, with their enabled state — and the roving
   * model derived from them.
   *
   * Everything below navigates the ENABLED subset. Undo is disabled on a freshly
   * mounted editor (there is nothing to undo yet), and it is the first control
   * in the row, so a naive `activeIndex = 0` parked the toolbar's only tab stop
   * on a button the browser will not tab to. The whole toolbar then vanished
   * from the Tab order, and — because the row scrolls horizontally — the
   * scrollable region was left with no focusable content at all.
   */
  const controls = entries.filter(
    (entry): entry is Extract<ToolbarEntry, { kind: "control" }> =>
      entry.kind === "control",
  );
  const enabledIndices = controls
    .map((control, index) => (control.enabled ? index : -1))
    .filter((index) => index >= 0);

  // Keep the tab stop on an enabled control as the enabled SET changes — undoing
  // the last edit disables Undo underneath the user's own focus, and the stop
  // has to move rather than evaporate.
  const resolvedActiveIndex =
    enabledIndices.length === 0
      ? -1
      : enabledIndices.includes(activeIndex)
        ? activeIndex
        : (enabledIndices.find((index) => index > activeIndex) ??
          enabledIndices[0]);

  activeIndexRef.current = resolvedActiveIndex;

  onKeyDownRef.current = (event, index) => {
    if (enabledIndices.length === 0) return;
    const position = enabledIndices.indexOf(index);
    const at = (offset: number) =>
      enabledIndices[(offset + enabledIndices.length) % enabledIndices.length];
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusControl(at(position + 1));
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusControl(at(position - 1));
        break;
      case "Home":
        event.preventDefault();
        focusControl(enabledIndices[0]);
        break;
      case "End":
        event.preventDefault();
        focusControl(enabledIndices[enabledIndices.length - 1]);
        break;
      default:
        break;
    }
  };

  let controlIndex = -1;
  return (
    <div
      className="dh-md-toolbar"
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      /*
       * The row scrolls horizontally, which makes it a scrollable REGION: WCAG
       * (and axe's `scrollable-region-focusable`) requires such a region to be
       * reachable by keyboard, either by containing focusable content or by
       * being focusable itself. Normally the roving tab stop above supplies the
       * former. When every control is disabled there is no such content, so the
       * container itself takes the tab stop and the region stays scrollable by
       * keyboard rather than silently becoming unreachable.
       */
      tabIndex={enabledIndices.length === 0 ? 0 : undefined}
    >
      {entries.map((entry) => {
        if (entry.kind === "separator") {
          return (
            <span
              key={entry.key}
              className="dh-md-toolbar__separator"
              aria-hidden="true"
            />
          );
        }
        controlIndex += 1;
        const index = controlIndex;
        return <Fragment key={entry.key}>{entry.render(index)}</Fragment>;
      })}
    </div>
  );
}

/** Re-exported so a consumer can assert the full catalogue without importing two modules. */
export { MARKDOWN_FORMATTING_ACTIONS };
