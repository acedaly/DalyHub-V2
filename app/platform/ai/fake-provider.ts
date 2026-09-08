/**
 * V2.14 GROUND-00 — the deterministic development provider (DEBT-237).
 *
 * ## Why this exists
 *
 * Every claim the AI platform makes ABOVE the adapter seam is covered by tests.
 * Every claim BELOW it is documentation, because no provider credential has ever
 * existed in any environment this repository builds in
 * ([`AI_PLATFORM.md` §21](../../../docs/development/AI_PLATFORM.md)). That is a
 * gap in the evidence, not in the code, and it is the reason the AI gate has
 * been a tripwire rather than a release: a thoroughly mocked platform with every
 * suite green is precisely the evidence that does not settle the question.
 *
 * This adapter closes it. It answers like a maximally obedient model — it reads
 * the ids DalyHub supplied and cites them — and it sits at the ADAPTER seam, so
 * everything above it is the code a real provider runs:
 *
 *   preference gate → feature policy → privacy filter → token estimate →
 *   budget reservation → ledger row → retry and fallback plan → schema
 *   validation → citation validation → numeric grounding → reconciliation →
 *   release
 *
 * Not one of those is bypassed, stubbed or short-circuited. What is simulated is
 * exactly one thing: the network call.
 *
 * ## Why it cannot reach production
 *
 * Two independent keys, the same rule the development authenticator uses
 * (`auth-configuration.ts`): `AI_FAKE_PROVIDER=1` **and** an explicit
 * development or test `ENVIRONMENT`. A production deploy sets
 * `ENVIRONMENT=production` in `wrangler.jsonc`, so the second key can never be
 * turned by a stray variable, and `test/unit/ai/fake-provider.test.ts` asserts
 * the refusal directly against a production-shaped environment.
 *
 * Production code never learns this exists: `resolveAiConfiguration` builds it
 * in place of a real adapter and returns the same `AiProviderAdapter` shape, so
 * the runtime, the routes and every surface are unchanged and unaware.
 */

import {
  AiError,
  estimateTokens,
  isFactIdShape,
  type AiFeatureId,
  type AiProvider,
  type AiProviderAdapter,
  type StructuredRequest,
  type StructuredResponse,
} from "~/kernel/ai";

/**
 * The behaviours the development provider can be asked for.
 *
 * Every one of them exercises a REAL failure path in the platform rather than a
 * branch invented for testing: `timeout`, `unavailable` and `rate_limited` are
 * transient and drive the retry/fallback policy; `refusal` is terminal;
 * `malformed`, `unknown_fact`, `uncited` and `fabricated_figure` all produce a
 * response the provider is happy with and DalyHub's own validator refuses, each
 * for a different documented reason.
 */
export const FAKE_PROVIDER_SCENARIOS = [
  "success",
  "insufficient",
  "timeout",
  "unavailable",
  "rate_limited",
  "refusal",
  "malformed",
  "unknown_fact",
  "uncited",
  "fabricated_figure",
  "fabricated_comparison",
  "html_injection",
  "expensive",
  /*
   * V2.15 — three refusals that only a PROPOSAL feature can produce, and each
   * is a real validator path rather than a branch invented for testing:
   *
   *   - `out_of_range` answers about a row, or picks a category, that was never
   *     sent. It is what an obedient model would never do and a prompt
   *     injection would love to;
   *   - `duplicate_row` proposes two categories for one transaction, which is
   *     an ambiguity the owner would have to resolve by guessing which one the
   *     surface happened to render;
   *   - `overreach` returns more items than the schema's ceiling permits, which
   *     is the shape "create 100 tasks" arrives in.
   */
  "out_of_range",
  "duplicate_row",
  "overreach",
] as const;

export type FakeProviderScenario = (typeof FAKE_PROVIDER_SCENARIOS)[number];

export function isFakeProviderScenario(
  value: unknown,
): value is FakeProviderScenario {
  return (
    typeof value === "string" &&
    (FAKE_PROVIDER_SCENARIOS as readonly string[]).includes(value)
  );
}

/** Environments in which the development provider may run. */
const DEVELOPMENT_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "development",
  "test",
]);

/** The two bindings that, together and only together, enable it. */
export interface FakeProviderEnv {
  readonly AI_FAKE_PROVIDER?: string;
  readonly ENVIRONMENT?: string;
}

/**
 * True when the development provider may be constructed.
 *
 * BOTH keys are required, and the environment key is the one that cannot be
 * turned by accident: a production deploy pins `ENVIRONMENT=production`, so
 * setting `AI_FAKE_PROVIDER` there changes nothing at all.
 */
export function fakeProviderEnabled(env: FakeProviderEnv): boolean {
  const flag = (env.AI_FAKE_PROVIDER ?? "").trim();
  if (flag !== "1" && flag.toLowerCase() !== "true") return false;
  const environment = (env.ENVIRONMENT ?? "").trim().toLowerCase();
  return DEVELOPMENT_ENVIRONMENTS.has(environment);
}

/** What the adapter is constructed with. Never a key: there isn't one. */
export interface FakeAdapterConfig {
  /** The provider it impersonates, so the ledger and the plan read normally. */
  readonly provider: AiProvider;
  readonly featureId: AiFeatureId;
  /** The behaviour to produce. Defaults to `success`. */
  readonly scenario?: FakeProviderScenario;
}

/* -------------------------------------------------------------------------- */
/* Reading the request                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The fact ids DalyHub put in the request, in order.
 *
 * Parsed out of the rendered block exactly as a model would read them, which is
 * the point: the adapter has no privileged channel to DalyHub's state and can
 * only cite what the prompt actually carried. A bug that failed to send the
 * facts would produce an uncited answer here, and be caught.
 */
function factIdsIn(userMessage: string): readonly string[] {
  const ids: string[] = [];
  for (const match of userMessage.matchAll(/^(F[1-9][0-9]*): /gm)) {
    const id = match[1];
    if (id !== undefined && isFactIdShape(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/** The evidence ids DalyHub put in the request, in order. */
function evidenceIdsIn(userMessage: string): readonly string[] {
  const ids: string[] = [];
  for (const match of userMessage.matchAll(/^id: (evidence_[0-9]{2,})$/gm)) {
    const id = match[1];
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The `Fn: label = display` lines, so an answer can restate a real figure. */
function factLines(userMessage: string): readonly {
  readonly id: string;
  readonly label: string;
  readonly display: string;
}[] {
  const lines: { id: string; label: string; display: string }[] = [];
  for (const match of userMessage.matchAll(
    /^(F[1-9][0-9]*): (.+?) = (.+)$/gm,
  )) {
    const [, id, label, display] = match;
    if (id !== undefined && label !== undefined && display !== undefined) {
      lines.push({ id, label, display });
    }
  }
  return lines;
}

/* -------------------------------------------------------------------------- */
/* The adapter                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build the development adapter.
 *
 * It reports token usage from the same estimator the runtime budgets with, so
 * the reservation, the reconciliation and the ledger all move exactly as they
 * would against a real provider — a run against this adapter spends budget,
 * writes a usage row and can exhaust a daily allowance.
 */
export function createFakeAdapter(
  config: FakeAdapterConfig,
): AiProviderAdapter {
  const scenario = config.scenario ?? "success";
  return {
    provider: config.provider,
    complete: async (request) => fakeComplete(config, scenario, request),
  };
}

async function fakeComplete(
  config: FakeAdapterConfig,
  scenario: FakeProviderScenario,
  request: StructuredRequest,
): Promise<StructuredResponse> {
  // Cancellation is honoured exactly as the real adapters honour it, so the
  // route's abort path is the same code in both.
  if (request.signal?.aborted === true) throw new AiError("cancelled");

  switch (scenario) {
    case "timeout":
      throw new AiError("provider_timeout");
    case "unavailable":
      throw new AiError("provider_unavailable");
    case "rate_limited":
      throw new AiError("rate_limited");
    case "refusal":
      throw new AiError("provider_rejected_request");
    default:
      break;
  }

  const inputTokens = estimateTokens(
    `${request.system}\n${request.userMessage}`,
  );
  const value = fakeValue(config.featureId, scenario, request.userMessage);
  const outputTokens =
    scenario === "expensive"
      ? request.maxOutputTokens
      : Math.min(
          request.maxOutputTokens,
          estimateTokens(JSON.stringify(value ?? "")),
        );

  return {
    value,
    usage: { inputTokens, outputTokens },
    // A stable, non-identifying correlation id. Never a token, never a key.
    providerResponseId: `fake_${config.featureId}_${scenario}`,
    provider: config.provider,
    modelId: request.model.id,
  };
}

/** The body the adapter "receives". Untrusted from here on, exactly as usual. */
function fakeValue(
  featureId: AiFeatureId,
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  if (scenario === "malformed") {
    // Not an object at all. `asRecord` refuses it at the boundary.
    return "The answer is that spending went up.";
  }

  switch (featureId) {
    case "report-explanation":
    case "grounded-question-answer":
      return groundedValue(scenario, userMessage);
    case "weekly-review-assistant":
      return weeklyReviewValue(scenario, userMessage);
    case "workspace-question-answer":
      return workspaceAnswerValue(scenario, userMessage);
    case "meeting-action-extraction":
    case "note-action-extraction":
      return extractionValue(featureId, userMessage);
    case "finance-categorisation":
      return categorisationValue(scenario, userMessage);
    case "obligation-follow-up":
      return followUpValue(scenario, userMessage);
    case "review-reflection-draft":
      return reflectionValue(scenario, userMessage);
  }
}

/**
 * A grounded explanation.
 *
 * The `success` answer is deliberately written the way the prompt asks a real
 * model to write: direction and cause in words, the figures restated verbatim
 * from the facts, and every observation citing the ids it is about.
 */
function groundedValue(
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  const ids = factIdsIn(userMessage);
  const lines = factLines(userMessage);
  const first = ids[0] ?? "F1";
  const second = ids[1] ?? first;

  if (scenario === "insufficient" || ids.length === 0) {
    return {
      status: "insufficient",
      summary:
        "There is not enough recorded history here to explain what changed.",
      observations: [],
    };
  }

  if (scenario === "unknown_fact") {
    return {
      status: "ok",
      summary: "Spending moved between the two periods.",
      observations: [
        { text: "The larger share came from one category.", factIds: ["F999"] },
      ],
    };
  }

  if (scenario === "uncited") {
    return {
      status: "ok",
      summary: "Spending moved between the two periods.",
      observations: [
        {
          text: "Something changed, but I would rather not say what.",
          factIds: [],
        },
      ],
    };
  }

  if (scenario === "fabricated_figure") {
    return {
      status: "ok",
      summary: "Spending was $99,999 across the period.",
      observations: [{ text: "The total came to $99,999.", factIds: [first] }],
    };
  }

  if (scenario === "fabricated_comparison") {
    // Both numbers are real; the RELATIONSHIP between them is invented.
    return {
      status: "ok",
      summary: "The pattern held.",
      observations: [
        { text: "That happened in 4 of the last 4 periods.", factIds: [first] },
      ],
    };
  }

  if (scenario === "html_injection") {
    return {
      status: "ok",
      summary: "Spending moved between the two periods.",
      observations: [
        {
          text: "<img src=x onerror=alert(1)> the total moved.",
          factIds: [first],
        },
      ],
    };
  }

  const named = lines.slice(0, 2);
  const observations = named.map((line, index) => ({
    text:
      index === 0
        ? `${line.label} is the largest single figure here, at ${line.display}.`
        : `${line.label} sits alongside it, at ${line.display}.`,
    factIds: [line.id],
  }));

  return {
    status: "ok",
    summary:
      named.length > 1
        ? `The period is dominated by ${named[0]?.label ?? "one figure"}, with ${named[1]?.label ?? "the rest"} behind it.`
        : `The period is dominated by ${named[0]?.label ?? "one figure"}.`,
    observations:
      observations.length > 0
        ? observations
        : [{ text: "The figures are shown beside this.", factIds: [second] }],
  };
}

/** A Weekly Review answer, citing both a fact and a record. */
function weeklyReviewValue(
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  const factIds = factIdsIn(userMessage);
  const evidenceIds = evidenceIdsIn(userMessage);
  const citations = [factIds[0], evidenceIds[0]].filter(
    (id): id is string => id !== undefined,
  );
  const lines = factLines(userMessage);

  if (scenario === "fabricated_figure") {
    return {
      overview: "You completed 4,321 things this week.",
      notableProgress: [],
      attentionItems: [],
      patterns: [],
      proposedNextWeekPriorities: [],
      uncertainties: [],
      reflectionQuestions: [],
    };
  }

  const first = lines[0];
  return {
    overview:
      first === undefined
        ? "This is a quiet period in the records."
        : `${first.label} stands at ${first.display} for this period.`,
    notableProgress:
      citations.length > 0 && first !== undefined
        ? [
            {
              text: `${first.label}: ${first.display}.`,
              evidenceIds: citations,
            },
          ]
        : [],
    attentionItems: [],
    patterns:
      citations.length > 0
        ? [
            {
              text: "The period reads as steady rather than eventful.",
              evidenceIds: citations,
              classification: "inference",
            },
          ]
        : [],
    proposedNextWeekPriorities: [],
    uncertainties: ["Nothing here says why anything moved."],
    reflectionQuestions:
      citations.length > 0
        ? [
            {
              text: "Is there anything about this period worth writing down?",
              evidenceIds: citations,
            },
          ]
        : [],
  };
}

/** An evidence-backed Ask answer, unchanged in shape from AI-01. */
function workspaceAnswerValue(
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  const ids = evidenceIdsIn(userMessage);
  if (scenario === "insufficient" || ids.length === 0) {
    return {
      status: "insufficient_evidence",
      summary: "I could not find enough in your records to answer that.",
      statements: [],
      uncertainties: [],
    };
  }
  return {
    status: "answered",
    summary: "Here is what your records show.",
    statements: [
      {
        text: "The records below are the ones that matched.",
        evidenceIds: [ids[0] as string],
        classification: "observation",
      },
    ],
    uncertainties: [],
  };
}

/** An extraction answer that proposes nothing. Deliberately conservative. */
function extractionValue(featureId: AiFeatureId, userMessage: string): unknown {
  const ids = evidenceIdsIn(userMessage);
  const core = {
    summary: "A short, neutral description of the record.",
    decisions: [],
    proposedTasks: [],
    unresolvedQuestions:
      ids.length > 0
        ? [{ text: "What happens next?", evidenceIds: [ids[0] as string] }]
        : [],
    suggestedLinks: [],
  };
  return featureId === "meeting-action-extraction"
    ? { ...core, proposedNotes: [] }
    : core;
}

/* -------------------------------------------------------------------------- */
/* V2.15 ASSISTED                                                              */
/* -------------------------------------------------------------------------- */

/** The `Row N` / `Category N` positions DalyHub numbered in the block. */
function positionsIn(userMessage: string, word: "Row" | "Category"): number {
  let highest = -1;
  for (const match of userMessage.matchAll(
    new RegExp(`^F[1-9][0-9]*: ${word} ([0-9]+) `, "gm"),
  )) {
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }
  return highest + 1;
}

/** The fact id DalyHub gave one numbered position, so the answer can cite it. */
function factIdForPosition(
  userMessage: string,
  word: "Row" | "Category",
  position: number,
): string | null {
  const match = new RegExp(`^(F[1-9][0-9]*): ${word} ${position} `, "m").exec(
    userMessage,
  );
  return match?.[1] ?? null;
}

/**
 * A Finance categorisation answer.
 *
 * The `success` answer suggests the FIRST category for every row it was sent,
 * which is deliberately mechanical: this adapter is not pretending to be good
 * at categorising, it is proving that a well-formed answer travels the whole
 * platform — validation, index resolution, review, acceptance, replay and undo
 * — exactly as a real one would.
 */
function categorisationValue(
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  const rows = positionsIn(userMessage, "Row");
  const options = positionsIn(userMessage, "Category");

  if (scenario === "insufficient" || rows === 0 || options === 0) {
    return { status: "insufficient", suggestions: [] };
  }

  const cite = (row: number): readonly string[] => {
    const id = factIdForPosition(userMessage, "Row", row);
    return id === null ? [] : [id];
  };

  if (scenario === "out_of_range") {
    // A row that was never sent. The validator refuses the WHOLE answer.
    return {
      status: "ok",
      suggestions: [
        {
          rowIndex: rows,
          categoryIndex: 0,
          reason: "A row that was not sent.",
          factIds: cite(0),
        },
      ],
    };
  }

  if (scenario === "duplicate_row") {
    return {
      status: "ok",
      suggestions: [
        {
          rowIndex: 0,
          categoryIndex: 0,
          reason: "The first category.",
          factIds: cite(0),
        },
        {
          rowIndex: 0,
          categoryIndex: options > 1 ? 1 : 0,
          reason: "And also the second.",
          factIds: cite(0),
        },
      ],
    };
  }

  if (scenario === "overreach") {
    // What "create 100 suggestions" looks like when it reaches the boundary.
    return {
      status: "ok",
      suggestions: Array.from({ length: 100 }, (_unused, index) => ({
        rowIndex: index % Math.max(rows, 1),
        categoryIndex: 0,
        reason: "Everything is this category.",
        factIds: cite(0),
      })),
    };
  }

  if (scenario === "uncited") {
    return {
      status: "ok",
      suggestions: [
        {
          rowIndex: 0,
          categoryIndex: 0,
          reason: "No reason given.",
          factIds: [],
        },
      ],
    };
  }

  if (scenario === "fabricated_figure") {
    return {
      status: "ok",
      suggestions: [
        {
          rowIndex: 0,
          categoryIndex: 0,
          reason: "A charge of $99,999 at this payee.",
          factIds: cite(0),
        },
      ],
    };
  }

  if (scenario === "html_injection") {
    return {
      status: "ok",
      suggestions: [
        {
          rowIndex: 0,
          categoryIndex: 0,
          reason: "<img src=x onerror=alert(1)> groceries.",
          factIds: cite(0),
        },
      ],
    };
  }

  return {
    status: "ok",
    suggestions: Array.from({ length: rows }, (_unused, row) => ({
      rowIndex: row,
      categoryIndex: 0,
      reason: "The payee reads like this category.",
      factIds: cite(row),
    })).filter((entry) => entry.factIds.length > 0),
  };
}

/** An obligation follow-up answer. One Task, imperative, citing the facts. */
function followUpValue(
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  const ids = factIdsIn(userMessage);
  const first = ids[0];

  if (scenario === "insufficient" || first === undefined) {
    return { status: "insufficient", tasks: [] };
  }
  if (scenario === "uncited") {
    return {
      status: "ok",
      tasks: [{ title: "Do something", reason: "Because.", factIds: [] }],
    };
  }
  if (scenario === "unknown_fact") {
    return {
      status: "ok",
      tasks: [
        { title: "Ring them", reason: "It is overdue.", factIds: ["F999"] },
      ],
    };
  }
  if (scenario === "fabricated_figure") {
    return {
      status: "ok",
      tasks: [
        {
          title: "Pay the 4,321 dollars owing",
          reason: "It is overdue.",
          factIds: [first],
        },
      ],
    };
  }
  if (scenario === "html_injection") {
    return {
      status: "ok",
      tasks: [
        {
          title: "<script>alert(1)</script>",
          reason: "It is overdue.",
          factIds: [first],
        },
      ],
    };
  }
  if (scenario === "overreach") {
    return {
      status: "ok",
      tasks: Array.from({ length: 50 }, (_unused, index) => ({
        title: `Follow up ${index}`,
        reason: "It is overdue.",
        factIds: [first],
      })),
    };
  }

  return {
    status: "ok",
    tasks: [
      {
        title: "Chase this up",
        reason: "It is past its due date and nothing is open for it.",
        factIds: [first],
      },
    ],
  };
}

/** A Review reflection draft. Prose, in the second person, citing a fact. */
function reflectionValue(
  scenario: FakeProviderScenario,
  userMessage: string,
): unknown {
  const ids = factIdsIn(userMessage);
  const lines = factLines(userMessage);
  const first = ids[0];

  if (scenario === "insufficient" || first === undefined) {
    return { status: "insufficient", draft: "", factIds: [] };
  }
  if (scenario === "uncited") {
    return {
      status: "ok",
      draft: "Something happened this week.",
      factIds: [],
    };
  }
  if (scenario === "unknown_fact") {
    return {
      status: "ok",
      draft: "Something happened this week.",
      factIds: ["F999"],
    };
  }
  if (scenario === "fabricated_figure") {
    return {
      status: "ok",
      draft: "You finished 4,321 things this week.",
      factIds: [first],
    };
  }
  if (scenario === "html_injection") {
    return {
      status: "ok",
      draft: "<img src=x onerror=alert(1)> a steady week.",
      factIds: [first],
    };
  }

  const named = lines[0];
  return {
    status: "ok",
    draft:
      named === undefined
        ? "This reads as a steady period rather than an eventful one."
        : `${named.label} stands at ${named.display} for this period. That reads as steady rather than eventful, and there is nothing here that says why.`,
    factIds: [first],
  };
}
