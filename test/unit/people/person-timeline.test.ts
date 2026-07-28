/**
 * PEOPLE-02 — the Person relationship Timeline's pure model.
 *
 * Proves the parts that must be right before anything renders: how a cross-module
 * event gets a readable, PAYLOAD-FREE line from the module registry rather than a
 * People-side switch statement; how events are classified into relationship
 * categories for the DS-07 filter; and how the page cursor keeps the anchor set
 * stable, bound to its Person and closed to tampering.
 */

import { describe, expect, it } from "vitest";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  toActivityItem,
  type ActivityItem,
  type EntityResolver,
} from "~/shared/activity-feed/model";
import { filterRecords } from "~/shared/filters/model";

import {
  buildPersonTimelineDescriptors,
  PEOPLE_ACTIVITY_DESCRIPTORS,
} from "~/modules/people/person-activity";
import {
  decodePersonTimelineCursor,
  encodePersonTimelineCursor,
} from "~/modules/people/person-timeline-anchors";
import {
  PERSON_TIMELINE_CATEGORY_FIELD_ID,
  PERSON_TIMELINE_FILTER_FIELDS,
  personTimelineCategory,
} from "~/modules/people/person-timeline";

const WS = parseWorkspaceId("ws-person-timeline");
const SYSTEM: ActivityActor = { type: "system", id: null };
const PERSON = "person-1";

function record(
  type: string,
  subjects: readonly { entityId: string; role: string }[],
  payload: Record<string, string> = {},
): ActivityRecord {
  return {
    id: `evt-${type}-${subjects.map((s) => s.entityId).join("-")}`,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: SYSTEM,
    occurredAt: new Date("2026-07-20T10:00:00Z"),
    payload,
    subjects,
  };
}

const TYPES: Readonly<Record<string, string>> = {
  [PERSON]: "person",
  "note-1": "note",
  "task-1": "task",
  "meeting-1": "meeting",
  "diary-1": "diary",
  "asset-1": "asset",
};

const resolve: EntityResolver = (entityId) => ({
  entityId,
  entityType: TYPES[entityId] ?? "note",
  label: `Record ${entityId}`,
});

function item(
  type: string,
  subjects: readonly { entityId: string; role: string }[],
  payload: Record<string, string> = {},
  descriptors = PEOPLE_ACTIVITY_DESCRIPTORS,
): ActivityItem {
  return toActivityItem(record(type, subjects, payload), {
    descriptors,
    resolveEntity: resolve,
    anchorEntityId: PERSON,
  });
}

describe("cross-module descriptors from the module registry", () => {
  const descriptors = buildPersonTimelineDescriptors([
    { type: "task.completed", label: "Task completed" },
    { type: "meeting.created", label: "Meeting created" },
    // Malformed contributions are skipped rather than crashing the timeline.
    { type: "", label: "Nope" },
    { type: "bad.one", label: "" },
  ]);

  it("labels another module’s event without importing that module", () => {
    const completed = item(
      "task.completed",
      [{ entityId: "task-1", role: "subject" }],
      {},
      descriptors,
    );
    expect(completed.isKnownType).toBe(true);
    expect(
      completed.presentation.segments.some(
        (segment) =>
          segment.kind === "emphasis" && segment.text === "Task completed",
      ),
    ).toBe(true);
    // It names the canonical record, so the reader can navigate to it.
    expect(
      completed.presentation.segments.some(
        (segment) => segment.kind === "entity" && segment.entityId === "task-1",
      ),
    ).toBe(true);
  });

  it("emits NO payload metadata for another module’s event (privacy)", () => {
    const completed = item(
      "task.completed",
      [{ entityId: "task-1", role: "subject" }],
      { note: "call the surgeon about the biopsy" },
      descriptors,
    );
    expect(completed.presentation.metadata ?? []).toHaveLength(0);
    expect(JSON.stringify(completed.presentation)).not.toContain("biopsy");
  });

  it("keeps the People-owned line for the Person’s own events", () => {
    const updated = item(
      "person.updated",
      [{ entityId: PERSON, role: "subject" }],
      {},
      descriptors,
    );
    expect(updated.presentation.entityType).toBe("person");
    expect(
      updated.presentation.segments.some(
        (segment) =>
          segment.kind === "text" &&
          segment.text.includes("updated the details for"),
      ),
    ).toBe(true);
  });

  it("keeps the kernel link default, which names both endpoints", () => {
    const linked = item(
      "entity_link.created",
      [
        { entityId: "note-1", role: "source" },
        { entityId: PERSON, role: "target" },
      ],
      {},
      descriptors,
    );
    const entityIds = linked.presentation.segments
      .filter((segment) => segment.kind === "entity")
      .map((segment) => (segment.kind === "entity" ? segment.entityId : ""));
    expect(entityIds).toEqual(["note-1", PERSON]);
  });

  it("falls back safely for a type no module declared", () => {
    const unknown = item(
      "widget.frobnicated",
      [{ entityId: "asset-1", role: "subject" }],
      { secret: "do not render" },
      descriptors,
    );
    expect(unknown.isKnownType).toBe(false);
    expect(unknown.presentation.metadata ?? []).toHaveLength(0);
    expect(JSON.stringify(unknown.presentation)).not.toContain("do not render");
  });
});

describe("relationship categories", () => {
  it("classifies by event domain, then by the referenced record", () => {
    expect(
      personTimelineCategory(
        item("person.updated", [{ entityId: PERSON, role: "subject" }]),
      ),
    ).toBe("person");
    expect(
      personTimelineCategory(
        item("entity_link.created", [
          { entityId: "meeting-1", role: "source" },
          { entityId: PERSON, role: "target" },
        ]),
      ),
    ).toBe("relationship");
    expect(
      personTimelineCategory(
        item("task.completed", [{ entityId: "task-1", role: "subject" }]),
      ),
    ).toBe("task");
    expect(
      personTimelineCategory(
        item("meeting.created", [{ entityId: "meeting-1", role: "subject" }]),
      ),
    ).toBe("meeting");
    expect(
      personTimelineCategory(
        item("diary_entry.created", [{ entityId: "diary-1", role: "subject" }]),
      ),
    ).toBe("diary");
  });

  it("classifies a generic lifecycle event by the linked record it names", () => {
    expect(
      personTimelineCategory(
        item("entity.created", [{ entityId: "note-1", role: "subject" }]),
      ),
    ).toBe("note");
    expect(
      personTimelineCategory(
        item("entity.updated", [{ entityId: PERSON, role: "subject" }]),
      ),
    ).toBe("person");
  });

  it("classifies an unfamiliar module’s record as Other, never throwing", () => {
    expect(
      personTimelineCategory(
        item("asset.disposed", [{ entityId: "asset-1", role: "subject" }]),
      ),
    ).toBe("other");
    expect(() =>
      personTimelineCategory({
        ...item("x.y", [{ entityId: "unknown-9", role: "subject" }]),
        subjects: [],
      }),
    ).not.toThrow();
  });

  it("drives the DS-07 filter without adding an operator", () => {
    const items = [
      item("task.completed", [{ entityId: "task-1", role: "subject" }]),
      item("entity.created", [{ entityId: "note-1", role: "subject" }]),
      item("person.updated", [{ entityId: PERSON, role: "subject" }]),
    ];
    const filtered = filterRecords(
      PERSON_TIMELINE_FILTER_FIELDS,
      {
        mode: "and",
        clauses: [
          {
            id: "c1",
            field: PERSON_TIMELINE_CATEGORY_FIELD_ID,
            operator: "is",
            value: "task",
          },
        ],
      },
      [...items],
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toBe(items[0]);
  });

  it("offers a date field on the shared DS-07 URL contract", () => {
    expect(PERSON_TIMELINE_FILTER_FIELDS.map((field) => field.id)).toEqual([
      PERSON_TIMELINE_CATEGORY_FIELD_ID,
      "occurredAt",
    ]);
  });
});

describe("the page cursor", () => {
  const anchors = [PERSON, "note-1", "task-1"];

  it("round-trips the anchor set, the inner cursor and the truncation flag", () => {
    const encoded = encodePersonTimelineCursor(
      PERSON,
      anchors,
      "inner-cursor",
      true,
    );
    expect(decodePersonTimelineCursor(encoded, PERSON)).toEqual({
      anchorIds: anchors,
      activityCursor: "inner-cursor",
      truncated: true,
    });
  });

  it("is bound to the Person it was issued for", () => {
    const encoded = encodePersonTimelineCursor(
      PERSON,
      anchors,
      "inner-cursor",
      false,
    );
    expect(decodePersonTimelineCursor(encoded, "person-2")).toBeNull();
  });

  it("rejects garbage, truncation, a wrong version and a missing anchor", () => {
    expect(decodePersonTimelineCursor("", PERSON)).toBeNull();
    expect(decodePersonTimelineCursor("not-base64!!", PERSON)).toBeNull();
    expect(
      decodePersonTimelineCursor(
        btoa(JSON.stringify([99, PERSON, anchors, "c", false])),
        PERSON,
      ),
    ).toBeNull();
    // An anchor set that does not contain the Person is never accepted.
    expect(
      decodePersonTimelineCursor(
        btoa(JSON.stringify([1, PERSON, ["note-1"], "c", false])),
        PERSON,
      ),
    ).toBeNull();
  });

  it("carries no title, snippet or private field", () => {
    const encoded = encodePersonTimelineCursor(
      PERSON,
      anchors,
      "inner-cursor",
      false,
    );
    expect(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))).not.toMatch(
      /Record |@/,
    );
  });
});
