/**
 * IDENT-01 / DS-05 — every persisted event type has a renderer.
 *
 * The workspace feed used to carry only a partial descriptor list, so a fully
 * registered event (a meeting item converted to a task, a Person or Asset
 * change) rendered through the generic fallback and was flagged as an
 * unrecognised event. This test is what stops that regressing: the descriptor map
 * a cross-module surface builds must cover EVERY activity type in the current
 * schema — the seven kernel lifecycle types, every module-declared type, and
 * every activity-type constant the kernel exports.
 */

import { describe, expect, it } from "vitest";

import { ASSET_ACTIVITY_TYPES } from "~/kernel/assets";
import {
  AREA_ARCHIVED,
  AREA_DELETED,
  AREA_RESTORED,
} from "~/kernel/area-settings";
import { DIARY_ACTIVITY_TYPES } from "~/kernel/diary";
import { GOAL_DETAILS_UPDATED } from "~/kernel/goals";
import {
  MEETING_ARCHIVED,
  MEETING_CREATED,
  MEETING_FOLLOW_UP_CREATED,
  MEETING_HELD,
  MEETING_ITEM_CONVERTED_TO_TASK,
  MEETING_RESTORED,
  MEETING_UPDATED,
} from "~/kernel/meetings";
import {
  NOTE_ARCHIVED,
  NOTE_CONTENT_UPDATED,
  NOTE_TAGS_UPDATED,
  NOTE_UNARCHIVED,
} from "~/kernel/notes";
import { OBLIGATION_ACTIVITY_TYPES } from "~/kernel/obligations";
import { PERSON_ACTIVITY_TYPES } from "~/kernel/people";
import { APP_PREFERENCES_CHANGED } from "~/kernel/preferences";
import {
  PROJECT_ARCHIVED,
  PROJECT_RESTORED,
  PROJECT_STATUS_CHANGED,
} from "~/kernel/project-settings";
import { REVIEW_ACTIVITY_TYPES } from "~/kernel/reviews";
import {
  GOAL_COMPLETED,
  GOAL_REOPENED,
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
  TASK_COMPLETED,
  TASK_REOPENED,
} from "~/kernel/spine";
import {
  TASK_PLANNED,
  TASK_PLAN_CLEARED,
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
  TASK_RESCHEDULED,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_STARTED,
} from "~/kernel/tasks";
import { discoverModuleRegistry } from "~/modules/discover-modules";
import { insightActivityDescriptors } from "~/modules/analytics/activity-feed";
import {
  DEFAULT_ACTIVITY_DESCRIPTORS,
  buildWorkspaceActivityDescriptors,
  resolveActivityDescriptor,
  toActivityItem,
  type ActivityItemPresentation,
} from "~/shared/activity-feed/model";
import { parseActivityType, type ActivityRecord } from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";

/**
 * Every event type that can currently be persisted, gathered from the KERNEL
 * identifier constants (the same constants the repositories record with), so
 * this list cannot silently drift from what the database actually holds.
 */
const PERSISTED_ACTIVITY_TYPES: readonly string[] = [
  ...Object.keys(DEFAULT_ACTIVITY_DESCRIPTORS),
  TASK_COMPLETED,
  TASK_REOPENED,
  TASK_PLANNED,
  TASK_RESCHEDULED,
  TASK_PLAN_CLEARED,
  TASK_WAITING_STARTED,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
  PROJECT_STATUS_CHANGED,
  PROJECT_ARCHIVED,
  PROJECT_RESTORED,
  GOAL_COMPLETED,
  GOAL_REOPENED,
  GOAL_DETAILS_UPDATED,
  AREA_ARCHIVED,
  AREA_RESTORED,
  AREA_DELETED,
  NOTE_CONTENT_UPDATED,
  NOTE_TAGS_UPDATED,
  NOTE_ARCHIVED,
  NOTE_UNARCHIVED,
  MEETING_CREATED,
  MEETING_UPDATED,
  MEETING_ARCHIVED,
  MEETING_RESTORED,
  MEETING_HELD,
  MEETING_ITEM_CONVERTED_TO_TASK,
  MEETING_FOLLOW_UP_CREATED,
  APP_PREFERENCES_CHANGED,
  ...DIARY_ACTIVITY_TYPES,
  ...PERSON_ACTIVITY_TYPES,
  ...ASSET_ACTIVITY_TYPES,
  /*
   * V2.10 LIFE-01 — the obligation vocabulary, alongside the `asset.obligation_*`
   * types inside `ASSET_ACTIVITY_TYPES` rather than instead of them. Both have to
   * render: `activities` is append-only, so every obligation event written before
   * the migration still carries the old type string.
   */
  ...OBLIGATION_ACTIVITY_TYPES,
  ...REVIEW_ACTIVITY_TYPES,
];

const WS = parseWorkspaceId("ws-coverage");

function record(type: string): ActivityRecord {
  return {
    id: `act-${type}`,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: { type: "user", id: "sub-1" },
    occurredAt: new Date("2026-08-01T09:00:00.000Z"),
    payload: { secretValue: "must never be rendered" },
    subjects: [
      { entityId: "e-source", role: "subject" },
      { entityId: "e-target", role: "target" },
      { entityId: "e-successor", role: "successor" },
    ],
  };
}

function plainText(presentation: ActivityItemPresentation): string {
  return presentation.segments
    .map((segment) => {
      switch (segment.kind) {
        case "actor":
          return "Aidan Daly";
        case "text":
        case "emphasis":
          return segment.text;
        case "entity":
          return segment.entityId === "e-target" ? "Team Catch up" : "A record";
      }
    })
    .join("");
}

describe("every persisted activity type has a renderer", () => {
  const descriptors = insightActivityDescriptors();

  it("covers every type the module registry declares", () => {
    const missing = discoverModuleRegistry()
      .listActivityTypes()
      .map((contribution) => contribution.type)
      .filter((type) => !resolveActivityDescriptor(descriptors, type).isKnown);
    expect(missing).toEqual([]);
  });

  it("covers every activity type the kernel can persist", () => {
    const missing = PERSISTED_ACTIVITY_TYPES.filter(
      (type) => !resolveActivityDescriptor(descriptors, type).isKnown,
    );
    expect(missing).toEqual([]);
  });

  it("renders each one as a readable line naming the actor, with no raw type", () => {
    for (const type of PERSISTED_ACTIVITY_TYPES) {
      const item = toActivityItem(record(type), { descriptors });
      const text = plainText(item.presentation);

      expect(item.isKnownType, type).toBe(true);
      // The actor is always present, and it is never the anonymous placeholder.
      expect(text, type).toContain("Aidan Daly");
      expect(text, type).not.toContain("Someone");
      // The dotted machine identifier never reaches the description.
      expect(text, type).not.toContain(type);
      // Payload content is never surfaced by a cross-module descriptor.
      expect(JSON.stringify(item.presentation), type).not.toContain(
        "must never be rendered",
      );
      // A description always says something.
      expect(text.trim().length, type).toBeGreaterThan("Aidan Daly".length);
    }
  });

  it("names the destination record for the events that JOIN two records", () => {
    for (const type of [
      MEETING_ITEM_CONVERTED_TO_TASK,
      MEETING_FOLLOW_UP_CREATED,
      "entity_link.created",
    ]) {
      const item = toActivityItem(record(type), { descriptors });
      expect(plainText(item.presentation), type).toContain("Team Catch up");
    }
  });

  it("stays total for an event type nothing has registered", () => {
    const item = toActivityItem(record("future_module.did_a_thing"), {
      descriptors,
    });
    expect(item.isKnownType).toBe(false);
    // Still readable, still attributed, still no raw JSON.
    expect(plainText(item.presentation)).toContain("Aidan Daly");
    expect(plainText(item.presentation)).toContain("Future module did a thing");
    expect(JSON.stringify(item.presentation)).not.toContain(
      "must never be rendered",
    );
  });

  it("lets a module's own manifest label win over the shared wording", () => {
    const built = buildWorkspaceActivityDescriptors([
      { type: MEETING_HELD, label: "Meeting held" },
    ]);
    expect(built[MEETING_HELD]?.label).toBe("Meeting held");
    // …while the shared entry still contributes the entity marker.
    expect(built[MEETING_HELD]?.entityType).toBe("meeting");
  });
});
