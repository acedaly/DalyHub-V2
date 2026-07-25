/**
 * NOTES-04 — pure, React-free Markdown SOURCE transformations for the Notes
 * writing toolbar.
 *
 * These are string-in / string-out functions over the editor's current value
 * and selection. They exist so a user can apply common Markdown structures
 * (headings, lists, checklists, blockquotes, links, code, tables, …) WITHOUT
 * remembering the syntax — but the toolbar only ever edits the ONE canonical
 * representation the rest of DalyHub already trusts: the Markdown **source**
 * text (FND-08 / ADR-015). There is deliberately NO second document model, no
 * rich-text/HTML representation, and no parser here — a transform is a plain
 * splice of Markdown characters into the same string the `<textarea>` already
 * holds, so `NoteContentForm`'s existing DS-06 autosave, exact-source
 * preservation and safe FND-08 preview all keep working unchanged.
 *
 * Correctness rules every transform in this module honours:
 *   - it NEVER mutates its input (strings are immutable; a fresh result object
 *     is always returned);
 *   - it preserves surrounding content byte-for-byte, including line endings —
 *     CRLF (`\r\n`) and LF (`\n`) are both left exactly as they were, and no
 *     line ending is ever inserted or normalised except the ones a block
 *     structure genuinely needs;
 *   - it returns an explicit resulting selection/caret so the caller can
 *     restore it (a range stays selected so the action is repeatable/toggle-
 *     able; a collapsed caret lands somewhere useful for continued typing);
 *   - applied twice it never produces malformed Markdown — line-prefix and
 *     inline-wrap actions TOGGLE, so pressing Bold twice unbolds and pressing
 *     Bulleted list twice removes the bullets, rather than stacking markers.
 *
 * Everything here is intentionally free of React and the DOM so it is
 * exhaustively unit-testable in isolation (selected/unselected, multi-line,
 * empty document, Unicode, CRLF, non-mutation, resulting caret).
 */

/** The editor's value plus its current selection (a `<textarea>`'s
 * `value`/`selectionStart`/`selectionEnd`). */
export interface EditorSelection {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** The result of a transform: the new value plus the selection to restore. */
export interface EditorTransform {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/** A pure Markdown-source transform. */
export type MarkdownTransform = (input: EditorSelection) => EditorTransform;

// ---------------------------------------------------------------------------
// Line helpers (line-prefix structures: headings, lists, blockquotes)
// ---------------------------------------------------------------------------

/** A single logical line split into its indent, content and trailing CR (so a
 * CRLF document round-trips exactly — the `\r` is preserved and re-attached).
 * `\r` is a line terminator excluded by `.`/`[^\r\n]`, so it is separated out
 * explicitly rather than being treated as content. */
interface SplitLine {
  readonly indent: string;
  readonly rest: string;
  readonly cr: string;
}

function splitLine(line: string): SplitLine {
  let cr = "";
  let core = line;
  if (core.endsWith("\r")) {
    cr = "\r";
    core = core.slice(0, -1);
  }
  const indent = /^[ \t]*/.exec(core)![0];
  return { indent, rest: core.slice(indent.length), cr };
}

/** The [start, end) offsets of the whole-line block the selection touches.
 * A selection that ends exactly at the start of a line (just after a `\n`)
 * does NOT drag in that following line. */
function lineBlockBounds(input: EditorSelection): {
  readonly start: number;
  readonly end: number;
} {
  const { value, selectionStart, selectionEnd } = input;
  const endForLines =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
  let end = value.indexOf("\n", endForLines);
  if (end === -1) {
    end = value.length;
  }
  return { start, end };
}

/**
 * Rewrite the whole-line block the selection touches with `mapLines`, and
 * return a sensible restored selection: a range selection re-selects the
 * rewritten block (so the action can be toggled again); a collapsed caret
 * shifts by exactly the length change (all edits are at line starts, so
 * everything from the caret onward moves by the same delta) and stays
 * collapsed for continued typing.
 */
function rewriteLineBlock(
  input: EditorSelection,
  mapLines: (lines: readonly string[]) => readonly string[],
): EditorTransform {
  const { value, selectionStart, selectionEnd } = input;
  const { start, end } = lineBlockBounds(input);
  const block = value.slice(start, end);
  const lines = block.split("\n");
  const newBlock = mapLines(lines).join("\n");
  const newValue = value.slice(0, start) + newBlock + value.slice(end);

  if (selectionStart === selectionEnd) {
    const delta = newBlock.length - block.length;
    const caret = Math.max(start, selectionStart + delta);
    return { value: newValue, selectionStart: caret, selectionEnd: caret };
  }
  return {
    value: newValue,
    selectionStart: start,
    selectionEnd: start + newBlock.length,
  };
}

/** The content lines (ignoring blank ones) used to decide toggle direction. */
function contentLines(lines: readonly string[]): SplitLine[] {
  return lines.map(splitLine).filter((line) => line.rest.trim().length > 0);
}

interface LinePrefixSpec {
  /** Does this line already carry the structure? */
  readonly has: (rest: string) => boolean;
  /** Remove the structure's marker (and only it). */
  readonly remove: (rest: string) => string;
  /** Add the structure's marker (stripping conflicting list/heading markers
   * first), given the 1-based ordinal among content lines (for numbered lists). */
  readonly add: (rest: string, ordinal: number) => string;
}

/** Strip any leading list/checklist/blockquote/heading marker so switching one
 * structure for another never leaves a doubled `- 1.` / `> #` prefix. */
function stripLeadingMarkers(rest: string): string {
  let out = rest;
  // Repeatedly peel blockquote markers, then one list/heading marker.
  out = out.replace(/^(?:>\s?)+/, "");
  out = out.replace(/^[-*+] \[[ xX]\] /, "");
  out = out.replace(/^[-*+] /, "");
  out = out.replace(/^\d+\.\s/, "");
  out = out.replace(/^#{1,6} /, "");
  return out;
}

function makeLinePrefix(spec: LinePrefixSpec): MarkdownTransform {
  return (input) =>
    rewriteLineBlock(input, (lines) => {
      const relevant = contentLines(lines);
      const allHave =
        relevant.length > 0 && relevant.every((line) => spec.has(line.rest));
      if (allHave) {
        return lines.map((line) => {
          const { indent, rest, cr } = splitLine(line);
          return indent + spec.remove(rest) + cr;
        });
      }
      let ordinal = 0;
      return lines.map((line) => {
        const { indent, rest, cr } = splitLine(line);
        // A blank line inside a multi-line selection stays blank (no orphan
        // marker on an empty line) — UNLESS the whole block is empty (an empty
        // document / bare caret), where the marker IS the useful starting point.
        if (rest.trim().length === 0 && relevant.length > 0) {
          return line;
        }
        ordinal += 1;
        return indent + spec.add(rest, ordinal) + cr;
      });
    });
}

// ---------------------------------------------------------------------------
// Inline helpers (wrap the selection in paired markers)
// ---------------------------------------------------------------------------

/** A word character (letter, digit, underscore) — used to tell a real emphasis
 * span from literal intraword markers. */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

/** The length of the longest run of consecutive backticks in `text` (0 if
 * none) — so a code delimiter can be sized longer than anything it must
 * contain. */
function longestBacktickRun(text: string): number {
  let longest = 0;
  const runs = text.match(/`+/g);
  if (runs) {
    for (const run of runs) {
      longest = Math.max(longest, run.length);
    }
  }
  return longest;
}

/** Collapse a selection to a caret at its END — for "insert a block here"
 * actions that must NOT consume the selected text. */
function collapseToEnd(input: EditorSelection): EditorSelection {
  return {
    value: input.value,
    selectionStart: input.selectionEnd,
    selectionEnd: input.selectionEnd,
  };
}

function makeInlineWrap(
  marker: string,
  placeholder: string,
): MarkdownTransform {
  return (input) => {
    const { value, selectionStart: s, selectionEnd: e } = input;
    const before = value.slice(0, s);
    const selected = value.slice(s, e);
    const after = value.slice(e);

    // Markers sit immediately OUTSIDE the selection → unwrap them — but ONLY
    // when they actually bracket the selection as emphasis, not when they are
    // literal intraword markers (e.g. the underscores in `foo_bar_baz`, which
    // CommonMark does NOT treat as emphasis). Requiring the characters just
    // outside the markers to be non-word / string boundaries keeps the common
    // `**abc**` / ` say **hi** ` toggle while never deleting adjacent literal
    // characters.
    if (
      before.endsWith(marker) &&
      after.startsWith(marker) &&
      !isWordChar(before[before.length - marker.length - 1]) &&
      !isWordChar(after[marker.length])
    ) {
      const newValue =
        before.slice(0, before.length - marker.length) +
        selected +
        after.slice(marker.length);
      return {
        value: newValue,
        selectionStart: s - marker.length,
        selectionEnd: e - marker.length,
      };
    }

    // Markers sit just INSIDE the selection → unwrap them.
    if (
      selected.length >= marker.length * 2 &&
      selected.startsWith(marker) &&
      selected.endsWith(marker)
    ) {
      const inner = selected.slice(
        marker.length,
        selected.length - marker.length,
      );
      return {
        value: before + inner + after,
        selectionStart: s,
        selectionEnd: s + inner.length,
      };
    }

    // No selection → insert markers around a placeholder, selecting it.
    if (s === e) {
      const insert = marker + placeholder + marker;
      return {
        value: before + insert + after,
        selectionStart: s + marker.length,
        selectionEnd: s + marker.length + placeholder.length,
      };
    }

    // Wrap the selection, keeping it selected inside the markers.
    return {
      value: before + marker + selected + marker + after,
      selectionStart: s + marker.length,
      selectionEnd: e + marker.length,
    };
  };
}

// ---------------------------------------------------------------------------
// Block helpers (fenced code, tables, thematic break — own paragraph)
// ---------------------------------------------------------------------------

/**
 * Splice a multi-line block into its own paragraph. Block-level Markdown
 * (tables, fenced code, thematic breaks) must be separated from surrounding
 * text by a BLANK line to parse correctly — e.g. `above\n---` is a setext
 * heading, not a thematic break — so this inserts exactly enough newlines to
 * guarantee a blank line on each side that has neighbouring content, never
 * doubling an existing one and never adding any at the very start/end of the
 * document. `innerStart`/`innerEnd` (offsets INTO `block`) become the restored
 * selection; omit them to place a collapsed caret at the end of the block.
 */
function insertBlock(
  input: EditorSelection,
  block: string,
  innerStart?: number,
  innerEnd?: number,
): EditorTransform {
  const { value, selectionStart: s, selectionEnd: e } = input;
  const before = value.slice(0, s);
  const after = value.slice(e);
  const lead =
    before.length === 0 || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const trail =
    after.length === 0 || after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n";
  const newValue = before + lead + block + trail + after;
  const base = s + lead.length;
  if (innerStart === undefined) {
    const caret = base + block.length;
    return { value: newValue, selectionStart: caret, selectionEnd: caret };
  }
  return {
    value: newValue,
    selectionStart: base + innerStart,
    selectionEnd: base + (innerEnd ?? innerStart),
  };
}

// ---------------------------------------------------------------------------
// The transforms
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,6}) /;

/**
 * Cycle the heading level of the touched line(s): none → H1 → H2 → H3 → none.
 * Cycling (rather than always adding a `#`) means repeated presses never stack
 * into malformed `## ## text`; the level is taken from the first content line
 * and applied uniformly so a multi-line selection ends at one consistent level.
 */
export const headingTransform: MarkdownTransform = (input) =>
  rewriteLineBlock(input, (lines) => {
    const relevant = contentLines(lines);
    const first = relevant[0];
    const currentMatch = first ? HEADING_RE.exec(first.rest) : null;
    const current = currentMatch ? currentMatch[1].length : 0;
    const next = current >= 3 ? 0 : current + 1;
    return lines.map((line) => {
      const { indent, rest, cr } = splitLine(line);
      if (rest.trim().length === 0 && relevant.length > 0) {
        return line;
      }
      const bare = rest.replace(HEADING_RE, "");
      const prefix = next === 0 ? "" : "#".repeat(next) + " ";
      return indent + prefix + bare + cr;
    });
  });

export const boldTransform = makeInlineWrap("**", "bold text");
export const italicTransform = makeInlineWrap("_", "italic text");

/**
 * Inline code. Backticks are NOT a fixed single delimiter: a code span's
 * delimiter must be a run of backticks LONGER than any run inside it, or the
 * span closes early (selecting `` a`b `` would otherwise render as code `a`
 * followed by literal `` b` ``). The delimiter is sized to
 * `longestBacktickRun + 1`, and a single space pads each side when the content
 * itself starts or ends with a backtick (CommonMark's rule for a code span that
 * begins/ends with a backtick).
 */
export const inlineCodeTransform: MarkdownTransform = (input) => {
  const { value, selectionStart: s, selectionEnd: e } = input;
  const before = value.slice(0, s);
  const after = value.slice(e);
  if (s === e) {
    const insert = "`code`";
    return {
      value: before + insert + after,
      selectionStart: s + 1,
      selectionEnd: s + 5,
    };
  }
  const selected = value.slice(s, e);
  const delim = "`".repeat(longestBacktickRun(selected) + 1);
  const pad = selected.startsWith("`") || selected.endsWith("`") ? " " : "";
  const insert = delim + pad + selected + pad + delim;
  const contentStart = s + delim.length + pad.length;
  return {
    value: before + insert + after,
    selectionStart: contentStart,
    selectionEnd: contentStart + selected.length,
  };
};

export const bulletListTransform = makeLinePrefix({
  has: (rest) => /^[-*+] /.test(rest) && !/^[-*+] \[[ xX]\] /.test(rest),
  remove: (rest) => rest.replace(/^[-*+] /, ""),
  add: (rest) => "- " + stripLeadingMarkers(rest),
});

export const numberedListTransform = makeLinePrefix({
  has: (rest) => /^\d+\.\s/.test(rest),
  remove: (rest) => rest.replace(/^\d+\.\s/, ""),
  add: (rest, ordinal) => `${ordinal}. ` + stripLeadingMarkers(rest),
});

export const checklistTransform = makeLinePrefix({
  has: (rest) => /^[-*+] \[[ xX]\] /.test(rest),
  remove: (rest) => rest.replace(/^[-*+] \[[ xX]\] /, ""),
  add: (rest) => "- [ ] " + stripLeadingMarkers(rest),
});

export const blockquoteTransform = makeLinePrefix({
  has: (rest) => /^> /.test(rest),
  remove: (rest) => rest.replace(/^> ?/, ""),
  add: (rest) => "> " + rest,
});

/**
 * Link: wrap the selection as `[selected](url)` (caret on `url` to fill in the
 * destination); with no selection insert `[text](url)` and select `text`. The
 * transform only ever emits Markdown link SOURCE — rendering still goes through
 * the one safe FND-08 pipeline and its URL policy, so nothing here can bypass
 * sanitisation or emit unsafe HTML.
 */
export const linkTransform: MarkdownTransform = (input) => {
  const { value, selectionStart: s, selectionEnd: e } = input;
  const before = value.slice(0, s);
  const selected = value.slice(s, e);
  const after = value.slice(e);
  if (s === e) {
    const insert = "[text](url)";
    return {
      value: before + insert + after,
      selectionStart: s + 1,
      selectionEnd: s + 5,
    };
  }
  const insert = `[${selected}](url)`;
  const urlStart = s + 1 + selected.length + 2; // after "[selected]("
  return {
    value: before + insert + after,
    selectionStart: urlStart,
    selectionEnd: urlStart + 3, // selects "url"
  };
};

/** Fenced code block (bare fence — FND-08 escapes code and does not highlight,
 * so no language identifier is added). Wraps a selection, or inserts an empty
 * fence with the caret on the middle line. The fence is sized LONGER than any
 * backtick run inside the selection (`longestBacktickRun + 1`, minimum 3), so a
 * selection that itself contains a ``` fence — common when documenting
 * Markdown — stays entirely inside the block instead of closing it early. */
export const codeBlockTransform: MarkdownTransform = (input) => {
  const { value, selectionStart: s, selectionEnd: e } = input;
  const selected = value.slice(s, e);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(selected) + 1));
  if (s === e) {
    const block = `${fence}\ncode\n${fence}`;
    // selects "code" (after the fence line + its newline)
    return insertBlock(input, block, fence.length + 1, fence.length + 5);
  }
  const block = `${fence}\n${selected}\n${fence}`;
  return insertBlock(
    input,
    block,
    fence.length + 1,
    fence.length + 1 + selected.length,
  );
};

/** A GFM table skeleton. Inserts the canonical 2×2 example after the caret (or
 * after the selection — a table is an INSERTION, so any selected note content
 * is preserved, never replaced) and selects the first header cell for editing. */
export const tableTransform: MarkdownTransform = (input) => {
  const block = "| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |";
  return insertBlock(collapseToEnd(input), block, 2, 10); // selects "Column 1"
};

/** A thematic break on its own line — inserted after the caret/selection, never
 * replacing selected content. */
export const horizontalRuleTransform: MarkdownTransform = (input) =>
  insertBlock(collapseToEnd(input), "---");

/** Remove common inline emphasis/code markers from the selection (a best-effort
 * "clear formatting" — leaves surrounding text untouched). */
export const removeFormattingTransform: MarkdownTransform = (input) => {
  const { value, selectionStart: s, selectionEnd: e } = input;
  if (s === e) {
    return { value, selectionStart: s, selectionEnd: e };
  }
  const before = value.slice(0, s);
  const after = value.slice(e);
  const cleaned = value
    .slice(s, e)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<![*\\])\*(?!\*)([^*]+?)\*(?!\*)/g, "$1")
    .replace(/(?<![_\\])_(?!_)([^_]+?)_(?!_)/g, "$1")
    .replace(/`([^`]+?)`/g, "$1")
    .replace(/~~(.*?)~~/g, "$1");
  return {
    value: before + cleaned + after,
    selectionStart: s,
    selectionEnd: s + cleaned.length,
  };
};
