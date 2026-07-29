import type { CaptureType } from "./capture-model";

export const CAPTURE_CONTEXT_ENTITY_TYPES = [
  "person",
  "project",
  "area",
  "goal",
  "meeting",
  "task",
  "note",
  "diary",
  "asset",
  "review",
] as const;

export type CaptureContextEntityType =
  (typeof CAPTURE_CONTEXT_ENTITY_TYPES)[number];

export type CaptureContextMode = "suggested" | "fixed" | "removable";

export type CaptureRelationshipMeaning =
  "related" | "parent" | "attendee" | "follow_up" | "source" | "supports";

export interface CaptureContextContract {
  readonly sourceEntityId: string;
  readonly sourceEntityType: CaptureContextEntityType;
  readonly sourceEntityTitle: string;
  readonly sourceModule: string;
  readonly originatingRoute: string;
  readonly relationshipMeaning?: CaptureRelationshipMeaning;
  readonly mode: CaptureContextMode;
  readonly returnTo?: string;
}

export type CaptureRelationshipPlan =
  | {
      readonly kind: "none";
      readonly presentation: string;
      readonly reason?: string;
    }
  | {
      readonly kind: "task_parent";
      readonly parentKind: "area" | "project";
      readonly presentation: string;
    }
  | {
      readonly kind: "entity_link";
      readonly linkType: "link.related" | "task.relates_to";
      readonly direction: "captured_to_context" | "context_to_captured";
      readonly presentation: string;
    }
  | {
      readonly kind: "meeting_attendee";
      readonly presentation: string;
    };

export function isCaptureContextEntityType(
  value: unknown,
): value is CaptureContextEntityType {
  return (
    typeof value === "string" &&
    CAPTURE_CONTEXT_ENTITY_TYPES.includes(value as CaptureContextEntityType)
  );
}

export function encodeCaptureContext(
  context: CaptureContextContract | null | undefined,
): string {
  return context ? JSON.stringify(context) : "";
}

export function parseCaptureContextContract(
  value: unknown,
): CaptureContextContract | null {
  if (value === null || value === undefined || value === "") return null;
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const sourceEntityId = stringField(input.sourceEntityId, 1, 256);
  const sourceEntityTitle = stringField(input.sourceEntityTitle, 1, 512);
  const sourceModule = stringField(input.sourceModule, 1, 80);
  const originatingRoute = stringField(input.originatingRoute, 1, 2048);
  if (
    !sourceEntityId ||
    !sourceEntityTitle ||
    !sourceModule ||
    !originatingRoute ||
    !isCaptureContextEntityType(input.sourceEntityType)
  ) {
    return null;
  }
  const mode =
    input.mode === "fixed" || input.mode === "removable"
      ? input.mode
      : "suggested";
  const relationshipMeaning = parseRelationshipMeaning(
    input.relationshipMeaning,
  );
  const returnTo = stringField(input.returnTo, 1, 2048) ?? undefined;
  return {
    sourceEntityId,
    sourceEntityType: input.sourceEntityType,
    sourceEntityTitle,
    sourceModule,
    originatingRoute,
    ...(relationshipMeaning ? { relationshipMeaning } : {}),
    mode,
    ...(returnTo ? { returnTo } : {}),
  };
}

export function captureRelationshipPlan(
  captureType: CaptureType,
  sourceType: CaptureContextEntityType,
): CaptureRelationshipPlan {
  if (captureType === "task") {
    switch (sourceType) {
      case "project":
        return {
          kind: "task_parent",
          parentKind: "project",
          presentation: "In",
        };
      case "area":
        return { kind: "task_parent", parentKind: "area", presentation: "In" };
      case "meeting":
        return {
          kind: "entity_link",
          linkType: "task.relates_to",
          direction: "captured_to_context",
          presentation: "Follow-up from",
        };
      case "note":
      case "diary":
        return {
          kind: "entity_link",
          linkType: "task.relates_to",
          direction: "captured_to_context",
          presentation: "From",
        };
      case "person":
        return {
          kind: "entity_link",
          linkType: "task.relates_to",
          direction: "captured_to_context",
          presentation: "Related to",
        };
      case "goal":
        return {
          kind: "entity_link",
          linkType: "task.relates_to",
          direction: "captured_to_context",
          presentation: "Supports",
        };
      default:
        return { kind: "none", presentation: "Linked to" };
    }
  }

  if (captureType === "note") {
    if (sourceType === "project") {
      return {
        kind: "entity_link",
        linkType: "link.related",
        direction: "context_to_captured",
        presentation: "In",
      };
    }
    if (
      sourceType === "person" ||
      sourceType === "area" ||
      sourceType === "goal" ||
      sourceType === "meeting" ||
      sourceType === "task" ||
      sourceType === "diary"
    ) {
      return {
        kind: "entity_link",
        linkType: "link.related",
        direction: "captured_to_context",
        presentation: "Related to",
      };
    }
    return { kind: "none", presentation: "Related to" };
  }

  if (captureType === "meeting") {
    if (sourceType === "person") {
      return { kind: "meeting_attendee", presentation: "With" };
    }
    if (
      sourceType === "project" ||
      sourceType === "area" ||
      sourceType === "goal" ||
      sourceType === "task" ||
      sourceType === "note" ||
      sourceType === "diary"
    ) {
      return {
        kind: "entity_link",
        linkType: "link.related",
        direction: "captured_to_context",
        presentation: "Linked to",
      };
    }
    return { kind: "none", presentation: "Linked to" };
  }

  if (captureType === "diary") {
    if (
      sourceType === "person" ||
      sourceType === "project" ||
      sourceType === "area" ||
      sourceType === "goal" ||
      sourceType === "meeting" ||
      sourceType === "task" ||
      sourceType === "note"
    ) {
      return {
        kind: "entity_link",
        linkType: "link.related",
        direction: "captured_to_context",
        presentation: "Related to",
      };
    }
    return { kind: "none", presentation: "Related to" };
  }

  return { kind: "none", presentation: "Related to" };
}

export function contextPresentation(
  captureType: CaptureType,
  context: CaptureContextContract,
): string {
  const plan = captureRelationshipPlan(captureType, context.sourceEntityType);
  return `${plan.presentation} ${context.sourceEntityTitle}`;
}

export function contextForCaptureType(
  captureType: CaptureType,
  context: CaptureContextContract | null | undefined,
): CaptureContextContract | null {
  if (!context) return null;
  const plan = captureRelationshipPlan(captureType, context.sourceEntityType);
  return plan.kind === "none" ? null : context;
}

function stringField(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function parseRelationshipMeaning(
  value: unknown,
): CaptureRelationshipMeaning | undefined {
  switch (value) {
    case "related":
    case "parent":
    case "attendee":
    case "follow_up":
    case "source":
    case "supports":
      return value;
    default:
      return undefined;
  }
}
