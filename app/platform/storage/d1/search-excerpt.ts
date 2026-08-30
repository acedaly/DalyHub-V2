/**
 * RECALL-01 — the ONE Search excerpt contract, shared by every body-searching
 * repository projection (ADR-114 decision 3).
 *
 * Before RECALL-01 this mechanism existed once, inside the Notes repository, and
 * four other providers matched titles only. Generalising it meant a choice
 * between forking the `instr(...)`/`substr(...)` window into Tasks, Meetings,
 * Diary and Reviews — four copies of an offset calculation that is easy to get
 * subtly wrong — or promoting it to one module. This is that module. Notes now
 * consumes it too, so it remains the reference implementation rather than
 * becoming a fifth fork.
 *
 * The contract, in three parts:
 *
 *   1. **The window is cut in SQL, never in application code.** A matching
 *      1 MiB body ships {@link SEARCH_EXCERPT_WINDOW} characters, not the
 *      record. `substr(col, max(1, instr(lower(col), needle) - W/2), W)` is the
 *      whole mechanism: the database finds the hit and returns a bounded window
 *      around it. No caller may read a body column to cut an excerpt afterwards.
 *   2. **Normalisation is shared.** The window is raw Markdown, so it is passed
 *      through the one analyser (`markdownToPlainText` via
 *      {@link excerptAroundMatch}) which strips syntax and bounds the result.
 *      Providers return PLAIN TEXT and never HTML — highlighting is
 *      presentation-side, over match ranges.
 *   3. **A mid-line window is repaired before it is analysed.** A window that
 *      starts at an arbitrary offset usually begins mid-line, and a truncated
 *      line can be misread as a heading or half a code fence. When the needle
 *      lies after the window's first newline, that partial line is dropped.
 *
 * ASCII case folding is deliberate and matches D1's `lower()` — see
 * `SHARED_SEARCH.md`.
 */

import { excerptAroundMatch } from "~/platform/markdown/note-document";

/**
 * How much raw source travels back for one excerpt, in characters. The window
 * is centred on the hit, so roughly half of it precedes the match. It is a
 * BOUND on the payload, not a display length: the analyser truncates further to
 * `MAX_EXCERPT_LENGTH` after stripping syntax.
 */
export const SEARCH_EXCERPT_WINDOW = 400;

/** Needle binds one excerpt projection consumes, in the order they appear. */
export const SEARCH_EXCERPT_BINDS = 3;

/**
 * The three columns one body source contributes to a search projection:
 * the 1-based hit offset, the bounded window, and where the window starts.
 *
 * `column` must be a SQL expression that is never NULL (wrap nullable columns in
 * `coalesce(..., '')`) and must be composed from literals — never from user
 * input. Binds THREE parameters, all the lower-cased needle, in the order the
 * expressions appear: hit, window, window start.
 */
export function searchExcerptColumns(column: string, alias: string): string {
  const hit = `instr(lower(${column}), ?)`;
  const start = `max(1, instr(lower(${column}), ?) - ${SEARCH_EXCERPT_WINDOW / 2})`;
  return `${hit} AS ${alias}_hit,
          substr(${column}, ${start}, ${SEARCH_EXCERPT_WINDOW}) AS ${alias}_window,
          max(1, instr(lower(${column}), ?) - ${SEARCH_EXCERPT_WINDOW / 2}) AS ${alias}_window_start`;
}

/**
 * The same three columns, resolved from a correlated sub-query over a CHILD
 * table (a Meeting's captured items, a Review's sections) instead of a column on
 * the joined detail row.
 *
 * The parent record still appears exactly ONCE — the predicate that admits it is
 * an `EXISTS` semi-join in the WHERE clause, and this projection only picks the
 * first matching child by the caller's deterministic order. Nothing here fetches
 * child bodies: each sub-query returns a bounded window, `LIMIT 1`.
 *
 * Binds SIX parameters, in pairs (needle, like) — one pair per sub-query.
 */
export function searchExcerptSubquery(options: {
  readonly alias: string;
  /** The child body expression, e.g. `mi.body_markdown`. Never NULL. */
  readonly column: string;
  /** The FROM clause of the sub-query, e.g. `meeting_items mi`. */
  readonly from: string;
  /**
   * The correlated predicate, ending in the child's own
   * `lower(<column>) LIKE ? ESCAPE '\'` so each sub-query binds one like.
   */
  readonly where: string;
  /** A total order over the children, so the chosen excerpt is deterministic. */
  readonly order: string;
}): string {
  const { alias, column, from, where, order } = options;
  const pick = (expression: string): string =>
    `(SELECT ${expression} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT 1)`;
  const start = `max(1, instr(lower(${column}), ?) - ${SEARCH_EXCERPT_WINDOW / 2})`;
  return `${pick(`instr(lower(${column}), ?)`)} AS ${alias}_hit,
          ${pick(`substr(${column}, ${start}, ${SEARCH_EXCERPT_WINDOW})`)} AS ${alias}_window,
          ${pick(start)} AS ${alias}_window_start`;
}

/** One body source's three projected columns, as they come back from D1. */
export interface SearchExcerptRow {
  readonly hit: number | null;
  readonly window: string | null;
  readonly windowStart: number | null;
}

/** Read one aliased excerpt triple out of a raw D1 row. */
export function readSearchExcerptRow(
  row: Record<string, unknown>,
  alias: string,
): SearchExcerptRow {
  const asNumber = (value: unknown): number | null =>
    typeof value === "number" ? value : null;
  return {
    hit: asNumber(row[`${alias}_hit`]),
    window:
      typeof row[`${alias}_window`] === "string"
        ? (row[`${alias}_window`] as string)
        : null,
    windowStart: asNumber(row[`${alias}_window_start`]),
  };
}

/** True when this body source actually contains the needle. */
export function searchExcerptMatched(row: SearchExcerptRow): boolean {
  return (row.hit ?? 0) > 0;
}

/**
 * The window with its partial first line removed when it began mid-line, plus
 * the needle's offset INSIDE the returned window (or `-1` when absent).
 *
 * Offsets from SQL are 1-based; offsets inside the window are relative to
 * `window_start`. Getting either wrong silently produces an excerpt centred on
 * the wrong place, which is why this lives in one function.
 */
export function normaliseSearchExcerptWindow(row: SearchExcerptRow): {
  readonly window: string;
  readonly offset: number;
} {
  const raw = row.window ?? "";
  const windowStart = row.windowStart ?? 1;
  const hit = (row.hit ?? 0) > 0 ? (row.hit as number) - 1 : -1;
  const rawOffset = hit >= 0 ? hit - (windowStart - 1) : -1;
  const partialLine = windowStart > 1 ? raw.indexOf("\n") : -1;
  const trimFrom =
    partialLine !== -1 && partialLine + 1 <= Math.max(rawOffset, 0)
      ? partialLine + 1
      : 0;
  return {
    window: raw.slice(trimFrom),
    offset: rawOffset >= 0 ? rawOffset - trimFrom : -1,
  };
}

/**
 * The finished excerpt for one body source: bounded, single-spaced, free of
 * Markdown syntax, centred on the match. Empty when this source did not match.
 *
 * `needle` is the normalised (lower-cased) query the statement bound, so the
 * analyser locates the same occurrence the database did.
 */
export function searchExcerpt(row: SearchExcerptRow, needle: string): string {
  if (!searchExcerptMatched(row)) return "";
  const { window } = normaliseSearchExcerptWindow(row);
  return excerptAroundMatch(window, needle);
}
