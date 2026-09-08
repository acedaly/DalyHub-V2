/**
 * V2.15 ASSIST — the three proposal validators, at the boundary.
 *
 * A model answer is data until it survives every one of these. What is checked
 * here that V2.14's grounded validator did not have to check is SELECTION: two
 * of the three features answer with integer positions into lists DalyHub sent,
 * and a position outside those lists is a reference to something that does not
 * exist — either invention or a prompt injection that worked. Either way the
 * whole answer is refused rather than having the stray entry trimmed away,
 * because a response containing one fabricated reference is not a response with
 * one bad row in it.
 */

import { describe, expect, it } from "vitest";

import {
  AiError,
  COUNTS,
  FINANCE_CATEGORISATION_SCHEMA,
  LIMITS,
  OBLIGATION_FOLLOW_UP_SCHEMA,
  REVIEW_REFLECTION_SCHEMA,
  buildFactBlock,
  schemaForFeature,
  validateFeatureResult,
  validateFinanceCategorisation,
  validateObligationFollowUp,
  validateReviewReflectionDraft,
  type Fact,
  type ValidationContext,
} from "~/kernel/ai";

/** A block shaped like the one the Finance builder produces. */
function categorisationFacts(rows = 2, options = 3): readonly Fact[] {
  return buildFactBlock({
    intent: "finance_categorisation",
    question: "Which category?",
    subject: "Uncategorised transactions",
    facts: [
      ...Array.from({ length: options }, (_unused, index) => ({
        label: `Category ${index} — Groceries`,
        value: { kind: "state" as const, state: "Money out" },
        display: "Money out",
      })),
      ...Array.from({ length: rows }, (_unused, index) => ({
        label: `Row ${index} — Woolworths Metro (Everyday)`,
        value: {
          kind: "money" as const,
          minorUnits: -4230,
          currencyCode: "AUD",
        },
        display: "-A$42.30 on 2026-09-01",
      })),
    ],
  }).facts;
}

function context(
  facts: readonly Fact[],
  selection: ValidationContext["selection"] = null,
): ValidationContext {
  return {
    evidenceIds: new Set(),
    projectCandidateIds: new Set(),
    personCandidateIds: new Set(),
    linkCandidateIds: new Set(),
    facts,
    selection,
  };
}

/** The refusal reason behind a rejected answer. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (cause) {
    if (cause instanceof AiError) {
      expect(cause.code).toBe("provider_response_invalid");
      return cause.detail ?? "";
    }
    throw cause;
  }
  throw new Error("expected a refusal");
}

/* -------------------------------------------------------------------------- */
/* The schemas the provider is sent                                            */
/* -------------------------------------------------------------------------- */

describe("the schemas leave no field for an invented identifier", () => {
  it("routes each feature to its own schema", () => {
    expect(schemaForFeature("finance-categorisation")).toBe(
      FINANCE_CATEGORISATION_SCHEMA,
    );
    expect(schemaForFeature("obligation-follow-up")).toBe(
      OBLIGATION_FOLLOW_UP_SCHEMA,
    );
    expect(schemaForFeature("review-reflection-draft")).toBe(
      REVIEW_REFLECTION_SCHEMA,
    );
  });

  it("expresses every Finance reference as an integer, never a string id", () => {
    /*
     * The structural half of "the provider may not invent a category id". A
     * validator that rejected an invented id would still have had to receive
     * one; this schema has nowhere to put one.
     */
    const suggestions = (
      FINANCE_CATEGORISATION_SCHEMA.properties as Record<string, JsonLike>
    ).suggestions;
    const item = suggestions.items as Record<string, JsonLike>;
    const properties = item.properties as Record<string, JsonLike>;
    expect(properties.rowIndex.type).toBe("integer");
    expect(properties.categoryIndex.type).toBe("integer");
    expect(Object.keys(properties).sort()).toEqual([
      "categoryIndex",
      "factIds",
      "reason",
      "rowIndex",
    ]);
  });

  it("gives the obligation follow-up no date field at all", () => {
    // The obligation's own due date is the Task's, exactly as the manual
    // `create-task` path has it, so there is no date for a model to infer.
    const tasks = (
      OBLIGATION_FOLLOW_UP_SCHEMA.properties as Record<string, JsonLike>
    ).tasks;
    const item = tasks.items as Record<string, JsonLike>;
    expect(Object.keys(item.properties as object).sort()).toEqual([
      "factIds",
      "reason",
      "title",
    ]);
  });
});

type JsonLike = Record<string, unknown> & { type?: unknown };

/* -------------------------------------------------------------------------- */
/* Finance categorisation                                                      */
/* -------------------------------------------------------------------------- */

describe("Finance categorisation", () => {
  const facts = categorisationFacts(2, 3);
  const ctx = context(facts, { rowCount: 2, optionCount: 3 });
  const rowFact = (row: number) =>
    (facts.find((fact) => fact.label.startsWith(`Row ${row} `)) as Fact).id;

  const ok = {
    status: "ok",
    suggestions: [
      {
        rowIndex: 0,
        categoryIndex: 1,
        reason: "The payee reads like a supermarket.",
        factIds: [rowFact(0)],
      },
    ],
  };

  it("accepts a well-formed answer and keeps the positions", () => {
    const result = validateFinanceCategorisation(ok, ctx);
    expect(result.kind).toBe("finance_categorisation");
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.rowIndex).toBe(0);
    expect(result.suggestions[0]?.categoryIndex).toBe(1);
  });

  it("refuses a row that was never sent", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          { ...ok, suggestions: [{ ...ok.suggestions[0], rowIndex: 2 }] },
          ctx,
        ),
      ),
    ).toBe("rowIndex:out_of_range");
  });

  it("refuses a category that was never offered", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          { ...ok, suggestions: [{ ...ok.suggestions[0], categoryIndex: 3 }] },
          ctx,
        ),
      ),
    ).toBe("categoryIndex:out_of_range");
  });

  it("refuses a fractional, negative or non-numeric position", () => {
    for (const bad of [1.5, -1, Number.NaN, "0", null]) {
      expect(
        refusal(() =>
          validateFinanceCategorisation(
            {
              ...ok,
              suggestions: [{ ...ok.suggestions[0], rowIndex: bad }],
            },
            ctx,
          ),
        ),
        String(bad),
      ).toMatch(/^rowIndex:(not_an_index|out_of_range)$/);
    }
  });

  it("refuses two categories for one transaction", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          {
            status: "ok",
            suggestions: [
              ok.suggestions[0],
              { ...ok.suggestions[0], categoryIndex: 2 },
            ],
          },
          ctx,
        ),
      ),
    ).toBe("suggestion:duplicate_row");
  });

  it("refuses an uncited suggestion", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          { ...ok, suggestions: [{ ...ok.suggestions[0], factIds: [] }] },
          ctx,
        ),
      ),
    ).toBe("suggestion:uncited");
  });

  it("refuses a citation of a fact that was never supplied", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          { ...ok, suggestions: [{ ...ok.suggestions[0], factIds: ["F999"] }] },
          ctx,
        ),
      ),
    ).toBe("factIds:unknown");
  });

  it("refuses a figure the cited fact does not license", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          {
            ...ok,
            suggestions: [
              {
                ...ok.suggestions[0],
                reason: "A charge of $99,999 at this payee.",
              },
            ],
          },
          ctx,
        ),
      ),
    ).toBe("suggestion:ungrounded_figure");
  });

  it("refuses HTML in a reason", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          {
            ...ok,
            suggestions: [
              {
                ...ok.suggestions[0],
                reason: "<img src=x onerror=alert(1)> groceries",
              },
            ],
          },
          ctx,
        ),
      ),
    ).toBe("suggestion:html_not_allowed");
  });

  it("refuses a property DalyHub did not ask for", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          {
            ...ok,
            suggestions: [{ ...ok.suggestions[0], categoryId: "cat-secret" }],
          },
          ctx,
        ),
      ),
    ).toBe("suggestion:unknown_property");
  });

  it("refuses more suggestions than the batch ceiling", () => {
    const many = Array.from(
      { length: COUNTS.categorySuggestions + 1 },
      (_unused, index) => ({ ...ok.suggestions[0], rowIndex: index }),
    );
    expect(
      refusal(() =>
        validateFinanceCategorisation({ status: "ok", suggestions: many }, ctx),
      ),
    ).toBe("suggestions:too_many");
  });

  it("refuses an answer with no selection bounds declared", () => {
    // A feature that selects must declare what it offered. Without it the
    // validator has nothing to check a position against, so it refuses rather
    // than accepting an unchecked index.
    expect(
      refusal(() => validateFinanceCategorisation(ok, context(facts))),
    ).toBe("financeCategorisation:no_selection");
  });

  it("refuses an answer with no facts behind it", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation(
          ok,
          context([], { rowCount: 2, optionCount: 3 }),
        ),
      ),
    ).toBe("financeCategorisation:no_facts");
  });

  it("accepts an honest empty answer", () => {
    const result = validateFinanceCategorisation(
      { status: "insufficient", suggestions: [] },
      ctx,
    );
    expect(result.status).toBe("insufficient");
    expect(result.suggestions).toEqual([]);
  });

  it("refuses a claim of success with nothing behind it", () => {
    expect(
      refusal(() =>
        validateFinanceCategorisation({ status: "ok", suggestions: [] }, ctx),
      ),
    ).toBe("financeCategorisation:no_suggestions");
  });
});

/* -------------------------------------------------------------------------- */
/* Obligation follow-up                                                        */
/* -------------------------------------------------------------------------- */

describe("obligation follow-up", () => {
  const facts = buildFactBlock({
    intent: "obligation_follow_up",
    question: "What should be done?",
    subject: "Electricity",
    facts: [
      {
        label: "Obligation — Electricity",
        value: { kind: "date", iso: "2026-08-01" },
        display: "due 2026-08-01",
      },
      {
        label: "Days past due",
        value: { kind: "count", count: 12 },
        display: "12",
      },
    ],
  }).facts;
  const ctx = context(facts);
  const first = (facts[0] as Fact).id;

  const ok = {
    status: "ok",
    tasks: [
      {
        title: "Ring the retailer",
        reason: "It is past its due date.",
        factIds: [first],
      },
    ],
  };

  it("accepts a well-formed answer", () => {
    const result = validateObligationFollowUp(ok, ctx);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe("Ring the retailer");
  });

  it("refuses HTML in a title", () => {
    expect(
      refusal(() =>
        validateObligationFollowUp(
          {
            ...ok,
            tasks: [{ ...ok.tasks[0], title: "<script>alert(1)</script>" }],
          },
          ctx,
        ),
      ),
    ).toBe("followUpTask:html_not_allowed");
  });

  it("refuses a figure the facts do not license, in the TITLE as well", () => {
    // A title reaches a Task, so a fabricated amount in one would become a
    // record. The grounding rule applies to it exactly as to the reason.
    expect(
      refusal(() =>
        validateObligationFollowUp(
          {
            ...ok,
            tasks: [{ ...ok.tasks[0], title: "Pay the 4,321 dollars owing" }],
          },
          ctx,
        ),
      ),
    ).toBe("followUpTask:ungrounded_figure");
  });

  it("refuses more tasks than the ceiling — the shape of “create 100 tasks”", () => {
    const many = Array.from(
      { length: COUNTS.followUpTasks + 1 },
      (_unused, index) => ({ ...ok.tasks[0], title: `Follow up ${index}` }),
    );
    expect(
      refusal(() =>
        validateObligationFollowUp({ status: "ok", tasks: many }, ctx),
      ),
    ).toBe("tasks:too_many");
  });

  it("refuses an uncited task", () => {
    expect(
      refusal(() =>
        validateObligationFollowUp(
          { ...ok, tasks: [{ ...ok.tasks[0], factIds: [] }] },
          ctx,
        ),
      ),
    ).toBe("followUpTask:uncited");
  });

  it("accepts an honest empty answer", () => {
    expect(
      validateObligationFollowUp({ status: "insufficient", tasks: [] }, ctx)
        .tasks,
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Review reflection draft                                                     */
/* -------------------------------------------------------------------------- */

describe("Review reflection draft", () => {
  const facts = buildFactBlock({
    intent: "weekly_review",
    question: "How did the period go?",
    subject: "Week of 24 August",
    facts: [
      {
        label: "Tasks completed",
        value: { kind: "count", count: 9 },
        display: "9",
      },
    ],
  }).facts;
  const ctx = context(facts);
  const first = (facts[0] as Fact).id;

  it("accepts a cited draft", () => {
    const result = validateReviewReflectionDraft(
      {
        status: "ok",
        draft: "You finished 9 things, which reads as a steady week.",
        factIds: [first],
      },
      ctx,
    );
    expect(result.kind).toBe("review_reflection_draft");
    expect(result.draft).toContain("steady");
  });

  it("refuses a draft with no citation, even when it holds no figure", () => {
    /*
     * Stricter than the grounded explanation rule, and deliberately so. This
     * prose ends up INSIDE the owner's own personal writing; an uncited
     * reflection about their week is prose DalyHub cannot show the working for.
     */
    expect(
      refusal(() =>
        validateReviewReflectionDraft(
          { status: "ok", draft: "It was a good week.", factIds: [] },
          ctx,
        ),
      ),
    ).toBe("reviewReflection:uncited");
  });

  it("refuses a fabricated figure", () => {
    expect(
      refusal(() =>
        validateReviewReflectionDraft(
          {
            status: "ok",
            draft: "You finished 4,321 things this week.",
            factIds: [first],
          },
          ctx,
        ),
      ),
    ).toBe("draft:ungrounded_figure");
  });

  it("refuses HTML", () => {
    expect(
      refusal(() =>
        validateReviewReflectionDraft(
          {
            status: "ok",
            draft: "<img src=x onerror=alert(1)> a steady week.",
            factIds: [first],
          },
          ctx,
        ),
      ),
    ).toBe("reviewReflection:html_not_allowed");
  });

  it("refuses a draft over the ceiling", () => {
    expect(
      refusal(() =>
        validateReviewReflectionDraft(
          {
            status: "ok",
            draft: "a".repeat(LIMITS.reflectionDraft + 1),
            factIds: [first],
          },
          ctx,
        ),
      ),
    ).toBe("draft:too_long");
  });

  it("accepts an honest empty draft, and only when the status says so", () => {
    expect(
      validateReviewReflectionDraft(
        { status: "insufficient", draft: "", factIds: [] },
        ctx,
      ).draft,
    ).toBe("");
    expect(
      refusal(() =>
        validateReviewReflectionDraft(
          { status: "ok", draft: "   ", factIds: [first] },
          ctx,
        ),
      ),
    ).toBe("draft:empty");
  });
});

/* -------------------------------------------------------------------------- */
/* The feature router                                                          */
/* -------------------------------------------------------------------------- */

describe("validateFeatureResult routes the three new features", () => {
  it("uses the categorisation validator for the Finance feature", () => {
    const facts = categorisationFacts(1, 1);
    const result = validateFeatureResult(
      "finance-categorisation",
      {
        status: "ok",
        suggestions: [
          {
            rowIndex: 0,
            categoryIndex: 0,
            reason: "Reads like a supermarket.",
            factIds: [(facts[1] as Fact).id],
          },
        ],
      },
      context(facts, { rowCount: 1, optionCount: 1 }),
    );
    expect(result.kind).toBe("finance_categorisation");
  });
});
