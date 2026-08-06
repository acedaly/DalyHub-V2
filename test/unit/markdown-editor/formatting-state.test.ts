/**
 * EDIT-01 — the toolbar's ACTIVE-formatting derivation.
 *
 * These assertions are DalyHub's contract, not CodeMirror's: given the Markdown
 * source the user's document actually holds and where their selection is, which
 * toolbar controls should look pressed? The module is pure, so the edge cases
 * that used to be invisible (a caret parked on a delimiter, a half-typed `**`, a
 * mixed block) are testable as strings.
 */

import { describe, expect, it } from "vitest";

import { activeFormattingIds } from "~/shared/markdown-editor/formatting-state";

/**
 * Probe the ids active for the selection marked by `«` and `»`.
 *
 * Guillemets rather than square brackets, because square brackets are Markdown:
 * `- [ ] task` and `[label](url)` both contain them, and a helper that ate the
 * first `[` it saw would silently probe the wrong offset in exactly the cases
 * these tests exist to pin down.
 */
function active(marked: string): ReadonlySet<string> {
  const start = marked.indexOf("«");
  const withoutStart = marked.slice(0, start) + marked.slice(start + 1);
  const end = withoutStart.indexOf("»");
  const value = withoutStart.slice(0, end) + withoutStart.slice(end + 1);
  return activeFormattingIds({
    value,
    selectionStart: start,
    selectionEnd: end,
  });
}

describe("activeFormattingIds — inline emphasis", () => {
  it("reports bold for a selection inside a bold span", () => {
    expect(active("say **«hello»** there").has("bold")).toBe(true);
  });

  it("reports bold for a caret inside a bold span", () => {
    expect(active("say **hel«»lo** there").has("bold")).toBe(true);
  });

  it("does NOT report bold for a caret outside the span", () => {
    expect(active("say «»**hello** there").has("bold")).toBe(false);
  });

  it("does not confuse bold with italic — `**` is not the italic marker", () => {
    const ids = active("**«bold»**");
    expect(ids.has("bold")).toBe(true);
    expect(ids.has("italic")).toBe(false);
  });

  it("reports italic for underscore emphasis", () => {
    expect(active("_«soft»_ landing").has("italic")).toBe(true);
  });

  it("reports strikethrough for a GFM delete span", () => {
    expect(active("~~«gone»~~").has("strikethrough")).toBe(true);
  });

  it("reports inline code", () => {
    expect(active("run `«npm test»` now").has("inline-code")).toBe(true);
  });

  it("stays quiet while emphasis is only half typed", () => {
    // An author mid-keystroke is not yet bold. Reporting `true` here makes the
    // button flicker on every character, which is worse than being late.
    expect(active("**«bold»").has("bold")).toBe(false);
  });

  it("treats an empty `****` as literal asterisks, not emphasis", () => {
    expect(active("**«»**").has("bold")).toBe(false);
  });

  it("does not reach across a line break", () => {
    expect(active("**bold**\n«plain» text").has("bold")).toBe(false);
  });
});

describe("activeFormattingIds — block structures", () => {
  it("reports a heading", () => {
    expect(active("## «Section»").has("heading")).toBe(true);
  });

  it("reports a bulleted list but not a checklist", () => {
    const ids = active("- «item»");
    expect(ids.has("bulleted-list")).toBe(true);
    expect(ids.has("checklist")).toBe(false);
  });

  it("reports a checklist rather than a plain bullet", () => {
    const ids = active("- [ ] «do it»");
    expect(ids.has("checklist")).toBe(true);
    expect(ids.has("bulleted-list")).toBe(false);
  });

  it("reports a numbered list", () => {
    expect(active("1. «first»").has("numbered-list")).toBe(true);
  });

  it("reports a blockquote", () => {
    expect(active("> «quoted»").has("blockquote")).toBe(true);
  });

  it("reports a block only when EVERY touched line carries it", () => {
    // A mixed selection is not a state one toggle can express, and the transform
    // would BULLET such a block rather than unbullet it — so the control must
    // not look pressed.
    expect(active("- «one\nplain two»").has("bulleted-list")).toBe(false);
    expect(active("- «one\n- two»").has("bulleted-list")).toBe(true);
  });

  it("ignores leading indentation", () => {
    expect(active("    - «nested»").has("bulleted-list")).toBe(true);
  });

  it("reports nothing for an empty document", () => {
    expect(
      activeFormattingIds({ value: "", selectionStart: 0, selectionEnd: 0 })
        .size,
    ).toBe(0);
  });
});
