/**
 * V2.15 ASSIST-00 — the proposal registry, and the rules it exists to make
 * unbreakable.
 *
 * These are not tests of the registry's CONTENT (that is data, and it changes
 * when the product does). They are tests of its INVARIANTS — the properties the
 * release rests on, each of which used to live in a comment.
 */

import { describe, expect, it } from "vitest";

import {
  PROPOSAL_KINDS,
  UNTRACEABLE_PROPOSAL_KINDS,
  allProposalKinds,
  isProposalKind,
  parseProposalKind,
  proposalKindAllowedForFeature,
  proposalKindDescriptor,
  proposalKindsForFeature,
} from "~/kernel/ai";

describe("the vocabulary is closed", () => {
  it("recognises exactly the shipped kinds", () => {
    for (const kind of PROPOSAL_KINDS) {
      expect(isProposalKind(kind), kind).toBe(true);
    }
  });

  it("refuses everything else, and refuses it as null rather than as a Task", () => {
    /*
     * The defect this replaces, stated as a test. The apply engine used to read
     * `item.kind === "link" ? "link" : item.kind === "note" ? "note" : "task"`,
     * so every value below produced a TASK. A typo made a record.
     */
    for (const hostile of [
      "transaction_categry",
      "transfer_pair",
      "possible_duplicate",
      "update_record",
      "TASK",
      "",
      " task",
      42,
      null,
      undefined,
      {},
      ["task"],
      { kind: "task" },
    ]) {
      expect(parseProposalKind(hostile), String(hostile)).toBeNull();
    }
  });

  it("does not carry the two kinds V2.15 deliberately struck", () => {
    // `transfer_pair` — the deterministic candidate read already matches on the
    // exactly opposite amount, so there is no ambiguity for a model to reduce.
    // `possible_duplicate` — no deterministic post-import candidate read exists
    // to ground one. Both refusals are measured, and both stay refusals until
    // something changes the measurement.
    expect(PROPOSAL_KINDS as readonly string[]).not.toContain("transfer_pair");
    expect(PROPOSAL_KINDS as readonly string[]).not.toContain(
      "possible_duplicate",
    );
  });
});

describe("every kind can be undone", () => {
  it("declares a strategy, with no escape hatch", () => {
    for (const descriptor of allProposalKinds()) {
      expect(descriptor.undo, descriptor.kind).toBeTruthy();
      // There is deliberately no "none": the type has no member for it, and a
      // string that reads like one would still have to be dispatched.
      expect(descriptor.undo, descriptor.kind).not.toBe("none");
    }
  });
});

describe("a kind that CHANGES a record must prove what it expected to find", () => {
  it("requires an expectation exactly when it updates", () => {
    for (const descriptor of allProposalKinds()) {
      expect(descriptor.requiresExpectedState, descriptor.kind).toBe(
        descriptor.mutates === "update",
      );
    }
  });

  it("shows a difference exactly when there is a current value to show", () => {
    for (const descriptor of allProposalKinds()) {
      expect(descriptor.showsDifference, descriptor.kind).toBe(
        descriptor.mutates === "update",
      );
    }
  });
});

describe("a feature may produce only its own kinds", () => {
  it("refuses a Finance kind under an extraction feature", () => {
    expect(
      proposalKindAllowedForFeature(
        "transaction_category",
        "meeting-action-extraction",
      ),
    ).toBe(false);
    expect(
      proposalKindAllowedForFeature(
        "transaction_category",
        "finance-categorisation",
      ),
    ).toBe(true);
  });

  it("refuses a Review draft under the Finance feature", () => {
    expect(
      proposalKindAllowedForFeature(
        "review_reflection",
        "finance-categorisation",
      ),
    ).toBe(false);
  });

  it("refuses every proposal kind under a READ-ONLY feature", () => {
    for (const readOnly of [
      "report-explanation",
      "grounded-question-answer",
      "workspace-question-answer",
    ] as const) {
      expect(proposalKindsForFeature(readOnly), readOnly).toEqual([]);
    }
  });

  it("gives Finance categorisation exactly one kind", () => {
    expect(proposalKindsForFeature("finance-categorisation")).toEqual([
      "transaction_category",
    ]);
  });
});

describe("an untraceable acceptance may only CREATE", () => {
  it("names the three AI-01/AI-02 kinds and nothing else", () => {
    expect([...UNTRACEABLE_PROPOSAL_KINDS]).toEqual(["task", "note", "link"]);
    for (const kind of UNTRACEABLE_PROPOSAL_KINDS) {
      expect(proposalKindDescriptor(kind).mutates, kind).toBe("create");
    }
  });
});

describe("the categories a kind discloses are declared", () => {
  it("declares financial content on the Finance kind", () => {
    expect(proposalKindDescriptor("transaction_category").categories).toContain(
      "financial",
    );
  });

  it("declares authored reflection on the Review kind", () => {
    expect(proposalKindDescriptor("review_reflection").categories).toContain(
      "reflection",
    );
  });

  it("declares nothing sensitive on the three create kinds", () => {
    for (const kind of ["task", "note", "link"] as const) {
      expect([...proposalKindDescriptor(kind).categories], kind).toEqual([
        "general",
      ]);
    }
  });
});
