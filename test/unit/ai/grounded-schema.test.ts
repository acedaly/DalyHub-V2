/**
 * V2.14 GROUND-01 — the grounded response boundary.
 *
 * Every case below is an answer a provider might genuinely return, and every
 * assertion names the rule that refuses it. The refusals are the feature: an
 * explanation DalyHub cannot verify is discarded, and the figures the owner was
 * already looking at stay exactly where they were.
 *
 * `AiError.message` is the calm owner-facing sentence and is deliberately the
 * same for every invalid answer; the machine-readable reason lives in `detail`,
 * which is what these tests assert so each one names the rule that fired rather
 * than merely "it threw".
 */

import { describe, expect, it } from "vitest";

import {
  GROUNDED_EXPLANATION_SCHEMA,
  isAiError,
  schemaForFeature,
  validateFeatureResult,
  validateGroundedExplanation,
  type Fact,
  type ValidationContext,
} from "~/kernel/ai";

const FACTS: readonly Fact[] = [
  {
    id: "F1",
    label: "Total spending in August 2026",
    value: { kind: "money", minorUnits: 241032, currencyCode: "AUD" },
    display: "A$2,410.32",
    period: null,
    reference: null,
    note: null,
  },
  {
    id: "F2",
    label: "Total spending in July 2026",
    value: { kind: "money", minorUnits: 198418, currencyCode: "AUD" },
    display: "A$1,984.18",
    period: null,
    reference: null,
    note: null,
  },
  {
    id: "F3",
    label: "Kitchen — recorded at risk at Reviews",
    value: { kind: "ratio", numerator: 3, denominator: 4 },
    display: "3 of 4 Reviews",
    period: null,
    reference: null,
    note: null,
  },
];

const context: ValidationContext = {
  evidenceIds: new Set(),
  projectCandidateIds: new Set(),
  personCandidateIds: new Set(),
  linkCandidateIds: new Set(),
  facts: FACTS,
};

function ok(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "ok",
    summary: "August was the higher of the two months.",
    observations: [
      { text: "Groceries carried most of the difference.", factIds: ["F1"] },
    ],
    ...over,
  };
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isAiError(error)) return error.detail ?? "";
    throw error;
  }
  throw new Error("expected the answer to be refused");
}

describe("the grounded schema DalyHub asks for", () => {
  it("has no field a figure could be returned in", () => {
    const properties = (
      GROUNDED_EXPLANATION_SCHEMA as {
        properties: Record<string, { type?: unknown }>;
      }
    ).properties;
    expect(Object.keys(properties).sort()).toEqual([
      "observations",
      "status",
      "summary",
    ]);
    const serialised = JSON.stringify(GROUNDED_EXPLANATION_SCHEMA);
    expect(serialised).not.toContain('"number"');
    expect(serialised).not.toContain('"integer"');
  });

  it("is the schema both grounded features send", () => {
    expect(schemaForFeature("report-explanation")).toBe(
      GROUNDED_EXPLANATION_SCHEMA,
    );
    expect(schemaForFeature("grounded-question-answer")).toBe(
      GROUNDED_EXPLANATION_SCHEMA,
    );
  });
});

describe("a well-formed grounded answer", () => {
  it("is accepted, and comes back as data rather than as prose", () => {
    const result = validateGroundedExplanation(ok(), context);
    expect(result.kind).toBe("grounded_explanation");
    expect(result.status).toBe("ok");
    expect(result.observations[0]?.factIds).toEqual(["F1"]);
  });

  it("accepts an honest refusal with nothing behind it", () => {
    const result = validateGroundedExplanation(
      {
        status: "insufficient",
        summary: "There isn't enough recorded history to explain that.",
        observations: [],
      },
      context,
    );
    expect(result.status).toBe("insufficient");
    expect(result.observations).toHaveLength(0);
  });

  it("reaches the same validator through the feature switch", () => {
    for (const feature of [
      "report-explanation",
      "grounded-question-answer",
    ] as const) {
      const result = validateFeatureResult(feature, ok(), context);
      expect(result.kind).toBe("grounded_explanation");
    }
  });
});

describe("the refusals", () => {
  it("refuses a citation of a fact id DalyHub did not supply", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({
            observations: [{ text: "Something moved.", factIds: ["F99"] }],
          }),
          context,
        ),
      ),
    ).toBe("factIds:unknown");
  });

  it("refuses an UNCITED observation rather than dropping it", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({ observations: [{ text: "Something moved.", factIds: [] }] }),
          context,
        ),
      ),
    ).toBe("observation:uncited");
  });

  it("refuses a figure no supplied fact holds — the fabrication case", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({
            observations: [{ text: "Spending was $99,999.", factIds: ["F1"] }],
          }),
          context,
        ),
      ),
    ).toBe("observation:ungrounded_figure");
  });

  it("refuses a fabricated figure in the SUMMARY, which carries no citations", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({ summary: "You spent $99,999 in August." }),
          context,
        ),
      ),
    ).toBe("summary:ungrounded_figure");
  });

  it("refuses a figure from a fact the observation did not cite", () => {
    /*
     * F2 holds A$1,984.18 and the observation cites only F1. Citing one fact
     * and quoting another's number is not grounding, and an answer that does it
     * is not one DalyHub can stand behind.
     */
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({
            observations: [
              { text: "July came to A$1,984.18.", factIds: ["F1"] },
            ],
          }),
          context,
        ),
      ),
    ).toBe("observation:ungrounded_figure");
  });

  it("accepts the same claim once it cites the fact it came from", () => {
    const result = validateGroundedExplanation(
      ok({
        observations: [{ text: "July came to A$1,984.18.", factIds: ["F2"] }],
      }),
      context,
    );
    expect(result.observations).toHaveLength(1);
  });

  it("refuses a fabricated RELATIONSHIP between two real numbers", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({
            observations: [
              {
                text: "It was at risk at 4 of the last 4 Reviews.",
                factIds: ["F3"],
              },
            ],
          }),
          context,
        ),
      ),
    ).toBe("observation:ungrounded_comparison");
  });

  it("refuses markup in an observation rather than sanitising it away", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({
            observations: [
              { text: "<img src=x onerror=alert(1)>", factIds: ["F1"] },
            ],
          }),
          context,
        ),
      ),
    ).toBe("observation:html_not_allowed");
  });

  it("refuses a property DalyHub did not ask for", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({ toolCall: "delete_everything" }),
          context,
        ),
      ),
    ).toBe("groundedExplanation:unknown_property");
  });

  it("refuses an observation carrying a field of its own", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          ok({
            observations: [
              { text: "A thing.", factIds: ["F1"], amount: 99999 },
            ],
          }),
          context,
        ),
      ),
    ).toBe("observation:unknown_property");
  });

  it("refuses `ok` with nothing behind it", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(ok({ observations: [] }), context),
      ),
    ).toBe("groundedExplanation:no_observations");
  });

  it("refuses a grounded answer over an EMPTY fact block", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(ok(), { ...context, facts: [] }),
      ),
    ).toBe("groundedExplanation:no_facts");
  });

  it("refuses an answer that is not an object at all", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(
          "Spending went up, mate." as unknown,
          context,
        ),
      ),
    ).toBe("result:not_object");
  });

  it("refuses an unknown status rather than mapping it onto the nearest one", () => {
    expect(
      refusal(() =>
        validateGroundedExplanation(ok({ status: "probably" }), context),
      ),
    ).toBe("status:not_allowed");
  });
});
