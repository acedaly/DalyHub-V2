/**
 * DS-05 — the pure presentation model: mapping, unknown fallback, safe payload,
 * deterministic ordering + tie-breaking, day grouping, page merge/dedup, the
 * date-formatting seam, filter-field integration and the windowing math.
 */

import { describe, expect, it } from "vitest";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityPayload,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { filterRecords } from "~/shared/filters/model";
import {
  ACTIVITY_FILTER_FIELD_IDS,
  buildActivityRows,
  buildRowOffsets,
  computeWindow,
  createActivityDateFormatter,
  createActivityDescriptorMap,
  createActivityFilterFields,
  dedupeActivityItems,
  defaultActivityDateFormatter,
  DEFAULT_ACTIVITY_DESCRIPTORS,
  groupActivityItemsByDay,
  humanizeActivityType,
  mergeActivityPage,
  referencedEntityTypes,
  sortActivityItemsNewestFirst,
  summarizeActivityPayload,
  toActivityItem,
  toActivityItems,
  type ActivityItem,
  type ActivityTypeDescriptor,
  type EntityResolver,
} from "~/shared/activity-feed/model";

const WS = parseWorkspaceId("ws-test");
const SYSTEM: ActivityActor = { type: "system", id: null };
const USER: ActivityActor = { type: "user", id: "u-1" };

function record(
  overrides: Partial<Omit<ActivityRecord, "type" | "workspaceId">> & {
    type?: string;
  } = {},
): ActivityRecord {
  return {
    id: overrides.id ?? "evt-1",
    workspaceId: WS,
    type: parseActivityType(overrides.type ?? "entity.created"),
    actor: overrides.actor ?? SYSTEM,
    occurredAt: overrides.occurredAt ?? new Date("2026-07-19T10:00:00Z"),
    payload: overrides.payload ?? {},
    subjects: overrides.subjects ?? [{ entityId: "p1", role: "subject" }],
  };
}

const resolveEntity: EntityResolver = (entityId) => {
  if (entityId === "ghost") {
    return null;
  }
  return {
    entityId,
    entityType: "project",
    label: `Entity ${entityId}`,
    drawerKey: `project:${entityId}`,
  };
};

describe("toActivityItem — mapping preserves the kernel model", () => {
  it("preserves branded type, timestamp, actor and payload without any", () => {
    const src = record({
      type: "entity.created",
      actor: USER,
      payload: { field: "title" } as ActivityPayload,
      occurredAt: new Date("2026-07-19T09:30:00Z"),
    });
    const item = toActivityItem(src, {
      descriptors: DEFAULT_ACTIVITY_DESCRIPTORS,
      resolveEntity,
    });

    expect(item.id).toBe(src.id);
    expect(item.type).toBe(src.type); // branded value preserved as-is
    expect(item.occurredAt).toBe(src.occurredAt);
    expect(item.payload).toEqual({ field: "title" });
    expect(item.actor.type).toBe("user");
    expect(item.actor.id).toBe("u-1");
    expect(item.isKnownType).toBe(true);
    expect(item.primarySubject?.entity?.label).toBe("Entity p1");
  });

  it("resolves subjects in one batch and marks the timeline anchor", () => {
    const item = toActivityItem(
      record({
        subjects: [
          { entityId: "p1", role: "source" },
          { entityId: "g1", role: "target" },
        ],
      }),
      { resolveEntity, anchorEntityId: "g1" },
    );
    const anchor = item.subjects.find((s) => s.isAnchor);
    expect(anchor?.entityId).toBe("g1");
    // Anchor biases primary-subject selection.
    expect(item.primarySubject?.entityId).toBe("g1");
  });

  it("marks an unresolved subject as null (deleted/inaccessible)", () => {
    const item = toActivityItem(
      record({ subjects: [{ entityId: "ghost", role: "subject" }] }),
      { resolveEntity },
    );
    expect(item.subjects[0].entity).toBeNull();
  });
});

describe("unknown / newly-registered event types", () => {
  it("falls back readably and safely for an unknown type", () => {
    const item = toActivityItem(record({ type: "widget.frobnicated" }), {
      descriptors: DEFAULT_ACTIVITY_DESCRIPTORS,
      resolveEntity,
    });
    expect(item.isKnownType).toBe(false);
    const emphasis = item.presentation.segments.find(
      (s) => s.kind === "emphasis",
    );
    expect(emphasis).toEqual({ kind: "emphasis", text: "Widget frobnicated" });
    // The fallback never emits payload metadata.
    expect(item.presentation.metadata).toBeUndefined();
  });

  it("humanizes dotted/underscored types without leaking syntax", () => {
    expect(humanizeActivityType("entity_link.created")).toBe(
      "Entity link created",
    );
    expect(humanizeActivityType("task.completed")).toBe("Task completed");
    expect(humanizeActivityType("")).toBe("Activity");
  });
});

describe("built-in descriptor defaults (ADR-021 §21.4)", () => {
  it("resolves a kernel lifecycle type as known WITHOUT supplying descriptors", () => {
    const item = toActivityItem(record({ type: "entity.created" }), {
      resolveEntity,
    });
    expect(item.isKnownType).toBe(true);
    // Uses the built-in "created" lifecycle rendering.
    expect(item.presentation.segments).toContainEqual({
      kind: "text",
      text: " created ",
    });
  });

  it("lets a custom descriptor take precedence over the built-in default", () => {
    const custom = createActivityDescriptorMap({
      "entity.created": {
        label: "Made",
        describe: () => ({
          segments: [{ kind: "emphasis", text: "custom-made" }],
        }),
      } as ActivityTypeDescriptor,
    });
    const item = toActivityItem(record({ type: "entity.created" }), {
      descriptors: custom,
      resolveEntity,
    });
    expect(item.isKnownType).toBe(true);
    expect(item.presentation.segments).toContainEqual({
      kind: "emphasis",
      text: "custom-made",
    });
  });

  it("keeps an unknown type unknown and safe (even with a partial custom map)", () => {
    const custom = createActivityDescriptorMap({
      "task.completed": { label: "Task completed" } as ActivityTypeDescriptor,
    });
    const item = toActivityItem(record({ type: "widget.frobnicated" }), {
      descriptors: custom,
      resolveEntity,
    });
    expect(item.isKnownType).toBe(false);
  });
});

describe("summarizeActivityPayload — never dumps raw JSON", () => {
  it("keeps only primitive top-level entries, skips nested objects/arrays", () => {
    const out = summarizeActivityPayload({
      duration: "25m",
      effort: 3,
      done: true,
      nested: { a: 1 },
      list: [1, 2, 3],
    });
    expect(out.map((m) => m.id)).toEqual(["duration", "effort", "done"]);
    expect(out.find((m) => m.id === "done")?.value).toBe("Yes");
  });

  it("bounds the number of entries and truncates long values", () => {
    const long = "x".repeat(200);
    const out = summarizeActivityPayload({
      a: "1",
      b: "2",
      c: "3",
      d: "4",
      e: "5",
      long,
    });
    expect(out.length).toBeLessThanOrEqual(4);
    const out2 = summarizeActivityPayload({ long });
    expect(out2[0].value.length).toBeLessThanOrEqual(80);
    expect(out2[0].value.endsWith("…")).toBe(true);
  });

  it("is total on a non-object payload", () => {
    expect(summarizeActivityPayload(null)).toEqual([]);
    expect(summarizeActivityPayload("nope" as unknown)).toEqual([]);
  });
});

describe("deterministic ordering and tie-breaking", () => {
  const mk = (id: string, iso: string): ActivityItem =>
    toActivityItem(record({ id, occurredAt: new Date(iso) }), {
      resolveEntity,
    });

  it("orders newest-first by occurredAt", () => {
    const sorted = sortActivityItemsNewestFirst([
      mk("a", "2026-07-18T10:00:00Z"),
      mk("b", "2026-07-19T10:00:00Z"),
      mk("c", "2026-07-17T10:00:00Z"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks ties by descending id for equal timestamps", () => {
    const t = "2026-07-19T10:00:00Z";
    const sorted = sortActivityItemsNewestFirst([
      mk("evt-a", t),
      mk("evt-c", t),
      mk("evt-b", t),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["evt-c", "evt-b", "evt-a"]);
  });
});

describe("day grouping", () => {
  const mk = (id: string, iso: string): ActivityItem =>
    toActivityItem(record({ id, occurredAt: new Date(iso) }), {
      resolveEntity,
    });

  it("groups by UTC calendar day, newest day first", () => {
    const groups = groupActivityItemsByDay(
      [
        mk("a", "2026-07-19T23:30:00Z"),
        mk("b", "2026-07-19T01:00:00Z"),
        mk("c", "2026-07-18T12:00:00Z"),
      ],
      defaultActivityDateFormatter,
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-07-19", "2026-07-18"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("flattens to heading + item rows with feed positions", () => {
    const rows = buildActivityRows(
      [mk("a", "2026-07-19T10:00:00Z"), mk("b", "2026-07-18T10:00:00Z")],
      defaultActivityDateFormatter,
    );
    expect(rows.map((r) => r.kind)).toEqual([
      "heading",
      "item",
      "heading",
      "item",
    ]);
    const items = rows.filter((r) => r.kind === "item");
    expect(items.map((r) => (r.kind === "item" ? r.setSize : 0))).toEqual([
      2, 2,
    ]);
    expect(items.map((r) => (r.kind === "item" ? r.posInSet : 0))).toEqual([
      1, 2,
    ]);
  });
});

describe("page merge and deduplication", () => {
  const mk = (id: string): ActivityItem =>
    toActivityItem(record({ id }), { resolveEntity });

  it("dedupes by stable id, keeping the first occurrence", () => {
    const deduped = dedupeActivityItems([mk("a"), mk("b"), mk("a")]);
    expect(deduped.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("merges an incoming page and reports added count", () => {
    const result = mergeActivityPage([mk("a"), mk("b")], [mk("b"), mk("c")]);
    expect(result.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(result.addedCount).toBe(1);
  });
});

describe("date-formatting seam", () => {
  it("is UTC-based and hydration-stable", () => {
    const f = defaultActivityDateFormatter;
    const d = new Date("2026-07-19T14:32:05Z");
    expect(f.dayKey(d)).toBe("2026-07-19");
    expect(f.formatTimeOfDay(d)).toBe("14:32");
    expect(f.toDateTimeAttr(d)).toBe(d.toISOString());
    expect(f.formatAbsolute(d)).toBe("19 July 2026 at 14:32 UTC");
  });

  it("produces relative Today/Yesterday when a reference now is given", () => {
    const f = createActivityDateFormatter({
      now: new Date("2026-07-19T12:00:00Z"),
    });
    expect(f.formatDayHeading(new Date("2026-07-19T01:00:00Z"))).toBe("Today");
    expect(f.formatDayHeading(new Date("2026-07-18T23:00:00Z"))).toBe(
      "Yesterday",
    );
    expect(f.formatDayHeading(new Date("2026-07-17T23:00:00Z"))).toContain(
      "17 July 2026",
    );
  });
});

describe("DS-07 filter-field integration", () => {
  const items = toActivityItems(
    [
      record({
        id: "a",
        type: "task.completed",
        actor: USER,
        subjects: [{ entityId: "t1", role: "subject" }],
      }),
      record({
        id: "b",
        type: "entity.created",
        actor: SYSTEM,
        subjects: [{ entityId: "p1", role: "subject" }],
      }),
    ],
    {
      descriptors: createActivityDescriptorMap({
        "task.completed": { label: "Task completed" } as ActivityTypeDescriptor,
      }),
      resolveEntity: (id) => ({
        entityId: id,
        entityType: id.startsWith("t") ? "task" : "project",
        label: id,
      }),
    },
  );

  const fields = createActivityFilterFields({
    eventTypeOptions: [
      { value: "task.completed", label: "Task completed" },
      { value: "entity.created", label: "Created" },
    ],
    actorTypeOptions: [
      { value: "system", label: "System" },
      { value: "user", label: "Person" },
    ],
    entityTypeOptions: [
      { value: "task", label: "Task" },
      { value: "project", label: "Project" },
    ],
  });

  it("filters by event type through the shared evaluator", () => {
    const filtered = filterRecords(
      fields,
      {
        mode: "and",
        clauses: [
          {
            id: "c1",
            field: ACTIVITY_FILTER_FIELD_IDS.eventType,
            operator: "is",
            value: "task.completed",
          },
        ],
      },
      items,
    );
    expect(filtered.map((i) => i.id)).toEqual(["a"]);
  });

  it("filters by referenced entity type (multi-enum) via the accessor", () => {
    expect(referencedEntityTypes(items[0])).toEqual(["task"]);
    const filtered = filterRecords(
      fields,
      {
        mode: "and",
        clauses: [
          {
            id: "c1",
            field: ACTIVITY_FILTER_FIELD_IDS.entityType,
            operator: "is_any_of",
            value: ["project"],
          },
        ],
      },
      items,
    );
    expect(filtered.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("windowing math", () => {
  it("builds cumulative offsets, clamping bad heights", () => {
    const { offsets, totalHeight } = buildRowOffsets([10, 20, -5, NaN, 30]);
    expect(offsets).toEqual([0, 10, 30, 30, 30, 60]);
    expect(totalHeight).toBe(60);
  });

  it("computes a stable window with symmetric overscan and exact spacers", () => {
    const { offsets, totalHeight } = buildRowOffsets([100, 100, 100, 100, 100]);
    const w = computeWindow({
      offsets,
      totalHeight,
      count: 5,
      scrollTop: 250,
      viewportHeight: 100,
      overscan: 1,
    });
    // Visible rows are index 2 and 3; overscan 1 widens to [1, 5).
    expect(w.startIndex).toBe(1);
    expect(w.endIndex).toBe(5);
    expect(w.paddingTop).toBe(100);
    expect(w.paddingBottom).toBe(0);
    expect(
      w.paddingTop +
        (offsets[w.endIndex] - offsets[w.startIndex]) +
        w.paddingBottom,
    ).toBe(totalHeight);
  });

  it("returns an empty window for no rows", () => {
    const w = computeWindow({
      offsets: [0],
      totalHeight: 0,
      count: 0,
      scrollTop: 0,
      viewportHeight: 500,
      overscan: 4,
    });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(0);
  });
});
