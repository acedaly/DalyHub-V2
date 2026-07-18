import { describe, expect, it } from "vitest";

import {
  MARKDOWN_SOURCE_MAX_BYTES,
  MarkdownSourceTooLargeError,
  MarkdownValidationError,
  isMarkdownSource,
  markdownSourceByteLength,
  parseMarkdownSource,
} from "../../app/kernel/markdown";

describe("parseMarkdownSource — type", () => {
  it("accepts a plain string", () => {
    expect(parseMarkdownSource("hello")).toBe("hello");
  });

  it("accepts the empty string", () => {
    expect(parseMarkdownSource("")).toBe("");
  });

  it.each([42, null, undefined, {}, [], true])(
    "rejects a non-string (%p)",
    (value) => {
      expect(() => parseMarkdownSource(value)).toThrow(MarkdownValidationError);
    },
  );

  it("reports the `source` field for a non-string", () => {
    try {
      parseMarkdownSource(42);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MarkdownValidationError);
      expect((error as MarkdownValidationError).field).toBe("source");
    }
  });
});

describe("parseMarkdownSource — preservation", () => {
  it("preserves the exact source: it does not trim", () => {
    const source = "   leading and trailing spaces   ";
    expect(parseMarkdownSource(source)).toBe(source);
  });

  it("preserves whitespace, blank lines and CRLF/LF line endings verbatim", () => {
    const source = "line1\r\n\r\nline2\n\n\tindented\n";
    expect(parseMarkdownSource(source)).toBe(source);
  });

  it("preserves unsupported Markdown/HTML syntax in the stored source", () => {
    const source = "<div>raw html stays in source</div>\n\n[[wikilink]]";
    expect(parseMarkdownSource(source)).toBe(source);
  });
});

describe("parseMarkdownSource — control characters", () => {
  it.each(["\t", "\n", "\r", "line\tone\nline\r\ntwo"])(
    "allows tabs and normal line endings (%j)",
    (source) => {
      expect(parseMarkdownSource(source)).toBe(source);
    },
  );

  it.each([
    ["NUL", "a\u0000b"],
    ["BEL", "a\u0007b"],
    ["vertical tab", "a\u000Bb"],
    ["form feed", "a\u000Cb"],
    ["escape", "a\u001Bb"],
    ["DEL", "a\u007Fb"],
  ])("rejects a disallowed control character (%s)", (_label, source) => {
    expect(() => parseMarkdownSource(source)).toThrow(MarkdownValidationError);
  });

  it("labels a control-character rejection without echoing the content", () => {
    try {
      parseMarkdownSource("secret note\u0000more");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MarkdownValidationError);
      const message = (error as MarkdownValidationError).message;
      expect(message).toContain("U+0000");
      expect(message).not.toContain("secret note");
    }
  });
});

describe("parseMarkdownSource — size limit (UTF-8 bytes)", () => {
  it("exposes a 1 MiB documented limit", () => {
    expect(MARKDOWN_SOURCE_MAX_BYTES).toBe(1024 * 1024);
  });

  it("accepts a source at exactly the maximum byte size", () => {
    const source = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES);
    expect(markdownSourceByteLength(source)).toBe(MARKDOWN_SOURCE_MAX_BYTES);
    expect(() => parseMarkdownSource(source)).not.toThrow();
  });

  it("rejects a source one byte over the maximum", () => {
    const source = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES + 1);
    expect(() => parseMarkdownSource(source)).toThrow(
      MarkdownSourceTooLargeError,
    );
  });

  it("measures the limit in UTF-8 bytes, not UTF-16 code units", () => {
    // "€" is one UTF-16 code unit but three UTF-8 bytes. A string whose
    // `.length` equals the limit therefore exceeds the byte limit ~3x and must
    // be rejected — proving the limit is byte-based, not code-unit-based.
    const source = "€".repeat(MARKDOWN_SOURCE_MAX_BYTES);
    expect(source.length).toBe(MARKDOWN_SOURCE_MAX_BYTES);
    expect(markdownSourceByteLength(source)).toBeGreaterThan(
      MARKDOWN_SOURCE_MAX_BYTES,
    );
    expect(() => parseMarkdownSource(source)).toThrow(
      MarkdownSourceTooLargeError,
    );
  });

  it("attaches the byte figures to the too-large error, not the content", () => {
    const source = "z".repeat(MARKDOWN_SOURCE_MAX_BYTES + 10);
    try {
      parseMarkdownSource(source);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MarkdownSourceTooLargeError);
      const typed = error as MarkdownSourceTooLargeError;
      expect(typed.maxBytes).toBe(MARKDOWN_SOURCE_MAX_BYTES);
      expect(typed.actualBytes).toBe(MARKDOWN_SOURCE_MAX_BYTES + 10);
      expect(typed.message).not.toContain("zzz");
    }
  });
});

describe("isMarkdownSource", () => {
  it("returns true for valid sources", () => {
    expect(isMarkdownSource("ok")).toBe(true);
    expect(isMarkdownSource("")).toBe(true);
  });

  it("returns false for invalid sources", () => {
    expect(isMarkdownSource(42)).toBe(false);
    expect(isMarkdownSource("bad\u0000")).toBe(false);
    expect(isMarkdownSource("x".repeat(MARKDOWN_SOURCE_MAX_BYTES + 1))).toBe(
      false,
    );
  });
});
