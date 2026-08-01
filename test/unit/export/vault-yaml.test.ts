/**
 * X-04 — YAML frontmatter escaping.
 *
 * The rule under test is "always double-quote, always escape". These cases are
 * the ones that would silently change a record's meaning if the emitter tried to
 * be clever: values YAML would read as booleans, numbers, times or nulls, and
 * values that would break out of the scalar altogether.
 */

import { describe, expect, it } from "vitest";

import { fields, frontmatter, yamlString, yamlValue } from "~/platform/export";

describe("yamlString", () => {
  it("always quotes, so an ambiguous value stays a string", () => {
    for (const value of [
      "true",
      "false",
      "yes",
      "no",
      "on",
      "off",
      "null",
      "~",
      "12:30",
      "1.0",
      "0x10",
      "2026-08-01",
    ]) {
      expect(yamlString(value)).toBe(`"${value}"`);
    }
  });

  it("escapes quotes and backslashes", () => {
    expect(yamlString('a "quoted" title')).toBe('"a \\"quoted\\" title"');
    expect(yamlString("a\\b")).toBe('"a\\\\b"');
    expect(yamlString('\\"')).toBe('"\\\\\\""');
  });

  it("escapes newlines, carriage returns and tabs", () => {
    expect(yamlString("a\nb")).toBe('"a\\nb"');
    expect(yamlString("a\r\nb")).toBe('"a\\r\\nb"');
    expect(yamlString("a\tb")).toBe('"a\\tb"');
  });

  it("escapes other control characters rather than dropping them", () => {
    expect(yamlString("a\u0000b")).toBe('"a\\x00b"');
    expect(yamlString("a\u001bb")).toBe('"a\\x1bb"');
    expect(yamlString("a\u007fb")).toBe('"a\\x7fb"');
  });

  it("passes Unicode through untouched", () => {
    expect(yamlString("Café — 日本語 🌱")).toBe('"Café — 日本語 🌱"');
  });

  it("cannot be escaped out of by a crafted title", () => {
    const hostile = '"\n---\ninjected: true\n#';
    const emitted = yamlString(hostile);
    expect(emitted.startsWith('"')).toBe(true);
    expect(emitted.endsWith('"')).toBe(true);
    // No raw newline survives, so a title cannot terminate the block or add keys.
    expect(emitted.includes("\n")).toBe(false);
  });
});

describe("yamlValue", () => {
  it("renders scalars without quoting non-strings", () => {
    expect(yamlValue(null)).toBe("null");
    expect(yamlValue(true)).toBe("true");
    expect(yamlValue(false)).toBe("false");
    expect(yamlValue(42)).toBe("42");
  });

  it("renders a non-finite number as null rather than an unparseable token", () => {
    expect(yamlValue(Number.NaN)).toBe("null");
    expect(yamlValue(Number.POSITIVE_INFINITY)).toBe("null");
  });

  it("renders an array as a flow sequence with every string quoted", () => {
    expect(yamlValue(["a", "b: c", "true"])).toBe('["a", "b: c", "true"]');
    expect(yamlValue([])).toBe("[]");
  });
});

describe("frontmatter", () => {
  it("emits a delimited block in the order given", () => {
    expect(
      frontmatter([
        { key: "dalyhub_id", value: "n1" },
        { key: "title", value: "A note" },
        { key: "tags", value: ["x"] },
      ]),
    ).toBe(
      [
        "---",
        'dalyhub_id: "n1"',
        'title: "A note"',
        'tags: ["x"]',
        "---",
        "",
      ].join("\n"),
    );
  });

  it("emits nothing rather than an empty block", () => {
    expect(frontmatter([])).toBe("");
  });

  it("drops a key that is not a safe identifier", () => {
    expect(frontmatter([{ key: "not a key", value: "x" }])).toBe("");
    expect(frontmatter([{ key: "A_Key", value: "x" }])).toBe("");
  });
});

describe("fields", () => {
  it("keeps explicit nulls and drops undefined", () => {
    expect(
      fields([
        ["a", null],
        ["b", undefined],
        ["c", "x"],
      ]),
    ).toEqual([
      { key: "a", value: null },
      { key: "c", value: "x" },
    ]);
  });
});
