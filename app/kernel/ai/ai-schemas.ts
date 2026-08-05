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
  /**
   * AI-02 — a proposed Note's title and body ceilings. Both are DalyHub's, not
   * the provider's: they bound what the owner can be asked to review in one
   * sitting and what a single acceptance can write. The body ceiling is
   * deliberately far below what a hand-written Note may hold — a proposal is a
   * starting point the owner edits, never a place to generate an essay.
   */
  noteTitle: 120,
  noteBody: 4_000,
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
  /**
   * AI-02 — at most four proposed Notes per Meeting extraction. One durable
   * summary, one decision record and one open-questions note is already the
   * whole of what the purposes below describe; four leaves one spare rather
   * than inviting a wall of generated prose the owner must wade through.
   */
  proposedNotes: 4,
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

/**
 * What a proposed Note is FOR. A closed vocabulary, because "write a note about
 * this" is exactly the open-ended instruction this architecture refuses: each
 * purpose names a durable artefact a Meeting genuinely produces, and anything
 * outside the list is rejected rather than mapped onto the nearest one.
 */
export const NOTE_PURPOSES = [
  "meeting_summary",
  "decision_record",
  "open_questions",
  "general_note",
] as const;
export type ProposedNotePurpose = (typeof NOTE_PURPOSES)[number];

/** True when a value names a supported proposed-Note purpose. */
export function isProposedNotePurpose(
  value: unknown,
): value is ProposedNotePurpose {
  return (
    typeof value === "string" &&
    (NOTE_PURPOSES as readonly string[]).includes(value)
  );
}

/**
 * AI-02 — a proposed Note. It exists ONLY in the response and in the owner's
 * review state; nothing persists it until the owner accepts it, and after
 * acceptance it is an ordinary DalyHub Note with no AI-specific storage.
 *
 * `body` is Markdown SOURCE and is treated as such end to end: it is stored
 * through the canonical Note content repository and rendered — later, elsewhere
 * — through the ONE sanitising FND-08 pipeline (ADR-006). Raw HTML is refused
 * here rather than sanitised away, because a proposal containing markup is
 * evidence the answer is not the plain prose that was asked for.
 *
 * Note what the model CANNOT supply: a workspace id, an owner id, a Note id, a
 * record id of any kind, a URL, a storage instruction or a link target. A
 * proposal names a title, a body, a purpose and the evidence behind it. Every
 * identifier the acceptance touches is resolved server-side.
 */
export interface ProposedNote {
  readonly title: string;
  readonly body: string;
  readonly purpose: ProposedNotePurpose;
  /** Never empty: a Note asserting something about the Meeting must cite it. */
  readonly evidenceIds: readonly string[];
  readonly confidence: ConfidenceLevel;
}

/** The validated result of Note action extraction. */
export interface ActionExtractionResult {
  readonly kind: "action_extraction";
  readonly summary: string;
  readonly decisions: readonly ExtractedDecision[];
  readonly proposedTasks: readonly ProposedTask[];
  readonly unresolvedQuestions: readonly UnresolvedQuestion[];
  readonly suggestedLinks: readonly SuggestedLink[];
}

/**
 * AI-02 — the validated result of MEETING extraction: everything Note extraction
 * produces, plus proposed Notes.
 *
 * Deliberately a SEPARATE contract rather than an optional field on
 * `ActionExtractionResult`. Meetings are where a durable summary, a decision
 * record or an open-questions note is genuinely useful; a Note proposing more
 * Notes is a recursion nobody asked for. Keeping the two apart means the Note
 * feature's schema, prompt and validator stay exactly as narrow as they were,
 * and the validator can REFUSE a `proposedNotes` field on a Note answer instead
 * of quietly dropping it.
 */
export interface MeetingExtractionResult {
  readonly kind: "meeting_extraction";
  readonly summary: string;
  readonly decisions: readonly ExtractedDecision[];
  readonly proposedTasks: readonly ProposedTask[];
  readonly proposedNotes: readonly ProposedNote[];
  readonly unresolvedQuestions: readonly UnresolvedQuestion[];
  readonly suggestedLinks: readonly SuggestedLink[];
}

/** Either extraction result — what the shared review surface renders. */
export type ExtractionResult = ActionExtractionResult | MeetingExtractionResult;

/** True for either extraction result kind. */
export function isExtractionResult(value: {
  readonly kind: string;
}): value is ExtractionResult {
  return (
    value.kind === "action_extraction" || value.kind === "meeting_extraction"
  );
}

/** The proposed Notes an extraction carries. Note extraction never has any. */
export function proposedNotesOf(
  result: ExtractionResult,
): readonly ProposedNote[] {
  return result.kind === "meeting_extraction" ? result.proposedNotes : [];
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
  | ActionExtractionResult
  | MeetingExtractionResult
  | WeeklyReviewAssistantResult
  | WorkspaceAnswerResult;

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

/**
 * The properties BOTH extraction schemas share. Declared once so the Meeting and
 * Note schemas cannot drift apart on the fields they have in common; the Meeting
 * schema adds `proposedNotes` and nothing else.
 */
const EXTRACTION_PROPERTIES: Record<string, JsonSchema> = {
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
};

/** The schema for NOTE action extraction. It has no `proposedNotes` property,
 * and `additionalProperties: false` means a Note answer cannot smuggle one in. */
export const ACTION_EXTRACTION_SCHEMA: JsonSchema = object(
  EXTRACTION_PROPERTIES,
);

/** The `proposedNotes` array, sent only with the Meeting extraction schema. */
const proposedNotesSchema: JsonSchema = {
  type: "array",
  maxItems: COUNTS.proposedNotes,
  description:
    "Durable Notes worth keeping from this meeting. Omit entirely when none is warranted; an empty array is the right answer more often than not.",
  items: object({
    title: {
      type: "string",
      description: `A short, plain title. At most ${LIMITS.noteTitle} characters.`,
    },
    body: {
      type: "string",
      description: `Plain Markdown prose. No HTML, no scripts, no URLs, no record ids. At most ${LIMITS.noteBody} characters.`,
    },
    purpose: { type: "string", enum: [...NOTE_PURPOSES] },
    evidenceIds: evidenceIdsSchema,
    confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
  }),
};

/** AI-02 — the schema for MEETING extraction: action extraction plus Notes. */
export const MEETING_EXTRACTION_SCHEMA: JsonSchema = object({
  ...EXTRACTION_PROPERTIES,
  proposedNotes: proposedNotesSchema,
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
      return MEETING_EXTRACTION_SCHEMA;
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

/**
 * Reject an object carrying a property DalyHub did not ask for.
 *
 * The provider schemas already say `additionalProperties: false`, but that is a
 * REQUEST. This is the boundary: an unexpected key means the answer is not the
 * shape DalyHub asked for, and a proposal that is not the shape asked for is not
 * trustworthy enough to render — so it is refused rather than having the stray
 * field quietly deleted.
 */
function requireExactKeys(
  source: Record<string, unknown>,
  allowed: readonly string[],
  what: string,
): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) throw invalid(`${what}:unknown_property`);
  }
}

/**
 * Anything that looks like an HTML/XML tag. Markdown prose never needs one, and
 * DalyHub renders Note bodies through the ONE sanitising pipeline (ADR-006) —
 * so markup in a proposal is refused at the boundary rather than stripped later
 * and silently changed under the owner while they review it.
 */
const HTML_TAG = /<\s*\/?\s*[a-zA-Z!][^>]*>/;

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

/** The fields both extraction results share, validated once. */
function validateExtractionCore(
  source: Record<string, unknown>,
  context: ValidationContext,
): Omit<ActionExtractionResult, "kind"> {
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
    summary,
    decisions,
    proposedTasks,
    unresolvedQuestions,
    suggestedLinks,
  };
}

/** The keys a proposed Note may carry, and nothing else. */
const PROPOSED_NOTE_KEYS = [
  "title",
  "body",
  "purpose",
  "evidenceIds",
  "confidence",
] as const;

/**
 * Validate ONE proposed Note.
 *
 * Four refusals matter here and each is deliberate rather than defensive:
 *   - an unknown property means the answer is not the shape asked for;
 *   - a purpose outside the closed vocabulary is not mapped onto the nearest
 *     one, because guessing what the model meant is how a "decision record"
 *     ends up holding something nobody decided;
 *   - a body containing markup is refused, not sanitised, so what the owner
 *     reviews is exactly what would be stored;
 *   - a Note with NO evidence is refused outright. Every proposed Note asserts
 *     something about the Meeting, and an uncited assertion is precisely the
 *     failure citations exist to prevent.
 */
function validateProposedNote(
  entry: unknown,
  context: ValidationContext,
): ProposedNote {
  const item = asRecord(entry, "proposedNote");
  requireExactKeys(item, PROPOSED_NOTE_KEYS, "proposedNote");

  const title = requireString(item, "title", LIMITS.noteTitle);
  const body = requireString(item, "body", LIMITS.noteBody);
  if (HTML_TAG.test(title))
    throw invalid("proposedNote.title:html_not_allowed");
  if (HTML_TAG.test(body)) throw invalid("proposedNote.body:html_not_allowed");

  const purpose = requireEnum(item, "purpose", NOTE_PURPOSES);
  const evidenceIds = requireEvidenceIds(item, context);
  if (evidenceIds.length === 0) throw invalid("proposedNote:uncited");

  return {
    title,
    body,
    purpose,
    evidenceIds,
    confidence: requireEnum(item, "confidence", CONFIDENCE_LEVELS),
  };
}

/**
 * Validate a NOTE action-extraction answer.
 *
 * A candidate id the model invented is REJECTED rather than dropped: a proposal
 * that names a Project the owner does not have is evidence the answer is not
 * trustworthy, and silently deleting the field would hide that.
 *
 * A `proposedNotes` field is likewise refused rather than ignored. Note action
 * extraction proposes actions from the current Note; it does not propose more
 * Notes, and an answer that tried to would be answering a different question.
 */
export function validateActionExtraction(
  raw: unknown,
  context: ValidationContext,
): ActionExtractionResult {
  const source = asRecord(raw, "result");
  if ("proposedNotes" in source) throw invalid("proposedNotes:not_supported");
  return {
    kind: "action_extraction",
    ...validateExtractionCore(source, context),
  };
}

/** AI-02 — validate a MEETING extraction answer, including its proposed Notes. */
export function validateMeetingExtraction(
  raw: unknown,
  context: ValidationContext,
): MeetingExtractionResult {
  const source = asRecord(raw, "result");
  const core = validateExtractionCore(source, context);
  const proposedNotes = requireArray(
    source,
    "proposedNotes",
    COUNTS.proposedNotes,
  ).map((entry) => validateProposedNote(entry, context));
  return { kind: "meeting_extraction", ...core, proposedNotes };
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
      return validateMeetingExtraction(raw, context);
    case "note-action-extraction":
      return validateActionExtraction(raw, context);
    case "weekly-review-assistant":
      return validateWeeklyReviewAssistant(raw, context);
    case "workspace-question-answer":
      return validateWorkspaceAnswer(raw, context);
  }
}
