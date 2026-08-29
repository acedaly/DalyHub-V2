/**
 * STEER-05 criterion 2 — the week's door reads the SAME period authority the
 * Reviews module reads, asserted STRUCTURALLY.
 *
 * The criterion is explicit about why this is a source-level guard rather than
 * a value comparison: *"asserted structurally (one import path), not by two
 * values agreeing today."* Two independent derivations of "the owner's calendar
 * week" would agree on every day this suite could plausibly run — that is
 * exactly what DEBT-152 / DEBT-154 found when `weeklyPeriod`, `planningWeek`,
 * `habitWeek` and Today's strip were four derivations of one rule and only
 * three of them read the preference. The drift was invisible precisely because
 * the values matched.
 *
 * So this file asserts the SHAPE:
 *
 *   1. Exactly one module owns the rule — `app/kernel/reviews/review-periods.ts`.
 *   2. Every consumer reaches it through the one published path,
 *      `~/kernel/reviews`; nobody deep-imports the file, and nobody re-declares
 *      the function.
 *   3. Today's door computes NO week arithmetic of its own — no
 *      `planningWeekStart`, no day offsets, no `weekDatesFor`.
 *   4. Today's door and the Reviews module's own creation form call the very
 *      same function, so "which week is this?" cannot have two answers.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

/**
 * The file's CODE, with comments removed.
 *
 * The scans below are about what the module does, and a doc comment that names
 * the rule it deliberately does NOT use ("Today does not re-derive the week
 * from `planningWeekStart`") is the opposite of the defect — it must not be the
 * thing that fails the guard.
 */
function code(relative: string): string {
  return source(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every `.ts`/`.tsx` file under `app/`, so the scans below cannot miss one. */
function appSources(dir = "app", out: string[] = []): readonly string[] {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const relative = path.join(dir, name);
    if (statSync(path.join(ROOT, relative)).isDirectory()) {
      appSources(relative, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(relative);
    }
  }
  return out;
}

/** The one module that may define the rule. */
const AUTHORITY = path.join("app", "kernel", "reviews", "review-periods.ts");

/** The published path every consumer must reach it through. */
const IMPORT_PATH = "~/kernel/reviews";

/** Today's door, and the Reviews module's own creation form. */
const DOOR = path.join("app", "modules", "today", "day", "review-door.ts");
const NEW_REVIEW_FORM = path.join(
  "app",
  "modules",
  "reviews",
  "NewReviewForm.tsx",
);

describe("one period authority", () => {
  it("is DECLARED in exactly one module", () => {
    const declarations = appSources().filter((file) =>
      /export\s+function\s+currentReviewPeriod\b/.test(code(file)),
    );
    expect(declarations).toEqual([AUTHORITY]);
  });

  it("is reached by every consumer through the one published path", () => {
    const consumers = appSources().filter(
      (file) =>
        file !== AUTHORITY &&
        /\bcurrentReviewPeriod\s*\(/.test(code(file)) &&
        !file.startsWith(path.join("app", "kernel", "reviews")),
    );
    // The door is one of them — a scan that found nothing would pass vacuously.
    expect(consumers).toContain(DOOR);
    expect(consumers).toContain(NEW_REVIEW_FORM);

    for (const file of consumers) {
      const text = code(file);
      expect(
        text.includes(`from "${IMPORT_PATH}"`),
        `${file} calls currentReviewPeriod but does not import from "${IMPORT_PATH}"`,
      ).toBe(true);
      // A deep import would bind to the same code today and be a second,
      // unpublished path to it tomorrow.
      expect(
        /from\s+"[^"]*kernel\/reviews\/review-periods"/.test(text),
        `${file} deep-imports the period module instead of the module's index`,
      ).toBe(false);
    }
  });
});

describe("Today's door derives no week of its own", () => {
  const text = code(DOOR);

  it("imports the period rule and the period label from the kernel", () => {
    expect(text).toMatch(
      /import\s*\{[^}]*currentReviewPeriod[^}]*\}\s*from\s*"~\/kernel\/reviews"/s,
    );
    expect(text).toMatch(
      /import\s*\{[^}]*reviewPeriodLabel[^}]*\}\s*from\s*"~\/kernel\/reviews"/s,
    );
  });

  it.each([
    // Every other module in the product that knows what a week is.
    "planningWeekStart",
    "weekDatesFor",
    "goalMovementWindow",
    "habitWeek",
    // …and the shapes a hand-rolled week takes.
    "addCalendarDays",
    "getDay(",
    "86_400_000",
    "86400000",
  ])("never reaches for %s", (word) => {
    expect(
      text.includes(word),
      `review-door.ts mentions "${word}" — the owner's week comes from currentReviewPeriod and nowhere else`,
    ).toBe(false);
  });

  it("asks the Reviews module for the answer rather than the Reviews tables", () => {
    // The existence read is the repository contract's own bounded lookup — the
    // same one `create` performs. Today writes no SQL and knows no table name.
    expect(text).toContain("scope.reviews.findPeriodEntry");
    expect(text.toUpperCase()).not.toContain("SELECT ");
    expect(text).not.toContain("review_details");
  });
});
