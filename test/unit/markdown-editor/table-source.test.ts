import { describe, expect, it } from "vitest";

import {
  parseTableSource,
  splitTableRow,
} from "~/shared/markdown-editor/table-source";

/**
 * NOTES-05 — the pure GFM-table-source parser behind the live editor's rendered
 * table widget. Pure string-in/data-out; no DOM, no HTML.
 */

describe("splitTableRow", () => {
  it("splits cells and trims framing pipes + whitespace", () => {
    expect(splitTableRow("| a | b | c |")).toEqual(["a", "b", "c"]);
  });

  it("keeps genuine empty interior cells", () => {
    expect(splitTableRow("| a |  | c |")).toEqual(["a", "", "c"]);
  });

  it("does not split on an escaped pipe", () => {
    expect(splitTableRow("| a \\| b | c |")).toEqual(["a \\| b", "c"]);
  });

  it("handles a row with no framing pipes", () => {
    expect(splitTableRow("a | b")).toEqual(["a", "b"]);
  });
});

describe("parseTableSource", () => {
  it("parses headers, alignments and rows", () => {
    const parsed = parseTableSource(
      "| Name | Score |\n| :-- | --: |\n| Ann | 10 |\n| Bo | 7 |",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.headers).toEqual(["Name", "Score"]);
    expect(parsed!.aligns).toEqual(["left", "right"]);
    expect(parsed!.rows).toEqual([
      ["Ann", "10"],
      ["Bo", "7"],
    ]);
  });

  it("reads centre alignment", () => {
    const parsed = parseTableSource("| a |\n| :-: |\n| 1 |");
    expect(parsed!.aligns).toEqual(["center"]);
  });

  it("returns null without a delimiter row", () => {
    expect(parseTableSource("| a | b |\n| 1 | 2 |")).toBeNull();
    expect(parseTableSource("just text")).toBeNull();
  });

  it("tolerates CRLF line endings", () => {
    const parsed = parseTableSource("| a |\r\n| - |\r\n| 1 |");
    expect(parsed!.headers).toEqual(["a"]);
    expect(parsed!.rows).toEqual([["1"]]);
  });
});
