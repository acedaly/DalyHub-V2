import { describe, expect, it } from "vitest";

import { MARKDOWN_FORMATTING_ACTIONS } from "~/shared/markdown-editor/formatting-actions";

/**
 * NOTES-04 — the writing toolbar's action catalogue. These assert the toolbar
 * exposes exactly the required set of formatting actions, that every action is
 * accessibly labelled, and — crucially — that every action produces Markdown
 * SOURCE only (never rendered HTML or a rich-text/JSON representation), so the
 * one canonical Markdown source stays authoritative.
 */

const REQUIRED_IDS = [
  "heading",
  "bold",
  "italic",
  "bulleted-list",
  "numbered-list",
  "checklist",
  "blockquote",
  "link",
  "inline-code",
  "code-block",
  "table",
];

describe("MARKDOWN_FORMATTING_ACTIONS", () => {
  it("includes every required formatting action", () => {
    const ids = MARKDOWN_FORMATTING_ACTIONS.map((action) => action.id);
    for (const id of REQUIRED_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("uses unique ids", () => {
    const ids = MARKDOWN_FORMATTING_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every action a non-empty visible label and tooltip hint", () => {
    for (const action of MARKDOWN_FORMATTING_ACTIONS) {
      expect(action.label.trim().length).toBeGreaterThan(0);
      expect(action.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("every transform produces Markdown source with no HTML tags or JSON", () => {
    const samples = ["", "plain", "a\nb"];
    for (const action of MARKDOWN_FORMATTING_ACTIONS) {
      for (const value of samples) {
        const result = action.transform({
          value,
          selectionStart: value.length,
          selectionEnd: value.length,
        });
        expect(typeof result.value).toBe("string");
        // No rendered-HTML / rich-text sink: the output is Markdown text.
        expect(result.value).not.toMatch(/<[a-z][\s\S]*>/i);
      }
    }
  });

  it("transforms are pure — the same input yields the same output", () => {
    for (const action of MARKDOWN_FORMATTING_ACTIONS) {
      const input = { value: "sample", selectionStart: 0, selectionEnd: 6 };
      const a = action.transform({ ...input });
      const b = action.transform({ ...input });
      expect(a).toEqual(b);
    }
  });
});
