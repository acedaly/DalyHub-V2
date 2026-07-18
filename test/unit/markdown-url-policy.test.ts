import { describe, expect, it } from "vitest";

import {
  SAFE_URL_SCHEMES,
  isSafeMarkdownUrl,
} from "../../app/platform/markdown";

describe("isSafeMarkdownUrl — allowed", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "https://example.com/a/b?c=d#e",
    "mailto:user@example.com",
    "MAILTO:user@example.com",
    "tel:+61000000000",
    "/path",
    "/path/to/page",
    "../relative-path",
    "./sibling",
    "page",
    "sub/page.md",
    "#section",
    "page#section",
  ])("permits a safe URL (%j)", (url) => {
    expect(isSafeMarkdownUrl(url)).toBe(true);
  });

  it("documents the allowed scheme set", () => {
    expect([...SAFE_URL_SCHEMES].sort()).toEqual([
      "http",
      "https",
      "mailto",
      "tel",
    ]);
  });
});

describe("isSafeMarkdownUrl — rejected schemes", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/png;base64,AAAA",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/uuid",
    "filesystem:http://example.com/temporary/f",
    "about:blank",
    "chrome://settings",
    "resource://x",
  ])("rejects a dangerous scheme (%j)", (url) => {
    expect(isSafeMarkdownUrl(url)).toBe(false);
  });
});

describe("isSafeMarkdownUrl — obfuscation the browser would normalise", () => {
  it("rejects mixed-case javascript", () => {
    expect(isSafeMarkdownUrl("JaVaScRiPt:alert(1)")).toBe(false);
  });

  it("rejects leading/trailing whitespace around a dangerous scheme", () => {
    expect(isSafeMarkdownUrl("  javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownUrl("\tjavascript:alert(1)\t")).toBe(false);
  });

  it("rejects a scheme split by an embedded newline (browsers strip it)", () => {
    expect(isSafeMarkdownUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeMarkdownUrl("java\r\nscript:alert(1)")).toBe(false);
  });

  it("rejects a scheme split by an embedded tab", () => {
    expect(isSafeMarkdownUrl("java\tscript:alert(1)")).toBe(false);
  });

  it("rejects a leading control character before a scheme", () => {
    expect(isSafeMarkdownUrl("\u0001javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownUrl("\u0000javascript:alert(1)")).toBe(false);
  });

  it("rejects unusual Unicode spacing that reveals a dangerous scheme", () => {
    expect(isSafeMarkdownUrl("\u00A0javascript:alert(1)")).toBe(false);
    expect(isSafeMarkdownUrl(" javascript:alert(1)")).toBe(false);
  });

  it("rejects protocol-relative and backslash-authority forms", () => {
    expect(isSafeMarkdownUrl("//evil.example.com")).toBe(false);
    expect(isSafeMarkdownUrl("\\\\evil.example.com")).toBe(false);
    expect(isSafeMarkdownUrl("/\\evil.example.com")).toBe(false);
  });

  it("treats a percent-encoded colon as an inert relative path (never executes)", () => {
    // The browser does not decode `%3A` into a scheme separator, so this is a
    // harmless relative URL, not `javascript:`. Permitting it as relative is
    // safe; it can never execute.
    expect(isSafeMarkdownUrl("javascript%3Aalert(1)")).toBe(true);
  });
});

describe("isSafeMarkdownUrl — degenerate input", () => {
  it.each(["", "   ", "\t\n", null, undefined, 42, {}])(
    "rejects empty/whitespace/non-string input (%j)",
    (value) => {
      expect(isSafeMarkdownUrl(value)).toBe(false);
    },
  );
});
