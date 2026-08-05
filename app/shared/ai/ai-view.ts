/**
 * AI-01 shared — the React-free view model for every AI surface.
 *
 * Kept pure so the state machine the UI renders can be tested without a DOM, and
 * so the same states drive Meetings, Notes, the Weekly Review and Ask DalyHub
 * rather than each inventing its own.
 */

import type {
  AiResult,
  ActionExtractionResult,
  PrivacyCategory,
  WeeklyReviewAssistantResult,
  WorkspaceAnswerResult,
} from "~/kernel/ai";

/** A citation card resolved from evidence DalyHub supplied. */
export interface AiCitation {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly date: string | null;
  readonly href: string | null;
  readonly excerpt: string;
}

/** The cost/provenance detail shown behind a secondary disclosure. */
export interface AiDetail {
  readonly provider: string;
  readonly modelId: string;
  readonly modelLabel: string;
  readonly tier: string;
  readonly promptVersion: string;
  readonly estimatedUsd: number;
  readonly reconciledUsd: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly pricingVersion: string;
  readonly usedFallback: boolean;
  readonly reused: boolean;
  readonly generatedAt: string | null;
  readonly evidenceCount: number;
  readonly evidenceTruncated: boolean;
}

/** What the evidence disclosure tells the owner before and after a run. */
export interface AiDisclosure {
  readonly recordCount: number;
  readonly truncated: boolean;
  readonly excludedCategories: readonly PrivacyCategory[];
}

/**
 * The candidate allowlists DalyHub supplied. The review surface offers ONLY
 * these, so an invented Project or link target cannot be presented to the owner
 * even if a validator were somehow bypassed.
 */
export interface AiCandidates {
  readonly projects: readonly { readonly id: string; readonly title: string }[];
  readonly people: readonly { readonly id: string; readonly title: string }[];
  readonly links: readonly {
    readonly id: string;
    readonly title: string;
    readonly type: string;
  }[];
}

/** An empty allowlist — the model may reference nothing. */
export const NO_CANDIDATES: AiCandidates = {
  projects: [],
  people: [],
  links: [],
};

/** The bounded set of states an AI surface can be in. */
export type AiSurfaceState =
  | { readonly kind: "idle" }
  | { readonly kind: "disabled" }
  | { readonly kind: "unconfigured" }
  | { readonly kind: "feature_blocked" }
  | { readonly kind: "budget_exhausted" }
  | { readonly kind: "running" }
  | { readonly kind: "cancelling" }
  | {
      readonly kind: "result";
      readonly result: AiResult;
      readonly citations: readonly AiCitation[];
      readonly detail: AiDetail;
      readonly disclosure: AiDisclosure;
      /** The allowlists the answer was permitted to reference. */
      readonly candidates: AiCandidates;
      readonly usageId: string;
    }
  | {
      readonly kind: "deterministic";
      readonly summary: string;
      readonly citations: readonly {
        readonly title: string;
        readonly href: string | null;
        readonly date: string | null;
      }[];
    }
  | { readonly kind: "error"; readonly code: string; readonly message: string };

/** True when the surface is waiting on a provider. */
export function isBusy(state: AiSurfaceState): boolean {
  return state.kind === "running" || state.kind === "cancelling";
}

/** The typed narrowings each surface needs. */
export function asExtraction(result: AiResult): ActionExtractionResult | null {
  return result.kind === "action_extraction" ? result : null;
}

export function asWeeklyReview(
  result: AiResult,
): WeeklyReviewAssistantResult | null {
  return result.kind === "weekly_review_assistant" ? result : null;
}

export function asAnswer(result: AiResult): WorkspaceAnswerResult | null {
  return result.kind === "workspace_answer" ? result : null;
}

/**
 * The owner's working copy of one proposed Task while they review it. The AI's
 * values are the starting point; every field is editable, and what is sent on
 * acceptance is THIS, never the model's original.
 */
export interface TaskDraft {
  readonly index: number;
  readonly selected: boolean;
  readonly title: string;
  readonly dueDate: string;
  readonly scheduledDate: string;
  readonly projectId: string;
  /** Retained for the disclosure: was the date written down, or worked out? */
  readonly dateBasis: "explicit" | "inferred" | "none";
  readonly confidence: string;
  readonly evidenceIds: readonly string[];
  /** The AI's Person suggestion, shown but never applied automatically. */
  readonly suggestedOwnerPersonId: string | null;
}

/** Build the initial drafts from a validated extraction. */
export function draftsFromExtraction(
  result: ActionExtractionResult,
): readonly TaskDraft[] {
  return result.proposedTasks.map((task, index) => ({
    index,
    // Nothing is pre-selected. "Accept all" is never the only route, and it is
    // never the default: the owner opts each item in.
    selected: false,
    title: task.title,
    // An INFERRED date is deliberately not pre-filled. DalyHub owns date
    // validation, and a date the model worked out must be confirmed before it is
    // stored — leaving the field blank is how the owner confirms it.
    dueDate: task.dateBasis === "explicit" ? (task.dueDate ?? "") : "",
    scheduledDate:
      task.dateBasis === "explicit" ? (task.scheduledDate ?? "") : "",
    projectId: task.suggestedProjectId ?? "",
    dateBasis: task.dateBasis,
    confidence: task.confidence,
    evidenceIds: task.evidenceIds,
    suggestedOwnerPersonId: task.suggestedOwnerPersonId,
  }));
}

/** The payload the apply route receives. Only selected, owner-approved items. */
export function acceptancePayload(
  drafts: readonly TaskDraft[],
  links: readonly { selected: boolean; targetEntityId: string }[],
  sourceEntityId: string,
): readonly Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const draft of drafts) {
    if (!draft.selected) continue;
    items.push({
      kind: "task",
      title: draft.title,
      dueDate: draft.dueDate.length > 0 ? draft.dueDate : null,
      scheduledDate:
        draft.scheduledDate.length > 0 ? draft.scheduledDate : null,
      projectId: draft.projectId.length > 0 ? draft.projectId : null,
    });
  }
  for (const link of links) {
    if (!link.selected) continue;
    items.push({
      kind: "link",
      sourceEntityId,
      targetEntityId: link.targetEntityId,
    });
  }
  return items;
}

/** The date label shown beside a proposed Task. Honest about provenance. */
export function dateBasisLabel(basis: TaskDraft["dateBasis"]): string | null {
  switch (basis) {
    case "explicit":
      return "Date from the record";
    case "inferred":
      return "Date worked out from the wording — confirm it";
    case "none":
      return null;
  }
}

/** A stable idempotency key for ONE deliberate owner action. */
export function idempotencyKey(
  feature: string,
  scopeId: string,
  nonce: string,
): string {
  return `${feature}:${scopeId}:${nonce}`.slice(0, 200);
}
