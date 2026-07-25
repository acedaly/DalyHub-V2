/**
 * DIARY-01A — timezone-aware day/month grouping of a Timeline page (unit tests).
 *
 * Proves grouping resolves each entry's `occurredAt` in an EXPLICIT display time
 * zone (never a hidden UTC or machine-local default), so an entry near local
 * midnight lands under the correct LOCAL calendar day — including across a
 * daylight-saving transition — while preserving page order and coalescing
 * contiguous same-day runs.
 */

import { describe, expect, it } from "vitest";

import {
  DiaryValidationError,
  groupEntriesByDay,
  groupEntriesByMonth,
  parseDiaryEntryType,
  toLocalDayKey,
  toLocalMonthKey,
  type DiaryEntry,
} from "~/kernel/diary";
import { parseWorkspaceId } from "~/kernel/workspaces";

const WS = parseWorkspaceId("ws-group");
const SYDNEY = "Australia/Sydney";

function entry(id: string, occurredAtIso: string): DiaryEntry {
  return {
    id,
    workspaceId: WS,
    entryType: parseDiaryEntryType("note"),
    title: id,
    body: null,
    occurredAt: new Date(occurredAtIso),
    timezone: SYDNEY,
    source: { channel: "manual", reference: null },
    createdAt: new Date(occurredAtIso),
    updatedAt: new Date(occurredAtIso),
    deletedAt: null,
  };
}

describe("local keys resolve in the given display zone", () => {
  it("places a late-evening Sydney instant under the LOCAL day, not the UTC day", () => {
    // 2026-07-20T14:30:00Z is 2026-07-21 00:30 in Sydney (AEST, UTC+10).
    const instant = new Date("2026-07-20T14:30:00.000Z");
    expect(toLocalDayKey(instant, "UTC")).toBe("2026-07-20");
    expect(toLocalDayKey(instant, SYDNEY)).toBe("2026-07-21");
    expect(toLocalMonthKey(instant, SYDNEY)).toBe("2026-07");
  });

  it("honours the daylight-saving offset (same wall time, different season → different local day)", () => {
    // Summer: Sydney is AEDT (UTC+11), so 13:30Z is the NEXT local day.
    expect(toLocalDayKey(new Date("2026-01-14T13:30:00.000Z"), SYDNEY)).toBe(
      "2026-01-15",
    );
    // Winter: Sydney is AEST (UTC+10), so the same 13:30Z is the SAME local day.
    expect(toLocalDayKey(new Date("2026-07-14T13:30:00.000Z"), SYDNEY)).toBe(
      "2026-07-14",
    );
  });

  it("rejects an invalid display time zone as a typed validation error", () => {
    expect(() => toLocalDayKey(new Date(), "Mars/Phobos")).toThrow(
      DiaryValidationError,
    );
    expect(() => groupEntriesByDay([], "Not/AZone")).toThrow(
      DiaryValidationError,
    );
  });
});

describe("groupEntriesByDay", () => {
  it("returns an empty array for no entries", () => {
    expect(groupEntriesByDay([], SYDNEY)).toEqual([]);
  });

  it("groups by LOCAL day and coalesces a contiguous run, preserving order", () => {
    // a & b are the same Sydney day (21 Jul); c is the previous Sydney day.
    const entries = [
      entry("a", "2026-07-21T09:00:00.000Z"), // 19:00 Sydney 21 Jul
      entry("b", "2026-07-20T14:30:00.000Z"), // 00:30 Sydney 21 Jul
      entry("c", "2026-07-20T09:00:00.000Z"), // 19:00 Sydney 20 Jul
    ];
    const groups = groupEntriesByDay(entries, SYDNEY);
    expect(groups.map((g) => g.day)).toEqual(["2026-07-21", "2026-07-20"]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[1]!.entries.map((e) => e.id)).toEqual(["c"]);
  });

  it("groups the SAME page differently under a different display zone", () => {
    const entries = [entry("a", "2026-07-20T14:30:00.000Z")];
    expect(groupEntriesByDay(entries, "UTC")[0]!.day).toBe("2026-07-20");
    expect(groupEntriesByDay(entries, SYDNEY)[0]!.day).toBe("2026-07-21");
  });
});

describe("groupEntriesByMonth", () => {
  it("coalesces a contiguous same-local-month run and preserves order", () => {
    const entries = [
      entry("a", "2026-07-31T09:00:00.000Z"),
      entry("b", "2026-07-01T09:00:00.000Z"),
      entry("c", "2026-06-30T09:00:00.000Z"),
    ];
    const groups = groupEntriesByMonth(entries, SYDNEY);
    expect(groups.map((g) => g.month)).toEqual(["2026-07", "2026-06"]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
