/**
 * DS-17 — the one wording for "clear this field".
 *
 * Every optional select offers a way back to genuinely unset, and until DS-17
 * each family named that control differently: `SelectField` said
 * `Clear selection` on an icon button, `SelectSheetControl` said the same in
 * visible text, and `InlineSelectField` alone named it after its field. A form
 * with three selects therefore had three buttons with one accessible name
 * between them, and a screen-reader user tabbing it could not tell which field
 * each would empty (DEBT-112).
 *
 * The name is derived from the field's own label rather than passed in, so a new
 * select cannot forget to supply one — the failure mode a prop would reintroduce
 * the first time a call site omitted it.
 *
 * Lower-cased because the label is a sentence fragment inside the command, not a
 * heading: "Clear due date", not "Clear Due date". `toLocaleLowerCase` rather
 * than `toLowerCase` for the same reason every other user-facing casing in the
 * product uses it.
 */
export function clearControlLabel(label: string): string {
  return `Clear ${label.toLocaleLowerCase()}`;
}
