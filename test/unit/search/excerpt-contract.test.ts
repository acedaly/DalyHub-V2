import { describe, expect, it } from "vitest";

import {
  SEARCH_EXCERPT_BINDS,
  SEARCH_EXCERPT_WINDOW,
  normaliseSearchExcerptWindow,
  searchExcerpt,
  searchExcerptColumns,
  searchExcerptMatched,
  searchExcerptSubquery,
} from "~/platform/storage/d1/search-excerpt";

/**
 * RECALL-01 — the ONE excerpt contract, tested where it can be tested without a
 * database: the SQL it generates (shape and bind arity), and the normalisation
 * it applies to a window that came back mid-line.
 *
 * The claims that need real SQL — that the window is actually cut by D1, and
 * that a 100 KiB body never crosses the repository boundary — are proven in
 * `test/kernel/recall-01-search-content.test.ts` against real D1. These are the
 * parts a wrong offset would silently corrupt.
 */
describe("RECALL-01 — the shared excerpt SQL", () => {
  it("cuts the window in SQL, around the hit, bounded", () => {
    const sql = searchExcerptColumns("coalesce(d.body, '')", "body");
    expect(sql).toContain("instr(lower(coalesce(d.body, '')), ?)");
    expect(sql).toContain(`substr(coalesce(d.body, ''),`);
    expect(sql).toContain(String(SEARCH_EXCERPT_WINDOW));
    // The window starts half a window before the hit, never before the string.
    expect(sql).toContain(`max(1, `);
    expect(sql).toContain(`- ${SEARCH_EXCERPT_WINDOW / 2}`);
  });

  it("names its three columns from one alias", () => {
    const sql = searchExcerptColumns("x", "agenda");
    expect(sql).toContain("AS agenda_hit");
    expect(sql).toContain("AS agenda_window");
    expect(sql).toContain("AS agenda_window_start");
  });

  it("binds exactly three needles, in the documented order", () => {
    const sql = searchExcerptColumns("x", "body");
    expect(sql.split("?").length - 1).toBe(SEARCH_EXCERPT_BINDS);
    expect(SEARCH_EXCERPT_BINDS).toBe(3);
  });

  it("resolves a child body through bounded LIMIT 1 sub-queries, never a join", () => {
    const sql = searchExcerptSubquery({
      alias: "item",
      column: "mi.body_markdown",
      from: "meeting_items mi",
      where: "mi.meeting_id = e.id AND lower(mi.body_markdown) LIKE ?",
      order: "mi.position ASC",
    });
    // Three sub-queries, each bounded to one row, so a parent with ten matching
    // children can never multiply into ten result rows.
    expect(sql.match(/LIMIT 1/g)).toHaveLength(3);
    expect(sql.match(/ORDER BY mi\.position ASC/g)).toHaveLength(3);
    // Six binds: one needle and one like per sub-query.
    expect(sql.split("?").length - 1).toBe(6);
  });
});

describe("RECALL-01 — normalising a window that came back mid-line", () => {
  const window = (
    hit: number | null,
    text: string | null,
    start: number | null,
  ) => ({ hit, window: text, windowStart: start });

  it("reports no match when the database found none", () => {
    expect(searchExcerptMatched(window(0, "", 1))).toBe(false);
    expect(searchExcerptMatched(window(null, null, null))).toBe(false);
    expect(searchExcerpt(window(0, "anything", 1), "x")).toBe("");
  });

  it("converts 1-based SQL offsets into a window-relative offset", () => {
    // Hit at document offset 10 (1-based), window starting at document offset 5.
    const { window: text, offset } = normaliseSearchExcerptWindow(
      window(10, "56789X1234", 5),
    );
    expect(text).toBe("56789X1234");
    expect(offset).toBe(5);
    expect(text[offset]).toBe("X");
  });

  it("drops the partial first line when the window began mid-line", () => {
    // The window opens halfway through a heading; the needle is on a later line.
    const raw = "eading\n\nThe needle is here.";
    const hit = 20 + raw.indexOf("needle");
    const { window: text, offset } = normaliseSearchExcerptWindow(
      window(hit + 1, raw, 21),
    );
    expect(text.startsWith("eading")).toBe(false);
    expect(text.slice(offset, offset + 6)).toBe("needle");
  });

  it("keeps the whole window when it started at the beginning of the source", () => {
    const raw = "# Heading\n\nThe needle is here.";
    const { window: text } = normaliseSearchExcerptWindow(window(16, raw, 1));
    expect(text).toBe(raw);
  });

  it("returns plain text with the Markdown syntax stripped", () => {
    const raw = "## Risks\n\nThe **wobblegrit** ratio is off.";
    const excerpt = searchExcerpt(window(24, raw, 1), "wobblegrit");
    expect(excerpt).toContain("wobblegrit");
    expect(excerpt).not.toContain("##");
    expect(excerpt).not.toContain("**");
    expect(excerpt).not.toContain("<");
  });
});
