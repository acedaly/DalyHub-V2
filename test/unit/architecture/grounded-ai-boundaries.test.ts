/**
 * V2.14 GROUND-04 — the boundaries GROUNDED AI promises, asserted structurally.
 *
 * Every rule below is an ABSENCE, and every one of them is the kind of promise
 * that decays silently. Nobody removes "AI cannot read the Diary" on purpose;
 * someone adds a builder, a fact source, a convenience read, eighteen months
 * from now, and the documentation goes on saying the old thing.
 *
 * A behavioural test proves an absence in the cases it happened to exercise; a
 * SOURCE assertion proves the code has no way to produce one, which is the
 * property that actually holds over the next release. The same choice
 * `attachment-boundaries.test.ts` and `report-boundaries.test.ts` made, for the
 * same reason.
 *
 * Comments are stripped before matching, so a rule written in a comment can
 * never pass for a rule enforced in code.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PROPOSAL_KINDS,
  PROPOSAL_UNDO_STRATEGIES,
  EVIDENCE_KINDS,
  FACT_BLOCK_INTENTS,
  FACT_REFERENCE_KINDS,
  aiFeaturePolicy,
} from "~/kernel/ai";
import { GROUNDED_ASK_INTENTS } from "~/platform/ai";

const ROOT = process.cwd();

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name))
      : entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
        ? [path.join(dir, entry.name)]
        : [],
  );
}

/** Every AI source file, with block and line comments removed. */
const FILES = [
  path.join(ROOT, "app", "kernel", "ai"),
  path.join(ROOT, "app", "platform", "ai"),
  path.join(ROOT, "app", "modules", "ai"),
]
  .flatMap(filesUnder)
  .map((file) => ({
    file: path.relative(ROOT, file),
    code: readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1"),
  }));

/** The files that BUILD a fact block — the only ones that choose what AI sees. */
const BUILDERS = FILES.filter(
  (entry) =>
    entry.file !== "app/kernel/ai/fact-block.ts" &&
    /buildFactBlock\s*\(/.test(entry.code),
);

describe("the builders are the only thing that chooses what AI sees", () => {
  it("exists, and is a small closed set", () => {
    expect(BUILDERS.map((entry) => entry.file).sort()).toEqual([
      "app/modules/ai/review-facts.ts",
      // V2.15 ASSIST — the Finance categorisation batch and the obligation
      // follow-up. The Review reflection draft is deliberately NOT here: it
      // reads the Weekly Review's own block, built by `review-facts.ts`,
      // because a period's facts do not change because the ask did.
      "app/platform/ai/assist-facts.server.ts",
      "app/platform/ai/grounded-facts.server.ts",
      "app/platform/ai/report-facts.ts",
    ]);
  });

  it("has one intent per builder and one builder per intent", () => {
    // A grounded surface that acquired an intent with no builder — or a builder
    // with no declared intent — is a surface whose grounding nobody can name.
    for (const intent of FACT_BLOCK_INTENTS) {
      const declared = BUILDERS.some((entry) =>
        entry.code.includes(`"${intent}"`),
      );
      expect(declared, intent).toBe(true);
    }
    for (const intent of GROUNDED_ASK_INTENTS) {
      expect(
        (FACT_BLOCK_INTENTS as readonly string[]).includes(intent),
        intent,
      ).toBe(true);
    }
  });
});

describe("Diary content never reaches a model", () => {
  it("is read by no builder", () => {
    for (const { file, code } of BUILDERS) {
      expect(code, `${file} must not read the Diary`).not.toMatch(
        /\bscope\.diary\b|~\/kernel\/diary|~\/platform\/diary/,
      );
    }
  });

  it("has no fact reference kind that could point at one", () => {
    expect(FACT_REFERENCE_KINDS as readonly string[]).not.toContain("diary");
  });
});

describe("People are not a fact source", () => {
  it("is read by no builder", () => {
    for (const { file, code } of BUILDERS) {
      expect(code, `${file} must not read People`).not.toMatch(
        /\bscope\.people\b|~\/kernel\/people|~\/platform\/people/,
      );
    }
  });

  it("has no fact reference kind that could point at one", () => {
    expect(FACT_REFERENCE_KINDS as readonly string[]).not.toContain("person");
    expect(FACT_REFERENCE_KINDS as readonly string[]).not.toContain("people");
  });
});

describe("attachments remain absent — V2.11's boundary, unchanged", () => {
  it("is not an evidence kind and not a fact reference kind", () => {
    for (const forbidden of ["attachment", "file", "document"]) {
      expect(EVIDENCE_KINDS as readonly string[]).not.toContain(forbidden);
      expect(FACT_REFERENCE_KINDS as readonly string[]).not.toContain(
        forbidden,
      );
    }
  });

  it("reads no attachment repository, table, filename or object store", () => {
    for (const { file, code } of FILES) {
      expect(code, `${file} must not reach an attachment`).not.toMatch(
        /\bscope\.attachments\b|~\/kernel\/attachments|~\/platform\/attachments|\bATTACHMENTS\b/,
      );
      expect(code, `${file} must not name a filename field`).not.toMatch(
        /\bfileName\b|\boriginalName\b|\bstorageKey\b/,
      );
    }
  });

  it("does no document understanding of any kind", () => {
    for (const { file, code } of FILES) {
      expect(code, `${file} must not do document AI`).not.toMatch(
        /\bocr\b|pdfjs|pdf-parse|tesseract|extractText|image_url|\bvision\b/i,
      );
    }
  });
});

describe("no embeddings, no vector store, no semantic index", () => {
  it("names none of them anywhere on an AI path", () => {
    for (const { file, code } of FILES) {
      expect(code, `${file} must not add a vector layer`).not.toMatch(
        /embedding|embed\s*\(|vectorize|pinecone|pgvector|cosine|faiss|\bknn\b/i,
      );
    }
  });
});

describe("the AI platform mutates through the apply engine and nothing else", () => {
  const READ_ONLY = FILES.filter(
    (entry) =>
      entry.file !== "app/modules/ai/apply-proposal.ts" &&
      entry.file !== "app/modules/ai/routes/apply.tsx",
  );

  it("calls no write on any grounded path", () => {
    /*
     * `apply-proposal.ts` and its route are the ONE owner-approved apply path
     * and are excluded by name. V2.14 neither widened nor touched them; V2.15
     * widened the VOCABULARY inside them and added nothing beside them, which
     * is why this exclusion list is still two entries long and why
     * `proposal-apply-authority.test.ts` enumerates the callers rather than
     * trusting that it stays that way. Everything else must be read-only, and
     * the words below are how a write arrives.
     */
    for (const { file, code } of READ_ONLY) {
      /*
       * A write reaches a repository through the workspace scope, so that is
       * what is matched: `scope.tasks.create(`, `scope.obligations.complete(`.
       * A bare `.complete(` would catch the provider adapter's own method and
       * say nothing about DalyHub's data.
       */
      expect(code, `${file} must not write`).not.toMatch(
        /\bscope\.[A-Za-z]+\.(create|update|delete|complete|save|insert|archive|set|write|add|remove)\w*\(/,
      );
    }
  });

  it("keeps V2.14's four READ-ONLY features read-only", () => {
    /*
     * V2.14 asserted that EVERY grounded feature was read-only, which was true
     * of the whole set at the time. V2.15 adds three grounded features that
     * DO produce proposals, so the blanket form of the rule would now be
     * asserting that V2.15 does not exist.
     *
     * What survives is the part that was actually load-bearing, and it is
     * NAMED rather than derived: an explanation is not an action. A Report
     * explanation and a grounded Ask read figures the owner is already looking
     * at, and their response schemas have no field a proposal could be
     * expressed in. Ask DalyHub stays explanatory in V2.15 by explicit
     * decision, not by omission.
     */
    for (const id of [
      "report-explanation",
      "grounded-question-answer",
      "workspace-question-answer",
      "note-action-extraction",
    ] as const) {
      const policy = aiFeaturePolicy(id);
      expect(
        policy.producesProposals,
        `${id} must not change its proposal stance`,
      ).toBe(id === "note-action-extraction");
    }
    expect(aiFeaturePolicy("report-explanation").producesProposals).toBe(false);
    expect(aiFeaturePolicy("grounded-question-answer").producesProposals).toBe(
      false,
    );
    expect(aiFeaturePolicy("workspace-question-answer").producesProposals).toBe(
      false,
    );
  });

  it("adds no proposal kind the registry does not declare", () => {
    /*
     * V2.14's version of this test listed five forbidden strings and asserted
     * the apply engine contained none of them. V2.15 makes three of them
     * legitimate, so the list would have to shrink every release until it said
     * nothing — a test that decays into a comment.
     *
     * The rule it was reaching for is better stated positively: the apply
     * engine speaks the REGISTRY's vocabulary and no other. A kind added to the
     * engine without a registry row now fails here, which is the property the
     * original list was approximating.
     */
    const apply = FILES.find(
      (entry) => entry.file === "app/modules/ai/apply-proposal.ts",
    );
    expect(apply).toBeDefined();
    const dispatched = [
      ...(apply?.code.matchAll(/case "([a-z_]+)":/g) ?? []),
    ].map((match) => match[1] as string);
    const known = new Set<string>([
      ...PROPOSAL_KINDS,
      ...PROPOSAL_UNDO_STRATEGIES,
    ]);
    for (const kind of dispatched) {
      expect(known.has(kind), `${kind} is not in the registry`).toBe(true);
    }
    // And the ones V2.15 deliberately REFUSED stay refused, by name, because
    // each was struck for a measured reason rather than for lack of time.
    for (const struck of ["transfer_pair", "possible_duplicate"]) {
      expect(apply?.code, struck).not.toContain(`"${struck}"`);
      expect(PROPOSAL_KINDS as readonly string[]).not.toContain(struck);
    }
  });
});

describe("the provider is only ever reached from the server", () => {
  it("keeps every provider endpoint out of anything a browser can import", () => {
    const client = [
      ...filesUnder(path.join(ROOT, "app", "shared", "ai")),
      ...filesUnder(path.join(ROOT, "app", "kernel", "ai")),
    ].map((file) => ({
      file: path.relative(ROOT, file),
      code: readFileSync(file, "utf8"),
    }));
    for (const { file, code } of client) {
      expect(code, `${file} must not import the AI platform`).not.toMatch(
        /from ["']~\/platform\/ai/,
      );
      expect(code, `${file} must not name a provider endpoint`).not.toMatch(
        /api\.anthropic\.com|api\.openai\.com|gateway\.ai\.cloudflare\.com/,
      );
      expect(code, `${file} must not read a credential`).not.toMatch(
        /ANTHROPIC_API_KEY|OPENAI_API_KEY|AI_GATEWAY_TOKEN/,
      );
    }
  });

  it("reads a credential in exactly one module", () => {
    const readers = FILES.filter((entry) =>
      /ANTHROPIC_API_KEY|OPENAI_API_KEY/.test(entry.code),
    ).map((entry) => entry.file);
    /*
     * Two files, and the second is a type declaration that carries no value:
     * `ai-bindings.d.ts` is where the Worker `Env` learns the bindings exist.
     * The module that READS one is the first, and only the first.
     */
    expect(readers).toEqual([
      "app/platform/ai/ai-bindings.d.ts",
      "app/platform/ai/ai-configuration.ts",
    ]);
  });
});

describe("the ledger stays metadata-only", () => {
  it("records ids and counts, never a value, a label or a prompt", () => {
    const runtime = FILES.find(
      (entry) => entry.file === "app/platform/ai/ai-runtime.ts",
    );
    expect(runtime).toBeDefined();
    const reserve = runtime?.code.slice(
      runtime.code.indexOf("usage.reserve("),
      runtime.code.indexOf("markRunning"),
    );
    expect(reserve).toBeDefined();
    for (const forbidden of [
      "display",
      "label",
      "payee",
      "memo",
      "amount",
      "minorUnits",
      "userMessage",
      "system",
      "prompt:",
      "summary",
    ]) {
      expect(reserve, `reserve must not record ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("never sends a prompt or a response body to a log", () => {
    for (const { file, code } of FILES) {
      const logged = [...code.matchAll(/console\.\w+\(([^)]*)\)/g)].map(
        (match) => match[1] ?? "",
      );
      for (const argument of logged) {
        expect(argument, `${file} logs too much`).not.toMatch(
          /userMessage|system|prompt|evidence|factBlock|result|apiKey/i,
        );
      }
    }
  });
});

describe("no AI call happens while a page is loading", () => {
  it("is reached only from an action, never from a loader", () => {
    /*
     * PERF-01's rule, made structural for AI: a route loader that awaited a
     * provider would put seconds of provider latency into the page's own
     * navigation budget. `runAiRequest` is called from exactly one place, and
     * that place is an ACTION.
     */
    const callers = FILES.filter((entry) =>
      /runAiRequest\s*\(/.test(
        entry.code.replace(/export async function runAiRequest/g, ""),
      ),
    ).map((entry) => entry.file);
    expect(callers.sort()).toEqual(["app/modules/ai/routes/assist.tsx"]);

    const assist = FILES.find(
      (entry) => entry.file === "app/modules/ai/routes/assist.tsx",
    );
    // The route's only loader is the shared action-only guard, which renders
    // DalyHub's error boundary for a GET and reads nothing at all.
    expect(assist?.code).toContain("export const loader = actionOnlyLoader");
  });
});
