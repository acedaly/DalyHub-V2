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
import { checkNumericGrounding, type Fact } from "./fact-block";

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
  /**
   * V2.15 — a proposed Review reflection.
   *
   * Deliberately far below what a hand-written reflection may hold. A draft is
   * a starting point the owner edits before it becomes theirs, never a place
   * for a model to write an essay into the owner's own personal writing.
   */
  reflectionDraft: 2_000,
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
   * V2.14 — observations in a grounded explanation. Six is already more than a
   * report or a comparison honestly supports; DalyHub is not asking for an
   * essay, and a bounded output is a bounded cost.
   */
  observations: 6,
  /** V2.14 — grounded reflection questions in a Weekly Review answer. */
  reflectionQuestions: 3,
  /**
   * AI-02 — at most four proposed Notes per Meeting extraction. One durable
   * summary, one decision record and one open-questions note is already the
   * whole of what the purposes below describe; four leaves one spare rather
   * than inviting a wall of generated prose the owner must wade through.
   */
  proposedNotes: 4,
  /**
   * V2.15 — category suggestions in one Finance batch.
   *
   * The SAME number as the batch bound, because the answer is at most one
   * suggestion per row DalyHub sent. A response carrying more rows than were
   * asked about is refused rather than truncated: an extra row is either a
   * model that invented a transaction or a prompt-injection that succeeded, and
   * neither should be silently trimmed to a plausible size.
   */
  categorySuggestions: 20,
  /**
   * V2.15 — proposed follow-up Tasks for ONE overdue obligation.
   *
   * Three. An overdue electricity bill needs a call, perhaps a payment and
   * perhaps a diary note; a fourth is a list, not a follow-up.
   */
  followUpTasks: 3,
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
  /**
   * V2.14 GROUND-02 — neutral questions worth reflecting on, each cited.
   *
   * A question asserts nothing on its own, but it can still smuggle a figure
   * ("was there a reason for the $4,000 month?"), so it is grounded exactly as
   * a statement is. The prompt's one rule about tone is enforced by the prompt
   * rather than by the validator: a validator cannot tell reproach from
   * curiosity, and pretending otherwise would be theatre.
   */
  readonly reflectionQuestions: readonly CitedStatement[];
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

/* ────────────────────────────────────────────────────────────────────────── */
/* V2.14 — the grounded explanation contract                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * One observation about a FactBlock, and the facts behind it.
 *
 * Note what this shape does NOT have: a number, an amount, a currency, a
 * percentage, a delta, a date field, a record id, a URL or a title. A grounded
 * answer is prose plus citations; every figure the owner reads beside it is
 * rendered by DalyHub from the `Fact` the observation cites. A schema with a
 * number field is a schema that invites a number.
 */
export interface GroundedObservation {
  readonly text: string;
  /** Never empty — an uncited observation is refused, not dropped. */
  readonly factIds: readonly string[];
}

/**
 * The validated result of a grounded explanation.
 *
 * `insufficient` is a SUCCESSFUL answer: "I don't have enough recorded history
 * to explain why that changed" is the correct response more often than a
 * confident one, and the facts stay on screen either way.
 */
export interface GroundedExplanationResult {
  readonly kind: "grounded_explanation";
  readonly status: "ok" | "insufficient";
  readonly summary: string;
  readonly observations: readonly GroundedObservation[];
}

/* ────────────────────────────────────────────────────────────────────────── */
/* V2.15 ASSISTED — proposal result shapes                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * ONE proposed category for ONE transaction.
 *
 * Note what is NOT here: a transaction id, and a category id. Both are
 * INDEXES into lists DalyHub supplied with the request. That is the structural
 * half of "the provider may not invent an id" — there is no field to put one
 * in, so an invented id is not rejected at validation, it is unrepresentable.
 *
 * The reason is prose the owner reads beside the change, and it is subject to
 * the same numeric-grounding rule as every other V2.14 claim: a figure in it
 * must come from a fact the suggestion cites.
 */
export interface ProposedTransactionCategory {
  /** Index into the batch of uncategorised rows DalyHub sent. */
  readonly rowIndex: number;
  /** Index into the ACTIVE category vocabulary DalyHub sent. */
  readonly categoryIndex: number;
  /** Why, in one short sentence the owner reads beside the change. */
  readonly reason: string;
  readonly factIds: readonly string[];
}

/** The validated result of a Finance categorisation request. */
export interface FinanceCategorisationResult {
  readonly kind: "finance_categorisation";
  /**
   * `insufficient` is a legitimate, successful answer: a batch of unfamiliar
   * payees with nothing to go on SHOULD produce no suggestions, and saying so
   * is better than guessing. A row the model has nothing to say about is simply
   * absent from `suggestions`, and the surface renders "No suggestion".
   */
  readonly status: "ok" | "insufficient";
  readonly suggestions: readonly ProposedTransactionCategory[];
}

/**
 * ONE proposed follow-up Task for an overdue obligation.
 *
 * There is no date field, and that is deliberate. The obligation's own due date
 * is the Task's due date — which is what the existing `create-task` intent on
 * `/obligations/mutate` already does — so there is no date for a model to
 * infer and no inferred date for the owner to have to check.
 */
export interface ProposedFollowUpTask {
  readonly title: string;
  readonly reason: string;
  readonly factIds: readonly string[];
}

/** The validated result of an obligation follow-up request. */
export interface ObligationFollowUpResult {
  readonly kind: "obligation_follow_up";
  readonly status: "ok" | "insufficient";
  readonly tasks: readonly ProposedFollowUpTask[];
}

/**
 * The validated result of a Review reflection draft.
 *
 * ONE draft. Not a list of drafts to choose between, and not a partial edit of
 * the owner's existing text: a proposal that arrived as a diff against writing
 * the owner may have changed since would be a proposal whose meaning depends on
 * state nobody re-checked. The draft is whole, and the apply path guards the
 * section it would replace with REVIEW-02's optimistic concurrency.
 */
export interface ReviewReflectionDraftResult {
  readonly kind: "review_reflection_draft";
  readonly status: "ok" | "insufficient";
  /** Plain Markdown prose. Bounded by `LIMITS.reflectionDraft`. */
  readonly draft: string;
  readonly factIds: readonly string[];
}

/** The union every validated AI result belongs to. */
export type AiResult =
  | ActionExtractionResult
  | MeetingExtractionResult
  | WeeklyReviewAssistantResult
  | WorkspaceAnswerResult
  | GroundedExplanationResult
  | FinanceCategorisationResult
  | ObligationFollowUpResult
  | ReviewReflectionDraftResult;

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
  reflectionQuestions: {
    type: "array",
    maxItems: COUNTS.reflectionQuestions,
    description:
      "Neutral questions worth thinking about, each citing what prompted it.",
    items: object({ text: { type: "string" }, evidenceIds: evidenceIdsSchema }),
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

/**
 * V2.14 — the schema for a grounded explanation.
 *
 * The citation array is named `factIds` rather than `evidenceIds` so the two
 * namespaces are visibly separate in the request the provider receives, and so
 * a model that has been asked for facts cannot answer with record excerpts it
 * was not given.
 */
export const GROUNDED_EXPLANATION_SCHEMA: JsonSchema = object({
  status: { type: "string", enum: ["ok", "insufficient"] },
  summary: {
    type: "string",
    description:
      "One or two plain sentences describing what the supplied facts show. No advice, no score, no judgement.",
  },
  observations: {
    type: "array",
    maxItems: COUNTS.observations,
    items: object({
      text: { type: "string" },
      factIds: {
        type: "array",
        items: { type: "string" },
        maxItems: COUNTS.evidenceIdsPerItem,
        description:
          "Fact ids copied exactly from the supplied facts, e.g. F1. Never invent one.",
      },
    }),
  },
});

/* -------------------------------------------------------------------------- */
/* V2.15 ASSISTED — the three proposal schemas                                */
/* -------------------------------------------------------------------------- */

/** A citation array over FACT ids. The V2.15 features cite facts only. */
const factIdsSchema: JsonSchema = {
  type: "array",
  items: { type: "string" },
  maxItems: COUNTS.evidenceIdsPerItem,
  description:
    "Fact ids copied exactly from the supplied facts, e.g. F1. Never invent one.",
};

/**
 * V2.15 — the schema for Finance categorisation.
 *
 * Every reference is an INTEGER INDEX. There is no string id anywhere in this
 * schema, which is why "the provider invents a category id" is not a failure
 * mode this feature has: the answer has nowhere to put one.
 */
export const FINANCE_CATEGORISATION_SCHEMA: JsonSchema = object({
  status: { type: "string", enum: ["ok", "insufficient"] },
  suggestions: {
    type: "array",
    maxItems: COUNTS.categorySuggestions,
    description:
      "At most one entry per supplied row. Omit a row you have nothing to go on for — no suggestion is a better answer than a guess.",
    items: object({
      rowIndex: {
        type: "integer",
        description:
          "The zero-based position of the transaction in the supplied list.",
      },
      categoryIndex: {
        type: "integer",
        description:
          "The zero-based position of the category in the supplied category list. Never a name, never an id.",
      },
      reason: {
        type: "string",
        description:
          "One short sentence. State what in the payee supports the category. No advice.",
      },
      factIds: factIdsSchema,
    }),
  },
});

/**
 * V2.15 — the schema for an obligation follow-up.
 *
 * A title and a reason. No date (the obligation's own due date is used), no
 * project, no priority, no assignee, no recurrence — every one of those is the
 * owner's, set through the ordinary Task surfaces after the Task exists.
 */
export const OBLIGATION_FOLLOW_UP_SCHEMA: JsonSchema = object({
  status: { type: "string", enum: ["ok", "insufficient"] },
  tasks: {
    type: "array",
    maxItems: COUNTS.followUpTasks,
    description:
      "Concrete next actions for this overdue obligation. Fewer is better; an empty list with status insufficient is a legitimate answer.",
    items: object({
      title: {
        type: "string",
        description:
          "An imperative Task title. Plain text, no Markdown, no HTML, no ids.",
      },
      reason: { type: "string" },
      factIds: factIdsSchema,
    }),
  },
});

/**
 * V2.15 — the schema for a Review reflection draft.
 *
 * ONE string. The draft is prose the owner reads, edits and approves; it is not
 * a structure, because a structured reflection would be the product telling the
 * owner what shape their own thinking takes.
 */
export const REVIEW_REFLECTION_SCHEMA: JsonSchema = object({
  status: { type: "string", enum: ["ok", "insufficient"] },
  draft: {
    type: "string",
    description: `Plain Markdown prose in the owner's second person. No headings, no HTML, no record ids, no advice about what they should do next. At most ${LIMITS.reflectionDraft} characters.`,
  },
  factIds: factIdsSchema,
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
    case "report-explanation":
    case "grounded-question-answer":
      return GROUNDED_EXPLANATION_SCHEMA;
    case "finance-categorisation":
      return FINANCE_CATEGORISATION_SCHEMA;
    case "obligation-follow-up":
      return OBLIGATION_FOLLOW_UP_SCHEMA;
    case "review-reflection-draft":
      return REVIEW_REFLECTION_SCHEMA;
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
  /**
   * V2.14 — the FACTS supplied this request, in a citation namespace of their
   * own (`F1`, never `evidence_01`). Empty for a feature that supplies none, in
   * which case every rule below behaves exactly as it did before V2.14.
   *
   * The facts themselves, not just their ids, because the numeric validator
   * needs the values: a citation proves the model named a fact DalyHub
   * supplied, and only the fact's own value proves the FIGURE came from it.
   */
  readonly facts: readonly Fact[];
  /**
   * V2.15 — the CLOSED INDEX SPACES a proposal-producing feature may select
   * from, or `null` for a feature that selects nothing.
   *
   * The Finance categorisation schema expresses every reference as an integer
   * index rather than an id, which makes an invented id unrepresentable. This
   * is the other half: an index OUT OF RANGE is refused, so a model that
   * answers about a twenty-first row in a batch of twenty — or picks the
   * hundredth category of twelve — has its whole answer rejected rather than
   * having the stray entry quietly dropped.
   *
   * Refusing the answer WHOLE rather than filtering it is the same choice the
   * citation validator makes, for the same reason: a response containing one
   * fabricated reference is not a response with one bad row in it, it is a
   * response DalyHub has no reason to trust the rest of.
   */
  readonly selection: {
    /** How many rows the request asked about. */
    readonly rowCount: number;
    /** How many options the request offered. */
    readonly optionCount: number;
  } | null;
}

/** An empty context — nothing may be referenced. */
export const EMPTY_VALIDATION_CONTEXT: ValidationContext = {
  evidenceIds: new Set(),
  projectCandidateIds: new Set(),
  personCandidateIds: new Set(),
  linkCandidateIds: new Set(),
  facts: [],
  selection: null,
};

/** The facts a validated citation list names, in the order they were cited. */
function citedFacts(
  ids: readonly string[],
  context: ValidationContext,
): readonly Fact[] {
  return context.facts.filter((fact) => ids.includes(fact.id));
}

/**
 * Refuse a claim carrying a figure DalyHub did not supply.
 *
 * This is the second half of the grounding guarantee. The first half is
 * structural — a grounded response schema has no numeric field, so the figures
 * the owner reads are rendered by DalyHub from the facts. This half catches the
 * prose: a model that writes a number into a sentence must have taken it from a
 * fact it was given, and an answer that does otherwise is refused whole rather
 * than rendered with one sentence quietly deleted.
 */
function requireGroundedFigures(
  text: string,
  facts: readonly Fact[],
  what: string,
): void {
  // A request that supplied no facts is a pre-V2.14 evidence-backed feature,
  // whose figures are grounded by the excerpts it cites rather than by a block.
  // Applying the numeric rule there would refuse every honest count. The
  // grounded contract refuses an empty block outright instead, below.
  if (facts.length === 0) return;
  const result = checkNumericGrounding(text, facts);
  if (result.grounded) return;
  throw invalid(
    result.ungroundedToken !== null
      ? `${what}:ungrounded_figure`
      : `${what}:ungrounded_comparison`,
  );
}

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

/**
 * A required string, trimmed and bounded.
 *
 * `allowEmpty` exists for exactly one case and is used in exactly one place: a
 * V2.15 draft answered `insufficient`, where "" is the honest value and
 * refusing it would force a model with nothing to say to say something. Every
 * other caller keeps the original behaviour, in which an empty required string
 * is a malformed answer.
 */
function requireString(
  source: Record<string, unknown>,
  key: string,
  max: number,
  options?: { readonly allowEmpty?: boolean },
): string {
  const value = source[key];
  if (typeof value !== "string") throw invalid(`${key}:not_string`);
  const trimmed = value.trim();
  if (trimmed.length === 0 && options?.allowEmpty !== true) {
    throw invalid(`${key}:empty`);
  }
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
 *
 * V2.14 widened the accepted namespace, not the rule: a citation may name an
 * EVIDENCE id (`evidence_01`) or a FACT id (`F1`), and both sets are DalyHub's
 * own. The two namespaces cannot collide by construction, so an id is
 * unambiguously one or the other and an id from neither is still refused.
 */
function requireCitationIds(
  source: Record<string, unknown>,
  context: ValidationContext,
  key = "evidenceIds",
): readonly string[] {
  const raw = requireArray(source, key, COUNTS.evidenceIdsPerItem);
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") throw invalid(`${key}:not_string`);
    const known =
      context.evidenceIds.has(value) ||
      context.facts.some((fact) => fact.id === value);
    if (!known) throw invalid(`${key}:unknown`);
    if (!ids.includes(value)) ids.push(value);
  }
  return ids;
}

/** The pre-V2.14 name, kept so the extraction validators read unchanged. */
const requireEvidenceIds = requireCitationIds;

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

/**
 * Validate a Weekly Review assistant answer.
 *
 * V2.14 — when the request supplied a FactBlock (which, after GROUND-02, it
 * always does), every figure in every sentence must be traceable to one of
 * those facts. The Review's statements cite RECORDS as well as facts, so the
 * numeric check is run against the whole block rather than against one
 * statement's own citations: the assistant is describing a period, and a
 * period's figures are the block's.
 */
export function validateWeeklyReviewAssistant(
  raw: unknown,
  context: ValidationContext,
): WeeklyReviewAssistantResult {
  const source = asRecord(raw, "result");
  const grounded = (text: string, what: string): string => {
    requireGroundedFigures(text, context.facts, what);
    return text;
  };
  const cited = (entry: unknown, what: string): CitedStatement => {
    const item = asRecord(entry, what);
    return {
      text: grounded(requireString(item, "text", LIMITS.line), what),
      evidenceIds: requireEvidenceIds(item, context),
    };
  };

  return {
    kind: "weekly_review_assistant",
    overview: grounded(
      requireString(source, "overview", LIMITS.overview),
      "overview",
    ),
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
        text: grounded(
          requireString(item, "text", LIMITS.line),
          "attentionItem",
        ),
        reason: grounded(
          requireString(item, "reason", LIMITS.reason),
          "attentionItem.reason",
        ),
        evidenceIds: requireEvidenceIds(item, context),
      } satisfies AttentionItem;
    }),
    patterns: requireArray(source, "patterns", COUNTS.patterns).map((entry) => {
      const item = asRecord(entry, "pattern");
      return {
        text: grounded(requireString(item, "text", LIMITS.line), "pattern"),
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
      return grounded(trimmed, "uncertainty");
    }),
    reflectionQuestions: requireArray(
      source,
      "reflectionQuestions",
      COUNTS.reflectionQuestions,
    ).map((entry) => cited(entry, "reflectionQuestion")),
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

/** The keys a grounded explanation may carry, and nothing else. */
const GROUNDED_KEYS = ["status", "summary", "observations"] as const;

/**
 * V2.14 — validate a grounded explanation against the facts behind it.
 *
 * Five refusals, each of them the point rather than a defensive habit:
 *
 *   1. an unknown property means the answer is not the shape asked for;
 *   2. an observation citing nothing is refused, not silently dropped — an
 *      uncited claim rendered beside cited ones is the failure citations exist
 *      to prevent;
 *   3. a citation of an id DalyHub did not supply is refused;
 *   4. a figure in an observation that its OWN cited facts do not license is
 *      refused — citing F1 and then quoting F7's number is not grounding;
 *   5. a figure in the summary or a question that NO supplied fact licenses is
 *      refused, because those carry no citations of their own.
 *
 * `status: "insufficient"` with no observations is a legitimate, successful
 * answer and is accepted as one. `status: "ok"` with nothing behind it is not.
 */
export function validateGroundedExplanation(
  raw: unknown,
  context: ValidationContext,
): GroundedExplanationResult {
  const source = asRecord(raw, "result");
  requireExactKeys(source, GROUNDED_KEYS, "groundedExplanation");
  if (context.facts.length === 0) {
    // A grounded explanation with no facts behind it has nothing to be grounded
    // BY. The runtime refuses this before a provider is contacted; refusing it
    // here too means the guarantee does not depend on the caller.
    throw invalid("groundedExplanation:no_facts");
  }

  const status = requireEnum(source, "status", ["ok", "insufficient"] as const);
  const summary = requireString(source, "summary", LIMITS.summary);

  const observations = requireArray(
    source,
    "observations",
    COUNTS.observations,
  ).map((entry) => {
    const item = asRecord(entry, "observation");
    requireExactKeys(item, ["text", "factIds"], "observation");
    const factIds = requireCitationIds(item, context, "factIds");
    if (factIds.length === 0) throw invalid("observation:uncited");
    const text = requireString(item, "text", LIMITS.line);
    if (HTML_TAG.test(text)) throw invalid("observation:html_not_allowed");
    requireGroundedFigures(text, citedFacts(factIds, context), "observation");
    return { text, factIds } satisfies GroundedObservation;
  });

  if (status === "ok" && observations.length === 0) {
    throw invalid("groundedExplanation:no_observations");
  }

  if (HTML_TAG.test(summary)) throw invalid("summary:html_not_allowed");
  requireGroundedFigures(summary, context.facts, "summary");

  return { kind: "grounded_explanation", status, summary, observations };
}

/* -------------------------------------------------------------------------- */
/* V2.15 ASSISTED — the three proposal validators                             */
/* -------------------------------------------------------------------------- */

/**
 * Read an integer index and prove it names something DalyHub actually supplied.
 *
 * `Number.isSafeInteger` rather than `typeof === "number"` because `1.5`, `NaN`,
 * `Infinity` and `-0` are all numbers and none of them is a position in a list.
 */
function requireIndex(
  source: Record<string, unknown>,
  key: string,
  size: number,
): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalid(`${key}:not_an_index`);
  }
  if (value < 0 || value >= size) throw invalid(`${key}:out_of_range`);
  return value;
}

/** The selection bounds, or a refusal. A feature that selects must declare them. */
function requireSelection(
  context: ValidationContext,
  what: string,
): { readonly rowCount: number; readonly optionCount: number } {
  if (context.selection === null) throw invalid(`${what}:no_selection`);
  return context.selection;
}

/**
 * V2.15 — validate a Finance categorisation answer.
 *
 * Six refusals, each closing a specific hole:
 *
 *   1. no facts supplied → the answer had nothing to be grounded by;
 *   2. an unknown key → the answer is not the shape DalyHub asked for;
 *   3. a `rowIndex` outside the batch → the model answered about a transaction
 *      that was not sent, which is either invention or an injection that
 *      worked;
 *   4. a `categoryIndex` outside the vocabulary → the same, for categories;
 *   5. a DUPLICATE `rowIndex` → two categories for one transaction is not a
 *      suggestion, it is an ambiguity the owner would have to resolve by
 *      guessing which one the surface happened to render;
 *   6. a figure in a reason that its own cited facts do not license → V2.14's
 *      numeric grounding rule, unchanged and applied here too.
 */
export function validateFinanceCategorisation(
  raw: unknown,
  context: ValidationContext,
): FinanceCategorisationResult {
  const source = asRecord(raw, "result");
  requireExactKeys(source, ["status", "suggestions"], "financeCategorisation");
  if (context.facts.length === 0) {
    throw invalid("financeCategorisation:no_facts");
  }
  const bounds = requireSelection(context, "financeCategorisation");

  const status = requireEnum(source, "status", ["ok", "insufficient"] as const);
  const seen = new Set<number>();
  const suggestions = requireArray(
    source,
    "suggestions",
    COUNTS.categorySuggestions,
  ).map((entry) => {
    const item = asRecord(entry, "suggestion");
    requireExactKeys(
      item,
      ["rowIndex", "categoryIndex", "reason", "factIds"],
      "suggestion",
    );
    const rowIndex = requireIndex(item, "rowIndex", bounds.rowCount);
    if (seen.has(rowIndex)) throw invalid("suggestion:duplicate_row");
    seen.add(rowIndex);
    const categoryIndex = requireIndex(
      item,
      "categoryIndex",
      bounds.optionCount,
    );
    const factIds = requireCitationIds(item, context, "factIds");
    if (factIds.length === 0) throw invalid("suggestion:uncited");
    const reason = requireString(item, "reason", LIMITS.reason);
    if (HTML_TAG.test(reason)) throw invalid("suggestion:html_not_allowed");
    requireGroundedFigures(reason, citedFacts(factIds, context), "suggestion");
    return {
      rowIndex,
      categoryIndex,
      reason,
      factIds,
    } satisfies ProposedTransactionCategory;
  });

  // `ok` with nothing behind it is the one contradiction worth refusing: an
  // answer that claims to have categorised something and then names nothing.
  // `insufficient` with an empty list is the honest form of the same outcome.
  if (status === "ok" && suggestions.length === 0) {
    throw invalid("financeCategorisation:no_suggestions");
  }

  return { kind: "finance_categorisation", status, suggestions };
}

/**
 * V2.15 — validate an obligation follow-up answer.
 *
 * The title is refused if it carries HTML or exceeds DalyHub's own Task title
 * ceiling — the SAME ceiling the acceptance re-applies, because bounding what a
 * model may return and bounding what an owner may submit are two different
 * jobs and neither substitutes for the other.
 */
export function validateObligationFollowUp(
  raw: unknown,
  context: ValidationContext,
): ObligationFollowUpResult {
  const source = asRecord(raw, "result");
  requireExactKeys(source, ["status", "tasks"], "obligationFollowUp");
  if (context.facts.length === 0) {
    throw invalid("obligationFollowUp:no_facts");
  }

  const status = requireEnum(source, "status", ["ok", "insufficient"] as const);
  const tasks = requireArray(source, "tasks", COUNTS.followUpTasks).map(
    (entry) => {
      const item = asRecord(entry, "followUpTask");
      requireExactKeys(item, ["title", "reason", "factIds"], "followUpTask");
      const factIds = requireCitationIds(item, context, "factIds");
      if (factIds.length === 0) throw invalid("followUpTask:uncited");
      const title = requireString(item, "title", LIMITS.title);
      if (HTML_TAG.test(title)) throw invalid("followUpTask:html_not_allowed");
      const reason = requireString(item, "reason", LIMITS.reason);
      if (HTML_TAG.test(reason)) throw invalid("followUpTask:html_not_allowed");
      requireGroundedFigures(
        title,
        citedFacts(factIds, context),
        "followUpTask",
      );
      requireGroundedFigures(
        reason,
        citedFacts(factIds, context),
        "followUpTask",
      );
      return { title, reason, factIds } satisfies ProposedFollowUpTask;
    },
  );

  if (status === "ok" && tasks.length === 0) {
    throw invalid("obligationFollowUp:no_tasks");
  }

  return { kind: "obligation_follow_up", status, tasks };
}

/**
 * V2.15 — validate a Review reflection draft.
 *
 * The strictest of the three, because this is the one whose output is written
 * INTO the owner's own personal writing. Every figure in the draft must be
 * licensed by a fact it cites; a draft with no citation at all is refused even
 * when it contains no figure, because an uncited reflection is prose about the
 * owner's week that DalyHub cannot show the working for.
 */
export function validateReviewReflectionDraft(
  raw: unknown,
  context: ValidationContext,
): ReviewReflectionDraftResult {
  const source = asRecord(raw, "result");
  requireExactKeys(source, ["status", "draft", "factIds"], "reviewReflection");
  if (context.facts.length === 0) throw invalid("reviewReflection:no_facts");

  const status = requireEnum(source, "status", ["ok", "insufficient"] as const);
  const factIds = requireCitationIds(source, context, "factIds");
  const draft = requireString(source, "draft", LIMITS.reflectionDraft, {
    allowEmpty: status === "insufficient",
  });
  if (HTML_TAG.test(draft)) throw invalid("reviewReflection:html_not_allowed");

  if (status === "ok") {
    // An empty `ok` draft was already refused above as `draft:empty`:
    // `allowEmpty` is on only for `insufficient`, which is the one status for
    // which "" is the honest value.
    if (factIds.length === 0) throw invalid("reviewReflection:uncited");
    requireGroundedFigures(draft, citedFacts(factIds, context), "draft");
  }

  return { kind: "review_reflection_draft", status, draft, factIds };
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
    case "report-explanation":
    case "grounded-question-answer":
      return validateGroundedExplanation(raw, context);
    case "finance-categorisation":
      return validateFinanceCategorisation(raw, context);
    case "obligation-follow-up":
      return validateObligationFollowUp(raw, context);
    case "review-reflection-draft":
      return validateReviewReflectionDraft(raw, context);
  }
}
