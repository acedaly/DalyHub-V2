import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import type { Decoration } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { createMarkdownLanguage } from "~/shared/markdown-editor/editor-language";
import { buildLivePreviewDecorations } from "~/shared/markdown-editor/live-decorations";
import {
  HorizontalRuleWidget,
  ImagePlaceholderWidget,
  TableWidget,
  TaskCheckboxWidget,
} from "~/shared/markdown-editor/widgets";

/**
 * NOTES-05 — the live-preview decoration builder is the heart of the "reads as
 * formatted, edits as source" behaviour. These tests exercise it purely against
 * a parsed `EditorState` (no browser/view), asserting BOTH that constructs get
 * their styling class/widget when inactive AND that raw Markdown source returns
 * (markers un-concealed) the moment the selection is inside the construct.
 */

interface Deco {
  readonly from: number;
  readonly to: number;
  readonly spec: Decoration["spec"];
}

function decorationsFor(doc: string, caret = doc.length): Deco[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [createMarkdownLanguage()],
  });
  // Force a full parse so the builder sees the complete tree deterministically.
  ensureSyntaxTree(state, doc.length, 5000);
  const set = buildLivePreviewDecorations(state);
  const out: Deco[] = [];
  set.between(0, doc.length, (from, to, value) => {
    out.push({ from, to, spec: value.spec });
  });
  return out;
}

const lineClasses = (decos: Deco[]): string[] =>
  decos
    .filter((d) => d.from === d.to && typeof d.spec.class === "string")
    .map((d) => d.spec.class as string);

const markClasses = (decos: Deco[]): string[] =>
  decos
    .filter((d) => d.from < d.to && typeof d.spec.class === "string")
    .map((d) => d.spec.class as string);

/** Ranges that are hidden (replace with no widget). */
const concealRanges = (decos: Deco[]): Array<[number, number]> =>
  decos
    .filter((d) => d.from < d.to && !d.spec.class && !d.spec.widget)
    .map((d) => [d.from, d.to] as [number, number]);

const widgets = (decos: Deco[]): unknown[] =>
  decos.filter((d) => d.spec.widget).map((d) => d.spec.widget);

describe("buildLivePreviewDecorations — headings", () => {
  it("adds a heading line class and conceals the `# ` marker when inactive", () => {
    // caret in the trailing paragraph, away from the heading.
    const doc = "# Title\n\nbody";
    const decos = decorationsFor(doc, doc.length);
    expect(lineClasses(decos)).toContain("cm-dh-heading cm-dh-h1");
    // `# ` (the mark plus its trailing space) is hidden.
    expect(concealRanges(decos)).toContainEqual([0, 2]);
  });

  it("reveals the `#` marker when the caret is on the heading line", () => {
    const doc = "# Title\n\nbody";
    const decos = decorationsFor(doc, 3); // inside "Title"
    expect(lineClasses(decos)).toContain("cm-dh-heading cm-dh-h1");
    expect(concealRanges(decos)).not.toContainEqual([0, 2]);
  });

  it("scales the class with the heading level", () => {
    expect(lineClasses(decorationsFor("### Three\n\nx", 11))).toContain(
      "cm-dh-heading cm-dh-h3",
    );
  });
});

describe("buildLivePreviewDecorations — inline emphasis", () => {
  it("marks strong text and conceals both `**` when inactive", () => {
    const doc = "a **bold** z";
    const decos = decorationsFor(doc, 0); // caret at very start, outside the span
    expect(markClasses(decos)).toContain("cm-dh-strong");
    expect(concealRanges(decos)).toContainEqual([2, 4]); // opening **
    expect(concealRanges(decos)).toContainEqual([8, 10]); // closing **
  });

  it("reveals the `**` markers when the selection is inside the span", () => {
    const doc = "a **bold** z";
    const decos = decorationsFor(doc, 5); // inside "bold"
    expect(markClasses(decos)).toContain("cm-dh-strong");
    expect(concealRanges(decos)).not.toContainEqual([2, 4]);
  });

  it("marks emphasis, strikethrough and inline code", () => {
    expect(markClasses(decorationsFor("_i_ x", 4))).toContain("cm-dh-em");
    expect(markClasses(decorationsFor("~~s~~ x", 6))).toContain("cm-dh-strike");
    expect(markClasses(decorationsFor("`c` x", 4))).toContain(
      "cm-dh-inline-code",
    );
  });
});

describe("buildLivePreviewDecorations — links & images", () => {
  it("styles link text and hides the destination when inactive", () => {
    const doc = "see [text](https://example.com) end";
    const decos = decorationsFor(doc, 0);
    expect(markClasses(decos)).toContain("cm-dh-link");
    // The URL run is concealed.
    const url = doc.indexOf("https");
    expect(
      concealRanges(decos).some(([f, t]) => f <= url && t >= url + 5),
    ).toBe(true);
  });

  it("replaces an image with a non-fetching placeholder widget when inactive", () => {
    const doc = "x ![alt text](https://img.example/x.png) y";
    const decos = decorationsFor(doc, 0);
    const w = widgets(decos);
    expect(w.some((widget) => widget instanceof ImagePlaceholderWidget)).toBe(
      true,
    );
  });

  it("shows the raw image source when the caret is inside it", () => {
    const doc = "![alt](https://img.example/x.png)";
    const decos = decorationsFor(doc, 3); // inside the image node
    expect(
      widgets(decos).some((w) => w instanceof ImagePlaceholderWidget),
    ).toBe(false);
  });
});

describe("buildLivePreviewDecorations — blockquotes & callouts", () => {
  it("adds a quote line class", () => {
    expect(lineClasses(decorationsFor("> quoted\n\nx", 10))).toContain(
      "cm-dh-quote",
    );
  });

  it("detects a callout type from `[!type]`", () => {
    const classes = lineClasses(
      decorationsFor("> [!warning] Careful\n\nx", 22),
    );
    expect(classes.some((c) => c.includes("cm-dh-callout-warning"))).toBe(true);
  });
});

describe("buildLivePreviewDecorations — task lists", () => {
  it("replaces the `[ ]` marker with a checkbox and hides the bullet when inactive", () => {
    const doc = "- [ ] do it\n\nx";
    const decos = decorationsFor(doc, doc.length);
    expect(widgets(decos).some((w) => w instanceof TaskCheckboxWidget)).toBe(
      true,
    );
    // The `- ` bullet is concealed.
    expect(concealRanges(decos)).toContainEqual([0, 2]);
  });

  it("reflects the checked state", () => {
    const decos = decorationsFor("- [x] done\n\nx", 12);
    const checkbox = widgets(decos).find(
      (w): w is TaskCheckboxWidget => w instanceof TaskCheckboxWidget,
    );
    expect(checkbox?.checked).toBe(true);
  });
});

describe("buildLivePreviewDecorations — block widgets", () => {
  it("renders a thematic break as a widget when inactive, raw when active", () => {
    const doc = "a\n\n---\n\nb";
    const hrPos = doc.indexOf("---");
    expect(
      widgets(decorationsFor(doc, 0)).some(
        (w) => w instanceof HorizontalRuleWidget,
      ),
    ).toBe(true);
    expect(
      widgets(decorationsFor(doc, hrPos + 1)).some(
        (w) => w instanceof HorizontalRuleWidget,
      ),
    ).toBe(false);
  });

  it("renders a table as a widget when inactive", () => {
    const doc = "intro\n\n| a | b |\n| - | - |\n| 1 | 2 |";
    const tableStart = doc.indexOf("| a");
    expect(
      widgets(decorationsFor(doc, 0)).some((w) => w instanceof TableWidget),
    ).toBe(true);
    // Caret inside the table shows raw source (no widget).
    expect(
      widgets(decorationsFor(doc, tableStart + 4)).some(
        (w) => w instanceof TableWidget,
      ),
    ).toBe(false);
  });
});

describe("buildLivePreviewDecorations — non-mutating & safe", () => {
  it("never emits a widget or class that carries raw HTML", () => {
    const decos = decorationsFor("# H\n\n**b** `c` [l](https://x.co)", 0);
    for (const d of decos) {
      if (typeof d.spec.class === "string") {
        expect(d.spec.class).not.toMatch(/[<>]/);
      }
    }
  });
});
