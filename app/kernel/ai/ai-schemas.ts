/**
 * AI-01 kernel — DalyHub-owned response schemas and their validators.
 *
 * **All model output is untrusted data.** It is never parsed out of prose, never
 * rendered as HTML, and never trusted to name a DalyHub record. Each feature
 * declares a JSON Schema (sent to the provider so it answers in shape) AND a
 * DalyHub validator (which decides whether the answer is acceptable). The schema
 * is a request; the validator is the boundary.
 *
 * The validator rejects: an unknown result type, a missing required field, too
 * many items, an overlong string, a malformed date, an unsupported record type,
 * an invented record id, an invalid confidence value, a citation of evidence that
 * was not supplied, and any proposal outside the feature's allowed actions.
 *
 * Nothing here renders. Prose reaches the UI as plain text or through the ONE
 * existing Markdown pipeline (ADR-006); no second renderer is introduced, and no
 * provider-returned HTML is ever accepted.
 */

import { AiError } from "./ai-errors";
import type { AiFeatureId } from "./ai-features";

/** Confidence values a model may attach to an extracted item. */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Whether a pattern is something observed in evidence or an AI inference. */
export const CLAIM_CLASSIFICATIONS = ["observation", "inference"] as const;
export type ClaimClassification = (typeof CLAIM_CLASSIFICATIONS)[number];

/** Shared string ceilings. A model that exceeds one has its answer rejected. */
export const LIMITS = {
  summary: 1_200,
  line: 400,
  title: 200,
  reason: 300,
  question: 300,
  overview: 1_500,
} as const;

/** Per-feature item-count ceilings. */
export const COUNTS = {
  decisions: 8,
  proposedTasks: 12,
  unresolvedQuestions: 6,
  suggestedLinks: 8,
  evidenceIdsPerItem: 6,
  notableProgress: 5,
  attentionItems: 5,
  patterns: 3,
  proposedPriorities: 3,
  uncertainties: 4,
  answerStatements: 8,
} as const;

/* ────────────────────────────────────────────────────────────────────────── */
/* Result shapes                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

/** One extracted decision. */
export interface ExtractedDecision {
  readonly text: string;
  readonly evidenceIds: readonly string[];
  readonly confidence: ConfidenceLevel;
}

/**
 * A proposed Task. Adapted to the TASKS-04 `NewTaskInput` contract: the model may
 * suggest a title, a description, a due or scheduled date and a Project/Person
 * from the SUPPLIED candidates — nothing else. Priority, sector, commitment and
 * recurrence are the owner's, set through the ordinary Task surfaces.
 *
 * `dateBasis` is what makes the date contract honest: DalyHub asks the model to
 * say whether a date was written down or worked out, and refuses to store an
 * INFERRED date without the owner confirming it.
 */
export interface ProposedTask {
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  /** `explicit` — a date appears in the evidence. `inferred` — it was derived. */
  readonly dateBasis: "explicit" | "inferred" | "none";
  /** Must be one of the supplied Project candidate ids, or `null`. */
  readonly suggestedProjectId: string | null;
  /** Must be one of the supplied Person candidate ids, or `null`. */
  readonly suggestedOwnerPersonId: string | null;
  readonly evidenceIds: readonly string[];
  readonly confidence: ConfidenceLevel;
}

/** A question the evidence raises but does not answer. */
export interface UnresolvedQuestion {
  readonly text: string;
  readonly evidenceIds: readonly string[];
}

/** A suggested EntityLink. The target MUST come from the supplied candidates. */
export interface SuggestedLink {
  readonly targetEntityId: string;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

/** The validated result of Meeting/Note extraction. */
export interface ActionExtractionResult {
  readonly kind: "action_extraction";
  readonly summary: string;
  readonly decisions: readonly ExtractedDecision[];
  readonly proposedTasks: readonly ProposedTask[];
  readonly unresolvedQuestions: readonly UnresolvedQuestion[];
  readonly suggestedLinks: readonly SuggestedLink[];
}

/** A cited statement in the Weekly Review assistant's output. */
export interface CitedStatement {
  readonly text: string;
  readonly evidenceIds: readonly string[];
}

/** An attention item: what needs a look, and why. */
export interface AttentionItem {
  readonly text: string;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

/** A pattern, explicitly labelled as observation or inference. */
export interface ObservedPattern {
  readonly text: string;
  readonly evidenceIds: readonly string[];
  readonly classification: ClaimClassification;
}

/** The validated Weekly Review assistant result. */
export interface WeeklyReviewAssistantResult {
  readonly kind: "weekly_review_assistant";
  readonly overview: string;
  readonly notableProgress: readonly CitedStatement[];
  readonly attentionItems: readonly AttentionItem[];
  readonly patterns: readonly ObservedPattern[];
  readonly proposedNextWeekPriorities: readonly CitedStatement[];
  readonly uncertainties: readonly string[];
}

/** One statement in an Ask DalyHub answer, with its citations. */
export interface AnswerStatement {
  readonly text: string;
  readonly evidenceIds: readonly string[];
  readonly classification: ClaimClassification;
}

/** The validated Ask DalyHub result. */
export interface WorkspaceAnswerResult {
  readonly kind: "workspace_answer";
  /** `answered` | `insufficient_evidence` | `needs_narrowing`. */
  readonly status: "answered" | "insufficient_evidence" | "needs_narrowing";
  readonly summary: string;
  readonly statements: readonly AnswerStatement[];
  readonly uncertainties: readonly string[];
}

/** The union every validated AI result belongs to. */
export type AiResult =
  ActionExtractionResult | WeeklyReviewAssistantResult | WorkspaceAnswerResult;

/* ────────────────────────────────────────────────────────────────────────── */
/* JSON Schemas sent to the provider                                          */
/* ────────────────────────────────────────────────────────────────────────── */

/** A JSON Schema object. Structural only — DalyHub does not evaluate it. */
export type JsonSchema = Record<string, unknown>;

const evidenceIdsSchema: JsonSchema = {
  type: "array",
  items: { type: "string" },
  maxItems: COUNTS.evidenceIdsPerItem,
  description:
    "Citation ids copied exactly from the supplied evidence, e.g. evidence_01.",
};

/**
 * Both providers' strict modes require every property to be listed in `required`
 * and `additionalProperties: false`. Nullability is expressed with a union type
 * rather than by omitting the key.
 */
function object(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** The schema for Meeting/Note action extraction. */
export const ACTION_EXTRACTION_SCHEMA: JsonSchema = object({
  summary: {
    type: "string",
    description: "A short, neutral summary of the record. No advice.",
  },
  decisions: {
    type: "array",
    maxItems: COUNTS.decisions,
    items: object({
      text: { type: "string" },
      evidenceIds: evidenceIdsSchema,
      confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
    }),
  },
  proposedTasks: {
    type: "array",
    maxItems: COUNTS.proposedTasks,
    items: object({
      title: { type: "string" },
      description: { type: ["string", "null"] },
      dueDate: {
        type: ["string", "null"],
        description: "ISO calendar date YYYY-MM-DD, or null.",
      },
      scheduledDate: { type: ["string", "null"] },
      dateBasis: { type: "string", enum: ["explicit", "inferred", "none"] },
      suggestedProjectId: {
        type: ["string", "null"],
        description:
          "One of the supplied project candidate ids, or null. Never invent one.",
      },
      suggestedOwnerPersonId: {
        type: ["string", "null"],
        description:
          "One of the supplied person candidate ids, or null. Never invent one.",
      },
      evidenceIds: evidenceIdsSchema,
      confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
    }),
  },
  unresolvedQuestions: {
    type: "array",
    maxItems: COUNTS.unresolvedQuestions,
    items: object({
      text: { type: "string" },
      evidenceIds: evidenceIdsSchema,
    }),
  },
  suggestedLinks: {
    type: "array",
    maxItems: COUNTS.suggestedLinks,
    items: object({
      targetEntityId: {
        type: "string",
        description:
          "One of the supplied link candidate ids. Never invent one.",
      },
      reason: { type: "string" },
      evidenceIds: evidenceIdsSchema,
    }),
  },
});

/** The schema for the Weekly Review assistant. */
export const WEEKLY_REVIEW_SCHEMA: JsonSchema = object({
  overview: { type: "string" },
  notableProgress: {
    type: "array",
    maxItems: COUNTS.notableProgress,
    items: object({ text: { type: "string" }, evidenceIds: evidenceIdsSchema }),
  },
  attentionItems: {
    type: "array",
    maxItems: COUNTS.attentionItems,
    items: object({
      text: { type: "string" },
      reason: { type: "string" },
      evidenceIds: evidenceIdsSchema,
    }),
  },
  patterns: {
    type: "array",
    maxItems: COUNTS.patterns,
    items: object({
      text: { type: "string" },
      evidenceIds: evidenceIdsSchema,
      classification: {
        type: "string",
        enum: [...CLAIM_CLASSIFICATIONS],
      },
    }),
  },
  proposedNextWeekPriorities: {
    type: "array",
    maxItems: COUNTS.proposedPriorities,
    items: object({ text: { type: "string" }, evidenceIds: evidenceIdsSchema }),
  },
  uncertainties: {
    type: "array",
    maxItems: COUNTS.uncertainties,
    items: { type: "string" },
  },
});

/** The schema for Ask DalyHub. */
export const WORKSPACE_ANSWER_SCHEMA: JsonSchema = object({
  status: {
    type: "string",
    enum: ["answered", "insufficient_evidence", "needs_narrowing"],
  },
  summary: { type: "string" },
  statements: {
    type: "array",
    maxItems: COUNTS.answerStatements,
    items: object({
      text: { type: "string" },
      evidenceIds: evidenceIdsSchema,
      classification: { type: "string", enum: [...CLAIM_CLASSIFICATIONS] },
    }),
  },
  uncertainties: {
    type: "array",
    maxItems: COUNTS.uncertainties,
    items: { type: "string" },
  },
});

/** The schema a feature sends to the provider. */
export function schemaForFeature(feature: AiFeatureId): JsonSchema {
  switch (feature) {
    case "meeting-action-extraction":
    case "note-action-extraction":
      return ACTION_EXTRACTION_SCHEMA;
    case "weekly-review-assistant":
      return WEEKLY_REVIEW_SCHEMA;
    case "workspace-question-answer":
      return WORKSPACE_ANSWER_SCHEMA;
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Validation                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/** What the validator is allowed to accept as a reference. */
export interface ValidationContext {
  /** Evidence ids actually supplied to the model this request. */
  readonly evidenceIds: ReadonlySet<string>;
  /** Project ids offered as candidates. Anything else is rejected. */
  readonly projectCandidateIds: ReadonlySet<string>;
  /** Person ids offered as candidates. */
  readonly personCandidateIds: ReadonlySet<string>;
  /** EntityLink target ids offered as candidates. */
  readonly linkCandidateIds: ReadonlySet<string>;
}

/** An empty context — nothing may be referenced. */
export const EMPTY_VALIDATION_CONTEXT: ValidationContext = {
  evidenceIds: new Set(),
  projectCandidateIds: new Set(),
  personCandidateIds: new Set(),
  linkCandidateIds: new Set(),
};

/** Raised when a model answer is unacceptable. Always a `provider_response_invalid`. */
function invalid(reason: string): AiError {
  return new AiError("provider_response_invalid", undefined, reason);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(`${what}:not_object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  source: Record<string, unknown>,
  key: string,
  max: number,
): string {
  const value = source[key];
  if (typeof value !== "string") throw invalid(`${key}:not_string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw invalid(`${key}:empty`);
  if (trimmed.length > max) throw invalid(`${key}:too_long`);
  return trimmed;
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  max: number,
): string | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw invalid(`${key}:not_string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) throw invalid(`${key}:too_long`);
  return trimmed;
}

function requireArray(
  source: Record<string, unknown>,
  key: string,
  max: number,
): readonly unknown[] {
  const value = source[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`${key}:not_array`);
  if (value.length > max) throw invalid(`${key}:too_many`);
  return value;
}

function requireEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = source[key];
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw invalid(`${key}:not_allowed`);
  }
  return value as T;
}

/**
 * Validate a citation list. Every id must be one DalyHub actually supplied —
 * this is the rule that makes a fabricated citation impossible to render.
 */
function requireEvidenceIds(
  source: Record<string, unknown>,
  context: ValidationContext,
): readonly string[] {
  const raw = requireArray(source, "evidenceIds", COUNTS.evidenceIdsPerItem);
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") throw invalid("evidenceIds:not_string");
    if (!context.evidenceIds.has(value)) throw invalid("evidenceIds:unknown");
    if (!ids.includes(value)) ids.push(value);
  }
  return ids;
}

/** Strict ISO calendar date. Rejects `2026-02-30` as well as `soon`. */
export function parseIsoCalendarDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw invalid("date:not_string");
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) throw invalid("date:malformed");
  const [, year, month, day] = match;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw invalid("date:malformed");
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw invalid("date:not_a_real_day");
  }
  return trimmed;
}

/**
 * Validate an action-extraction answer.
 *
 * A candidate id the model invented is REJECTED rather than dropped: a proposal
 * that names a Project the owner does not have is evidence the answer is not
 * trustworthy, and silently deleting the field would hide that.
 */
export function validateActionExtraction(
  raw: unknown,
  context: ValidationContext,
): ActionExtractionResult {
  const source = asRecord(raw, "result");
  const summary = requireString(source, "summary", LIMITS.summary);

  const decisions = requireArray(source, "decisions", COUNTS.decisions).map(
    (entry) => {
      const item = asRecord(entry, "decision");
      return {
        text: requireString(item, "text", LIMITS.line),
        evidenceIds: requireEvidenceIds(item, context),
        confidence: requireEnum(item, "confidence", CONFIDENCE_LEVELS),
      } satisfies ExtractedDecision;
    },
  );

  const proposedTasks = requireArray(
    source,
    "proposedTasks",
    COUNTS.proposedTasks,
  ).map((entry) => {
    const item = asRecord(entry, "proposedTask");
    const suggestedProjectId = optionalString(item, "suggestedProjectId", 100);
    if (
      suggestedProjectId !== null &&
      !context.projectCandidateIds.has(suggestedProjectId)
    ) {
      throw invalid("suggestedProjectId:unknown");
    }
    const suggestedOwnerPersonId = optionalString(
      item,
      "suggestedOwnerPersonId",
      100,
    );
    if (
      suggestedOwnerPersonId !== null &&
      !context.personCandidateIds.has(suggestedOwnerPersonId)
    ) {
      throw invalid("suggestedOwnerPersonId:unknown");
    }
    const dueDate = parseIsoCalendarDate(item.dueDate);
    const scheduledDate = parseIsoCalendarDate(item.scheduledDate);
    const dateBasis = requireEnum(item, "dateBasis", [
      "explicit",
      "inferred",
      "none",
    ] as const);
    if ((dueDate !== null || scheduledDate !== null) && dateBasis === "none") {
      // A date with no stated basis cannot be shown honestly, so it is refused
      // rather than displayed as if the owner had written it down.
      throw invalid("dateBasis:missing_for_date");
    }
    return {
      title: requireString(item, "title", LIMITS.title),
      description: optionalString(item, "description", LIMITS.summary),
      dueDate,
      scheduledDate,
      dateBasis,
      suggestedProjectId,
      suggestedOwnerPersonId,
      evidenceIds: requireEvidenceIds(item, context),
      confidence: requireEnum(item, "confidence", CONFIDENCE_LEVELS),
    } satisfies ProposedTask;
  });

  const unresolvedQuestions = requireArray(
    source,
    "unresolvedQuestions",
    COUNTS.unresolvedQuestions,
  ).map((entry) => {
    const item = asRecord(entry, "unresolvedQuestion");
    return {
      text: requireString(item, "text", LIMITS.question),
      evidenceIds: requireEvidenceIds(item, context),
    } satisfies UnresolvedQuestion;
  });

  const suggestedLinks = requireArray(
    source,
    "suggestedLinks",
    COUNTS.suggestedLinks,
  ).map((entry) => {
    const item = asRecord(entry, "suggestedLink");
    const targetEntityId = requireString(item, "targetEntityId", 100);
    if (!context.linkCandidateIds.has(targetEntityId)) {
      throw invalid("targetEntityId:unknown");
    }
    return {
      targetEntityId,
      reason: requireString(item, "reason", LIMITS.reason),
      evidenceIds: requireEvidenceIds(item, context),
    } satisfies SuggestedLink;
  });

  return {
    kind: "action_extraction",
    summary,
    decisions,
    proposedTasks,
    unresolvedQuestions,
    suggestedLinks,
  };
}

/** Validate a Weekly Review assistant answer. */
export function validateWeeklyReviewAssistant(
  raw: unknown,
  context: ValidationContext,
): WeeklyReviewAssistantResult {
  const source = asRecord(raw, "result");
  const cited = (entry: unknown, what: string): CitedStatement => {
    const item = asRecord(entry, what);
    return {
      text: requireString(item, "text", LIMITS.line),
      evidenceIds: requireEvidenceIds(item, context),
    };
  };

  return {
    kind: "weekly_review_assistant",
    overview: requireString(source, "overview", LIMITS.overview),
    notableProgress: requireArray(
      source,
      "notableProgress",
      COUNTS.notableProgress,
    ).map((entry) => cited(entry, "notableProgress")),
    attentionItems: requireArray(
      source,
      "attentionItems",
      COUNTS.attentionItems,
    ).map((entry) => {
      const item = asRecord(entry, "attentionItem");
      return {
        text: requireString(item, "text", LIMITS.line),
        reason: requireString(item, "reason", LIMITS.reason),
        evidenceIds: requireEvidenceIds(item, context),
      } satisfies AttentionItem;
    }),
    patterns: requireArray(source, "patterns", COUNTS.patterns).map((entry) => {
      const item = asRecord(entry, "pattern");
      return {
        text: requireString(item, "text", LIMITS.line),
        evidenceIds: requireEvidenceIds(item, context),
        classification: requireEnum(
          item,
          "classification",
          CLAIM_CLASSIFICATIONS,
        ),
      } satisfies ObservedPattern;
    }),
    proposedNextWeekPriorities: requireArray(
      source,
      "proposedNextWeekPriorities",
      COUNTS.proposedPriorities,
    ).map((entry) => cited(entry, "proposedPriority")),
    uncertainties: requireArray(
      source,
      "uncertainties",
      COUNTS.uncertainties,
    ).map((entry) => {
      if (typeof entry !== "string") throw invalid("uncertainties:not_string");
      const trimmed = entry.trim();
      if (trimmed.length === 0) throw invalid("uncertainties:empty");
      if (trimmed.length > LIMITS.line) throw invalid("uncertainties:too_long");
      return trimmed;
    }),
  };
}

/**
 * Validate an Ask DalyHub answer.
 *
 * The one asymmetry worth stating: a statement classified `observation` MUST cite
 * evidence. An answer that asserts a fact about the workspace with nothing behind
 * it is exactly the failure mode citations exist to prevent, so it is rejected
 * rather than rendered uncited.
 */
export function validateWorkspaceAnswer(
  raw: unknown,
  context: ValidationContext,
): WorkspaceAnswerResult {
  const source = asRecord(raw, "result");
  const status = requireEnum(source, "status", [
    "answered",
    "insufficient_evidence",
    "needs_narrowing",
  ] as const);

  const statements = requireArray(
    source,
    "statements",
    COUNTS.answerStatements,
  ).map((entry) => {
    const item = asRecord(entry, "statement");
    const classification = requireEnum(
      item,
      "classification",
      CLAIM_CLASSIFICATIONS,
    );
    const evidenceIds = requireEvidenceIds(item, context);
    if (classification === "observation" && evidenceIds.length === 0) {
      throw invalid("statement:uncited_observation");
    }
    return {
      text: requireString(item, "text", LIMITS.line),
      evidenceIds,
      classification,
    } satisfies AnswerStatement;
  });

  if (status === "answered" && statements.length === 0) {
    throw invalid("answer:no_statements");
  }

  return {
    kind: "workspace_answer",
    status,
    summary: requireString(source, "summary", LIMITS.summary),
    statements,
    uncertainties: requireArray(
      source,
      "uncertainties",
      COUNTS.uncertainties,
    ).map((entry) => {
      if (typeof entry !== "string") throw invalid("uncertainties:not_string");
      const trimmed = entry.trim();
      if (trimmed.length === 0) throw invalid("uncertainties:empty");
      if (trimmed.length > LIMITS.line) throw invalid("uncertainties:too_long");
      return trimmed;
    }),
  };
}

/** Validate whatever a feature produced. Throws a typed `AiError` on refusal. */
export function validateFeatureResult(
  feature: AiFeatureId,
  raw: unknown,
  context: ValidationContext,
): AiResult {
  switch (feature) {
    case "meeting-action-extraction":
    case "note-action-extraction":
      return validateActionExtraction(raw, context);
    case "weekly-review-assistant":
      return validateWeeklyReviewAssistant(raw, context);
    case "workspace-question-answer":
      return validateWorkspaceAnswer(raw, context);
  }
}
