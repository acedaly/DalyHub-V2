/**
 * V2.15 ASSIST — the shared proposal view model.
 *
 * Two properties are load-bearing here and both used to be prose:
 *
 *   1. **Nothing starts selected.** A panel that arrives with everything ticked
 *      makes "Apply selected" mean "apply everything I have not yet read".
 *   2. **A POSITION resolves to an id here, and only here.** The provider
 *      answers with indexes into lists DalyHub sent; this file looks them up in
 *      the SAME lists, and drops a suggestion whose position does not resolve.
 *      Never invents a target from a partial answer.
 */

import { describe, expect, it } from "vitest";

import type {
  FinanceCategorisationResult,
  ObligationFollowUpResult,
  ReviewReflectionDraftResult,
} from "~/kernel/ai";
import {
  applySummary,
  asCategorisationContext,
  asFollowUpContext,
  asReflectionContext,
  categorisationItem,
  categorisationRows,
  followUpItem,
  followUpRows,
  patchRow,
  proposalOutcomeLabel,
  reflectionItem,
  reflectionRows,
  selectedRows,
  setAllSelected,
  type CategorisationContext,
} from "~/shared/ai";

const money = (minor: number, code: string) =>
  `${code} ${(minor / 100).toFixed(2)}`;

const CONTEXT: CategorisationContext = {
  rows: [
    {
      transactionId: "txn-1",
      payeeDisplay: "NORTHWIND GROCERS",
      accountTitle: "Everyday",
      amountMinor: -4230,
      currencyCode: "AUD",
      occurredOn: "2026-09-02",
    },
    {
      transactionId: "txn-2",
      payeeDisplay: "SYNTH CAFE 001",
      accountTitle: "Everyday",
      amountMinor: -650,
      currencyCode: "AUD",
      occurredOn: "2026-09-03",
    },
  ],
  options: [
    { categoryId: "cat-groceries", name: "Groceries", kind: "spending" },
    { categoryId: "cat-income", name: "Salary", kind: "income" },
  ],
  deterministicallyAnswered: 13,
};

function categorisation(
  suggestions: FinanceCategorisationResult["suggestions"],
): FinanceCategorisationResult {
  return { kind: "finance_categorisation", status: "ok", suggestions };
}

describe("categorisation rows", () => {
  it("resolves a position into an id, and starts nothing selected", () => {
    const rows = categorisationRows(
      categorisation([
        {
          rowIndex: 0,
          categoryIndex: 0,
          reason: "Reads like a supermarket.",
          factIds: ["F3"],
        },
      ]),
      CONTEXT,
      money,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("txn-1");
    expect(rows[0]?.chosenOptionId).toBe("cat-groceries");
    expect(rows[0]?.proposedLabel).toBe("Groceries");
    expect(rows[0]?.currentLabel).toBe("Uncategorised");
    expect(rows[0]?.selected).toBe(false);
    expect(rows[0]?.context).toContain("Everyday");
    expect(rows[0]?.context).toContain("2026-09-02");
  });

  it("drops a suggestion whose position resolves to nothing", () => {
    /*
     * The validator already refuses an out-of-range index, so reaching this is
     * a bug rather than an attack — and a bug should lose a suggestion, never
     * invent a target.
     */
    const rows = categorisationRows(
      categorisation([
        { rowIndex: 9, categoryIndex: 0, reason: "?", factIds: ["F1"] },
        { rowIndex: 0, categoryIndex: 9, reason: "?", factIds: ["F1"] },
      ]),
      CONTEXT,
      money,
    );
    expect(rows).toEqual([]);
  });

  it("offers every supplied category, with its kind in words", () => {
    const rows = categorisationRows(
      categorisation([
        { rowIndex: 0, categoryIndex: 0, reason: "x", factIds: ["F1"] },
      ]),
      CONTEXT,
      money,
    );
    expect(rows[0]?.editable).toBe("option");
    expect(rows[0]?.options.map((option) => option.id)).toEqual([
      "cat-groceries",
      "cat-income",
    ]);
    expect(rows[0]?.options[1]?.note).toBe("Money in");
  });

  it("builds an acceptance item carrying the owner's choice and the expectation", () => {
    const [row] = categorisationRows(
      categorisation([
        { rowIndex: 0, categoryIndex: 0, reason: "x", factIds: ["F1"] },
      ]),
      CONTEXT,
      money,
    );
    // The owner switches it before accepting. That value is now OWNER INPUT.
    const edited = { ...row!, chosenOptionId: "cat-income" };
    expect(categorisationItem(edited)).toEqual({
      kind: "transaction_category",
      transactionId: "txn-1",
      categoryId: "cat-income",
      // Sent EXPLICITLY as null rather than omitted: an absent field would mean
      // "no expectation" rather than "expected uncategorised".
      expectedCategoryId: null,
    });
  });
});

describe("the categorisation context is parsed strictly", () => {
  it("accepts a complete payload", () => {
    expect(asCategorisationContext(CONTEXT)).not.toBeNull();
  });

  it("refuses a payload missing either list", () => {
    // A categorisation surface with no options is a surface that silently
    // cannot be edited, which is worse than one that does not render.
    expect(asCategorisationContext({ rows: [] })).toBeNull();
    expect(asCategorisationContext({ options: [] })).toBeNull();
    expect(asCategorisationContext(null)).toBeNull();
    expect(asCategorisationContext("rows")).toBeNull();
  });
});

describe("follow-up rows", () => {
  const result: ObligationFollowUpResult = {
    kind: "obligation_follow_up",
    status: "ok",
    tasks: [
      {
        title: "Ring the retailer",
        reason: "It is past its due date.",
        factIds: ["F1"],
      },
    ],
  };
  const context = {
    obligationId: "ob-1",
    title: "Electricity",
    dueDate: "2026-08-01",
    daysOverdue: 38,
    hasOpenTask: false,
  };

  it("shows no difference, because there is nothing to differ from", () => {
    const rows = followUpRows(result, context);
    expect(rows[0]?.currentLabel).toBeNull();
    expect(rows[0]?.editable).toBe("none");
    expect(rows[0]?.selected).toBe(false);
  });

  it("names the obligation in the acceptance item, never the browser's guess", () => {
    const [row] = followUpRows(result, context);
    expect(followUpItem(row!, context)).toEqual({
      kind: "obligation_task",
      obligationId: "ob-1",
      title: "Ring the retailer",
    });
  });

  it("answers a null context with an incomplete item the server refuses", () => {
    const [row] = followUpRows(result, context);
    expect(followUpItem(row!, null)).toEqual({ kind: "obligation_task" });
  });

  it("parses its context strictly", () => {
    expect(asFollowUpContext({ obligationId: "" })).toBeNull();
    expect(asFollowUpContext(undefined)).toBeNull();
    expect(asFollowUpContext(context)?.daysOverdue).toBe(38);
  });
});

describe("reflection rows", () => {
  const draft: ReviewReflectionDraftResult = {
    kind: "review_reflection_draft",
    status: "ok",
    draft: "A steady week rather than an eventful one.",
    factIds: ["F1"],
  };

  it("is ONE row, editable as text, starting from the draft", () => {
    const rows = reflectionRows(
      draft,
      {
        reviewId: "rev-1",
        sectionId: "summary.overall",
        currentBody: "",
        expectedUpdatedAt: null,
      },
      "Overall reflection",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.editable).toBe("text");
    expect(rows[0]?.draftText).toBe(draft.draft);
    expect(rows[0]?.currentLabel).toBeNull();
    expect(rows[0]?.selected).toBe(false);
  });

  it("bounds the preview of what would be replaced", () => {
    const [row] = reflectionRows(
      draft,
      {
        reviewId: "rev-1",
        sectionId: "summary.overall",
        currentBody: "a".repeat(400),
        expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
      },
      "Overall reflection",
    );
    expect(row?.currentLabel?.length).toBeLessThanOrEqual(120);
    expect(row?.currentLabel?.endsWith("…")).toBe(true);
    expect(row?.reason).toContain("replaces");
  });

  it("proposes nothing for an insufficient answer", () => {
    expect(
      reflectionRows(
        { ...draft, status: "insufficient", draft: "" },
        {
          reviewId: "rev-1",
          sectionId: "summary.overall",
          currentBody: "",
          expectedUpdatedAt: null,
        },
        "Overall reflection",
      ),
    ).toEqual([]);
  });

  it("carries the version the draft was generated against, unchanged", () => {
    const context = {
      reviewId: "rev-1",
      sectionId: "summary.overall",
      currentBody: "mine",
      expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
    };
    expect(reflectionItem(context, "the owner's edited draft")).toEqual({
      kind: "review_reflection",
      reviewId: "rev-1",
      sectionId: "summary.overall",
      body: "the owner's edited draft",
      expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("answers a null context with an incomplete item the server refuses", () => {
    expect(reflectionItem(null, "x")).toEqual({ kind: "review_reflection" });
  });

  it("parses its context strictly", () => {
    expect(asReflectionContext({ reviewId: "r" })).toBeNull();
    expect(asReflectionContext({ sectionId: "s" })).toBeNull();
    expect(
      asReflectionContext({ reviewId: "r", sectionId: "s" })?.currentBody,
    ).toBe("");
  });
});

describe("selection", () => {
  const rows = categorisationRows(
    categorisation([
      { rowIndex: 0, categoryIndex: 0, reason: "x", factIds: ["F1"] },
      { rowIndex: 1, categoryIndex: 0, reason: "y", factIds: ["F1"] },
    ]),
    CONTEXT,
    money,
  );

  it("says nothing is selected until something is", () => {
    expect(selectedRows(rows)).toEqual([]);
    expect(applySummary(rows)).toBe("Nothing selected.");
  });

  it("counts what is selected, always", () => {
    const one = patchRow(rows, "txn-1", { selected: true });
    expect(applySummary(one)).toBe("1 change selected.");
    expect(applySummary(setAllSelected(rows, true))).toBe(
      "2 changes selected.",
    );
    expect(applySummary(setAllSelected(rows, false))).toBe("Nothing selected.");
  });

  it("patches ONE row and leaves the rest alone", () => {
    const patched = patchRow(rows, "txn-2", { chosenOptionId: "cat-income" });
    expect(patched[0]?.chosenOptionId).toBe("cat-groceries");
    expect(patched[1]?.chosenOptionId).toBe("cat-income");
  });
});

describe("outcome words", () => {
  it("names each state without relying on a colour", () => {
    expect(
      proposalOutcomeLabel({
        ok: true,
        outcome: "created",
        message: null,
        undo: null,
      }),
    ).toBe("Added");
    expect(
      proposalOutcomeLabel({
        ok: true,
        outcome: "updated",
        message: null,
        undo: null,
      }),
    ).toBe("Applied");
    expect(
      proposalOutcomeLabel({
        ok: true,
        outcome: "unchanged",
        message: null,
        undo: null,
      }),
    ).toBe("Already done");
    expect(
      proposalOutcomeLabel({
        ok: false,
        outcome: "stale",
        message: null,
        undo: null,
      }),
    ).toBe("Not applied — changed");
    expect(
      proposalOutcomeLabel({
        ok: false,
        outcome: "failed",
        message: null,
        undo: null,
      }),
    ).toBe("Refused");
  });
});
