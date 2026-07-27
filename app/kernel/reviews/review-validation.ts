import { parseMarkdownSource } from "~/kernel/markdown";
import {
  REVIEW_SECTION_IDS,
  REVIEW_STATUSES,
  REVIEW_TYPES,
  type ReviewSectionId,
  type ReviewSort,
  type ReviewStatus,
  type ReviewType,
  type ReviewView,
} from "./review";
import { ReviewValidationError } from "./review-errors";

const MAX_TITLE_LENGTH = 160;
const MAX_QUERY_LENGTH = 120;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export function validateReviewId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new ReviewValidationError("id", "is required");
  }
  return value;
}

export function validateReviewTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new ReviewValidationError("title", "is required");
  }
  const title = value.trim();
  if (title.length === 0) {
    throw new ReviewValidationError("title", "is required");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ReviewValidationError(
      "title",
      `must be at most ${MAX_TITLE_LENGTH} characters`,
    );
  }
  return title;
}

export function parseReviewType(value: unknown): ReviewType {
  if (typeof value === "string" && REVIEW_TYPES.includes(value as ReviewType)) {
    return value as ReviewType;
  }
  throw new ReviewValidationError("type", "choose a supported review type");
}

export function parseReviewStatus(value: unknown): ReviewStatus {
  if (
    typeof value === "string" &&
    REVIEW_STATUSES.includes(value as ReviewStatus)
  ) {
    return value as ReviewStatus;
  }
  throw new ReviewValidationError("status", "choose a supported status");
}

export function parseReviewSectionId(value: unknown): ReviewSectionId {
  if (
    typeof value === "string" &&
    REVIEW_SECTION_IDS.includes(value as ReviewSectionId)
  ) {
    return value as ReviewSectionId;
  }
  throw new ReviewValidationError("sectionId", "choose a supported section");
}

export function validateDateOnly(
  value: unknown,
  field: "periodStart" | "periodEnd",
): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReviewValidationError(field, "use YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new ReviewValidationError(field, "use a real calendar date");
  }
  return value;
}

export function validateReviewPeriod(input: {
  readonly type: unknown;
  readonly periodStart: unknown;
  readonly periodEnd: unknown;
}): {
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
} {
  const type = parseReviewType(input.type);
  const periodStart = validateDateOnly(input.periodStart, "periodStart");
  const periodEnd = validateDateOnly(input.periodEnd, "periodEnd");
  if (periodEnd < periodStart) {
    throw new ReviewValidationError(
      "periodEnd",
      "must be on or after the start date",
    );
  }
  return { type, periodStart, periodEnd };
}

export function validateTemplateId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 80) {
    throw new ReviewValidationError("templateId", "is required");
  }
  if (!/^[a-z][a-z0-9_.-]*$/.test(value)) {
    throw new ReviewValidationError("templateId", "is not valid");
  }
  return value;
}

export function validateSectionContent(value: unknown): string {
  try {
    return String(parseMarkdownSource(value));
  } catch (cause) {
    throw new ReviewValidationError(
      "content",
      cause instanceof Error ? cause.message : "is not valid Markdown",
    );
  }
}

export function validateReviewLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new ReviewValidationError(
      "limit",
      `must be between 1 and ${MAX_LIMIT}`,
    );
  }
  return n;
}

export function normaliseReviewQuery(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ReviewValidationError("query", "must be text");
  }
  const trimmed = value.trim().toLocaleLowerCase();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw new ReviewValidationError(
      "query",
      `must be at most ${MAX_QUERY_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function parseReviewView(value: unknown): ReviewView {
  if (
    value === "current" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "archived"
  ) {
    return value;
  }
  return "current";
}

export function parseReviewSort(value: unknown): ReviewSort {
  return value === "period" ? "period" : "recent";
}
