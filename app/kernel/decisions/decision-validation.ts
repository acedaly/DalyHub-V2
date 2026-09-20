import {
  DECISION_STATUSES,
  type CreateDecisionInput,
  type DecisionStatus,
} from "./decision";
import { DecisionValidationError } from "./decision-errors";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DECISION_LENGTH = 512;
const MAX_RATIONALE_LENGTH = 8_000;

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function optionalDate(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!validDate(value))
    throw new DecisionValidationError(`${field} must be YYYY-MM-DD`);
  return value;
}

export function parseDecisionStatus(value: unknown): DecisionStatus {
  if (!DECISION_STATUSES.includes(value as DecisionStatus)) {
    throw new DecisionValidationError("status must be open or decided");
  }
  return value as DecisionStatus;
}

export function validateCreateDecision(input: CreateDecisionInput): Required<
  Pick<CreateDecisionInput, "decision" | "status">
> & {
  readonly rationale: string | null;
  readonly decisionDate: string | null;
  readonly reviewDate: string | null;
  readonly related: CreateDecisionInput["related"];
} {
  const decision = input.decision.trim();
  if (decision.length === 0 || decision.length > MAX_DECISION_LENGTH) {
    throw new DecisionValidationError(
      `text must be 1-${MAX_DECISION_LENGTH} characters`,
    );
  }
  const status =
    input.status === undefined ? "decided" : parseDecisionStatus(input.status);
  const rationale = input.rationale?.trim() || null;
  if (rationale !== null && rationale.length > MAX_RATIONALE_LENGTH) {
    throw new DecisionValidationError(
      `rationale must be at most ${MAX_RATIONALE_LENGTH} characters`,
    );
  }
  const decisionDate = optionalDate(input.decisionDate, "decisionDate");
  if (status === "decided" && decisionDate === null) {
    throw new DecisionValidationError(
      "decisionDate is required for a decided decision",
    );
  }
  if (input.related !== undefined && input.related !== null) {
    if (!(["project", "area"] as const).includes(input.related.kind)) {
      throw new DecisionValidationError("related kind must be project or area");
    }
    if (input.related.id.length === 0 || input.related.id.length > 128) {
      throw new DecisionValidationError("related id is invalid");
    }
  }
  return {
    decision,
    status,
    rationale,
    decisionDate,
    reviewDate: optionalDate(input.reviewDate, "reviewDate"),
    related: input.related ?? null,
  };
}

export function validateDecisionLimit(value: number | undefined): number {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value < 1)
    throw new DecisionValidationError("limit must be positive");
  return Math.min(value, 100);
}

export function validateDecisionSearchText(value: string): string {
  const text = value.trim();
  if (text.length === 0 || text.length > 200) {
    throw new DecisionValidationError("search text must be 1-200 characters");
  }
  return text;
}
