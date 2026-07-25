/**
 * NOTES-05 — a pure, DOM-free parser for a GFM table's SOURCE, used only to
 * build the live editor's rendered-table widget (`widgets.ts`).
 *
 * It never emits HTML and is not a second Markdown renderer: it turns the exact
 * table source the editor already holds into a small `{ headers, aligns, rows }`
 * value, which the widget then paints into a real `<table>` using DOM
 * `createElement` + `textContent` (never an HTML-string sink, so the FND-08
 * single-sink invariant is untouched). Cell text is rendered as
 * plain text — the live table widget deliberately does not itself render nested
 * inline Markdown; the full FND-08 render is available in Read mode.
 *
 * Kept pure and React/DOM-free so the row/column/alignment parsing is unit
 * tested directly.
 */

/** A parsed GFM table. */
export interface ParsedTable {
  readonly headers: readonly string[];
  /** Column alignments, one per column (`null` = default/left). */
  readonly aligns: readonly (TableAlign | null)[];
  readonly rows: readonly (readonly string[])[];
}

export type TableAlign = "left" | "center" | "right";

/** Split a single table row into its cells, honouring backslash-escaped pipes
 * (`\|`) and trimming the optional leading/trailing pipe and cell whitespace. */
export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      // Keep the escaped character verbatim (including `\|`), so an escaped
      // pipe never splits a cell.
      current += ch + line[i + 1];
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  // A leading pipe produces an empty first cell and a trailing pipe an empty
  // last cell — drop those framing empties, but never collapse genuine empty
  // interior cells.
  if (cells.length > 0 && cells[0].trim() === "") {
    cells.shift();
  }
  if (cells.length > 0 && cells[cells.length - 1].trim() === "") {
    cells.pop();
  }
  return cells.map((cell) => cell.trim());
}

/** Read a GFM alignment token (`---`, `:--`, `:-:`, `--:`) into an alignment. */
function readAlign(token: string): TableAlign | null {
  const t = token.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/**
 * Parse GFM table source (the exact text of a Lezer `Table` node) into a
 * structured value. Returns `null` if the source has no delimiter row (so the
 * caller can fall back to showing raw source rather than an empty widget).
 */
export function parseTableSource(source: string): ParsedTable | null {
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return null;
  }
  const headers = splitTableRow(lines[0]);
  const delimiterCells = splitTableRow(lines[1]);
  const isDelimiter =
    delimiterCells.length > 0 &&
    delimiterCells.every((cell) => /^:?-+:?$/.test(cell.trim()));
  if (!isDelimiter) {
    return null;
  }
  const aligns = delimiterCells.map(readAlign);
  const rows = lines.slice(2).map((line) => splitTableRow(line));
  return { headers, aligns, rows };
}
