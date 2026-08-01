/**
 * NOTES-05 — the shared writing-editor formatting toolbar.
 *
 * Promoted to `~/shared/markdown-editor` from the NOTES-04 Notes-local
 * `NoteFormattingToolbar`, generalised so it drives ANY writing surface through
 * a single `onAction` callback (the live CodeMirror editor now; the same
 * fallback textarea when scripting is unavailable). It is NOT a rich-text
 * editor — each button just asks the host to apply one of the pure
 * `markdown-transforms.ts` splices to the Markdown source.
 *
 * Accessibility (WCAG 2.2 AA), unchanged from NOTES-04: a WAI-ARIA `toolbar`
 * with roving-tabindex keyboard navigation (Arrow/Home/End move between buttons;
 * the toolbar is a single Tab stop), every button carrying a visible,
 * unambiguous word AS its accessible name plus a longer `title` tooltip, 44px
 * touch targets, nothing icon-only or colour-only. On a narrow phone the row
 * scrolls horizontally rather than wrapping, so the writing surface keeps its
 * vertical space.
 *
 * MOBILE-01 — **common formatting directly, the rest behind More.** Eleven
 * permanently-visible controls is chrome that costs a phone the rows it needs
 * for writing, and it makes the FREQUENT commands harder to reach, not easier,
 * because each one sits further along a scrolling row. So the six commonest
 * actions render directly and the remaining five appear when "More" is expanded.
 *
 * Crucially, the secondary actions stay INSIDE this toolbar rather than moving to
 * a menu: the toolbar therefore remains exactly ONE Tab stop (the DS-11 baseline
 * for a command-button row), the roving model simply spans whatever is currently
 * rendered, and every action stays reachable by Arrow keys with no second focus
 * surface. "More" itself is an ordinary toolbar button carrying `aria-expanded`.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  MARKDOWN_FORMATTING_ACTIONS,
  PRIMARY_FORMATTING_ACTIONS,
  SECONDARY_FORMATTING_ACTIONS,
  type MarkdownFormattingAction,
} from "./formatting-actions";

/**
 * An extra, host-supplied toolbar command that is not a pure source transform —
 * it opens something (NOTES-05 §5's record-link picker is the first and only
 * one). It renders as an ordinary primary toolbar button INSIDE the same roving
 * model, so it costs no extra Tab stop and needs no second focus surface.
 */
export interface EditorToolbarCommand {
  readonly id: string;
  /** Visible button text AND accessible name — a plain, unambiguous word. */
  readonly label: string;
  /** Longer tooltip/help text. */
  readonly hint: string;
  /** Whether the command currently owns an expanded surface (sets `aria-expanded`). */
  readonly expanded?: boolean;
  readonly onSelect: () => void;
}

export interface EditorToolbarProps {
  /** Apply a formatting action to the host editor's Markdown source. */
  readonly onAction: (action: MarkdownFormattingAction) => void;
  /** Accessible-name context, e.g. so screen-reader users know these controls
   * format the "Note" editor. */
  readonly label?: string;
  /** Disable the whole toolbar (e.g. while in Read mode). */
  readonly disabled?: boolean;
  /** Host-supplied commands, rendered after the primary formatting actions. */
  readonly commands?: readonly EditorToolbarCommand[];
}

const NO_COMMANDS: readonly EditorToolbarCommand[] = [];

export function EditorToolbar({
  onAction,
  label = "Formatting",
  disabled = false,
  commands = NO_COMMANDS,
}: EditorToolbarProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving tabindex: only the active control is a Tab stop; Arrow/Home/End move
  // the active control.
  const [activeIndex, setActiveIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  // Everything the toolbar currently renders, in keyboard order: the primary
  // actions, the More toggle, then the secondary actions once revealed. There is
  // no separate collection — the roving model spans exactly what is on screen.
  const actions = useMemo<readonly MarkdownFormattingAction[]>(
    () =>
      moreOpen
        ? [...PRIMARY_FORMATTING_ACTIONS, ...SECONDARY_FORMATTING_ACTIONS]
        : PRIMARY_FORMATTING_ACTIONS,
    [moreOpen],
  );
  // Keyboard order: primary actions, then any host commands, then the More
  // toggle, then the secondary actions once revealed. Host commands sit with the
  // primary group because they are things a writer reaches for while writing
  // (linking a record), not less-used formatting.
  const commandsStart = PRIMARY_FORMATTING_ACTIONS.length;
  const moreIndex = commandsStart + commands.length;
  const controlCount = actions.length + commands.length + 1;

  const focusControl = useCallback((index: number) => {
    const button = buttonsRef.current[index];
    if (button) {
      setActiveIndex(index);
      button.focus();
    }
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          focusControl((index + 1) % controlCount);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          focusControl((index - 1 + controlCount) % controlCount);
          break;
        case "Home":
          event.preventDefault();
          focusControl(0);
          break;
        case "End":
          event.preventDefault();
          focusControl(controlCount - 1);
          break;
        default:
          break;
      }
    },
    [focusControl, controlCount],
  );

  /** Render one formatting button at a given roving index. */
  const renderAction = (action: MarkdownFormattingAction, index: number) => (
    <button
      key={action.id}
      ref={(node) => {
        buttonsRef.current[index] = node;
      }}
      type="button"
      className="dh-md-toolbar__button"
      data-action={action.id}
      title={action.hint}
      disabled={disabled}
      tabIndex={index === activeIndex ? 0 : -1}
      onKeyDown={(event) => onKeyDown(event, index)}
      onFocus={() => setActiveIndex(index)}
      // Keep the editor focused and its selection intact when a button is
      // clicked — the format applies to what the user had selected, the caret
      // stays in the document, and (on a phone) the software keyboard is not
      // dismissed and re-raised on every formatting tap.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onAction(action)}
    >
      {action.label}
    </button>
  );

  return (
    <div
      className="dh-md-toolbar"
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
    >
      {PRIMARY_FORMATTING_ACTIONS.map((action, index) =>
        renderAction(action, index),
      )}

      {commands.map((command, offset) => {
        const index = commandsStart + offset;
        return (
          <button
            key={command.id}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            className="dh-md-toolbar__button"
            data-action={command.id}
            title={command.hint}
            disabled={disabled}
            aria-expanded={command.expanded}
            tabIndex={index === activeIndex ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            onFocus={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={command.onSelect}
          >
            {command.label}
          </button>
        );
      })}

      <button
        ref={(node) => {
          buttonsRef.current[moreIndex] = node;
        }}
        type="button"
        className="dh-md-toolbar__button dh-md-toolbar__more"
        title={
          moreOpen
            ? "Hide the less-used formatting commands"
            : "Show the less-used formatting commands"
        }
        disabled={disabled}
        aria-expanded={moreOpen}
        tabIndex={moreIndex === activeIndex ? 0 : -1}
        onKeyDown={(event) => onKeyDown(event, moreIndex)}
        onFocus={() => setActiveIndex(moreIndex)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setMoreOpen((open) => !open)}
      >
        {moreOpen ? "Less" : "More"}
      </button>

      {moreOpen
        ? SECONDARY_FORMATTING_ACTIONS.map((action, offset) =>
            renderAction(action, moreIndex + 1 + offset),
          )
        : null}
    </div>
  );
}

/** Re-exported so a consumer can assert the full catalogue without importing two modules. */
export { MARKDOWN_FORMATTING_ACTIONS };
