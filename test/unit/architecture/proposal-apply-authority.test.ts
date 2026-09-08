/**
 * V2.15 ASSIST-00 — the proposal apply authority, ENUMERATED.
 *
 * `grounded-ai-boundaries.test.ts` already proves an ABSENCE: no AI source file
 * except the apply engine and its route writes to a repository. That is a good
 * test and it is not this one. An absence proof says "nothing else writes"; it
 * does not say **how many things apply a proposal**, and the release rule
 * V2.15 is built on is a COUNT:
 *
 *   > V2.15 must use the existing proposal apply path. No second path.
 *
 * A second apply route added in eighteen months would satisfy every existing
 * assertion — it would be in `app/modules/ai/`, it would be excluded from the
 * read-only sweep by name if somebody added it to the exclusion list, and the
 * documentation would go on saying "one apply path". So this file counts, by
 * enumerating every call site across the WHOLE application rather than only the
 * AI module, and asserts the number.
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
  UNTRACEABLE_PROPOSAL_KINDS,
  allProposalKinds,
  aiFeaturePolicy,
  proposalKindsForFeature,
  AI_FEATURE_IDS,
} from "~/kernel/ai";

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

/** Every application source file, comments removed. Not just the AI module. */
const APP = filesUnder(path.join(ROOT, "app")).map((file) => ({
  file: path.relative(ROOT, file),
  code: readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1"),
}));

/** Every worker source file — a scheduled handler is code too. */
const WORKERS = filesUnder(path.join(ROOT, "workers")).map((file) => ({
  file: path.relative(ROOT, file),
  code: readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1"),
}));

const APPLY_CALL = /\b(applyProposalItems|undoProposalItems)\s*\(/;

describe("there is exactly ONE proposal application authority", () => {
  it("is called from exactly one file, and that file is the apply route", () => {
    const callers = [...APP, ...WORKERS]
      .filter(
        (entry) =>
          entry.file !== "app/modules/ai/apply-proposal.ts" &&
          APPLY_CALL.test(entry.code),
      )
      .map((entry) => entry.file)
      .sort();

    expect(callers).toEqual(["app/modules/ai/routes/apply.tsx"]);
  });

  it("has exactly one route that applies a proposal", () => {
    /*
     * The route MANIFESTS, not the files: a second apply route could be added
     * as a file nothing imports and would be invisible to a call-site sweep,
     * but it cannot be reachable without a manifest entry.
     */
    const manifests = APP.filter((entry) =>
      entry.file.endsWith("routes.manifest.ts"),
    );
    const applyRoutes = manifests.flatMap((entry) =>
      [...entry.code.matchAll(/path:\s*"([^"]*)"/g)]
        .map((match) => match[1] ?? "")
        .filter((route) => /apply/i.test(route))
        .map((route) => `${entry.file}:${route}`),
    );
    expect(applyRoutes).toEqual(["app/modules/ai/routes.manifest.ts:ai/apply"]);
  });

  it("is not reachable from a loader, a scheduled handler or a queue", () => {
    /*
     * The prohibition V2.15's non-goals name first: no background agent, no
     * scheduled run, no unattended mutation. A proposal is applied by an owner
     * pressing something, and there is no other caller — so no worker, no cron
     * handler and no queue consumer may name the authority at all.
     */
    for (const { file, code } of WORKERS) {
      expect(code, `${file} must not apply a proposal`).not.toMatch(APPLY_CALL);
    }
    const route = APP.find(
      (entry) => entry.file === "app/modules/ai/routes/apply.tsx",
    );
    expect(route).toBeDefined();
    // The route exports an action and the shared action-only loader. It must
    // not apply anything during a page load.
    expect(route?.code).toMatch(/export const loader = actionOnlyLoader/);
    const loaderBody = /export async function loader\b/.test(route?.code ?? "");
    expect(loaderBody).toBe(false);
  });
});

describe("the proposal vocabulary is closed and complete", () => {
  it("declares a registry row for every kind, and no orphan rows", () => {
    expect(allProposalKinds().map((entry) => entry.kind)).toEqual([
      ...PROPOSAL_KINDS,
    ]);
  });

  it("gives every kind an implemented undo strategy", () => {
    // The release invariant. A kind with no undo cannot even be constructed —
    // the descriptor type has no member for it — and this asserts that no row
    // has quietly acquired a strategy the engine does not implement.
    for (const descriptor of allProposalKinds()) {
      expect(
        (PROPOSAL_UNDO_STRATEGIES as readonly string[]).includes(
          descriptor.undo,
        ),
        descriptor.kind,
      ).toBe(true);
    }
  });

  it("dispatches every undo strategy in the apply engine", () => {
    const engine = APP.find(
      (entry) => entry.file === "app/modules/ai/apply-proposal.ts",
    );
    expect(engine).toBeDefined();
    for (const strategy of PROPOSAL_UNDO_STRATEGIES) {
      expect(engine?.code, strategy).toContain(`case "${strategy}":`);
    }
  });

  it("applies every kind in the apply engine", () => {
    const engine = APP.find(
      (entry) => entry.file === "app/modules/ai/apply-proposal.ts",
    );
    for (const kind of PROPOSAL_KINDS) {
      expect(engine?.code, kind).toContain(`case "${kind}":`);
    }
  });

  it("requires an expected prior state for every kind that CHANGES a record", () => {
    for (const descriptor of allProposalKinds()) {
      expect(descriptor.requiresExpectedState, descriptor.kind).toBe(
        descriptor.mutates === "update",
      );
    }
  });

  it("permits only CREATE kinds when no generation can be traced", () => {
    for (const kind of UNTRACEABLE_PROPOSAL_KINDS) {
      const descriptor = allProposalKinds().find(
        (entry) => entry.kind === kind,
      );
      expect(descriptor?.mutates, kind).toBe("create");
    }
  });

  it("gives every kind at least one feature that may produce it", () => {
    for (const descriptor of allProposalKinds()) {
      expect(descriptor.features.length, descriptor.kind).toBeGreaterThan(0);
      for (const feature of descriptor.features) {
        expect(
          aiFeaturePolicy(feature).producesProposals,
          `${feature} produces ${descriptor.kind}`,
        ).toBe(true);
      }
    }
  });

  it("gives every proposal-producing feature at least one kind", () => {
    for (const feature of AI_FEATURE_IDS) {
      if (!aiFeaturePolicy(feature).producesProposals) continue;
      if (feature === "weekly-review-assistant") {
        /*
         * AI-01's exception, preserved rather than widened: the Weekly Review
         * assistant proposes next-period priorities the owner accepts as TEXT
         * into their own Review focus section. It creates no record and reaches
         * no apply kind. V2.15's `review-reflection-draft` is a DIFFERENT
         * feature, and it does have one.
         */
        continue;
      }
      expect(proposalKindsForFeature(feature).length, feature).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("nothing runs an AI request by itself", () => {
  /*
   * V2.15's first non-goal: no background agent, no scheduled run, no
   * unattended anything. `grounded-ai-boundaries.test.ts` asserts the SERVER
   * half — no loader contacts a provider. This is the CLIENT half, and it is
   * the one a new surface is most likely to break by accident: a `useEffect`
   * that fetches on mount is the shape "it just runs when you open the page"
   * arrives in, and it would be nobody's deliberate decision.
   */
  const AI_SURFACES = APP.filter((entry) =>
    entry.file.startsWith("app/shared/ai/"),
  );

  it("has an AI surface, so this is not asserting over an empty set", () => {
    expect(AI_SURFACES.length).toBeGreaterThan(5);
  });

  it("starts no request from an effect, anywhere in the AI surfaces", () => {
    for (const { file, code } of AI_SURFACES) {
      expect(code, `${file} must not run on mount`).not.toMatch(
        /useEffect\s*\(/,
      );
    }
  });

  it("starts no request from a timer or an interval", () => {
    for (const { file, code } of AI_SURFACES) {
      expect(code, `${file} must not run on a timer`).not.toMatch(
        /setInterval\s*\(|setTimeout\s*\([^)]*run|requestIdleCallback/,
      );
    }
  });

  it("reaches the AI routes from exactly one place", () => {
    // Every AI request and every acceptance goes through the shared request
    // controller. A surface fetching `/ai/assist` or `/ai/apply` itself would
    // be a second client contract for the same two routes.
    const callers = APP.filter(
      (entry) =>
        entry.file !== "app/shared/ai/use-ai-request.ts" &&
        /["'`]\/ai\/(assist|apply)["'`]/.test(entry.code),
    ).map((entry) => entry.file);
    expect(callers).toEqual([]);
  });
});

describe("no module writes an AI mutation of its own", () => {
  it("keeps the V2.15 proposal kind names out of every module but AI", () => {
    /*
     * A Finance route that grew its own `transaction_category` acceptance would
     * be the second apply path the roadmap forbids, and it would not call the
     * authority — so a call-site sweep would not see it. The VOCABULARY is what
     * gives it away: a proposal kind named outside the AI module is a module
     * speaking a language that is not its own.
     *
     * Only the DISTINCTIVE kinds are swept, and the exclusion is stated rather
     * than quietly applied. `"task"`, `"note"` and `"link"` are three of the
     * most common string literals in the product — an entity type, a capture
     * type, a link kind, a nav id — so sweeping for them would report several
     * dozen files that have nothing to do with proposals, and a test that cries
     * wolf is a test somebody deletes. The V2.15 kinds are compound slugs that
     * appear nowhere else, which is exactly why they are checkable.
     */
    const distinctive = PROPOSAL_KINDS.filter((kind) => kind.includes("_"));
    expect(distinctive).toEqual([
      "transaction_category",
      "obligation_task",
      "review_reflection",
    ]);
    const offenders = APP.filter(
      (entry) =>
        !entry.file.startsWith("app/modules/ai/") &&
        !entry.file.startsWith("app/kernel/ai/") &&
        !entry.file.startsWith("app/shared/ai/") &&
        distinctive.some((kind) => entry.code.includes(`"${kind}"`)),
    ).map((entry) => entry.file);
    expect(offenders).toEqual([]);
  });
});
