/**
 * NOTES-05 — keyboard shortcuts for the live editor.
 *
 * Every shortcut maps to one of the SAME pure Markdown-source transforms the
 * toolbar uses (via `applyMarkdownTransform`), so there is a single formatting
 * code path whether a user clicks a button or presses ⌘B. Shortcuts use the
 * `Mod` convention (⌘ on macOS, Ctrl elsewhere).
 *
 * These slot into the product's keyboard model (ACCESSIBILITY_RESPONSIVE.md):
 * they are scoped to the editor's own keymap (active only while it has focus)
 * and deliberately avoid the reserved global vocabulary — they never rebind
 * `Mod-K` (Command Palette) or `/` (Search). `Mod-b/i/e/k` and the list/quote
 * chords are standard editor shortcuts that only fire while typing in the note.
 */

import type { KeyBinding } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";

import { applyMarkdownTransform } from "./editor-commands";
import { MARKDOWN_FORMATTING_ACTIONS } from "./formatting-actions";

/** Build the editor's formatting key bindings from the shared action catalogue
 * (only the actions that declare a `shortcut`). */
export function formattingKeymap(): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  for (const action of MARKDOWN_FORMATTING_ACTIONS) {
    if (!action.shortcut) continue;
    bindings.push({
      key: action.shortcut,
      preventDefault: true,
      run: (view: EditorView) => applyMarkdownTransform(view, action.transform),
    });
  }
  return bindings;
}
