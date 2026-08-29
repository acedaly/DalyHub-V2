/**
 * STEER-05 — the week's door, as a pure rule.
 *
 * `buildReviewDoor` is the whole state decision: which of the three offers
 * Today makes, and where each one goes. Proving it here — with no database and
 * no React — is what stops the rule quietly becoming "whatever the loader
 * happened to return", and it is where the two states that are awkward to reach
 * against real D1 (an archived Review, a non-default date format) are cheapest
 * to assert.
 *
 * The period itself is NOT decided here: it comes from `currentReviewPeriod`,
 * whose sole authority is asserted structurally in
 * `review-door-authority.test.ts` and against real preferences in
 * `test/kernel/today-review-door.test.ts`.
 */

import { describe, expect, it } from "vitest";

import type { ReviewPeriodEntry, ReviewStatus } from "~/kernel/reviews";
import { buildReviewDoor } from "~/modules/today/day/review-door";

const START = "2026-08-24";
const END = "2026-08-30";

function entry(overrides: Partial<ReviewPeriodEntry> = {}): ReviewPeriodEntry {
  return {
    id: "rev_1",
    title: "Weekly Review — 24 August–30 August 2026",
    type: "weekly",
    periodStart: START,
    periodEnd: END,
    status: "draft",
    archived: false,
    ...overrides,
  };
}

function door(entryValue: ReviewPeriodEntry | null) {
  return buildReviewDoor({
    periodStart: START,
    periodEnd: END,
    dateFormat: "d_mmm_yyyy",
    entry: entryValue,
  });
}

describe("what the door offers", () => {
  it("offers Start when no Review covers the period", () => {
    const result = door(null);
    expect(result.state).toBe("start");
    expect(result.reviewId).toBeNull();
    // Today LINKS. `/reviews/new` is the Reviews module's own creation surface,
    // and its form already opens on this week from the same authority.
    expect(result.href).toBe("/reviews/new");
  });

  it.each<ReviewStatus>(["draft", "in_progress"])(
    "offers Continue into the guided flow for a %s Review",
    (status) => {
      const result = door(entry({ status }));
      expect(result.state).toBe("continue");
      expect(result.reviewId).toBe("rev_1");
      // The guided route resolves the owner's OWN resume position and redirects
      // to it — Today names no step and holds no bookmark of its own.
      expect(result.href).toBe("/reviews/rev_1/guide");
    },
  );

  it("offers a re-read of the canonical record once the Review is completed", () => {
    const result = door(entry({ status: "completed" }));
    expect(result.state).toBe("completed");
    expect(result.href).toBe("/reviews/rev_1");
  });

  it("treats an ARCHIVED Review for the period as an absence", () => {
    /*
     * The guided flow refuses an archived Review (it redirects to the record's
     * Settings tab, where restore lives), so "Continue" would be a door onto a
     * dead end. "Start" is not one: creation finds the archived Review for this
     * period and RESTORES it rather than making a second.
     */
    const result = door(entry({ archived: true, status: "in_progress" }));
    expect(result.state).toBe("start");
    expect(result.reviewId).toBeNull();
    expect(result.href).toBe("/reviews/new");
  });

  it("escapes the Review id it puts in a URL", () => {
    const result = door(entry({ id: "rev/1 2" }));
    expect(result.href).toBe("/reviews/rev%2F1%202/guide");
  });
});

describe("the period it names", () => {
  it("carries the period it was given, untouched", () => {
    const result = door(null);
    expect(result.periodStart).toBe(START);
    expect(result.periodEnd).toBe(END);
  });

  it("labels it in the owner's own date format", () => {
    // The SAME `reviewPeriodLabel` the Reviews collection and the Review record
    // print, so the door and the Review it opens cannot name the week two ways.
    expect(door(null).periodLabel).toBe("24 Aug 2026–30 Aug 2026");
    expect(
      buildReviewDoor({
        periodStart: START,
        periodEnd: END,
        dateFormat: "iso",
        entry: null,
      }).periodLabel,
    ).toBe("2026-08-24–2026-08-30");
    expect(
      buildReviewDoor({
        periodStart: START,
        periodEnd: END,
        dateFormat: "dmy_slash",
        entry: null,
      }).periodLabel,
    ).toBe("24/08/2026–30/08/2026");
  });

  it("names the period in every state, not only when there is nothing yet", () => {
    for (const value of [
      null,
      entry(),
      entry({ status: "completed" }),
      entry({ archived: true }),
    ]) {
      expect(door(value).periodLabel).toBe("24 Aug 2026–30 Aug 2026");
    }
  });
});
