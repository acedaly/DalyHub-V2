/**
 * TODAY-01 — the Today date is the OWNER's calendar date, not the runtime's.
 *
 * Cloudflare Workers run in UTC, so a naïve format shows the previous day during
 * the Australian morning. These deterministic tests pin instants around the
 * UTC/Sydney day boundary (both AEST winter and AEDT summer) and prove the
 * rendered day is the Sydney day.
 */

import { describe, expect, it } from "vitest";

import { formatTodayDate } from "~/modules/today/date";

describe("TODAY-01 formatTodayDate (owner timezone)", () => {
  it("renders the Sydney day when it is already tomorrow in Sydney (AEST/UTC+10)", () => {
    // 2026-07-19T20:00Z → 2026-07-20 06:00 in Sydney: the Sydney day, not the UTC day.
    expect(formatTodayDate(new Date("2026-07-19T20:00:00Z"))).toBe(
      "Monday 20 July 2026",
    );
  });

  it("keeps the same day before the boundary", () => {
    // 2026-07-19T13:00Z → 2026-07-19 23:00 in Sydney.
    expect(formatTodayDate(new Date("2026-07-19T13:00:00Z"))).toBe(
      "Sunday 19 July 2026",
    );
  });

  it("honours daylight saving (AEDT/UTC+11) across a month/year-ish boundary", () => {
    // 2026-01-31T13:30Z → 2026-02-01 00:30 in Sydney (summer time).
    expect(formatTodayDate(new Date("2026-01-31T13:30:00Z"))).toBe(
      "Sunday 1 February 2026",
    );
  });
});
