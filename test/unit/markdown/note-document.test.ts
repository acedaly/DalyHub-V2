import { describe, expect, it } from "vitest";

import {
  dalyhubReferenceUrl,
  distinctReferenceTitles,
  excerptAroundMatch,
  excerptAtOffset,
  extractHeadings,
  extractReferences,
  headingAtOffset,
  markdownToPlainText,
  offsetIsInHeading,
  transformReferencesForExport,
  MAX_EXCERPT_LENGTH,
} from "~/platform/markdown/note-document";

/**
 * NOTES-02/03/06 — the ONE Markdown document analyser.
 *
 * These are the guarantees the knowledge features are built on: a reference is
 * an explicit `[[…]]` outside code, never text that merely looks like one; a
 * duplicate reference is one relationship; an excerpt is bounded, deterministic
 * and free of raw Markdown; and export never emits broken internal syntax.
 */
describe("note-document — explicit references", () => {
  it("extracts a plain reference and an aliased one, preserving order", () => {
    const refs = extractReferences(
      "See [[Project Atlas]] and [[Meeting notes|last week]].",
    );
    expect(refs.map((r) => [r.title, r.label])).toEqual([
      ["Project Atlas", "Project Atlas"],
      ["Meeting notes", "last week"],
    ]);
  });

  it("NEVER treats link-like text inside a fenced code block as a reference", () => {
    const source = [
      "Real: [[Alpha]]",
      "",
      "```ts",
      "const wiki = '[[Beta]]';",
      "```",
      "",
      "Also real: [[Gamma]]",
    ].join("\n");
    expect(distinctReferenceTitles(source)).toEqual(["Alpha", "Gamma"]);
  });

  it("ignores a reference inside inline code", () => {
    expect(distinctReferenceTitles("Type `[[Beta]]` to link.")).toEqual([]);
  });

  it("never nests a reference inside an existing Markdown link", () => {
    expect(
      distinctReferenceTitles("[see [[Beta]]](https://example.com)"),
    ).toEqual([]);
  });

  it("ignores malformed occurrences instead of failing", () => {
    const source = "[[]] [[   ]] [[unterminated  ]not a link] [[Good]]";
    expect(distinctReferenceTitles(source)).toEqual(["Good"]);
  });

  it("collapses duplicates — the same target written many times is ONE relationship", () => {
    const source = "[[Atlas]] then [[atlas]] then [[ATLAS|the project]] again.";
    expect(extractReferences(source)).toHaveLength(3);
    expect(distinctReferenceTitles(source)).toEqual(["Atlas"]);
  });

  it("returns nothing for a document with no reference syntax at all", () => {
    expect(extractReferences("# Heading\n\nJust prose.")).toEqual([]);
  });
});

describe("note-document — headings", () => {
  it("extracts headings as plain text, with their level, in source order", () => {
    const source = "# Top\n\ntext\n\n## Risks **now**\n\n### `code` heading";
    expect(extractHeadings(source)).toEqual([
      { depth: 1, text: "Top" },
      { depth: 2, text: "Risks now" },
      { depth: 3, text: "code heading" },
    ]);
  });

  it("reports the heading an offset sits under, and whether it IS a heading", () => {
    const source = "# Top\n\nintro\n\n## Risks\n\nthe risky part\n";
    const offset = source.indexOf("risky");
    expect(headingAtOffset(source, offset)?.text).toBe("Risks");
    expect(offsetIsInHeading(source, offset)).toBe(false);
    expect(offsetIsInHeading(source, source.indexOf("Risks"))).toBe(true);
  });

  it("reports no heading above the first one", () => {
    expect(headingAtOffset("intro\n\n# Later\n", 2)).toBeNull();
  });
});

describe("note-document — plain text", () => {
  it("renders structure as layout, with no Markdown punctuation", () => {
    const source = [
      "# Title",
      "",
      "Some **bold** and _em_ and `code`.",
      "",
      "- one",
      "- two",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");
    const text = markdownToPlainText(source);
    expect(text).toContain("Title");
    expect(text).toContain("Some bold and em and code.");
    expect(text).toContain("- one");
    expect(text).toContain("a\tb");
    expect(text).not.toContain("**");
    expect(text).not.toContain("|");
    expect(text).not.toMatch(/^#/m);
  });

  it("keeps fenced code content verbatim", () => {
    expect(markdownToPlainText("```\nkeep  me\n```")).toContain("keep  me");
  });

  it("renders task list items with their checked state", () => {
    const text = markdownToPlainText("- [x] done\n- [ ] todo");
    expect(text).toContain("- [x] done");
    expect(text).toContain("- [ ] todo");
  });

  it("drops raw HTML rather than presenting it as prose", () => {
    expect(markdownToPlainText("<script>alert(1)</script>\n\nafter")).toBe(
      "after",
    );
  });
});

describe("note-document — bounded context", () => {
  const long = "word ".repeat(200);

  it("bounds every excerpt and marks truncation deterministically", () => {
    const excerpt = excerptAtOffset(long, 400);
    expect(excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH + 2);
    expect(excerptAtOffset(long, 400)).toBe(excerpt);
  });

  it("never spans past a blank-line block boundary", () => {
    const source = "secret block\n\ntarget block here\n\nother block";
    const excerpt = excerptAtOffset(source, source.indexOf("target"));
    expect(excerpt).toContain("target block here");
    expect(excerpt).not.toContain("secret");
    expect(excerpt).not.toContain("other block");
  });

  it("strips Markdown syntax so a broken construct is never rendered", () => {
    const source = "## A heading\n\nSee **the [thing](https://x.test)** here.";
    const excerpt = excerptAroundMatch(source, "thing");
    expect(excerpt).toContain("thing");
    expect(excerpt).not.toContain("**");
    expect(excerpt).not.toContain("](");
  });

  it("falls back to the opening block when the needle is absent", () => {
    expect(excerptAroundMatch("first block\n\nsecond", "missing")).toContain(
      "first block",
    );
  });

  it("returns an empty string for an empty document", () => {
    expect(excerptAtOffset("", 0)).toBe("");
    expect(excerptAroundMatch("", "x")).toBe("");
  });
});

describe("note-document — export transformation", () => {
  const resolve = (title: string) =>
    title.toLowerCase() === "atlas"
      ? { id: "n_atlas", type: "note", title: "Atlas" }
      : null;

  it("rewrites a resolvable reference as an explicit DalyHub link", () => {
    expect(
      transformReferencesForExport("See [[Atlas]].", "markdown", resolve),
    ).toBe(`See [Atlas](${dalyhubReferenceUrl("note", "n_atlas")}).`);
  });

  it("degrades an UNRESOLVABLE reference to readable text, never broken syntax", () => {
    const out = transformReferencesForExport(
      "See [[Nowhere|that thing]].",
      "markdown",
      resolve,
    );
    expect(out).toBe("See that thing.");
    expect(out).not.toContain("[[");
  });

  it("collapses every reference to its label in text mode", () => {
    expect(
      transformReferencesForExport("[[Atlas]] and [[X|why]]", "text", resolve),
    ).toBe("Atlas and why");
  });

  it("leaves the rest of the source byte-for-byte untouched, including code", () => {
    const source = "line\r\n\r\n```\n[[Atlas]]\n```\r\n\r\ntail  ";
    expect(transformReferencesForExport(source, "markdown", resolve)).toBe(
      source,
    );
  });

  it("does not treat a bracketed alias as a reference at all (the syntax excludes brackets)", () => {
    const source = "[[Atlas|a [bad] label]]";
    expect(extractReferences(source)).toEqual([]);
    expect(transformReferencesForExport(source, "markdown", resolve)).toBe(
      source,
    );
  });

  it("keeps a parenthesised label intact inside the exported link", () => {
    expect(
      transformReferencesForExport("[[Atlas|Atlas (v2)]]", "markdown", resolve),
    ).toBe(`[Atlas (v2)](${dalyhubReferenceUrl("note", "n_atlas")})`);
  });
});
