import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.10 LIFE-00 — the obligation domain REGISTRY.
 *
 * The item's claim is that there is exactly ONE obligation domain and that it
 * carries no Asset assumption. That claim is not self-enforcing: the failure
 * mode is not a broken test but a second, plausible copy — a `describeX` here,
 * a category list there — appearing months later because the shared one was
 * slightly inconvenient. ADR-117 records the same hazard for
 * `analytics-range.ts`, where a thin alias would have kept a second range
 * vocabulary alive behind a re-export.
 *
 * So this test states what is true and fails when any count moves in either
 * direction:
 *
 *   1. `app/kernel/obligations` imports NO other product domain. Its whole
 *      reason to exist is that a commitment with no Asset can use it.
 *   2. There is exactly one `evaluateObligation` implementation, and it is
 *      there. `evaluateAssetObligation` is a composition that supplies the
 *      meter side — asserted to delegate rather than to decide.
 *   3. There is exactly one closed obligation category vocabulary and one
 *      closed status vocabulary, both there.
 *   4. The product has exactly THREE recurrence engines — Tasks, obligations,
 *      Habits — each with its recorded reason (ADR-116 decision 1). A fourth
 *      fails here.
 *
 * Read as source with comments stripped, so prose about a rule can neither
 * satisfy nor trip it. The technique is CONV-01's
 * `test/unit/task-record/shared-row-consumers.test.ts`.
 */

const ROOT = process.cwd();
const OBLIGATIONS_DIR = path.join(ROOT, "app", "kernel", "obligations");
const KERNEL_DIR = path.join(ROOT, "app", "kernel");

/** Strip comments, so a rule about code is never satisfied or tripped by prose. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function readCode(file: string): string {
  return code(readFileSync(file, "utf8"));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [path.join(dir, entry.name)]
        : [],
  );
}

describe("the obligation domain is one domain", () => {
  it("imports no other product domain — only the calendar-day primitive", () => {
    /*
     * Three kernel PRIMITIVES are allowed, and nothing else. Each is a
     * single-authority module the whole product shares — the calendar day, the
     * money representation, the workspace scope — so depending on one is what
     * stops a second implementation appearing rather than a domain dependency.
     * It is the same choice `app/kernel/history` made for owner-day resolution
     * (ADR-117 d1). Anything else — and `~/kernel/assets` above all — puts the
     * Asset assumption straight back into the arithmetic this item removed.
     */
    const ALLOWED = new Set([
      // The product's ONE calendar-day implementation (DEBT-52).
      "~/kernel/datetime",
      // The product's ONE money representation (ADR-049). Depending on it is
      // what STOPS a second money model appearing, which is the opposite of a
      // domain dependency.
      "~/kernel/money",
      // The workspace scope every repository contract is bound to (ADR-010).
      "~/kernel/workspaces",
    ]);
    const offenders: string[] = [];

    for (const file of filesUnder(OBLIGATIONS_DIR)) {
      const source = readCode(file);
      for (const [, specifier] of source.matchAll(
        /from\s+"([^"]+)"/g,
      ) as Iterable<RegExpMatchArray>) {
        if (specifier.startsWith(".")) continue;
        if (ALLOWED.has(specifier)) continue;
        offenders.push(`${path.relative(ROOT, file)} → ${specifier}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("holds the only evaluateObligation, and the Asset one delegates to it", () => {
    const implementations = filesUnder(KERNEL_DIR).filter((file) =>
      /export\s+function\s+evaluateObligation\b/.test(readCode(file)),
    );

    expect(implementations.map((f) => path.relative(ROOT, f))).toEqual([
      "app/kernel/obligations/obligation.ts",
    ]);

    /*
     * The Asset composition may not re-derive urgency: it computes the meter
     * side and hands it over. If it ever grows its own `state`/`needsAttention`
     * decision, Today and the Asset record can disagree about the same rego.
     */
    const bridge = readCode(
      path.join(KERNEL_DIR, "assets", "asset-obligation.ts"),
    );
    expect(bridge).toContain("return evaluateObligation(");
    expect(bridge).not.toMatch(/needsAttention\s*:/);
  });

  it("holds the only closed category and status vocabularies", () => {
    const categoryDeclarations = filesUnder(KERNEL_DIR).filter((file) =>
      /export\s+const\s+OBLIGATION_CATEGORIES\b/.test(readCode(file)),
    );
    const statusDeclarations = filesUnder(KERNEL_DIR).filter((file) =>
      /export\s+const\s+OBLIGATION_STATUSES\b/.test(readCode(file)),
    );

    expect(categoryDeclarations.map((f) => path.relative(ROOT, f))).toEqual([
      "app/kernel/obligations/obligation-category.ts",
    ]);
    expect(statusDeclarations.map((f) => path.relative(ROOT, f))).toEqual([
      "app/kernel/obligations/obligation-status.ts",
    ]);
  });
});

describe("the product has three recurrence engines, and no more", () => {
  /**
   * Each entry is an ENGINE — a module that decides when the next occurrence
   * of something falls — with the reason it is separate. ADR-116 decision 1
   * fixes the count at three; adding a fourth is a decision, not a refactor,
   * and it fails this test until somebody records it.
   */
  const ENGINES: readonly { readonly file: string; readonly why: string }[] = [
    {
      file: "app/kernel/tasks/task-recurrence.ts",
      why: "Tasks: fixed vs after-completion scheduling, ordinals, weekend rules and end conditions — the engine for what you DO.",
    },
    {
      file: "app/kernel/obligations/obligation-recurrence.ts",
      why: "Obligations: a (kind, interval) pair anchored on the day the work was actually done, plus a meter dimension — the engine for what you must DEAL WITH.",
    },
    {
      file: "app/kernel/habits/habit-schedule.ts",
      why: "Habits: effective-dated schedule versions, because changing a habit's cadence must not rewrite its history.",
    },
  ];

  it("enumerates exactly the three engines, each still present", () => {
    for (const engine of ENGINES) {
      expect(
        readCode(path.join(ROOT, engine.file)).length,
        `${engine.file} — ${engine.why}`,
      ).toBeGreaterThan(0);
    }
    expect(ENGINES).toHaveLength(3);
  });

  it("has no fourth advance-the-next-occurrence helper in the kernel", () => {
    /*
     * A fourth engine announces itself as a function that advances a schedule.
     * The three above own that verb; anything else claiming it is either a
     * duplicate to converge or a decision to record here.
     */
    const KNOWN = new Set(ENGINES.map((e) => path.join(ROOT, e.file)));
    const offenders = filesUnder(KERNEL_DIR)
      .filter((file) => !KNOWN.has(file))
      .filter((file) =>
        /export\s+function\s+next(Obligation|Task|Habit|Occurrence|Recurrence)\w*\s*\(/.test(
          readCode(file),
        ),
      )
      .map((f) => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });
});
