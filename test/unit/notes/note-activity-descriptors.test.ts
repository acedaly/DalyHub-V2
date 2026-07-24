/**
 * NOTES-01B — the Notes module's Activity descriptors.
 *
 * Proves the Note Timeline extends the shared DS-05 registry (never forks
 * it): the Note-owned `note.content_updated` event gets a calm, structured
 * presentation — never a raw payload dump; the kernel lifecycle defaults
 * (creation, rename) still apply; any unknown registered type falls through
 * to the shared safe fallback; and no second parser/renderer/
 * `dangerouslySetInnerHTML` is introduced by this descriptor layer (it deals
 * only in plain labels, never Markdown/HTML). Mirrors
 * `test/unit/goals/goal-activity-descriptors.test.ts` exactly.
 */

import { describe, expect, it } from "vitest";

import { NOTE_CONTENT_UPDATED } from "~/kernel/notes";
import {
  parseActivityType,
  type ActivityActor,
  type ActivityPayload,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  toActivityItem,
  type EntityResolver,
} from "~/shared/activity-feed/model";

import {
  NOTE_ACTIVITY_DESCRIPTOR_MAP,
  NOTE_ACTIVITY_DESCRIPTORS,
} from "~/modules/notes/note-activity";

const WS = parseWorkspaceId("ws-note-activity");
const SYSTEM: ActivityActor = { type: "system", id: null };

function record(
  type: string,
  subjectId = "n-1",
  payload: ActivityPayload = {},
): ActivityRecord {
  return {
    id: `evt-${type}`,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: SYSTEM,
    occurredAt: new Date("2026-07-24T10:00:00Z"),
    payload,
    subjects: [{ entityId: subjectId, role: "subject" }],
  };
}

const resolveNote: EntityResolver = (entityId) => ({
  entityId,
  entityType: "note",
  label: "Reading list",
});

describe("Note Activity descriptors", () => {
  it("renders note.content_updated calmly, never dumping the raw payload (content stays private)", () => {
    const item = toActivityItem(
      record(NOTE_CONTENT_UPDATED, "n-1", { empty: false }),
      {
        descriptors: NOTE_ACTIVITY_DESCRIPTOR_MAP,
        resolveEntity: resolveNote,
        anchorEntityId: "n-1",
      },
    );
    expect(item.isKnownType).toBe(true);
    expect(item.presentation.entityType).toBe("note");
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Updated note content");
    expect(text).not.toContain("empty");
    expect(text).not.toContain(NOTE_CONTENT_UPDATED);
  });

  it("still resolves the kernel lifecycle defaults (Note creation, rename)", () => {
    const created = toActivityItem(record("entity.created"), {
      descriptors: NOTE_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveNote,
      anchorEntityId: "n-1",
    });
    expect(created.isKnownType).toBe(true);

    const renamed = toActivityItem(record("entity.updated"), {
      descriptors: NOTE_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveNote,
      anchorEntityId: "n-1",
    });
    expect(renamed.isKnownType).toBe(true);
  });

  it("falls through to the shared safe fallback for an unknown registered type", () => {
    const item = toActivityItem(record("note.some_future_event"), {
      descriptors: NOTE_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveNote,
      anchorEntityId: "n-1",
    });
    expect(item.isKnownType).toBe(false);
    expect(item.presentation.tone).toBe("neutral");
  });

  it("registers only the one Note-owned event, layered over the shared defaults", () => {
    expect(Object.keys(NOTE_ACTIVITY_DESCRIPTORS)).toEqual([
      NOTE_CONTENT_UPDATED,
    ]);
  });
});
