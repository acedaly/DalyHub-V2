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

import { readFileSync, readdirSync, statSync } from "node:fs";
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
  // V2.8 CONV-02 — the Waiting list, the layer's last Card consumer.
  "app/modules/today/task/WaitingTasks.tsx",
] as const;

const WAITING_SURFACE = "app/modules/today/task/WaitingTasks.tsx";
const WAITING_ROUTE = "app/modules/today/routes/waiting.tsx";

/**
 * V2.8 CONV-02 / ADR-115 decision 3 — the REFERENCE surfaces: a Task named on
 * them is a link with at most the signal primitives, never a row. They must
 * not adopt the row, and they must not grow a completion control, a Task
 * overflow menu or an inline editor of their own.
 */
const TASK_REFERENCE_SURFACES = [
  "app/shared/search/SearchSurface.tsx",
  "app/modules/views/ViewsWorkspace.tsx",
  "app/modules/meetings/MeetingFollowUp.tsx",
  "app/shared/task-record/NextActionLine.tsx",
] as const;

/**
 * Where a Task is RENDERED. Any file under these roots that imports the shared
 * generic Card must be in the allow-list below with the non-Task thing it
 * draws — so a future Task surface cannot quietly fork back into the Card.
 */
const TASK_RENDERING_ROOTS = [
  "app/modules/tasks",
  "app/modules/projects",
  "app/modules/today",
  "app/modules/plan",
  "app/shared/task-record",
] as const;

/** Generic-Card importers under those roots, each drawing something that is NOT a Task. */
const CARD_IMPORTERS_NOT_FOR_TASKS: Readonly<Record<string, string>> = {
  "app/modules/projects/ProjectKnowledgeTab.tsx": "linked Notes and Meetings",
  "app/modules/projects/ProjectsCollection.tsx": "the Projects gallery",
  "app/modules/projects/GoalSummarySection.tsx": "Goal progress rows",
  "app/modules/projects/project-view.ts": "a tone type and a progress helper",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) {
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

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

/* -------------------------------------------------------------------------- */
/* V2.8 CONV-02 — the Waiting consumer, the reference rule, the CSS guard      */
/* -------------------------------------------------------------------------- */

describe("CONV-02 — the Waiting list is a consumer, not a second anatomy", () => {
  it("renders the shared row through the shared host, and nothing Card-shaped", () => {
    const surface = code(read(WAITING_SURFACE));
    const route = code(read(WAITING_ROUTE));
    for (const source of [surface, route]) {
      expect(source).not.toContain('from "~/shared/card"');
      expect(source).not.toMatch(
        /\bCardProps\b|\bCardMetaItem\b|\bCardCollection\b|WaitingTaskCard|toWaitingCardProps|toWaitingCardData/,
      );
    }
    expect(surface).toContain(
      'from "~/shared/task-record/use-task-surface-actions"',
    );
    expect(surface).toContain('from "~/shared/task-record/use-departing-rows"');
    expect(surface).toContain('from "~/shared/task-record/TaskTitleEditor"');
    expect(surface).not.toMatch(/\bfetch\s*\(/);
    expect(surface).not.toMatch(
      /\bpostTaskBulkAction\b|\bpostTaskRecordAction\b/,
    );
  });

  it("passes the waiting fact through the row's ONE slot, built by the shared helper", () => {
    const surface = code(read(WAITING_SURFACE));
    expect(surface).toMatch(/\btaskRowWaitingFact\b/);
    // No second formatter: the surface never formats a subject, a since or a
    // follow-up date itself.
    expect(surface).not.toMatch(
      /formatWaitingSince|formatWaitingElapsed|waitingSubjectLabel|relativeCalendarDate|taskFollowUpPresentation/,
    );
    // And the route file is a loader: nothing about a row lives there.
    const route = code(read(WAITING_ROUTE));
    expect(route).not.toMatch(/<TaskRow\b|<Card\b/);
  });

  it("switches selection, drag and 'Plan for today' OFF through the row's contract — never by forking it", () => {
    const surface = code(read(WAITING_SURFACE));
    expect(surface).not.toMatch(/\bselection\s*:/);
    expect(surface).not.toMatch(
      /\bonLongPress\b|TaskBulkActionBar|taskSelectionReducer/,
    );
    expect(surface).not.toMatch(/\bdragHandle\b|DragHandle|TaskDragging/);
    expect(surface).not.toMatch(/\bonPlanToday\b/);
    // …and it invents no waiting-specific system: no snooze, no reminder, no
    // second follow-up editor.
    expect(surface).not.toMatch(/snooze|reminder|followUpOn\s*:/i);
  });

  it("the waiting Card, its test and its stylesheet block are gone", () => {
    expect(() => read("app/modules/today/task/WaitingTaskCard.tsx")).toThrow();
    expect(() => read("test/unit/today/WaitingTaskCard.test.tsx")).toThrow();
    expect(read("app/styles/today.css")).not.toContain("dh-waiting-card");
  });
});

describe("CONV-02 — no Task surface imports the generic Card to draw a Task", () => {
  it("every generic-Card importer under a Task-rendering root is an allow-listed non-Task use", () => {
    const importers = TASK_RENDERING_ROOTS.flatMap(sourceFiles).filter((file) =>
      code(read(file)).includes('from "~/shared/card"'),
    );
    for (const file of importers) {
      expect(
        CARD_IMPORTERS_NOT_FOR_TASKS[file],
        `${file} imports the generic Card and is not allow-listed as a non-Task use`,
      ).toBeDefined();
    }
    // The allow-list is not stale either: every entry still imports it.
    for (const file of Object.keys(CARD_IMPORTERS_NOT_FOR_TASKS)) {
      expect(importers, `${file} no longer imports the Card`).toContain(file);
    }
  });

  it("the roadmap's own grep is empty on the surfaces it names", () => {
    for (const file of [
      ...sourceFiles("app/modules/tasks"),
      ...sourceFiles("app/modules/today/task"),
      WAITING_ROUTE,
    ]) {
      expect(code(read(file)), `${file}`).not.toContain('from "~/shared/card"');
    }
  });
});

describe("CONV-02 — the Card override layer is gone", () => {
  it("tasks.css carries no Task-collection Card rule", () => {
    const css = read("app/styles/tasks.css").replace(/\/\*[\s\S]*?\*\//g, "");
    // Every selector in the file, with whitespace collapsed.
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((match) =>
      match[1]!.replace(/\s+/g, " ").trim(),
    );
    const offenders = selectors.filter(
      (selector) =>
        /dh-collection--tasks|dh-tasklist/.test(selector) &&
        /\.dh-card\b|\.dh-card__|dh-card-collection/.test(selector),
    );
    expect(offenders).toEqual([]);
    // Nothing else in the file addresses the Card's metadata anatomy either.
    expect(css).not.toMatch(
      /\.dh-card__meta\b|data-field="waiting-for"|container-name: tasks-list/,
    );
  });

  it("no stylesheet declares a Task-specific container ladder outside the shared list", () => {
    const styles = sourceFilesCss("app/styles").filter(
      (file) => !file.endsWith("task-list.css"),
    );
    for (const file of styles) {
      expect(read(file), `${file}`).not.toMatch(/@container tasks-list\b/);
    }
  });
});

function sourceFilesCss(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir))
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => `${dir}/${entry}`);
}

describe("ADR-115 decision 3 — exactly one TaskRow, and a reference is a link", () => {
  it("exactly one component in app/ is declared TaskRow, and it is the shared exported row", () => {
    const declaration = /\b(?:function|const|class)\s+TaskRow\b/;
    const declared = sourceFiles("app").filter((file) =>
      declaration.test(code(read(file))),
    );
    expect(declared).toEqual(["app/shared/task-record/TaskRow.tsx"]);
    expect(code(read("app/shared/task-record/TaskRow.tsx"))).toMatch(
      /export function TaskRow\b/,
    );
    // The offline snapshot's read-only row is named as one, and stays private.
    const snapshot = code(read("app/shared/offline/OfflineSnapshotView.tsx"));
    expect(snapshot).toMatch(/\bfunction SnapshotTaskRow\b/);
    expect(snapshot).not.toMatch(/export function SnapshotTaskRow\b/);
    expect(snapshot).not.toContain('from "~/shared/task-record/TaskRow"');
  });

  it("the four reference surfaces do not adopt the row and grow no Task controls", () => {
    for (const file of TASK_REFERENCE_SURFACES) {
      const source = code(read(file));
      expect(source, `${file} must not import the shared row`).not.toContain(
        'from "~/shared/task-record/TaskRow"',
      );
      expect(source, `${file} must not import the row's editors`).not.toMatch(
        /task-record\/TaskRowFields|task-record\/TaskList|task-record\/task-row-actions|task-record\/TaskBulkActionBar|task-record\/use-task-surface-actions|task-record\/TaskTitleEditor/,
      );
      // No completion control and no Task overflow menu, by their product-wide
      // names rather than by a CSS class.
      expect(source, `${file} draws no completion control`).not.toMatch(
        /dh-check-circle|task-complete|Complete \$\{|Reopen \$\{/,
      );
      expect(source, `${file} draws no Task overflow menu`).not.toMatch(
        /More actions for|\boverflowActions\b/,
      );
    }
  });
});
