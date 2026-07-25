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
 */

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  MARKDOWN_FORMATTING_ACTIONS,
  type MarkdownFormattingAction,
} from "./formatting-actions";

export interface EditorToolbarProps {
  /** Apply a formatting action to the host editor's Markdown source. */
  readonly onAction: (action: MarkdownFormattingAction) => void;
  /** Accessible-name context, e.g. so screen-reader users know these controls
   * format the "Note" editor. */
  readonly label?: string;
  /** Disable the whole toolbar (e.g. while in Read mode). */
  readonly disabled?: boolean;
}

export function EditorToolbar({
  onAction,
  label = "Formatting",
  disabled = false,
}: EditorToolbarProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving tabindex: only the active button is a Tab stop; Arrow/Home/End move
  // the active button.
  const [activeIndex, setActiveIndex] = useState(0);

  const focusButton = useCallback((index: number) => {
    const button = buttonsRef.current[index];
    if (button) {
      setActiveIndex(index);
      button.focus();
    }
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      const count = MARKDOWN_FORMATTING_ACTIONS.length;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          focusButton((index + 1) % count);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          focusButton((index - 1 + count) % count);
          break;
        case "Home":
          event.preventDefault();
          focusButton(0);
          break;
        case "End":
          event.preventDefault();
          focusButton(count - 1);
          break;
        default:
          break;
      }
    },
    [focusButton],
  );

  return (
    <div
      className="dh-md-toolbar"
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
    >
      {MARKDOWN_FORMATTING_ACTIONS.map((action, index) => (
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
          // clicked — the format applies to what the user had selected, and the
          // caret stays in the document (the host restores focus on apply).
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
