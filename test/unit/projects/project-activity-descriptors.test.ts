/**
 * PROJ-04 — the Projects module's Activity descriptors.
 *
 * Proves the project Timeline extends the shared DS-05 registry (never forks it):
 * the two project-specific spine events (`project.completed` / `project.reopened`)
 * get a calm, structured presentation; the kernel lifecycle defaults still apply to
 * the events that carry the project's creation, rename and links; and any unknown
 * registered type falls through to the shared safe generic fallback — never a raw
 * JSON dump.
 */

import { describe, expect, it } from "vitest";

import { PROJECT_COMPLETED, PROJECT_REOPENED } from "~/kernel/spine";
import {
  parseActivityType,
  type ActivityActor,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  toActivityItem,
  type EntityResolver,
} from "~/shared/activity-feed/model";

import {
  PROJECT_ACTIVITY_DESCRIPTOR_MAP,
  PROJECT_ACTIVITY_DESCRIPTORS,
} from "~/modules/projects/project-activity";

const WS = parseWorkspaceId("ws-proj-activity");
const SYSTEM: ActivityActor = { type: "system", id: null };

function record(type: string, subjectId = "pr-1"): ActivityRecord {
  return {
    id: `evt-${type}`,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: SYSTEM,
    occurredAt: new Date("2026-07-20T10:00:00Z"),
    payload: {},
    subjects: [{ entityId: subjectId, role: "subject" }],
  };
}

const resolveProject: EntityResolver = (entityId) => ({
  entityId,
  entityType: "project",
  label: "Website relaunch",
  // No drawerKey: the project itself is the record, so it renders as calm text.
});

describe("project Activity descriptors", () => {
  it("renders project.completed as a known, calm success event naming the project", () => {
    const item = toActivityItem(record(PROJECT_COMPLETED), {
      descriptors: PROJECT_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveProject,
      anchorEntityId: "pr-1",
    });

    expect(item.isKnownType).toBe(true);
    expect(item.presentation.tone).toBe("success");
    expect(item.presentation.entityType).toBe("project");
    // The actor and the subject (as an entity segment) are retained.
    expect(item.presentation.segments.some((s) => s.kind === "actor")).toBe(
      true,
    );
    expect(
      item.presentation.segments.some(
        (s) => s.kind === "entity" && s.entityId === "pr-1",
      ),
    ).toBe(true);
    // A concise label, not the dotted machine type.
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Completed project");
    expect(text).not.toContain("project.completed");
  });

  it("renders project.reopened as a known event with the project marker", () => {
    const item = toActivityItem(record(PROJECT_REOPENED), {
      descriptors: PROJECT_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveProject,
      anchorEntityId: "pr-1",
    });
    expect(item.isKnownType).toBe(true);
    expect(item.presentation.entityType).toBe("project");
  });

  it("still resolves the kernel lifecycle defaults (project creation etc.)", () => {
    const item = toActivityItem(record("entity.created"), {
      descriptors: PROJECT_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveProject,
      anchorEntityId: "pr-1",
    });
    // entity.created ships a kernel default, so it stays a known type — the project
    // map layers on top of the defaults, it does not replace them.
    expect(item.isKnownType).toBe(true);
  });

  it("falls through to the shared safe fallback for an unknown registered type", () => {
    const item = toActivityItem(record("project.some_future_event"), {
      descriptors: PROJECT_ACTIVITY_DESCRIPTOR_MAP,
      resolveEntity: resolveProject,
      anchorEntityId: "pr-1",
    });
    expect(item.isKnownType).toBe(false);
    expect(item.presentation.tone).toBe("neutral");
    // Never a raw payload dump; a humanised phrase instead.
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Project some future event");
  });

  it("registers only the two project events, layered over the defaults", () => {
    expect(Object.keys(PROJECT_ACTIVITY_DESCRIPTORS).sort()).toEqual(
      [PROJECT_COMPLETED, PROJECT_REOPENED].sort(),
    );
  });
});
