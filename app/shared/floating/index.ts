/**
 * DHDS-09 — DalyHub's FLOATING SURFACES, and what each one is for.
 *
 * Six kinds of thing can float above the canvas in this product. They are not
 * interchangeable, and the difference between them is behavioural — what the
 * owner is doing, what they can do next, and how the surface goes away — rather
 * than a matter of size or styling. Choosing the wrong one is the defect this
 * module exists to end.
 *
 * | Surface        | It exists to…                                  | Where it lives                    |
 * |----------------|------------------------------------------------|-----------------------------------|
 * | **Tooltip**    | EXPLAIN an unlabelled control, in a few words  | `~/shared/tooltip`                |
 * | **Menu**       | choose a COMMAND from a small closed set        | `./Menu`                          |
 * | **Popover**    | make a short contextual CHOICE that is not a list | `./Popover`                    |
 * | **Picker**     | choose a VALUE from a potentially large set     | `./Picker`                        |
 * | **Sheet**      | do all of the above, on a phone                 | `~/shared/sheet`                  |
 * | **Inspector / Drawer** | INSPECT or edit a record without losing the collection | `~/shared/inspector`, `~/shared/drawer` |
 * | **Dialog**     | INTERRUPT, when interruption is justified       | `~/shared/ui` → `ConfirmationDialog` |
 *
 * Rules that follow from the table, each of which DHDS-09 found broken
 * somewhere in the product:
 *
 *   - a tooltip contains no workflow — no buttons, no forms, no destructive
 *     actions, and it is never an accessible NAME;
 *   - a menu is command-oriented. It is not a mini settings panel;
 *   - a popover holds the choices that are too structured for a menu and too
 *     small for a record. It is not where a record is edited;
 *   - an Inspector is not the mechanism for changing one small piece of
 *     metadata. Reaching for it to set a priority is the friction DHDS-09 is
 *     removing;
 *   - a dialog interrupts, so it is reserved for a destructive confirmation, an
 *     irreversible operation, a conflict, or a decision that genuinely needs an
 *     explicit commitment. Ordinary metadata editing never opens one.
 *
 * All of them share ONE appearance (`app/styles/floating.css`), ONE placement
 * solver (`~/shared/anchored`), ONE motion grammar (DHDS-08, `motion.css`) and
 * ONE layer vocabulary (`--dh-layer-*`). They do NOT share an ARIA pattern,
 * because a menu, a listbox, a combobox and a dialog are different things and
 * flattening them is how a keyboard-complete product stops being one.
 *
 * The full taxonomy, the desktop→phone transformation, the dismissal contract
 * and the focus-restoration rules are in
 * `docs/design/DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md`.
 */

export { Menu } from "./Menu";
export type { MenuProps } from "./Menu";

export { Picker } from "./Picker";
export type { PickerOption, PickerProps } from "./Picker";

export { Popover } from "./Popover";
export type { PopoverProps } from "./Popover";

export { OptionContent } from "./OptionContent";
export type { OptionContentProps } from "./OptionContent";

export {
  TYPEAHEAD_RESET_MS,
  isTypeaheadKey,
  matchTypeahead,
} from "./menu-typeahead";
export type { TypeaheadCandidate } from "./menu-typeahead";

export type {
  FloatingAlign,
  FloatingMenuOption,
  FloatingOption,
  FloatingOptionTone,
  FloatingPresentation,
} from "./types";
