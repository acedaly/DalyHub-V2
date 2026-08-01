/**
 * NOTES-05 §5/§28 — the `dalyhub://` record-link contract.
 *
 * Three things are proven here, and they are the three that make the feature
 * safe rather than merely present:
 *
 *   1. the FORMAT round-trips exactly, and rejects everything it should;
 *   2. the RENDERER turns a record link into a real, navigable internal link,
 *      while leaving code samples alone and never producing a `dalyhub:` href;
 *   3. an unparseable record link degrades to inert text instead of crashing or
 *      becoming a clickable link to an unverified destination (§23).
 */

import { describe, expect, it } from "vitest";

import { renderMarkdownSource } from "~/platform/markdown";
import { remarkRecordLinks } from "~/platform/markdown/record-links";
import {
  formatRecordLink,
  parseRecordLink,
  recordLinkHref,
} from "~/shared/markdown/record-link";
import {
  distinctRecordLinkIds,
  extractRecordLinks,
} from "~/platform/markdown/note-document";

const ID = "9f1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

describe("record-link format", () => {
  it("round-trips a type and id", () => {
    const url = formatRecordLink("project", ID);
    expect(url).toBe(`dalyhub://project/${ID}`);
    expect(parseRecordLink(url)).toEqual({ type: "project", id: ID });
  });

  it("compares the scheme case-insensitively, as a browser would", () => {
    expect(parseRecordLink(`DalyHub://project/${ID}`)).toEqual({
      type: "project",
      id: ID,
    });
  });

  it("strips tab/newline/CR before parsing, so an obfuscated scheme cannot differ from how it resolves", () => {
    expect(parseRecordLink(`daly\nhub://project/${ID}`)).toEqual({
      type: "project",
      id: ID,
    });
    expect(parseRecordLink(`  dalyhub://project/${ID}  `)).toEqual({
      type: "project",
      id: ID,
    });
  });

  it.each([
    ["another scheme", `https://example.com/project/${ID}`],
    ["no scheme", `project/${ID}`],
    ["too few segments", "dalyhub://project"],
    ["a trailing empty segment", "dalyhub://project/"],
    ["too many segments", `dalyhub://project/${ID}/extra`],
    ["a query", `dalyhub://project/${ID}?x=1`],
    ["a fragment", `dalyhub://project/${ID}#x`],
    ["an uppercase type", `dalyhub://Project/${ID}`],
    ["a type with a hyphen", `dalyhub://my-type/${ID}`],
    ["a path separator in the id", "dalyhub://project/a%2Fb/c"],
    ["a percent escape in the id", "dalyhub://project/a%2Fb"],
    ["a colon in the id", "dalyhub://project/a:b"],
    ["an empty type", `dalyhub:///${ID}`],
    ["the bare scheme", "dalyhub://"],
    ["a non-string", 42],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(parseRecordLink(value)).toBeNull();
  });

  it("rejects an over-long id rather than truncating it", () => {
    expect(parseRecordLink(`dalyhub://project/${"a".repeat(129)}`)).toBeNull();
    expect(
      parseRecordLink(`dalyhub://project/${"a".repeat(128)}`),
    ).not.toBeNull();
  });

  it("builds a RELATIVE resolver href — the only form the URL policy permits", () => {
    const href = recordLinkHref("project", ID);
    expect(href.startsWith("/notes/resolve?")).toBe(true);
    expect(href).toContain("type=project");
    expect(href).toContain(`id=${ID}`);
  });
});

describe("record links in the rendered note", () => {
  it("renders a record link as a navigable internal link, never a dalyhub: href", () => {
    const { html } = renderMarkdownSource(
      `See [Project: Atlas](dalyhub://project/${ID}).`,
    );
    expect(html).toContain("/notes/resolve?type=project");
    expect(html).toContain(`id=${ID}`);
    expect(html).toContain("Project: Atlas");
    // The scheme must never reach the DOM as an href a browser cannot follow.
    expect(html).not.toContain("dalyhub://");
  });

  it("degrades an unparseable record link to inert text — never a crash, never a link", () => {
    const { html } = renderMarkdownSource(
      "See [Broken](dalyhub://project/a/b/c).",
    );
    expect(html).toContain("Broken");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("dalyhub:");
  });

  it("leaves a record link inside a code fence as sample text", () => {
    const source = ["```", `[X](dalyhub://project/${ID})`, "```"].join("\n");
    const { html } = renderMarkdownSource(source);
    expect(html).toContain("dalyhub://project/");
    expect(html).not.toContain("/notes/resolve");
  });

  it("leaves an inline code span alone", () => {
    const { html } = renderMarkdownSource(
      `Write \`[X](dalyhub://project/${ID})\` to link.`,
    );
    expect(html).toContain("dalyhub://project/");
    expect(html).not.toContain("/notes/resolve");
  });

  it("still refuses a script URL — the record-link transform widened nothing", () => {
    const { html } = renderMarkdownSource("[Bad](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a");
  });

  it("is a pure tree rewrite that touches no other link", () => {
    const tree = {
      type: "root",
      children: [
        { type: "link", url: `dalyhub://note/${ID}`, children: [] },
        { type: "link", url: "https://example.com", children: [] },
        { type: "link", url: "/areas/abc", children: [] },
      ],
    };
    remarkRecordLinks()(tree as never);
    const urls = (tree.children as { url: string }[]).map((node) => node.url);
    expect(urls[0]).toBe(recordLinkHref("note", ID));
    expect(urls[1]).toBe("https://example.com");
    expect(urls[2]).toBe("/areas/abc");
  });
});

describe("record-link extraction (what becomes a relationship)", () => {
  it("extracts type, id and the author's label", () => {
    expect(
      extractRecordLinks(`Ref [Atlas](dalyhub://project/${ID}) here.`),
    ).toEqual([{ type: "project", id: ID, label: "Atlas" }]);
  });

  it("never extracts from a code fence — sample text is not a relationship", () => {
    const source = ["```", `[X](dalyhub://project/${ID})`, "```"].join("\n");
    expect(extractRecordLinks(source)).toEqual([]);
  });

  it("never extracts from an inline code span", () => {
    expect(extractRecordLinks(`\`[X](dalyhub://project/${ID})\``)).toEqual([]);
  });

  it("ignores a malformed destination rather than guessing a target", () => {
    expect(extractRecordLinks("[X](dalyhub://project/a/b/c)")).toEqual([]);
  });

  it("collapses repeats of the same record to ONE distinct target", () => {
    const source = `[A](dalyhub://project/${ID}) and [B](dalyhub://project/${ID})`;
    expect(extractRecordLinks(source)).toHaveLength(2);
    expect(distinctRecordLinkIds(source)).toEqual([ID]);
  });

  it("returns nothing for a note that mentions no record link", () => {
    expect(extractRecordLinks("# Just a heading\n\nSome prose.")).toEqual([]);
    expect(distinctRecordLinkIds("plain")).toEqual([]);
  });

  it("keeps distinct records distinct, in first-occurrence order", () => {
    const other = "11111111-2222-4333-8444-555555555555";
    const source = `[B](dalyhub://note/${other}) then [A](dalyhub://project/${ID})`;
    expect(distinctRecordLinkIds(source)).toEqual([other, ID]);
  });
});
