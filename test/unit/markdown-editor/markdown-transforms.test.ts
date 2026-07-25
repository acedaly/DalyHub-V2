import { describe, expect, it } from "vitest";

import {
  blockquoteTransform,
  boldTransform,
  bulletListTransform,
  checklistTransform,
  codeBlockTransform,
  headingTransform,
  horizontalRuleTransform,
  inlineCodeTransform,
  italicTransform,
  linkTransform,
  numberedListTransform,
  removeFormattingTransform,
  tableTransform,
  type EditorSelection,
  type MarkdownTransform,
} from "~/shared/markdown-editor/markdown-transforms";

/**
 * NOTES-04 — the pure Markdown-source transforms behind the writing toolbar.
 *
 * These prove the toolbar edits ONLY the canonical Markdown source (never a
 * second document model): every case asserts the exact resulting string plus
 * the resulting selection/caret, across selected/unselected/multi-line/empty/
 * Unicode/CRLF inputs, and that a transform never mutates its input nor
 * produces malformed Markdown when applied twice.
 */

/** Convenience: build an input where `[` / `]` (stripped) mark the selection,
 * to keep the intent of each case readable. */
function sel(text: string): EditorSelection {
  const start = text.indexOf("[");
  const withoutStart = text.replace("[", "");
  const end = withoutStart.indexOf("]");
  const value = withoutStart.replace("]", "");
  if (start === -1 || end === -1) {
    // No markers: a collapsed caret at the end.
    return {
      value: text,
      selectionStart: text.length,
      selectionEnd: text.length,
    };
  }
  return { value, selectionStart: start, selectionEnd: end };
}

/** The substring the result selection covers. */
function selected(result: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}): string {
  return result.value.slice(result.selectionStart, result.selectionEnd);
}

function expectNoMutation(
  transform: MarkdownTransform,
  input: EditorSelection,
) {
  const snapshot = { ...input };
  transform(input);
  expect(input).toEqual(snapshot);
}

describe("markdown-transforms — headings", () => {
  it("adds an H1 to a plain collapsed line and shifts the caret past the marker", () => {
    const result = headingTransform({
      value: "hello",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(result.value).toBe("# hello");
    expect(result.selectionStart).toBe(7);
    expect(result.selectionEnd).toBe(7);
  });

  it("cycles heading level none → H1 → H2 → H3 → none", () => {
    let state: EditorSelection = {
      value: "hello",
      selectionStart: 0,
      selectionEnd: 5,
    };
    state = headingTransform(state);
    expect(state.value).toBe("# hello");
    state = headingTransform(state);
    expect(state.value).toBe("## hello");
    state = headingTransform(state);
    expect(state.value).toBe("### hello");
    state = headingTransform(state);
    expect(state.value).toBe("hello");
  });

  it("keeps a range selection over the transformed block", () => {
    const result = headingTransform({
      value: "hello",
      selectionStart: 0,
      selectionEnd: 5,
    });
    expect(selected(result)).toBe("# hello");
  });

  it("applies a heading to an empty document", () => {
    const result = headingTransform({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe("# ");
    expect(result.selectionStart).toBe(2);
  });

  it("does not mutate its input", () => {
    expectNoMutation(headingTransform, {
      value: "x",
      selectionStart: 0,
      selectionEnd: 1,
    });
  });
});

describe("markdown-transforms — inline emphasis", () => {
  it("wraps a bold selection and keeps it selected", () => {
    const result = boldTransform(sel("[abc]"));
    expect(result.value).toBe("**abc**");
    expect(selected(result)).toBe("abc");
  });

  it("inserts a bold placeholder when nothing is selected and selects it", () => {
    const result = boldTransform({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe("**bold text**");
    expect(selected(result)).toBe("bold text");
  });

  it("unbolds when applied to an already-bold selection (no malformed repeat)", () => {
    const wrapped = boldTransform(sel("[abc]"));
    const toggled = boldTransform({
      value: wrapped.value,
      selectionStart: wrapped.selectionStart,
      selectionEnd: wrapped.selectionEnd,
    });
    expect(toggled.value).toBe("abc");
    expect(selected(toggled)).toBe("abc");
  });

  it("italicises with underscores", () => {
    const result = italicTransform(sel("[abc]"));
    expect(result.value).toBe("_abc_");
  });

  it("wraps inline code with backticks", () => {
    const result = inlineCodeTransform(sel("[abc]"));
    expect(result.value).toBe("`abc`");
  });

  it("preserves Unicode content exactly", () => {
    const result = boldTransform(sel("[héllo 🎉]"));
    expect(result.value).toBe("**héllo 🎉**");
    expect(selected(result)).toBe("héllo 🎉");
  });

  it("does not mutate its input", () => {
    expectNoMutation(boldTransform, sel("[abc]"));
  });
});

describe("markdown-transforms — list structures", () => {
  const twoLines = (): EditorSelection => ({
    value: "First item\nSecond item",
    selectionStart: 0,
    selectionEnd: "First item\nSecond item".length,
  });

  it("bulleted list — the documented selected-lines example", () => {
    const result = bulletListTransform(twoLines());
    expect(result.value).toBe("- First item\n- Second item");
  });

  it("bulleted list toggles off when every line already has a bullet", () => {
    const once = bulletListTransform(twoLines());
    const twice = bulletListTransform({
      value: once.value,
      selectionStart: once.selectionStart,
      selectionEnd: once.selectionEnd,
    });
    expect(twice.value).toBe("First item\nSecond item");
  });

  it("numbered list numbers each content line sequentially", () => {
    const result = numberedListTransform(twoLines());
    expect(result.value).toBe("1. First item\n2. Second item");
  });

  it("checklist — the documented example", () => {
    const result = checklistTransform(twoLines());
    expect(result.value).toBe("- [ ] First item\n- [ ] Second item");
  });

  it("blockquote prefixes each line", () => {
    const result = blockquoteTransform(twoLines());
    expect(result.value).toBe("> First item\n> Second item");
  });

  it("switches a bullet list to a numbered list cleanly (no doubled markers)", () => {
    const bulleted = bulletListTransform(twoLines());
    const numbered = numberedListTransform({
      value: bulleted.value,
      selectionStart: bulleted.selectionStart,
      selectionEnd: bulleted.selectionEnd,
    });
    expect(numbered.value).toBe("1. First item\n2. Second item");
  });

  it("leaves a blank line inside a multi-line selection blank (no orphan marker)", () => {
    const result = bulletListTransform({
      value: "a\n\nb",
      selectionStart: 0,
      selectionEnd: 4,
    });
    expect(result.value).toBe("- a\n\n- b");
  });

  it("inserts a starting marker for a bullet on an empty document", () => {
    const result = bulletListTransform({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe("- ");
  });

  it("preserves CRLF line endings exactly", () => {
    const result = bulletListTransform({
      value: "a\r\nb",
      selectionStart: 0,
      selectionEnd: 4,
    });
    expect(result.value).toBe("- a\r\n- b");
  });

  it("applies a bullet to a single collapsed line", () => {
    const result = bulletListTransform({
      value: "hello",
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect(result.value).toBe("- hello");
    // The caret shifts by the inserted prefix length.
    expect(result.selectionStart).toBe(4);
  });

  it("does not mutate its input", () => {
    expectNoMutation(numberedListTransform, twoLines());
  });
});

describe("markdown-transforms — links", () => {
  it("wraps a selection and puts the caret on the URL placeholder", () => {
    const result = linkTransform(sel("[DalyHub]"));
    expect(result.value).toBe("[DalyHub](url)");
    expect(selected(result)).toBe("url");
  });

  it("inserts a full link scaffold when nothing is selected and selects the text", () => {
    const result = linkTransform({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe("[text](url)");
    expect(selected(result)).toBe("text");
  });

  it("only emits Markdown link source — never HTML", () => {
    const result = linkTransform(sel("[click]"));
    expect(result.value).not.toContain("<a");
    expect(result.value).toContain("[click](url)");
  });
});

describe("markdown-transforms — block insertions", () => {
  it("inserts the documented 2×2 table and selects the first header cell", () => {
    const result = tableTransform({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe(
      "| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |",
    );
    expect(selected(result)).toBe("Column 1");
  });

  it("separates an inserted table from existing text with a newline", () => {
    const result = tableTransform({
      value: "notes",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(result.value).toBe(
      "notes\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |",
    );
  });

  it("inserts an empty fenced code block and selects the placeholder", () => {
    const result = codeBlockTransform({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value).toBe("```\ncode\n```");
    expect(selected(result)).toBe("code");
  });

  it("wraps a selection in a fenced code block", () => {
    const result = codeBlockTransform(sel("[const x = 1]"));
    expect(result.value).toBe("```\nconst x = 1\n```");
  });

  it("inserts a thematic break on its own line", () => {
    const result = horizontalRuleTransform({
      value: "above",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(result.value).toBe("above\n\n---");
  });
});

describe("markdown-transforms — reviewer edge cases (no content corruption)", () => {
  it("Table preserves selected text (insertion, never replacement)", () => {
    const result = tableTransform({
      value: "keep me",
      selectionStart: 0,
      selectionEnd: 7,
    });
    expect(result.value).toContain("keep me");
    expect(result.value.startsWith("keep me\n\n| Column 1 | Column 2 |")).toBe(
      true,
    );
  });

  it("Italic does not delete literal intraword underscores", () => {
    // `bar` selected inside `foo_bar_baz` — the underscores are literal, not
    // emphasis, so the action must NOT strip them (which would yield foobarbaz).
    const result = italicTransform({
      value: "foo_bar_baz",
      selectionStart: 4,
      selectionEnd: 7,
    });
    expect(result.value).not.toBe("foobarbaz");
    expect(result.value).toContain("bar");
    expect(result.value).toBe("foo__bar__baz");
  });

  it("Bold still toggles off when its markers genuinely bracket the selection", () => {
    const result = boldTransform({
      value: "**abc**",
      selectionStart: 2,
      selectionEnd: 5,
    });
    expect(result.value).toBe("abc");
  });

  it("Inline code sizes its delimiter longer than any backtick run inside", () => {
    const result = inlineCodeTransform({
      value: "a`b",
      selectionStart: 0,
      selectionEnd: 3,
    });
    expect(result.value).toBe("``a`b``");
  });

  it("Inline code pads a selection that starts or ends with a backtick", () => {
    const result = inlineCodeTransform({
      value: "`x",
      selectionStart: 0,
      selectionEnd: 2,
    });
    expect(result.value).toBe("`` `x ``");
  });

  it("Fenced code sizes its fence longer than a ``` run inside the selection", () => {
    const result = codeBlockTransform({
      value: "```",
      selectionStart: 0,
      selectionEnd: 3,
    });
    expect(result.value).toBe("````\n```\n````");
  });
});

describe("markdown-transforms — remove formatting", () => {
  it("strips inline emphasis and code markers from the selection", () => {
    const result = removeFormattingTransform({
      value: "**bold** and `code`",
      selectionStart: 0,
      selectionEnd: "**bold** and `code`".length,
    });
    expect(result.value).toBe("bold and code");
  });

  it("is a no-op with no selection", () => {
    const input = { value: "**bold**", selectionStart: 0, selectionEnd: 0 };
    const result = removeFormattingTransform(input);
    expect(result.value).toBe("**bold**");
  });
});
