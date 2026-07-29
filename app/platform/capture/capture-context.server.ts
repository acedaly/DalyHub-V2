import type { CaptureType } from "~/shared/capture/capture-model";
import {
  captureRelationshipPlan,
  parseCaptureContextContract,
  type CaptureContextContract,
  type CaptureRelationshipPlan,
} from "~/shared/capture/capture-context";
import type { WorkspaceScope } from "~/platform/workspaces";

export interface ValidatedCaptureContext {
  readonly contract: CaptureContextContract;
  readonly plan: CaptureRelationshipPlan;
}

export async function validateCaptureContextForCreate(
  scope: WorkspaceScope,
  captureType: CaptureType,
  raw: unknown,
): Promise<ValidatedCaptureContext | null> {
  const parsed = parseCaptureContextContract(raw);
  if (!parsed) return null;
  const source = await scope.entities.getById(parsed.sourceEntityId);
  if (!source || source.type !== parsed.sourceEntityType) return null;
  const plan = captureRelationshipPlan(captureType, parsed.sourceEntityType);
  if (plan.kind === "none") return null;
  return {
    contract: { ...parsed, sourceEntityTitle: source.title },
    plan,
  };
}

export async function applyCaptureRelationship(
  scope: WorkspaceScope,
  capturedEntityId: string,
  context: ValidatedCaptureContext | null,
): Promise<"linked" | "not_applicable"> {
  if (!context) return "not_applicable";
  const sourceId = context.contract.sourceEntityId;
  switch (context.plan.kind) {
    case "entity_link": {
      const sourceEntityId =
        context.plan.direction === "captured_to_context"
          ? capturedEntityId
          : sourceId;
      const targetEntityId =
        context.plan.direction === "captured_to_context"
          ? sourceId
          : capturedEntityId;
      await scope.entityLinks.create({
        sourceEntityId,
        targetEntityId,
        type: context.plan.linkType,
      });
      return "linked";
    }
    case "meeting_attendee":
      await scope.entityLinks.create({
        sourceEntityId: capturedEntityId,
        targetEntityId: sourceId,
        type: "meeting.attendee",
      });
      return "linked";
    case "task_parent":
      return "not_applicable";
    case "none":
      return "not_applicable";
  }
}

export async function compensateCapturedRecord(
  scope: WorkspaceScope,
  capturedEntityId: string,
  captureType: CaptureType,
): Promise<boolean> {
  try {
    if (captureType === "task") {
      await scope.spine.softDelete(capturedEntityId);
      return true;
    }
    await scope.entities.softDelete(capturedEntityId);
    return true;
  } catch {
    return false;
  }
}
