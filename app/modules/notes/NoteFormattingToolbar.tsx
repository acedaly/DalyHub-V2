/**
 * NOTES-04 — the Notes writing toolbar.
 *
 * A restrained, Notes-LOCAL row of formatting controls around the existing
 * DS-06 Markdown source `<textarea>`. It helps a user write Markdown without
 * remembering the syntax, but it is NOT a rich-text editor: every button just
 * applies one of the pure `markdown-transforms.ts` splices to the SAME string
 * the textarea already holds and pushes the result back through the editor's
 * existing `onChange` — so the canonical Markdown source stays the single
 * source of truth, the DS-06 autosave coordinator runs exactly as it does for
 * typed changes, and the safe FND-08 preview is unchanged. There is no second
 * document model, parser, or HTML sink here (see MARKDOWN_PIPELINE.md).
 *
 * Accessibility (WCAG 2.2 AA): the row is a WAI-ARIA `toolbar` with
 * roving-tabindex keyboard navigation (Arrow/Home/End move between buttons; the
 * toolbar is a single Tab stop), every button carries a visible, unambiguous
 * word AS its accessible name plus a longer `title` tooltip, controls meet the
 * 44px touch-target floor, and nothing is icon-only or colour-only. On a narrow
 * phone the row scrolls horizontally rather than wrapping into several rows, so
 * the writing surface below keeps the vertical space.
 *
 * Applying an action returns focus and the computed selection/caret to the
 * textarea so the user can keep typing (and repeat a toggle) — a range stays
 * selected, a collapsed caret lands where continued typing makes sense. A
 * `flushSync` around the controlled-value update guarantees the textarea's DOM
 * value has updated before the selection is restored.
 */

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";

import {
  NOTE_FORMATTING_ACTIONS,
  type NoteFormattingAction,
} from "./note-formatting-actions";

export interface NoteFormattingToolbarProps {
  /** The Markdown source textarea the actions operate on. */
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The editor's change handler (the DS-06 autosave field's `onChange`). */
  readonly onChange: (value: string) => void;
  /** Accessible-name context, e.g. so screen-reader users know these controls
   * format the "Note" editor. */
  readonly label?: string;
}

export function NoteFormattingToolbar({
  textareaRef,
  onChange,
  label = "Formatting",
}: NoteFormattingToolbarProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Roving tabindex: only the active button is a Tab stop; Arrow/Home/End move
  // the active button. Activating an action moves focus back to the textarea.
  const [activeIndex, setActiveIndex] = useState(0);

  const applyAction = useCallback(
    (action: NoteFormattingAction) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const value = textarea.value;
      const selectionStart = textarea.selectionStart ?? value.length;
      const selectionEnd = textarea.selectionEnd ?? value.length;
      const result = action.transform({ value, selectionStart, selectionEnd });

      // Only push a change (and so touch autosave) when the source actually
      // changed — a no-op action must not mark the note unsaved.
      if (result.value !== value) {
        // Force the controlled value to flush to the DOM before restoring the
        // selection, so the offsets line up with the new text.
        flushSync(() => onChange(result.value));
      }
      textarea.focus();
      try {
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      } catch {
        // Some environments throw on setSelectionRange for detached nodes;
        // focus alone is an acceptable fallback.
      }
    },
    [onChange, textareaRef],
  );

  const focusButton = useCallback((index: number) => {
    const button = buttonsRef.current[index];
    if (button) {
      setActiveIndex(index);
      button.focus();
    }
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      const count = NOTE_FORMATTING_ACTIONS.length;
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
      className="dh-note-toolbar"
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
    >
      {NOTE_FORMATTING_ACTIONS.map((action, index) => (
        <button
          key={action.id}
          ref={(node) => {
            buttonsRef.current[index] = node;
          }}
          type="button"
          className="dh-note-toolbar__button"
          data-action={action.id}
          title={action.hint}
          tabIndex={index === activeIndex ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, index)}
          onFocus={() => setActiveIndex(index)}
          onClick={() => applyAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
