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
 * The reference is Today-scoped by design (TODAY-05): it documents the Today
 * execution keyboard workflow. A cross-app shortcuts overlay (`?` everywhere) can be
 * layered on later without changing this contract.
 */

import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";

/** The DS-03 drawer key that opens the keyboard reference. */
export const HELP_DRAWER_KEY = "help:shortcuts";

/** One documented shortcut: the keys to press and what it does. */
interface ShortcutRow {
  /** The keys, each rendered as a `<kbd>` (e.g. `["⌘", "K"]` or `["P"]`). */
  readonly keys: readonly string[];
  readonly description: string;
}

interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

/** The Today keyboard reference, grouped for scannability. */
export const TODAY_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Anywhere",
    rows: [
      { keys: ["⌘/Ctrl", "K"], description: "Open the Command Palette" },
      { keys: ["/"], description: "Search" },
      { keys: ["?"], description: "Show this keyboard reference" },
      {
        keys: ["Esc"],
        description: "Close the top overlay, or clear a selection",
      },
    ],
  },
  {
    title: "Move through tasks",
    rows: [
      { keys: ["↑"], description: "Focus the previous task" },
      { keys: ["↓"], description: "Focus the next task" },
      { keys: ["Home"], description: "First task in the section" },
      { keys: ["End"], description: "Last task in the section" },
      { keys: ["Enter"], description: "Open the focused task" },
      { keys: ["Space"], description: "Select or deselect the focused task" },
    ],
  },
  {
    title: "Act on the focused task",
    rows: [
      { keys: ["C"], description: "Complete or reopen" },
      { keys: ["P"], description: "Plan for today" },
      { keys: ["Shift", "P"], description: "Move to tomorrow" },
    ],
  },
];

/** Render the keyboard reference into a DS-03 drawer panel, or null for other keys. */
export function renderKeyboardHelpDrawer(
  entry: DrawerEntry,
): DrawerRenderResult | null {
  if (entry.key !== HELP_DRAWER_KEY) {
    return null;
  }
  return {
    title: "Keyboard shortcuts",
    description: "Operate Today without a mouse",
    children: <KeyboardHelp />,
  };
}

/** The reference body. Semantic, text-labelled, screen-reader friendly. */
export function KeyboardHelp() {
  return (
    <div className="dh-keyboard-help">
      <p className="dh-keyboard-help__intro">
        Today is fully operable from the keyboard. These shortcuts do not fire
        while you are typing in a field.
      </p>
      {TODAY_SHORTCUT_GROUPS.map((group) => (
        <section
          key={group.title}
          className="dh-keyboard-help__group"
          aria-labelledby={`kbd-${group.title.replace(/\s+/g, "-")}`}
        >
          <h3
            id={`kbd-${group.title.replace(/\s+/g, "-")}`}
            className="dh-keyboard-help__group-title"
          >
            {group.title}
          </h3>
          <dl className="dh-keyboard-help__list">
            {group.rows.map((row) => (
              <div key={row.description} className="dh-keyboard-help__row">
                <dt className="dh-keyboard-help__keys">
                  {row.keys.map((key, index) => (
                    <span key={key} className="dh-keyboard-help__key-wrap">
                      {index > 0 ? (
                        <span
                          className="dh-keyboard-help__plus"
                          aria-hidden="true"
                        >
                          {" + "}
                        </span>
                      ) : null}
                      <kbd className="dh-keyboard-help__key">{key}</kbd>
                    </span>
                  ))}
                </dt>
                <dd className="dh-keyboard-help__desc">{row.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
