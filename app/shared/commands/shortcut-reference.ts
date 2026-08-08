/**
 * UX-01 — the ONE keyboard-shortcut reference, as pure data.
 *
 * Before UX-01 the reference lived inside the Today module and was only reachable
 * from Today, while its own first line told the owner that `?` works "Anywhere".
 * That was the reference's most visible claim and it was untrue on every other
 * screen in the product — a keyboard-first product whose keyboard help could not
 * be summoned from the keyboard anywhere but one route.
 *
 * The content now lives here, React-free, so exactly one catalogue is rendered by
 * both hosts (see `KeyboardShortcutsReference`):
 *   - the app-wide sheet the shell opens on `?` from any surface, and
 *   - the DS-03 Drawer Today already hosts (which keeps the reference inside
 *     Today's drawer STACK, so a task drawer beneath it correctly stops owning the
 *     task shortcuts — behaviour a global sheet would not reproduce).
 *
 * Each group declares its `scope`, so a host can present only what applies where
 * the owner actually is: the shell sheet shows the global groups plus, honestly
 * labelled, the surface-specific ones; nothing is claimed to work where it does
 * not.
 */

/** One documented shortcut: the keys to press and what it does. */
export interface ShortcutReferenceRow {
  /** The keys, each rendered as a `<kbd>` (e.g. `["⌘/Ctrl", "K"]` or `["P"]`). */
  readonly keys: readonly string[];
  readonly description: string;
}

export interface ShortcutReferenceGroup {
  readonly title: string;
  /**
   * `global` shortcuts work on every screen; `today` shortcuts work on the Today
   * execution surface. The scope is data, not prose, so a host can filter rather
   * than a reader having to. Today currently declares none of its own — the
   * union is deliberately kept so a future surface-specific group cannot appear
   * on Today by accident.
   */
  readonly scope: "global" | "today";
  readonly rows: readonly ShortcutReferenceRow[];
}

/** The complete reference, grouped for scannability, most general first. */
export const SHORTCUT_REFERENCE_GROUPS: readonly ShortcutReferenceGroup[] = [
  {
    title: "Anywhere",
    scope: "global",
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
    /*
     * These belong to an OPEN task record, not to a list.
     *
     * They used to be two Today-only groups: one for arrowing through the
     * dashboard’s roving task collection, one for acting on whichever row it had
     * focused. The Today redesign replaced that collection with plain rows — a
     * checkbox completes, a title opens — so the movement group documented keys
     * that no longer exist and had to go rather than be re-scoped.
     *
     * The ACTION group survived the move because its real owner was always the
     * task Drawer (`TaskDrawerContent` registers it while its record is on top),
     * and that Drawer opens from Today, Tasks, a Project and Search alike. So it
     * is `global`: the reference now claims these keys exactly where they work.
     */
    title: "With a task open",
    scope: "global",
    rows: [
      { keys: ["C"], description: "Complete or reopen" },
      { keys: ["P"], description: "Plan for today" },
      { keys: ["Shift", "P"], description: "Move to tomorrow" },
    ],
  },
];

/**
 * The one sentence above the groups. It states the ONE rule that is easy to get
 * wrong (single-key shortcuts are suppressed while typing) rather than restating
 * the table.
 */
export const SHORTCUT_REFERENCE_INTRO =
  "DalyHub is fully operable from the keyboard. Single-key shortcuts do not fire while you are typing in a field.";
