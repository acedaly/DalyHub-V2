import { describe, expect, it } from "vitest";

import {
  captureRelationshipPlan,
  contextPresentation,
  encodeCaptureContext,
  parseCaptureContextContract,
  type CaptureContextContract,
} from "~/shared/capture/capture-context";

const projectContext: CaptureContextContract = {
  sourceEntityId: "project-1",
  sourceEntityType: "project",
  sourceEntityTitle: "DalyHub Development",
  sourceModule: "projects",
  originatingRoute: "/projects/project-1",
  mode: "removable",
  relationshipMeaning: "related",
  returnTo: "/projects/project-1",
};

describe("capture context contract", () => {
  it("round-trips a declarative record context", () => {
    expect(
      parseCaptureContextContract(encodeCaptureContext(projectContext)),
    ).toEqual(projectContext);
  });

  it("rejects malformed or unsupported source context", () => {
    expect(parseCaptureContextContract("not-json")).toBeNull();
    expect(
      parseCaptureContextContract({
        ...projectContext,
        sourceEntityType: "workspace",
      }),
    ).toBeNull();
    expect(
      parseCaptureContextContract({
        ...projectContext,
        sourceEntityId: "",
      }),
    ).toBeNull();
  });

  it("uses Project and Area context as a Task structural parent", () => {
    expect(captureRelationshipPlan("task", "project")).toMatchObject({
      kind: "task_parent",
      parentKind: "project",
      presentation: "In",
    });
    expect(captureRelationshipPlan("task", "area")).toMatchObject({
      kind: "task_parent",
      parentKind: "area",
      presentation: "In",
    });
  });

  it("does not treat a Person context as delegation", () => {
    expect(captureRelationshipPlan("task", "person")).toEqual({
      kind: "entity_link",
      linkType: "task.relates_to",
      direction: "captured_to_context",
      presentation: "Related to",
    });
  });

  it("keeps Project Knowledge as Project to Note link.related", () => {
    expect(captureRelationshipPlan("note", "project")).toEqual({
      kind: "entity_link",
      linkType: "link.related",
      direction: "context_to_captured",
      presentation: "In",
    });
  });

  it("keeps Meeting attendee semantics distinct from generic links", () => {
    expect(captureRelationshipPlan("meeting", "person")).toEqual({
      kind: "meeting_attendee",
      presentation: "With",
    });
  });

  it("omits unsupported combinations instead of inventing meaning", () => {
    expect(captureRelationshipPlan("diary", "asset")).toMatchObject({
      kind: "none",
    });
  });

  it("presents context in user language, not link identifiers", () => {
    expect(contextPresentation("note", projectContext)).toBe(
      "In DalyHub Development",
    );
  });
});
