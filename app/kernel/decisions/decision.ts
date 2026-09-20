import type { WorkspaceId } from "~/kernel/workspaces";

export const DECISION_ENTITY_TYPE = "decision";
export const DECISION_STATUSES = ["open", "decided"] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export type DecisionRelationKind = "project" | "area";

export type DecisionRelation = {
  readonly kind: DecisionRelationKind;
  readonly id: string;
  readonly title: string;
};

export type DecisionRecord = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly decision: string;
  readonly status: DecisionStatus;
  readonly rationale: string | null;
  readonly decisionDate: string | null;
  readonly reviewDate: string | null;
  readonly related: DecisionRelation | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CreateDecisionInput = {
  readonly decision: string;
  readonly status?: DecisionStatus;
  readonly rationale?: string | null;
  readonly decisionDate?: string | null;
  readonly reviewDate?: string | null;
  readonly related?: {
    readonly kind: DecisionRelationKind;
    readonly id: string;
  } | null;
};

export type ListDecisionsInput = {
  readonly status?: DecisionStatus;
  readonly relatedEntityId?: string;
  readonly limit?: number;
};

export type SearchDecisionsInput = {
  readonly text: string;
  readonly limit?: number;
};
