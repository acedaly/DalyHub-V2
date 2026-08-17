/**
 * TODAY-TASK-01 / DEBT-143 — there is ONE product-level task row.
 *
 * DEBT-143's closing condition is written as a source check, and deliberately:
 * "`grep -n "function TaskRow" app/modules/today` returns nothing". That is not
 * a stylistic preference about where components live — it is the whole content
 * of the debt. Today drawing its own row is what made the same object have two
 * anatomies and, with it, two sets of capabilities; a behavioural test can prove
 * the CURRENT screen is right, but only a structural one can stop the next
 * redesign quietly forking the row again because the shared one was awkward
 * that afternoon.
 *
 * So this asserts the structure, in the terms the debt itself uses.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const TODAY_DIR = path.join(process.cwd(), "app", "modules", "today");

/** Every source file in the Today module. */
function todayFiles(dir = TODAY_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...todayFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("DEBT-143 — the Today module declares no task row of its own", () => {
  it("defines no `TaskRow`-shaped component anywhere under app/modules/today", () => {
    /*
     * The names the debt entry rules out by name — `TaskRow`, and the three
     * "compact variant" names a future pass would reach for instead — as
     * DECLARATIONS. A file may still IMPORT `TaskRow`; that is the whole point.
     */
    const declaration =
      /\b(?:function|const|class)\s+(TaskRow|TodayTaskRow|CompactTodayTaskRow|DashboardTaskRow|DayTaskRow|PlanTaskRow)\b/;
    const offenders = todayFiles()
      .map((file) => ({ file, source: readFileSync(file, "utf8") }))
      .filter(({ source }) => declaration.test(source))
      .map(({ file }) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  it("draws its plan with the shared row and the shared list", () => {
    const screen = readFileSync(
      path.join(TODAY_DIR, "day", "TodayScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain('from "~/shared/task-record/TaskRow"');
    expect(screen).toContain('from "~/shared/task-record/TaskList"');
    // …and the shared long tail, rather than a menu assembled here.
    expect(screen).toContain('from "~/shared/task-record/task-row-actions"');
  });

  it("posts every row mutation to the canonical Task routes, and owns none", () => {
    /*
     * "No second mutation authority" made structural.
     *
     * Today may HOST a row's mutations — it holds the optimistic patch map and
     * the revalidation, which are properties of a surface — but every write must
     * leave through the shared posters, which target `/tasks/:id` and
     * `/tasks/bulk`. A `fetch("/today/...")` or a route action of its own inside
     * this module would be the fork this item exists to prevent.
     */
    const host = readFileSync(
      path.join(TODAY_DIR, "day", "use-day-task-actions.ts"),
      "utf8",
    );
    expect(host).toContain('from "~/shared/task-record/task-inline-edit"');
    // No hand-rolled request anywhere in the host.
    expect(host).not.toMatch(/\bfetch\s*\(/);
  });
});
