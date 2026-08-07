/**
 * M3-TIP — `Mod-Shift-x` notation → the shared `CommandShortcut` model.
 *
 * Two places in DalyHub already describe a keyboard shortcut, and they describe
 * it differently: the editor keymap uses CodeMirror's dash-separated string
 * (`Mod-Shift-x`), while the command model (`~/shared/commands/shortcut`) uses a
 * `{ key, modifiers }` record and owns the ONE platform-correct display
 * formatter. This module is the bridge, so the tooltip can accept the notation
 * that is already written next to every editor action and still render it
 * through the formatter that already exists — rather than growing a second
 * ⌘/Ctrl table beside the first.
 *
 * Pure and React-free, so the parse is unit-testable without a DOM.
 */

import type { ShortcutModifier } from "~/shared/commands/shortcut";

import type { CommandShortcut } from "~/kernel/modules";

/** CodeMirror's modifier names, lowercased, mapped to the command model's. */
const MODIFIERS: Record<string, ShortcutModifier> = {
  mod: "mod",
  cmd: "meta",
  meta: "meta",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
};

/**
 * Parse `"Mod-Shift-x"` into `{ key: "x", modifiers: ["mod", "shift"] }`.
 *
 * Returns `null` for anything that is not a usable shortcut (an empty string, or
 * a spec whose final segment is missing), so a caller can simply render nothing
 * rather than guard first.
 */
export function parseModShortcut(spec: string): CommandShortcut | null {
  const parts = spec
    .split("-")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  // The LAST segment is always the key — including when the key is itself `-`
  // (written as a trailing empty segment, which the filter above removes and
  // which therefore cannot be expressed; no DalyHub shortcut uses it).
  const key = parts[parts.length - 1];
  const modifiers: ShortcutModifier[] = [];
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier === undefined) {
      // An unrecognised modifier means the spec is not one we can display
      // faithfully, and a wrong shortcut is worse than none.
      return null;
    }
    if (!modifiers.includes(modifier)) {
      modifiers.push(modifier);
    }
  }
  return { key, modifiers };
}
