/**
 * AREA-02 — the Goals module's Activity descriptors.
 *
 * Proves the Goal Timeline extends the shared DS-05 registry (never forks it):
 * the two spine Goal events (`goal.completed`/`goal.reopened`) and the
 * Goal-owned `goal.details_updated` event get a calm, structured presentation
 * — never a raw payload dump; the kernel lifecycle defaults still apply; and
 * any unknown registered type falls through to the shared safe fallback.
 */

import { describe, expect, it } from "vitest";

import { GOAL_COMPLETED, GOAL_REOPENED } from "~/kernel/spine";
import {
  GOAL_DETAILS_UPDATED,
  GOAL_MEASUREMENT_CORRECTED,
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MEASUREMENT_REMOVED,
  GOAL_MILESTONE_COMPLETED,
  GOAL_MILESTONE_REOPENED,
  GOAL_TARGET_REACHED,
} from "~/kernel/goals";
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
  GOAL_ACTIVITY_DESCRIPTOR_MAP,
  GOAL_ACTIVITY_DESCRIPTORS,
} from "~/modules/goals/goal-activity";

const WS = parseWorkspaceId("ws-goal-activity");
const SYSTEM: ActivityActor = { type: "system", id: null };

function record(
  type: string,
  subjectId = "g-1",
  payload: ActivityPayload = {},
): ActivityRecord {
  return {
    id: `evt-${type}`,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: SYSTEM,
    occurredAt: new Date("2026-07-20T10:00:00Z"),
    payload,
    subjects: [{ entityId: subjectId, role: "subject" }],
  };
}

const resolveGoal: EntityResolver = (entityId) => ({
  entityId,
  entityType: "goal",
  label: "Run a half-marathon",
});

describe("Goal Activity descriptors", () => {
  it("renders goal.completed as a known, calm success event naming the Goal", () => {
    const item = toActivityItem(record(GOAL_COMPLETED), {
      descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveGoal,
      anchorEntityId: "g-1",
    });
    expect(item.isKnownType).toBe(true);
    expect(item.presentation.tone).toBe("success");
    expect(item.presentation.entityType).toBe("goal");
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Completed goal");
    expect(text).not.toContain("goal.completed");
  });

  it("renders goal.reopened as a known event with the goal marker", () => {
    const item = toActivityItem(record(GOAL_REOPENED), {
      descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveGoal,
      anchorEntityId: "g-1",
    });
    expect(item.isKnownType).toBe(true);
    expect(item.presentation.entityType).toBe("goal");
  });

  it("renders goal.details_updated calmly, never dumping the raw payload (target date / definition of done stay private)", () => {
    const item = toActivityItem(
      record(GOAL_DETAILS_UPDATED, "g-1", {
        hasTargetDate: true,
        hasDefinitionOfDone: true,
      }),
      {
        descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
        resolveEntity: resolveGoal,
        anchorEntityId: "g-1",
      },
    );
    expect(item.isKnownType).toBe(true);
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Updated goal details");
    expect(text).not.toContain("hasTargetDate");
    expect(text).not.toContain("hasDefinitionOfDone");
  });

  it("still resolves the kernel lifecycle defaults (goal creation etc.)", () => {
    const item = toActivityItem(record("entity.created"), {
      descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveGoal,
      anchorEntityId: "g-1",
    });
    expect(item.isKnownType).toBe(true);
  });

  it("falls through to the shared safe fallback for an unknown registered type", () => {
    const item = toActivityItem(record("goal.some_future_event"), {
      descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveGoal,
      anchorEntityId: "g-1",
    });
    expect(item.isKnownType).toBe(false);
    expect(item.presentation.tone).toBe("neutral");
  });

  it("renders a logged measurement calmly, never dumping the reading itself", () => {
    const item = toActivityItem(
      record(GOAL_MEASUREMENT_LOGGED, "g-1", {
        measuredOn: "2026-08-09",
        hasNote: true,
      }),
      {
        descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
        resolveEntity: resolveGoal,
        anchorEntityId: "g-1",
      },
    );
    expect(item.isKnownType).toBe(true);
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Logged a measurement");
    expect(text).not.toContain("measuredOn");
    expect(text).not.toContain("hasNote");
  });

  it("tones reaching the target as a success, unlike the edit events", () => {
    const reached = toActivityItem(record(GOAL_TARGET_REACHED), {
      descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveGoal,
      anchorEntityId: "g-1",
    });
    expect(reached.presentation.tone).toBe("success");

    // A correction carries no tone at all — it is a record of an edit, not an
    // outcome, and colouring it would put weight on the wrong event.
    const corrected = toActivityItem(record(GOAL_MEASUREMENT_CORRECTED), {
      descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveGoal,
      anchorEntityId: "g-1",
    });
    expect(corrected.presentation.tone).toBeUndefined();
  });

  it("registers exactly the Goal-subject events, layered over the defaults", () => {
    expect(Object.keys(GOAL_ACTIVITY_DESCRIPTORS).sort()).toEqual(
      [
        GOAL_COMPLETED,
        GOAL_REOPENED,
        GOAL_DETAILS_UPDATED,
        // GOAL-02 — progress events. Note what is ABSENT: there is no event for
        // a recalculated percentage, and none for adding, renaming or
        // reweighting a milestone, because neither is a change to the record.
        GOAL_MEASUREMENT_LOGGED,
        GOAL_MEASUREMENT_CORRECTED,
        GOAL_MEASUREMENT_REMOVED,
        GOAL_TARGET_REACHED,
        GOAL_MILESTONE_COMPLETED,
        GOAL_MILESTONE_REOPENED,
      ].sort(),
    );
  });
});
