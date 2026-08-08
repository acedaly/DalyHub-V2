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

/* -------------------------------------------------------------------------- */
/* Full-form hand-off (DEBT-45)                                                */
/* -------------------------------------------------------------------------- */

/**
 * The query parameter that carries a capture context ACROSS a route transition.
 *
 * DEBT-45's remaining gap was that context lived only in the capture sheet's React
 * state, so leaving the sheet for a module's fuller creation surface silently threw
 * it away. Context is therefore carried the same way every other piece of DalyHub
 * state that must survive navigation is carried — in the URL — so the hand-off is
 * refresh-stable, Back/Forward-honest and identical on desktop and mobile.
 *
 * The value is NOT authoritative in any sense: it is re-parsed by
 * {@link parseCaptureContextContract} on arrival and the source id/type are
 * revalidated in the authenticated workspace by every canonical create route
 * before a relationship is written (ADR-060).
 */
export const CAPTURE_CONTEXT_PARAM = "ctx";

/**
 * Where each capture type's FULLER creation surface lives, as a URL the shared
 * sheet can navigate to. Each is the module's existing route-backed create surface
 * — no new page is introduced for the hand-off.
 *
 * A type is absent when the sheet ALREADY hosts the module's canonical creation
 * form and there is therefore nothing fuller to offer. `asset` (ASSET-03) is the
 * first such type: capture composes `NewAssetForm` itself, so a "More asset
 * options" link would lead to the same fields the owner is already looking at.
 */
const FULL_FORM_ROUTES: Partial<Record<CaptureType, string>> = {
  task: "/tasks?drawer=new-task",
  note: "/notes?drawer=new-note",
  meeting: "/new/meeting",
  diary: "/diary?inspector=new",
};

/** The label the sheet uses for the hand-off control, per capture type. */
const FULL_FORM_LABELS: Partial<Record<CaptureType, string>> = {
  task: "More task options",
  note: "More note options",
  meeting: "More meeting options",
  diary: "More entry options",
};

/** The hand-off label, or `null` for a type whose panel IS the full form. */
export function fullFormLabel(captureType: CaptureType): string | null {
  return FULL_FORM_LABELS[captureType] ?? null;
}

/**
 * The full-form destination for a capture type, carrying the context when there is
 * one whose relationship plan actually applies to that type. `null` when the
 * capture panel is already the module's canonical creation surface.
 */
export function fullFormRoute(
  captureType: CaptureType,
  context: CaptureContextContract | null | undefined,
): string | null {
  const base = FULL_FORM_ROUTES[captureType];
  if (base === undefined) return null;
  const applicable = contextForCaptureType(captureType, context ?? null);
  if (!applicable) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${CAPTURE_CONTEXT_PARAM}=${encodeURIComponent(
    encodeCaptureContext(applicable),
  )}`;
}

/**
 * Read a capture context from a URL's search parameters, validated through the
 * same parser the server uses. A malformed or absent parameter is simply no
 * context — never an error page.
 */
export function readCaptureContextParam(
  params: URLSearchParams | null | undefined,
): CaptureContextContract | null {
  if (!params) return null;
  return parseCaptureContextContract(params.get(CAPTURE_CONTEXT_PARAM));
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
