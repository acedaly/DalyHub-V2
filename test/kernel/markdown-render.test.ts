/**
 * FND-08 Markdown pipeline — functional + Workers-runtime integration tests.
 *
 * These run inside the REAL Cloudflare Workers runtime (the same pool as the
 * kernel D1 tests) and import the PRODUCTION renderer, proving the `unified`
 * pipeline works under Workers with no Node filesystem, `window`, `document`,
 * JSDOM or network. They assert semantic output and behavioural guarantees
 * rather than brittle whole-document snapshots.
 */

import { describe, expect, it } from "vitest";

import {
  MARKDOWN_SOURCE_MAX_BYTES,
  MarkdownSourceTooLargeError,
  MarkdownValidationError,
  parseMarkdownSource,
} from "~/kernel/markdown";
import { renderMarkdown, renderMarkdownSource } from "~/platform/markdown";

function render(markdown: string): string {
  return renderMarkdown(parseMarkdownSource(markdown)).html;
}

describe("supported profile", () => {
  it("renders empty source as empty output", () => {
    expect(render("")).toBe("");
  });

  it("renders plain text as a paragraph", () => {
    expect(render("Just some text.")).toContain("<p>Just some text.</p>");
  });

  it("renders every heading level", () => {
    for (let level = 1; level <= 6; level += 1) {
      const html = render(`${"#".repeat(level)} Heading ${level}`);
      expect(html).toContain(`<h${level}>Heading ${level}</h${level}>`);
    }
  });

  it("renders emphasis, strong and strikethrough", () => {
    const html = render("_em_ **strong** ~~struck~~");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain("<del>struck</del>");
  });

  it("renders unordered and ordered lists", () => {
    const ul = render("- one\n- two");
    expect(ul).toContain("<ul>");
    expect(ul).toMatch(/<li>one<\/li>/);

    const ol = render("1. first\n2. second");
    expect(ol).toContain("<ol>");
    expect(ol).toMatch(/<li>first<\/li>/);
  });

  it("renders nested lists", () => {
    const html = render("- parent\n  - child\n  - child2");
    expect(html).toContain("<ul>");
    // A nested <ul> appears inside a list item.
    expect(html.match(/<ul>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("child");
  });

  it("renders blockquotes and thematic breaks", () => {
    expect(render("> quoted")).toContain("<blockquote>");
    expect(render("---")).toContain("<hr>");
  });

  it("renders inline code and fenced code without a language class", () => {
    expect(render("use `code` here")).toContain("<code>code</code>");
    const fenced = render("```js\nconst x = 1;\n```");
    expect(fenced).toContain("<pre><code>const x = 1;");
    // No syntax-highlighting/language class is emitted (ADR-015 §13).
    expect(fenced).not.toContain("language-");
    expect(fenced).not.toContain("class=");
  });

  it("renders safe links and GFM autolinks", () => {
    expect(render("[site](https://example.com)")).toContain(
      '<a href="https://example.com">site</a>',
    );
    expect(render("visit https://autolink.example.com now")).toContain(
      '<a href="https://autolink.example.com">https://autolink.example.com</a>',
    );
  });

  it("renders GFM tables", () => {
    const html = render("| a | b |\n|:--|--:|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain('<th align="left">a</th>');
    expect(html).toContain('<td align="right">2</td>');
  });

  it("renders task lists as disabled, non-interactive checkboxes", () => {
    const html = render("- [ ] todo\n- [x] done");
    expect(html).toContain('class="contains-task-list"');
    expect(html).toContain('class="task-list-item"');
    expect(html).toContain('<input type="checkbox" disabled>');
    expect(html).toContain('<input type="checkbox" checked disabled>');
    // Never an editable control.
    expect(html).not.toMatch(/<input[^>]*\bname=/);
    expect(html).not.toMatch(/<input(?![^>]*\bdisabled\b)[^>]*>/);
  });

  it("renders hard line breaks", () => {
    // Two trailing spaces force a hard break.
    expect(render("line one  \nline two")).toContain("<br>");
  });

  it("preserves Unicode text and emoji", () => {
    const html = render("Héllo 世界 🌏 café");
    expect(html).toContain("Héllo 世界 🌏 café");
  });
});

describe("image transformation", () => {
  it("turns a safe image into a labelled link, never an <img>", () => {
    const html = render("![a cat](https://example.com/cat.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain(
      '<a href="https://example.com/cat.png">Image: a cat</a>',
    );
  });

  it("turns an unsafe-URL image into plain alt text, never an <img>", () => {
    const html = render("![evil](javascript:alert(1))");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Image: evil");
  });

  it("labels an image with no alt text generically", () => {
    const html = render("![](https://example.com/x.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain(">Image</a>");
  });
});

describe("raw HTML policy", () => {
  it("drops raw HTML rather than rendering it", () => {
    const html = render("before <div class='x'>raw</div> after");
    expect(html).not.toContain("<div");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });
});

describe("determinism & source preservation", () => {
  it("produces identical output for repeated renders of the same source", () => {
    const source = "# Title\n\n- [x] done\n\n`code` and [x](https://e.com)";
    expect(render(source)).toBe(render(source));
  });

  it("does not mutate or consume the source", () => {
    const raw = "  # kept exactly  \n\nwith trailing spaces  ";
    const source = parseMarkdownSource(raw);
    renderMarkdown(source);
    expect(source).toBe(raw);
  });
});

describe("renderMarkdownSource (validate + render)", () => {
  it("validates then renders an unknown value", () => {
    expect(renderMarkdownSource("**hi**").html).toContain(
      "<strong>hi</strong>",
    );
  });

  it("throws a typed validation error for a non-string", () => {
    expect(() => renderMarkdownSource(123)).toThrow(MarkdownValidationError);
  });

  it("throws a typed too-large error before parsing oversized input", () => {
    const oversized = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES + 1);
    expect(() => renderMarkdownSource(oversized)).toThrow(
      MarkdownSourceTooLargeError,
    );
  });
});

describe("performance envelope (bounded, not wall-clock)", () => {
  it("renders a large but valid document to completion", () => {
    // ~200k of repeated valid Markdown — well within the 1 MiB limit — must
    // complete and stay well-formed. This checks the pipeline handles size, not
    // a fragile timing threshold (ADR-015 §20).
    const block = "## Section\n\nSome **bold** text and a [link](/x).\n\n";
    const source = block.repeat(2000);
    expect(parseMarkdownSource(source).length).toBeLessThan(
      MARKDOWN_SOURCE_MAX_BYTES,
    );
    const html = render(source);
    expect(html).toContain("<h2>Section</h2>");
    expect(html.length).toBeGreaterThan(source.length / 2);
  });
});
