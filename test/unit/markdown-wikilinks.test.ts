/**
 * The pure `[[Wiki Link]]` remark transform (NOTES-02 seam): text splitting,
 * alias handling, href building, and the code/link exclusions — all without a
 * renderer or a browser.
 */

import { describe, expect, it } from "vitest";

import {
  remarkWikiLinks,
  wikiLinkHref,
  WIKILINK_RESOLVE_PATH,
} from "~/platform/markdown/wikilinks";

interface Node {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
}

function run(tree: Node): Node {
  remarkWikiLinks()(tree as never);
  return tree;
}

function paragraph(...children: Node[]): Node {
  return { type: "root", children: [{ type: "paragraph", children }] };
}

describe("wikiLinkHref", () => {
  it("builds an encoded resolver href, trimming the title", () => {
    expect(wikiLinkHref("  Design System  ")).toBe(
      `${WIKILINK_RESOLVE_PATH}?title=Design%20System`,
    );
  });
});

describe("remarkWikiLinks", () => {
  it("splits [[Title]] into a link node with a resolver url", () => {
    const tree = run(paragraph({ type: "text", value: "See [[Notes]] now" }));
    const para = tree.children![0]!;
    expect(para.children!.map((c) => c.type)).toEqual([
      "text",
      "link",
      "text",
    ]);
    const link = para.children![1]!;
    expect(link.url).toBe(`${WIKILINK_RESOLVE_PATH}?title=Notes`);
    expect(link.children![0]!.value).toBe("Notes");
  });

  it("uses the alias as the label but resolves by target", () => {
    const tree = run(paragraph({ type: "text", value: "[[Big Goal|goal]]" }));
    const link = tree.children![0]!.children![0]!;
    expect(link.url).toBe(`${WIKILINK_RESOLVE_PATH}?title=Big%20Goal`);
    expect(link.children![0]!.value).toBe("goal");
  });

  it("leaves plain text with no wiki link untouched", () => {
    const tree = run(paragraph({ type: "text", value: "no links here" }));
    expect(tree.children![0]!.children).toEqual([
      { type: "text", value: "no links here" },
    ]);
  });

  it("does not descend into code or existing link nodes", () => {
    const tree = run(
      paragraph(
        { type: "inlineCode", value: "[[nope]]" },
        { type: "link", url: "/x", children: [{ type: "text", value: "[[nope]]" }] },
      ),
    );
    const [code, link] = tree.children![0]!.children!;
    expect(code!.type).toBe("inlineCode");
    // The existing link's inner text is not re-split into a nested link.
    expect(link!.children).toEqual([{ type: "text", value: "[[nope]]" }]);
  });

  it("ignores an empty [[ ]] target", () => {
    const tree = run(paragraph({ type: "text", value: "a [[ ]] b" }));
    expect(tree.children![0]!.children!.every((c) => c.type === "text")).toBe(
      true,
    );
  });
});
