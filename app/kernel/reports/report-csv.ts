/**
 * V2.13 — encoding one CSV field, so a record's NAME cannot become a formula.
 *
 * ── Why this is kernel rather than route-local ─────────────────────────────
 * It is a pure rule about output safety, and a rule only the route could see
 * is a rule only the route can be tested for. It lives here so the export and
 * its test exercise the same function rather than two copies of a regex.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * Quoting stops a comma or a quote from breaking the row. It does NOT stop
 * Excel, Numbers or Sheets from treating a field beginning `=`, `+`, `-`, `@`
 * or a control character as a FORMULA — quoted or not, that is a parsing rule
 * of the reader, not of the file. Report labels are record names: a Finance
 * category, an account, an obligation subject. A name typed as `=cmd` would
 * otherwise be executed by whatever opens the download.
 *
 * The fix is the standard one: a leading `'`, which every spreadsheet reads as
 * "this is text". The value stays legible, and it stays the owner's own words.
 *
 * A NUMBER is never neutralised. A negative amount legitimately begins `-`, and
 * prefixing it would turn a figure into text in every spreadsheet — which would
 * break the one thing a CSV of figures is for.
 */

const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** One CSV field: always quoted, and never executable. `null` writes empty. */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return `"${value}"`;
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
