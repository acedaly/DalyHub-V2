/**
 * EDIT-01 — which formatting is ACTIVE at the current selection.
 *
 * A toolbar button that never looks pressed is a button that cannot tell you
 * what your text already is. Gmail, Docs and every modern notes app answer
 * "is this bold?" by lighting the control; DalyHub's toolbar could not, because
 * the catalogue was pure transforms with no notion of current state.
 *
 * This module is the missing half, and it is deliberately PURE — a Markdown
 * source string plus a selection in, a set of action ids out. No React, no
 * CodeMirror, no DOM. That matters for three reasons:
 *
 *   1. it works for BOTH writing surfaces (the CodeMirror view and the SSR/no-JS
 *      `<textarea>` fallback), so the pressed state is not a
 *      progressive-enhancement-only feature;
 *   2. it is unit-testable against strings, which is where the edge cases live;
 *   3. it reads the SOURCE, so it can never disagree with what will be stored —
 *      there is no second document model to drift from (ADR-006/ADR-015).
 *
 * It is a source scanner, not a CommonMark parser. The contract is deliberately
 * modest: it recognises the emphasis and block structures THIS toolbar can
 * produce, in the shapes it produces them. An exotic construct simply reports
 * "not active", which degrades to the previous behaviour rather than to a wrong
 * answer.
 */

/** The ids this module can report as active — the toolbar's stateful commands. */
export type ActiveFormattingId =
  | "bold"
  | "italic"
  | "strikethrough"
  | "inline-code"
  | "heading"
  | "bulleted-list"
  | "numbered-list"
  | "checklist"
  | "blockquote";

export interface FormattingProbe {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** An inline marker pair and the id it reports. */
const INLINE_MARKERS: readonly {
  readonly id: ActiveFormattingId;
  readonly marker: string;
}[] = [
  // Longest-first: `**` must win over `*`, and `~~` must be tried whole.
  { id: "bold", marker: "**" },
  { id: "strikethrough", marker: "~~" },
  { id: "italic", marker: "_" },
  { id: "inline-code", marker: "`" },
];

/** The line containing `index`, as absolute [start, end) offsets. */
function lineBoundsAt(
  value: string,
  index: number,
): { readonly start: number; readonly end: number } {
  const clamped = Math.max(0, Math.min(index, value.length));
  const start = value.lastIndexOf("\n", clamped - 1) + 1;
  const newline = value.indexOf("\n", clamped);
  return { start, end: newline === -1 ? value.length : newline };
}

/**
 * Every span on `line` delimited by `marker`, as offsets RELATIVE to the line,
 * covering the delimiters as well as the content.
 *
 * Spans are matched greedily left-to-right and non-overlapping, which is how the
 * renderer pairs them too. An unpaired trailing marker yields no span — an
 * author halfway through typing `**bold` is not yet bold, and saying they are
 * would make the button flicker on every keystroke.
 */
function inlineSpans(
  line: string,
  marker: string,
): readonly { readonly from: number; readonly to: number }[] {
  const spans: { from: number; to: number }[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const open = line.indexOf(marker, cursor);
    if (open === -1) break;
    const close = line.indexOf(marker, open + marker.length);
    if (close === -1) break;
    // An empty span (`****`) is not emphasis in CommonMark, and treating it as
    // one would report "bold" for a caret between two literal asterisks.
    if (close > open + marker.length) {
      spans.push({ from: open, to: close + marker.length });
    }
    cursor = close + marker.length;
  }
  return spans;
}

/**
 * True when the selection sits inside a `marker` span on its own line.
 *
 * A COLLAPSED caret must be strictly inside the content (not parked on a
 * delimiter), because a caret immediately before `**bold**` is not in bold text
 * — typing there produces unformatted output, and the button must agree with
 * what typing will do. A RANGE need only be contained.
 */
function selectionInsideMarker(
  probe: FormattingProbe,
  marker: string,
): boolean {
  const { value, selectionStart: s, selectionEnd: e } = probe;
  const line = lineBoundsAt(value, s);
  // A selection spanning a line break is never "inside" one inline span.
  if (e > line.end) return false;
  const text = value.slice(line.start, line.end);
  const from = s - line.start;
  const to = e - line.start;
  for (const span of inlineSpans(text, marker)) {
    const contentFrom = span.from + marker.length;
    const contentTo = span.to - marker.length;
    if (from === to) {
      if (from > contentFrom - 1 && to < contentTo + 1) return true;
    } else if (from >= contentFrom && to <= contentTo) {
      return true;
    }
    // The exact-wrap case: the user selected `bold` and the markers sit just
    // outside the selection — which is precisely what the toggle transform
    // treats as "already bold".
    if (from === contentFrom && to === contentTo) return true;
  }
  return false;
}

/** The lines the selection touches, stripped of leading indentation. */
function touchedLines(probe: FormattingProbe): readonly string[] {
  const { value, selectionStart: s, selectionEnd: e } = probe;
  const first = lineBoundsAt(value, s);
  const last = lineBoundsAt(value, e);
  return value
    .slice(first.start, last.end)
    .split("\n")
    .map((line) => line.replace(/^[ \t]*/, ""));
}

/**
 * A block structure is active only when EVERY touched non-blank line carries it.
 *
 * "Some of these lines are bullets" is not a state a single toggle can express,
 * and showing the control pressed would promise that pressing it removes the
 * bullets — when the transform's own rule is that a mixed block gets bulleted.
 * Agreeing with the transform is the whole point.
 */
function everyLineMatches(
  probe: FormattingProbe,
  predicate: (rest: string) => boolean,
): boolean {
  const lines = touchedLines(probe).filter((line) => line.trim().length > 0);
  return lines.length > 0 && lines.every(predicate);
}

/**
 * The formatting that applies at the selection.
 *
 * Returns a `Set` rather than an array so a renderer's per-button lookup is O(1)
 * — a toolbar asks this question once per button on every selection change.
 */
export function activeFormattingIds(
  probe: FormattingProbe,
): ReadonlySet<ActiveFormattingId> {
  const active = new Set<ActiveFormattingId>();
  if (probe.value.length === 0) return active;

  for (const { id, marker } of INLINE_MARKERS) {
    if (selectionInsideMarker(probe, marker)) {
      active.add(id);
    }
  }
  // `**bold**` also matches the single `_`-style scan for nothing, but a `~~`
  // span trivially contains two `~` — the markers above are distinct enough that
  // no de-duplication is needed. Bold does, however, imply the `*`-run is not
  // italic, and the italic marker here is `_`, so the two never collide.

  if (everyLineMatches(probe, (rest) => /^#{1,6} /.test(rest))) {
    active.add("heading");
  }
  if (everyLineMatches(probe, (rest) => /^[-*+] \[[ xX]\] /.test(rest))) {
    active.add("checklist");
  } else if (
    everyLineMatches(
      probe,
      (rest) => /^[-*+] /.test(rest) && !/^[-*+] \[[ xX]\] /.test(rest),
    )
  ) {
    active.add("bulleted-list");
  }
  if (everyLineMatches(probe, (rest) => /^\d+\.\s/.test(rest))) {
    active.add("numbered-list");
  }
  if (everyLineMatches(probe, (rest) => /^> ?/.test(rest))) {
    active.add("blockquote");
  }

  return active;
}

/** An empty result, exported so callers can share one stable identity. */
export const NO_ACTIVE_FORMATTING: ReadonlySet<ActiveFormattingId> = new Set();
