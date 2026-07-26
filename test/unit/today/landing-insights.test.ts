/**
 * TODAY-08 — the pure Morning Brief / Insights derivations.
 *
 * Asserts the calm, anti-guilt rules: zero-count signals are omitted (never "0
 * overdue"), accomplishments are framed positively, the greeting follows the
 * owner-local hour, and the focus line reflects the shape of the day. Pure — no
 * React, no timezones, no clock.
 */

import { describe, expect, it } from "vitest";

import {
  briefFocusLine,
  dayPartForHour,
  deriveInsights,
  greetingFor,
  type InsightsInput,
} from "~/modules/today/landing/insights";

const BASE: InsightsInput = {
  overdueCount: 0,
  plannedTodayCount: 0,
  inboxCount: 0,
  waitingCount: 0,
  completedTodayCount: 0,
  activeProjectCount: 0,
  projectsNeedingAttentionCount: 0,
  areasNeedingReviewCount: 0,
  goalsAtRiskCount: 0,
  hasDiaryToday: false,
};

describe("TODAY-08 greeting", () => {
  it("resolves the day part from the owner-local hour", () => {
    expect(dayPartForHour(6)).toBe("morning");
    expect(dayPartForHour(13)).toBe("afternoon");
    expect(dayPartForHour(20)).toBe("evening");
  });

  it("is calm and name-free", () => {
    expect(greetingFor("morning")).toBe("Good morning");
    expect(greetingFor("evening")).toBe("Good evening");
  });
});

describe("TODAY-08 insights", () => {
  it("omits every zero-count signal (no manufactured guilt)", () => {
    expect(deriveInsights(BASE)).toEqual([]);
  });

  it("surfaces only signals with something to say, framing accomplishments positively", () => {
    const signals = deriveInsights({
      ...BASE,
      overdueCount: 3,
      completedTodayCount: 2,
      goalsAtRiskCount: 1,
    });
    const byId = new Map(signals.map((s) => [s.id, s]));
    expect(byId.get("overdue")?.tone).toBe("attention");
    expect(byId.get("goals-risk")?.tone).toBe("attention");
    expect(byId.get("accomplished")?.tone).toBe("positive");
    expect(byId.has("waiting")).toBe(false);
    expect(byId.has("inbox")).toBe(false);
  });
});

describe("TODAY-08 focus line", () => {
  it("leads with the day's commitment when something is planned", () => {
    expect(briefFocusLine({ ...BASE, plannedTodayCount: 2 })).toMatch(
      /2 tasks planned/,
    );
    expect(briefFocusLine({ ...BASE, plannedTodayCount: 1 })).toMatch(
      /1 task planned/,
    );
  });

  it("nudges toward overdue then inbox when nothing is planned", () => {
    expect(briefFocusLine({ ...BASE, overdueCount: 1 })).toMatch(/overdue/);
    expect(briefFocusLine({ ...BASE, inboxCount: 5 })).toMatch(/inbox/);
  });

  it("is calm and encouraging on a clear day", () => {
    expect(briefFocusLine(BASE)).toMatch(/clear day/i);
  });
});
