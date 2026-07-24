/**
 * DIARY-01A — pure day/month grouping of a Timeline page (unit tests).
 *
 * Proves grouping is by `occurredAt` in UTC, preserves the page order,
 * coalesces contiguous same-key runs into one group, and never relies on `Intl`
 * or the machine's local time zone.
 */

import { describe, expect, it } from "vitest";

import {
  groupEntriesByDay,
  groupEntriesByMonth,
  toUtcDayKey,
  toUtcMonthKey,
  type DiaryEntry,
} from "~/kernel/diary";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { parseDiaryEntryType } from "~/kernel/diary";

const WS = parseWorkspaceId("ws-group");

function entry(id: string, occurredAtIso: string): DiaryEntry {
  return {
    id,
    workspaceId: WS,
    entryType: parseDiaryEntryType("note"),
    title: id,
    body: null,
    occurredAt: new Date(occurredAtIso),
    timezone: "UTC",
    source: { channel: "manual", reference: null },
    createdAt: new Date(occurredAtIso),
    updatedAt: new Date(occurredAtIso),
    deletedAt: null,
  };
}

describe("UTC keys", () => {
  it("formats day and month keys in UTC regardless of local time", () => {
    // 23:30 UTC — a local-time formatter in a positive offset would roll to the
    // next day; the UTC key must not.
    const instant = new Date("2026-07-20T23:30:00.000Z");
    expect(toUtcDayKey(instant)).toBe("2026-07-20");
    expect(toUtcMonthKey(instant)).toBe("2026-07");
  });

  it("pads single-digit months and days", () => {
    expect(toUtcDayKey(new Date("2026-01-05T00:00:00.000Z"))).toBe(
      "2026-01-05",
    );
  });
});

describe("groupEntriesByDay", () => {
  it("returns an empty array for no entries", () => {
    expect(groupEntriesByDay([])).toEqual([]);
  });

  it("coalesces a contiguous same-day run and preserves order", () => {
    const entries = [
      entry("a", "2026-07-20T18:00:00.000Z"),
      entry("b", "2026-07-20T09:00:00.000Z"),
      entry("c", "2026-07-19T22:00:00.000Z"),
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups.map((g) => g.day)).toEqual(["2026-07-20", "2026-07-19"]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[1]!.entries.map((e) => e.id)).toEqual(["c"]);
  });
});

describe("groupEntriesByMonth", () => {
  it("coalesces a contiguous same-month run and preserves order", () => {
    const entries = [
      entry("a", "2026-07-31T18:00:00.000Z"),
      entry("b", "2026-07-01T09:00:00.000Z"),
      entry("c", "2026-06-30T22:00:00.000Z"),
    ];
    const groups = groupEntriesByMonth(entries);
    expect(groups.map((g) => g.month)).toEqual(["2026-07", "2026-06"]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
