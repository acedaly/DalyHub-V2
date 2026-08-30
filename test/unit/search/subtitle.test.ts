import { describe, expect, it } from "vitest";

import { MAX_SUBTITLE_LENGTH } from "~/shared/search/limits";
import { searchSubtitle } from "~/shared/search/subtitle";

/**
 * RECALL-01 — the ONE subtitle grammar every body-searching provider composes
 * through: `match source · state/metadata · excerpt`.
 *
 * It exists so five providers cannot invent five sentences, and so the excerpt
 * can never push a row past the display bound the surface assumes.
 */
describe("RECALL-01 — the shared Search subtitle grammar", () => {
  it("joins the parts in order with the row's own separator", () => {
    expect(searchSubtitle(["Notes", "Archived", "a phrase here"])).toBe(
      "Notes · Archived · a phrase here",
    );
  });

  it("drops absent, empty and blank parts instead of leaving a dangling separator", () => {
    expect(
      searchSubtitle(["Title", null, undefined, "", "   ", "Boardroom"]),
    ).toBe("Title · Boardroom");
  });

  it("has no subtitle at all when nothing survives", () => {
    expect(searchSubtitle([])).toBeUndefined();
    expect(searchSubtitle([null, "", "  "])).toBeUndefined();
  });

  it("bounds the line at the existing display limit, with a deterministic ellipsis", () => {
    const long = "z".repeat(MAX_SUBTITLE_LENGTH * 2);
    const subtitle = searchSubtitle(["Body", long]) ?? "";
    expect([...subtitle]).toHaveLength(MAX_SUBTITLE_LENGTH);
    expect(subtitle.endsWith("…")).toBe(true);
    expect(subtitle.startsWith("Body · ")).toBe(true);
  });

  it("counts code points, not UTF-16 units, so an emoji cannot smuggle extra length", () => {
    const subtitle = searchSubtitle(["🌱".repeat(MAX_SUBTITLE_LENGTH)]) ?? "";
    expect([...subtitle]).toHaveLength(MAX_SUBTITLE_LENGTH);
  });
});
