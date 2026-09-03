/**
 * V2.8 CONV-01 / ADR-115 decision 2 — a Task is rendered by the shared row
 * wherever it can be acted on, and the row's consumers are ENUMERATED.
 *
 * The property this pins is the one DEBT-175 was raised for and F-09 proved:
 * *a fact added to `TaskRow` appears on every actionable surface with no
 * per-surface change*. That is true exactly while every actionable surface
 * renders the shared component — and it stops being true the afternoon one of
 * them grows a second anatomy because the shared row was awkward. A behavioural
 * test can prove the CURRENT tab is right; only a structural one can stop the
 * next redesign quietly forking the row again (the same reasoning
 * `one-task-row.test.ts` records for Today).
 *
 * So this asserts the contract in the terms ADR-115 states it:
 *
 *   1. the actionable consumers are a NAMED set, and every one of them imports
 *      the shared `TaskRow` and the shared `TaskList` — not a `Card`, not a
 *      module-private row;
 *   2. the Project record's Tasks tab is one of them, renders no generic Card,
 *      builds no Card props and posts nothing through a private bulk path;
 *   3. the tab passes NO drag capability — the Project scope draws no drop
 *      destination and stores no order (DEBT-188), so the row's `dragHandle`
 *      slot is left unpassed rather than a Project-local order invented;
 *   4. the standing exception in `e2e/helpers.ts` that said a Project's tasks
 *      are not `TaskRow`s is gone, and no shared source still says so.
 *
 * Falsified before it was trusted: restoring the old `Card` import to the tab,
 * routing a bulk action through a private `postTaskBulkAction`, and passing a
 * `dragHandle` from the tab each make exactly one assertion below fail.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Strip block and line comments so a prose mention cannot satisfy or break a rule. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Every surface on which a Task can be ACTED ON — completed, edited, moved —
 * rather than merely referred to (ADR-115 decision 3: a search result, a
 * cross-view row, a Meeting follow-up row and the next-action line are LINKS).
 *
 * A new actionable Task surface joins this list in the change that adds it;
 * one that leaves it does so by ceasing to draw Tasks, never by drawing them
 * another way.
 */
const ACTIONABLE_TASK_SURFACES = [
  "app/modules/tasks/TasksWorkspace.tsx",
  "app/modules/today/day/TodayScreen.tsx",
  "app/modules/plan/PlanWorkspace.tsx",
  "app/modules/projects/ProjectTasksTab.tsx",
] as const;

const PROJECT_TAB = "app/modules/projects/ProjectTasksTab.tsx";

describe("ADR-115 — one Task row, and its consumers are enumerated", () => {
  it("every actionable Task surface renders the shared TaskRow inside the shared TaskList", () => {
    for (const file of ACTIONABLE_TASK_SURFACES) {
      const source = code(read(file));
      expect(source, `${file} imports the shared row`).toContain(
        'from "~/shared/task-record/TaskRow"',
      );
      expect(source, `${file} imports the shared list`).toContain(
        'from "~/shared/task-record/TaskList"',
      );
      expect(source, `${file} renders the shared row`).toMatch(/<TaskRow\b/);
      // …and the shared long tail, rather than a menu assembled per surface.
      expect(
        source,
        `${file} builds its overflow from the shared set`,
      ).toContain('from "~/shared/task-record/task-row-actions"');
    }
  });

  it("the Project tab is a consumer, not a second anatomy", () => {
    const source = code(read(PROJECT_TAB));
    // DEBT-175's closing condition, in its own words.
    expect(source).not.toContain('from "~/shared/card"');
    expect(source).not.toMatch(
      /\bCardProps\b|\bCardMetaItem\b|toTaskCardProps/,
    );
    // No private completion control and no private mutation path: every write
    // leaves through the shared host or the shared bar.
    expect(source).not.toMatch(/\bpostTaskBulkAction\b/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).toContain(
      'from "~/shared/task-record/use-task-surface-actions"',
    );
    expect(source).toContain('from "~/shared/task-record/TaskBulkActionBar"');
    expect(source).toContain('from "~/shared/task-record/task-selection"');
    expect(source).toContain('from "~/shared/task-record/use-departing-rows"');
    expect(source).toContain('from "~/shared/task-record/TaskTitleEditor"');
  });

  it("the Project tab passes no drag capability — no grip, no order, no reorder request", () => {
    const source = code(read(PROJECT_TAB));
    expect(source).not.toMatch(/\bdragHandle\b/);
    expect(source).not.toMatch(/\bdragging\b/);
    expect(source).not.toMatch(
      /DragHandle|TaskDragging|useTaskDrop|SortableList/,
    );
    expect(source).not.toMatch(/\breorder\b|\brank\b|manual_order|sort_order/);
  });

  it("the shared bulk bar exists once and is the one /tasks and the Project tab render", () => {
    const tasks = code(read("app/modules/tasks/TasksWorkspace.tsx"));
    const tab = code(read(PROJECT_TAB));
    expect(tasks).toMatch(/<TaskBulkActionBar\b/);
    expect(tab).toMatch(/<TaskBulkActionBar\b/);
    // The bar declared privately in the workspace is gone, not shadowed.
    expect(tasks).not.toMatch(/function BulkActionBar\b/);
    const bar = code(read("app/shared/task-record/TaskBulkActionBar.tsx"));
    expect(bar).toContain('action: "/tasks/bulk"');
  });

  it("no shared source still carries the Project-tab exception", () => {
    for (const file of [
      "e2e/helpers.ts",
      "app/shared/task-record/TaskRow.tsx",
      PROJECT_TAB,
    ]) {
      const source = read(file);
      expect(
        source,
        `${file} no longer claims the tab is not a TaskRow`,
      ).not.toMatch(
        /does not render `?TaskRow`? yet|LAST task-bearing surface that has not adopted|still renders cards/,
      );
    }
  });
});
