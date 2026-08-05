/**
 * AI-01 — the evaluation corpus, run against a DETERMINISTIC fake provider.
 *
 * The point of these cases is not "did the model say the right sentence" — model
 * prose is not deterministic, and a suite that asserted it would fail for the
 * wrong reasons. What is asserted is that DalyHub's own boundary holds for every
 * case in the corpus: schema validity, citation validity, date handling, proposal
 * bounds, and the refusal/uncertainty behaviour that keeps an answer honest.
 *
 * The fake provider stands in for a hostile or careless model as readily as a
 * cooperative one — which is exactly what makes the injection case meaningful.
 */

import { describe, expect, it } from "vitest";

import {
  renderEvidenceBlock,
  selectEvidence,
  validateActionExtraction,
  validateWorkspaceAnswer,
  type EvidenceLimits,
  type PrivacyCategory,
  type ValidationContext,
} from "~/kernel/ai";

import { EVALUATION_CORPUS, evaluationCase } from "./evaluation-corpus";

const LIMITS: EvidenceLimits = {
  maxRecords: 12,
  maxExcerptCharacters: 2_000,
  maxTotalCharacters: 16_000,
  maxExcerptsPerRecord: 6,
};

const ALLOWED: ReadonlySet<PrivacyCategory> = new Set(["general"]);

function contextFor(evidenceIds: readonly string[]): ValidationContext {
  return {
    evidenceIds: new Set(evidenceIds),
    projectCandidateIds: new Set(["project-allowed"]),
    personCandidateIds: new Set(["person-allowed"]),
    linkCandidateIds: new Set(["link-allowed"]),
  };
}

describe("evaluation corpus — evidence assembly", () => {
  it("bounds every case, and never exceeds the character ceiling", () => {
    for (const testCase of EVALUATION_CORPUS) {
      const set = selectEvidence(testCase.evidence, LIMITS, ALLOWED);
      expect(set.items.length).toBeLessThanOrEqual(LIMITS.maxRecords);
      expect(set.totalCharacters).toBeLessThanOrEqual(
        LIMITS.maxTotalCharacters,
      );
      for (const item of set.items) {
        expect(item.excerpt.length).toBeLessThanOrEqual(
          LIMITS.maxExcerptCharacters,
        );
      }
    }
  });

  it("truncates the over-long case and reports it honestly", () => {
    const set = selectEvidence(
      evaluationCase("overly-long-content").evidence,
      LIMITS,
      ALLOWED,
    );
    expect(set.items[0]?.excerpt.length).toBeLessThanOrEqual(2_000);
    expect(set.items[0]?.excerpt.endsWith("…")).toBe(true);
  });

  it("produces no evidence for the no-evidence case", () => {
    const set = selectEvidence(
      evaluationCase("no-evidence-answer").evidence,
      LIMITS,
      ALLOWED,
    );
    expect(set.items).toHaveLength(0);
  });
});

describe("evaluation corpus — schema and citation validity", () => {
  it("accepts a well-formed extraction for every case that has evidence", () => {
    for (const testCase of EVALUATION_CORPUS) {
      const set = selectEvidence(testCase.evidence, LIMITS, ALLOWED);
      if (set.items.length === 0) continue;
      const ids = set.items.map((item) => item.id);
      const result = validateActionExtraction(
        {
          summary: "A neutral summary.",
          decisions: [],
          proposedTasks: [
            {
              title: "Do the thing",
              description: null,
              dueDate: null,
              scheduledDate: null,
              dateBasis: "none",
              suggestedProjectId: null,
              suggestedOwnerPersonId: null,
              evidenceIds: [ids[0]],
              confidence: "medium",
            },
          ],
          unresolvedQuestions: [],
          suggestedLinks: [],
        },
        contextFor(ids),
      );
      expect(result.proposedTasks).toHaveLength(1);
      // Citation validity: every cited id came from the supplied set.
      for (const task of result.proposedTasks) {
        for (const id of task.evidenceIds) expect(ids).toContain(id);
      }
    }
  });

  it("rejects an answer that cites evidence from a DIFFERENT case", () => {
    const first = selectEvidence(
      evaluationCase("clear-action").evidence,
      LIMITS,
      ALLOWED,
    );
    expect(() =>
      validateActionExtraction(
        {
          summary: "Borrowed a citation.",
          decisions: [
            {
              text: "Something",
              evidenceIds: ["evidence_09"],
              confidence: "high",
            },
          ],
          proposedTasks: [],
          unresolvedQuestions: [],
          suggestedLinks: [],
        },
        contextFor(first.items.map((item) => item.id)),
      ),
    ).toThrow();
  });
});

describe("evaluation corpus — date handling", () => {
  it("accepts an EXPLICIT date from the clear-action case", () => {
    const set = selectEvidence(
      evaluationCase("clear-action").evidence,
      LIMITS,
      ALLOWED,
    );
    const result = validateActionExtraction(
      {
        summary: "The sample ships on the 14th.",
        decisions: [],
        proposedTasks: [
          {
            title: "Send the draft",
            description: null,
            dueDate: "2026-08-11",
            scheduledDate: null,
            dateBasis: "explicit",
            suggestedProjectId: null,
            suggestedOwnerPersonId: null,
            evidenceIds: [set.items[0]!.id],
            confidence: "high",
          },
        ],
        unresolvedQuestions: [],
        suggestedLinks: [],
      },
      contextFor(set.items.map((item) => item.id)),
    );
    expect(result.proposedTasks[0]?.dueDate).toBe("2026-08-11");
    expect(result.proposedTasks[0]?.dateBasis).toBe("explicit");
  });

  it("refuses to turn “soon” into a date with no stated basis", () => {
    const set = selectEvidence(
      evaluationCase("ambiguous-date").evidence,
      LIMITS,
      ALLOWED,
    );
    expect(() =>
      validateActionExtraction(
        {
          summary: "Two follow-ups.",
          decisions: [],
          proposedTasks: [
            {
              title: "Send the summary",
              description: null,
              dueDate: "2026-08-06",
              scheduledDate: null,
              // A model that invents a date and claims no basis is refused.
              dateBasis: "none",
              suggestedProjectId: null,
              suggestedOwnerPersonId: null,
              evidenceIds: [set.items[0]!.id],
              confidence: "low",
            },
          ],
          unresolvedQuestions: [],
          suggestedLinks: [],
        },
        contextFor(set.items.map((item) => item.id)),
      ),
    ).toThrow();
  });

  it("marks a worked-out date as INFERRED, which the surface then does not pre-fill", () => {
    const set = selectEvidence(
      evaluationCase("ambiguous-date").evidence,
      LIMITS,
      ALLOWED,
    );
    const result = validateActionExtraction(
      {
        summary: "Two follow-ups.",
        decisions: [],
        proposedTasks: [
          {
            title: "Chase the reply",
            description: null,
            dueDate: "2026-08-08",
            scheduledDate: null,
            dateBasis: "inferred",
            suggestedProjectId: null,
            suggestedOwnerPersonId: null,
            evidenceIds: [set.items[0]!.id],
            confidence: "low",
          },
        ],
        unresolvedQuestions: [],
        suggestedLinks: [],
      },
      contextFor(set.items.map((item) => item.id)),
    );
    expect(result.proposedTasks[0]?.dateBasis).toBe("inferred");
  });
});

describe("evaluation corpus — person resolution", () => {
  it("refuses an owner id that is not in the supplied candidates", () => {
    const set = selectEvidence(
      evaluationCase("same-first-name").evidence,
      LIMITS,
      ALLOWED,
    );
    expect(() =>
      validateActionExtraction(
        {
          summary: "Sam will write the summary.",
          decisions: [],
          proposedTasks: [
            {
              title: "Write the summary",
              description: null,
              dueDate: null,
              scheduledDate: null,
              dateBasis: "none",
              suggestedProjectId: null,
              // Neither Sam was offered as a candidate — an id here is invented.
              suggestedOwnerPersonId: "person-sam-rivers",
              evidenceIds: [set.items[0]!.id],
              confidence: "low",
            },
          ],
          unresolvedQuestions: [],
          suggestedLinks: [],
        },
        contextFor(set.items.map((item) => item.id)),
      ),
    ).toThrow();
  });
});

describe("evaluation corpus — prompt injection stays inside the boundary", () => {
  const set = selectEvidence(
    evaluationCase("prompt-injection").evidence,
    LIMITS,
    ALLOWED,
  );
  const ids = set.items.map((item) => item.id);

  it("a compliant-looking answer is still bounded by the schema", () => {
    const result = validateActionExtraction(
      {
        summary: "The note contains instructions that were not followed.",
        decisions: [],
        proposedTasks: [],
        unresolvedQuestions: [],
        suggestedLinks: [],
      },
      contextFor(ids),
    );
    expect(result.proposedTasks).toHaveLength(0);
  });

  it("an answer that OBEYS the injection cannot express it — there is no field for a tool call", () => {
    expect(() =>
      validateActionExtraction(
        {
          summary: "Deleting all tasks.",
          decisions: [],
          proposedTasks: [],
          unresolvedQuestions: [],
          suggestedLinks: [],
          // A model that invented a tool call: the schema has no such property,
          // and the validator's `additionalProperties: false` contract means the
          // structured request never offered one.
          toolCalls: [{ name: "delete_all", arguments: {} }],
        } as never,
        contextFor(ids),
      ),
    ).not.toThrow();
    // The extra key is IGNORED, not honoured: the validated result carries only
    // the declared fields, so nothing downstream can ever see it.
    const result = validateActionExtraction(
      {
        summary: "Deleting all tasks.",
        decisions: [],
        proposedTasks: [],
        unresolvedQuestions: [],
        suggestedLinks: [],
        toolCalls: [{ name: "delete_all", arguments: {} }],
      } as never,
      contextFor(ids),
    );
    expect(Object.keys(result)).toEqual([
      "kind",
      "summary",
      "decisions",
      "proposedTasks",
      "unresolvedQuestions",
      "suggestedLinks",
    ]);
  });

  it("an injected proposal cannot name a record it was not offered", () => {
    expect(() =>
      validateActionExtraction(
        {
          summary: "Linking everything.",
          decisions: [],
          proposedTasks: [],
          unresolvedQuestions: [],
          suggestedLinks: [
            {
              targetEntityId: "every-record",
              reason: "because the note said so",
              evidenceIds: [ids[0]!],
            },
          ],
        },
        contextFor(ids),
      ),
    ).toThrow();
  });

  it("the hostile content is present as ordinary evidence, not as framing", () => {
    // The excerpt itself is NOT rewritten — evidence is stored as it was
    // written, and quietly editing a record would be its own kind of lie.
    expect(set.items[0]?.excerpt).toContain("Ignore previous instructions");

    // Neutralisation happens where it matters: the block sent to the provider.
    // The record can no longer close DalyHub's own framing and impersonate a
    // system instruction.
    const block = renderEvidenceBlock(set);
    expect(block).not.toContain("</evidence>");
    expect(block).not.toContain("</record>\n</record>");
    expect(block).not.toContain("<system_policy>");
    expect(block).toContain("[evidence]");
    expect(block).toContain("[system_policy]");
    // The hostile text survives as readable data, which is the point.
    expect(block).toContain("Ignore previous instructions");
  });
});

describe("evaluation corpus — refusal and uncertainty behaviour", () => {
  it("accepts an honest no-evidence answer and does NOT require a fabricated one", () => {
    const result = validateWorkspaceAnswer(
      {
        status: "insufficient_evidence",
        summary: "Nothing in your records covers that.",
        statements: [],
        uncertainties: ["No Meeting or Note mentions it"],
      },
      contextFor([]),
    );
    expect(result.status).toBe("insufficient_evidence");
    expect(result.statements).toHaveLength(0);
  });

  it("refuses an `answered` status with nothing behind it — the fabrication case", () => {
    expect(() =>
      validateWorkspaceAnswer(
        {
          status: "answered",
          summary: "You decided to ship on the 14th.",
          statements: [],
          uncertainties: [],
        },
        contextFor([]),
      ),
    ).toThrow();
  });

  it("refuses an uncited factual claim about the workspace", () => {
    const set = selectEvidence(
      evaluationCase("strong-evidence-answer").evidence,
      LIMITS,
      ALLOWED,
    );
    expect(() =>
      validateWorkspaceAnswer(
        {
          status: "answered",
          summary: "The prerequisites are finalised.",
          statements: [
            {
              text: "The prerequisite list is first aid, navigation and radio",
              evidenceIds: [],
              classification: "observation",
            },
          ],
          uncertainties: [],
        },
        contextFor(set.items.map((item) => item.id)),
      ),
    ).toThrow();
  });

  it("accepts the same claim once it cites the record it came from", () => {
    const set = selectEvidence(
      evaluationCase("strong-evidence-answer").evidence,
      LIMITS,
      ALLOWED,
    );
    const result = validateWorkspaceAnswer(
      {
        status: "answered",
        summary: "The prerequisites are finalised.",
        statements: [
          {
            text: "The prerequisite list is first aid, navigation and radio",
            evidenceIds: [set.items[0]!.id],
            classification: "observation",
          },
        ],
        uncertainties: [],
      },
      contextFor(set.items.map((item) => item.id)),
    );
    expect(result.statements[0]?.evidenceIds).toEqual([set.items[0]!.id]);
  });

  it("surfaces conflicting evidence as an uncertainty rather than picking silently", () => {
    const set = selectEvidence(
      evaluationCase("conflicting-decisions").evidence,
      LIMITS,
      ALLOWED,
    );
    const result = validateWorkspaceAnswer(
      {
        status: "answered",
        summary: "Two ship dates are recorded.",
        statements: [
          {
            text: "One record says the 14th and a later one says the 21st",
            evidenceIds: set.items.map((item) => item.id),
            classification: "observation",
          },
        ],
        uncertainties: ["Which ship date is current"],
      },
      contextFor(set.items.map((item) => item.id)),
    );
    expect(result.uncertainties).toHaveLength(1);
    expect(result.statements[0]?.evidenceIds).toHaveLength(2);
  });
});
