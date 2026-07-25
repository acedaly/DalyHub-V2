import { describe, expect, it } from "vitest";

import { createDiaryEntryTypeRegistry, type DiaryEntry } from "~/kernel/diary";
import {
  bodyIsLong,
  entryTypeOptions,
  humaniseEntryType,
  parseEntryTypeFilter,
  resolveEntryTypeLabel,
  serializeDiaryEntry,
  serializeTimelinePage,
} from "~/modules/diary/diary-view";
import { DIARY_DISPLAY_TIME_ZONE } from "~/modules/diary/occurred-time";

/**
 * DIARY-01 — the Timeline view model: entry-type label resolution (including the
 * safe fallback for a valid-but-unregistered custom type), body-length policy,
 * per-entry serialisation (local time + backdated marker), day grouping through
 * the kernel helper, and URL entry-type filter parsing.
 */

const TZ = DIARY_DISPLAY_TIME_ZONE;

function makeEntry(over: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: "d1",
    workspaceId: "ws" as DiaryEntry["workspaceId"],
    entryType: "note" as DiaryEntry["entryType"],
    title: "A moment",
    body: null,
    occurredAt: new Date("2026-07-19T04:30:00.000Z"),
    timezone: TZ,
    source: { channel: "manual", reference: null },
    createdAt: new Date("2026-07-19T04:30:00.000Z"),
    updatedAt: new Date("2026-07-19T04:30:00.000Z"),
    deletedAt: null,
    ...over,
  } as DiaryEntry;
}

describe("resolveEntryTypeLabel / humaniseEntryType", () => {
  const registry = createDiaryEntryTypeRegistry();

  it("uses the registry label for a built-in type", () => {
    expect(resolveEntryTypeLabel("meeting", registry)).toBe("Meeting");
    expect(resolveEntryTypeLabel("reflection", registry)).toBe("Reflection");
  });

  it("falls back to a readable label for an unregistered custom type", () => {
    expect(resolveEntryTypeLabel("custom.workout", registry)).toBe("Workout");
    expect(resolveEntryTypeLabel("custom.deep_work", registry)).toBe(
      "Deep Work",
    );
  });

  it("humanises dot-namespaced, underscored identifiers", () => {
    expect(humaniseEntryType("workout")).toBe("Workout");
    expect(humaniseEntryType("custom.deep_work")).toBe("Deep Work");
  });
});

describe("bodyIsLong", () => {
  it("is false for no body and short bodies", () => {
    expect(bodyIsLong(null)).toBe(false);
    expect(bodyIsLong("A short note.")).toBe(false);
  });

  it("is true for long or multi-line bodies", () => {
    expect(bodyIsLong("x".repeat(281))).toBe(true);
    expect(bodyIsLong("a\nb\nc\nd\ne")).toBe(true);
  });
});

describe("serializeDiaryEntry", () => {
  const registry = createDiaryEntryTypeRegistry();

  it("serialises the local occurred time and resolves the label", () => {
    const serialized = serializeDiaryEntry(
      makeEntry({ entryType: "meeting" as DiaryEntry["entryType"] }),
      TZ,
      registry,
    );
    expect(serialized.occurredTimeLabel).toBe("14:30");
    expect(serialized.entryTypeLabel).toBe("Meeting");
    expect(serialized.occurredAtIso).toBe("2026-07-19T04:30:00.000Z");
    expect(serialized.backdated).toBe(false);
  });

  it("marks an entry backdated when it occurred on an earlier local day", () => {
    const serialized = serializeDiaryEntry(
      makeEntry({
        occurredAt: new Date("2026-07-10T02:00:00.000Z"),
        createdAt: new Date("2026-07-19T04:30:00.000Z"),
      }),
      TZ,
      registry,
    );
    expect(serialized.backdated).toBe(true);
  });
});

describe("serializeTimelinePage", () => {
  it("groups entries sharing a local day and splits distinct days", () => {
    const groups = serializeTimelinePage(
      [
        makeEntry({
          id: "a",
          occurredAt: new Date("2026-07-19T05:00:00.000Z"),
        }),
        makeEntry({
          id: "b",
          occurredAt: new Date("2026-07-19T01:00:00.000Z"),
        }),
        makeEntry({
          id: "c",
          occurredAt: new Date("2026-07-18T02:00:00.000Z"),
        }),
      ],
      TZ,
    );
    expect(groups.map((group) => group.day)).toEqual([
      "2026-07-19",
      "2026-07-18",
    ]);
    expect(groups[0]!.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(groups[1]!.entries.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("files a late-local-evening UTC-next-day instant under its local day", () => {
    // 2026-07-19T13:30Z is 23:30 in Sydney on 2026-07-19 (not the 20th).
    const groups = serializeTimelinePage(
      [makeEntry({ occurredAt: new Date("2026-07-19T13:30:00.000Z") })],
      TZ,
    );
    expect(groups[0]!.day).toBe("2026-07-19");
  });
});

describe("parseEntryTypeFilter", () => {
  it("keeps valid types, drops invalid ones and dedupes", () => {
    expect(parseEntryTypeFilter(["meeting", "idea", "meeting"])).toEqual([
      "meeting",
      "idea",
    ]);
    expect(parseEntryTypeFilter(["Meeting!", ""])).toBeUndefined();
    expect(parseEntryTypeFilter([])).toBeUndefined();
  });

  it("accepts a syntactically valid custom type", () => {
    expect(parseEntryTypeFilter(["custom.workout"])).toEqual([
      "custom.workout",
    ]);
  });
});

describe("entryTypeOptions", () => {
  it("lists the built-in vocabulary as value/label options", () => {
    const options = entryTypeOptions();
    expect(options[0]).toEqual({ value: "note", label: "Note" });
    expect(options.some((option) => option.value === "meeting")).toBe(true);
    expect(options).toHaveLength(9);
  });
});
