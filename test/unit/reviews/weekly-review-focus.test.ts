/**
 * REVIEW-02 — the next-period focus handoff.
 *
 * The rule is a DERIVED read, so these tests pin down exactly which completed
 * Review supplies a period's focus, and prove that reopening, archiving, an empty
 * focus and a newer Review all change the answer without anything being copied.
 */

import { describe, expect, it } from "vitest";

import {
  selectPriorPeriodFocus,
  type PriorFocusCandidate,
} from "~/kernel/reviews";

function candidate(
  overrides: Partial<PriorFocusCandidate> & { readonly id: string },
): PriorFocusCandidate {
  return {
    title: `Weekly Review — ${overrides.id}`,
    type: "weekly",
    status: "completed",
    periodStart: "2026-07-20",
    periodEnd: "2026-07-26",
    archivedAt: null,
    completedAt: new Date("2026-07-27T09:00:00.000Z"),
    focusBody: "Ship the restore path.",
    ...overrides,
  };
}

const THIS_WEEK_START = "2026-08-03";

describe("selectPriorPeriodFocus", () => {
  it("returns null when no Review has been completed", () => {
    expect(selectPriorPeriodFocus([], THIS_WEEK_START)).toBeNull();
  });

  it("picks the completed weekly Review whose period ends latest before this one", () => {
    const focus = selectPriorPeriodFocus(
      [
        candidate({
          id: "older",
          periodStart: "2026-07-13",
          periodEnd: "2026-07-19",
          focusBody: "Older focus",
        }),
        candidate({
          id: "latest",
          periodStart: "2026-07-27",
          periodEnd: "2026-08-02",
          focusBody: "Latest focus",
        }),
        candidate({ id: "middle" }),
      ],
      THIS_WEEK_START,
    );
    expect(focus?.reviewId).toBe("latest");
    expect(focus?.body).toBe("Latest focus");
  });

  it("never lets a Review hand itself its own focus", () => {
    const focus = selectPriorPeriodFocus(
      [
        candidate({
          id: "this-week",
          periodStart: THIS_WEEK_START,
          periodEnd: "2026-08-09",
        }),
      ],
      THIS_WEEK_START,
    );
    expect(focus).toBeNull();
  });

  it("ignores a Review that is not completed — reopening removes it at once", () => {
    expect(
      selectPriorPeriodFocus(
        [candidate({ id: "reopened", status: "in_progress" })],
        THIS_WEEK_START,
      ),
    ).toBeNull();
    expect(
      selectPriorPeriodFocus(
        [candidate({ id: "draft", status: "draft" })],
        THIS_WEEK_START,
      ),
    ).toBeNull();
  });

  it("ignores an archived Review", () => {
    expect(
      selectPriorPeriodFocus(
        [candidate({ id: "archived", archivedAt: new Date() })],
        THIS_WEEK_START,
      ),
    ).toBeNull();
  });

  it("ignores a Review of another type — a month's focus is a different horizon", () => {
    expect(
      selectPriorPeriodFocus(
        [candidate({ id: "monthly", type: "monthly" })],
        THIS_WEEK_START,
      ),
    ).toBeNull();
  });

  it("skips an empty focus and falls back to the most recent Review that has one", () => {
    const focus = selectPriorPeriodFocus(
      [
        candidate({
          id: "recent-but-empty",
          periodStart: "2026-07-27",
          periodEnd: "2026-08-02",
          focusBody: "   \n  ",
        }),
        candidate({ id: "earlier-with-focus", focusBody: "Keep going" }),
      ],
      THIS_WEEK_START,
    );
    expect(focus?.reviewId).toBe("earlier-with-focus");
  });

  it("supersedes an older focus as soon as a newer Review is completed", () => {
    const older = candidate({ id: "week-29", focusBody: "Old" });
    const newer = candidate({
      id: "week-31",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
      focusBody: "New",
    });
    expect(selectPriorPeriodFocus([older], THIS_WEEK_START)?.reviewId).toBe(
      "week-29",
    );
    expect(
      selectPriorPeriodFocus([older, newer], THIS_WEEK_START)?.reviewId,
    ).toBe("week-31");
  });

  it("compares wall-calendar dates, so a DST or year boundary changes nothing", () => {
    // 2026-04-05 is the southern-hemisphere DST transition; the periods either
    // side are still plain calendar strings and are compared as such.
    const focus = selectPriorPeriodFocus(
      [
        candidate({
          id: "across-dst",
          periodStart: "2026-03-30",
          periodEnd: "2026-04-05",
          focusBody: "Autumn focus",
        }),
      ],
      "2026-04-06",
    );
    expect(focus?.reviewId).toBe("across-dst");

    const acrossYear = selectPriorPeriodFocus(
      [
        candidate({
          id: "last-year",
          periodStart: "2025-12-29",
          periodEnd: "2026-01-04",
          focusBody: "New-year focus",
        }),
      ],
      "2026-01-05",
    );
    expect(acrossYear?.reviewId).toBe("last-year");
  });

  it("breaks an impossible tie deterministically rather than at random", () => {
    const a = candidate({
      id: "aaa",
      completedAt: new Date("2026-07-27T09:00:00.000Z"),
    });
    const b = candidate({
      id: "bbb",
      completedAt: new Date("2026-07-27T09:00:00.000Z"),
    });
    expect(selectPriorPeriodFocus([a, b], THIS_WEEK_START)?.reviewId).toBe(
      "bbb",
    );
    expect(selectPriorPeriodFocus([b, a], THIS_WEEK_START)?.reviewId).toBe(
      "bbb",
    );
  });

  it("trims the stored body without otherwise rewriting it", () => {
    const focus = selectPriorPeriodFocus(
      [candidate({ id: "x", focusBody: "\n- One\n- Two\n\n" })],
      THIS_WEEK_START,
    );
    expect(focus?.body).toBe("- One\n- Two");
  });
});
