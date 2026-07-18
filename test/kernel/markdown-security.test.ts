/**
 * FND-08 Markdown pipeline — security corpus (Workers runtime).
 *
 * Original hostile-input cases written for this repository (not copied from an
 * external suite) exercising the PRODUCTION renderer against XSS, unsafe URLs,
 * embeds, remote-image tracking, attribute injection and malformed/nested
 * content (ADR-015 §17). Every case asserts that no executable or
 * remote-loading output can be produced.
 */

import { describe, expect, it } from "vitest";

import { parseMarkdownSource } from "~/kernel/markdown";
import { renderMarkdown, renderMarkdownSource } from "~/platform/markdown";

function render(markdown: string): string {
  return renderMarkdown(parseMarkdownSource(markdown)).html;
}

/** Assert rendered HTML contains nothing that can execute or load remotely. */
function expectInert(html: string): void {
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<img/i);
  expect(html).not.toMatch(/<svg/i);
  expect(html).not.toMatch(/<iframe/i);
  expect(html).not.toMatch(/<object/i);
  expect(html).not.toMatch(/<embed/i);
  expect(html).not.toMatch(/<style/i);
  expect(html).not.toMatch(/<form/i);
  expect(html).not.toMatch(/<button/i);
  expect(html).not.toMatch(/\son\w+\s*=/i); // onerror=, onload=, onclick=, …
  expect(html).not.toMatch(/srcdoc/i);
  expect(html).not.toMatch(/formaction/i);
  // No dangerous scheme actually reaches an href/src as an executable scheme.
  expect(html).not.toMatch(
    /(?:href|src)\s*=\s*"(?:javascript|data|vbscript|file|blob|about):/i,
  );
}

describe("raw HTML never becomes executable DOM", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="data:text/html,<script>alert(1)</script>">',
    "<style>body{display:none}</style>",
    '<form><input formaction="javascript:alert(1)"></form>',
    '<a href="/ok" onclick="alert(1)" id="x" name="y" style="color:red" target="_blank" data-x="1" aria-y="2">link</a>',
  ];

  it.each(attacks)("neutralises %j", (attack) => {
    const html = render(attack);
    expectInert(html);
  });

  it("drops attribute-injection attempts but keeps inline text", () => {
    const html = render('hello <b id="x" onclick="alert(1)">world</b> tail');
    expect(html).toContain("hello");
    expect(html).toContain("world");
    expect(html).toContain("tail");
    expect(html).not.toMatch(/\bid=/);
    expect(html).not.toMatch(/onclick/i);
  });
});

describe("dangerous link destinations are neutralised", () => {
  const dangerous = [
    "[j](javascript:alert(1))",
    "[j](JaVaScRiPt:alert(1))",
    "[j]( javascript:alert(1))",
    "[j](data:text/html,<script>alert(1)</script>)",
    "[j](vbscript:msgbox(1))",
    "[j](file:///etc/passwd)",
    "[j](blob:https://example.com/uuid)",
    // Entity/numeric-reference obfuscation the parser decodes before our policy.
    "[j](javascript&#58;alert)",
    "[j](&#106;avascript:alert)",
    "[j](&#x6a;avascript:alert)",
  ];

  it.each(dangerous)("neutralises %j", (markdown) => {
    const html = render(markdown);
    expectInert(html);
    // The link text survives; the dangerous destination does not become an href.
    expect(html).toContain("j");
    expect(html).not.toMatch(/<a[^>]+href="javascript/i);
  });

  it("keeps a percent-encoded colon inert (relative, never executing)", () => {
    const html = render("[j](javascript%3Aalert)");
    // It is a harmless relative URL — no executable `javascript:` scheme.
    expect(html).not.toMatch(/href="javascript:/i);
  });
});

describe("safe link destinations follow the allowlist", () => {
  it.each([
    ["https://example.com", '<a href="https://example.com">'],
    ["http://example.com", '<a href="http://example.com">'],
    ["mailto:user@example.com", '<a href="mailto:user@example.com">'],
    ["tel:+61000000000", '<a href="tel:+61000000000">'],
    ["/path", '<a href="/path">'],
    ["../relative-path", '<a href="../relative-path">'],
    ["#section", '<a href="#section">'],
  ])("permits %j", (url, expected) => {
    expect(render(`[x](${url})`)).toContain(expected);
  });
});

describe("remote images never load or fetch", () => {
  it.each([
    "![tracker](https://tracker.example.com/pixel.gif)",
    "![tracker](http://tracker.example.com/1x1.png)",
    "![x](https://example.com/a.png?leak=1)",
  ])("never emits <img> for %j", (markdown) => {
    const html = render(markdown);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/\bsrc\s*=/i);
  });
});

describe("code content stays inert text", () => {
  it("escapes HTML/script syntax inside inline code", () => {
    const html = render("`<script>alert(1)</script>`");
    expect(html).toContain("<code>");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("&#x3C;script>"); // escaped, not a real tag
  });

  it("escapes HTML/script syntax inside fenced code", () => {
    const html = render("```\n<script>alert(1)</script>\n```");
    expect(html).toContain("<pre><code>");
    expect(html).not.toMatch(/<script>alert/i);
    expect(html).toContain("&#x3C;script>");
  });
});

describe("malformed and deeply nested content stays safe", () => {
  it("handles a malformed HTML/markdown mixture without throwing", () => {
    const html = render(
      "<div><span>text **bold** <a href=javascript:alert(1)>x",
    );
    expectInert(html);
  });

  it("handles nested links and emphasis safely", () => {
    const html = render(
      "[**[inner](javascript:alert(1))**](https://ok.example.com)",
    );
    expectInert(html);
    expect(html).toContain("https://ok.example.com");
  });

  it("handles a deeply nested list within reasonable bounds", () => {
    let md = "";
    for (let depth = 0; depth < 40; depth += 1) {
      md += `${"  ".repeat(depth)}- level ${depth}\n`;
    }
    const html = render(md);
    expect(html).toContain("<ul>");
    expect(html).toContain("level 39");
  });

  it("handles unusual Unicode and zero-width characters", () => {
    const html = render("a​b‮c﻿d 𝕏 🧪");
    expectInert(html);
    expect(html).toContain("<p>");
  });

  it("renders hostile input via the validate-and-render entry point", () => {
    const html = renderMarkdownSource(
      "# Title\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))",
    ).html;
    expectInert(html);
    expect(html).toContain("<h1>Title</h1>");
  });
});
