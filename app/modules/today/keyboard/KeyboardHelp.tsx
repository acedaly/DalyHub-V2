/**
 * TODAY-05 — the keyboard-shortcuts reference, shown in the shared DS-03 Drawer.
 *
 * Rather than build a bespoke help modal, the reference is hosted by the SAME DS-03
 * Drawer that opens task records (reused focus trap, inert background, scroll lock,
 * focus restoration — no second modal machinery). A Today command ("Keyboard
 * shortcuts") and the `?` shortcut open the `help:shortcuts` drawer key. The keys are
 * rendered as `<kbd>` alongside a text description, so no meaning is carried by an
 * unlabelled glyph or by colour.
 *
 * UX-01 — the CONTENT is no longer Today's. It now comes from the ONE shared
 * catalogue (`~/shared/commands/shortcut-reference`) rendered by the ONE shared
 * component, because the same reference is also reachable from every other surface
 * via the shell's `?` sheet — and two copies of a keyboard reference is precisely
 * the drift this audit exists to remove.
 *
 * Today keeps this Drawer host on purpose: here the reference belongs inside the
 * drawer STACK, which is what makes a task drawer beneath it stop owning the task
 * shortcuts (`isTop`). A sheet would sit outside that stack. Converging the two
 * hosts remains recorded as DEBT-18.
 */

import { KeyboardShortcutsReference } from "~/shared/commands/KeyboardShortcutsReference";
import { SHORTCUT_REFERENCE_GROUPS } from "~/shared/commands/shortcut-reference";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";

/** The DS-03 drawer key that opens the keyboard reference. */
export const HELP_DRAWER_KEY = "help:shortcuts";

/**
 * The groups shown on Today: the global ones plus Today's own. That is the whole
 * catalogue today, but it is filtered by SCOPE rather than assumed, so a future
 * surface-specific group never silently appears on Today.
 */
export const TODAY_SHORTCUT_GROUPS = SHORTCUT_REFERENCE_GROUPS.filter(
  (group) => group.scope === "global" || group.scope === "today",
);

/** Render the keyboard reference into a DS-03 drawer panel, or null for other keys. */
export function renderKeyboardHelpDrawer(
  entry: DrawerEntry,
): DrawerRenderResult | null {
  if (entry.key !== HELP_DRAWER_KEY) {
    return null;
  }
  return {
    title: "Keyboard shortcuts",
    description: "Operate DalyHub without a mouse",
    children: <KeyboardHelp />,
  };
}

/** The reference body — the shared renderer, scoped to what applies on Today. */
export function KeyboardHelp() {
  return <KeyboardShortcutsReference groups={TODAY_SHORTCUT_GROUPS} />;
}
