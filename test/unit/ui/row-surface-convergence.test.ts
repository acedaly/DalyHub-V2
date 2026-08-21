/**
 * DHDS-02 — dense rows tell the same story everywhere.
 *
 * The failure this guards was structural: CSS visually reordered Task metadata
 * without moving the DOM, Plan copied TaskGroup's heading by hand, and Schedule
 * kept its secondary action permanently in the content stack. A screenshot can
 * catch one fixture; these checks stop a future module from quietly restoring
 * the divergence at the source boundary.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("DHDS-02 — row and grouped-surface convergence", () => {
  it("keeps Task metadata in when, where, importance order in DOM and grid", () => {
    const row = read("app", "shared", "task-record", "TaskRow.tsx");
    const css = read("app", "styles", "task-list.css");

    const due = row.indexOf(
      'className="dh-taskrow__cell dh-taskrow__cell--due"',
    );
    const project = row.indexOf(
      'className="dh-taskrow__cell dh-taskrow__cell--project"',
    );
    const priority = row.indexOf(
      'className="dh-taskrow__cell dh-taskrow__cell--priority"',
    );
    const state = row.indexOf(
      'className="dh-taskrow__cell dh-taskrow__cell--status"',
    );

    expect(due).toBeGreaterThan(-1);
    expect([due, project, priority, state]).toEqual(
      [...[due, project, priority, state]].sort((a, b) => a - b),
    );
    expect(css).toMatch(/\.dh-taskrow__cell--due\s*{[^}]*grid-column:\s*3;/s);
    expect(css).toMatch(
      /\.dh-taskrow__cell--project\s*{[^}]*grid-column:\s*4;/s,
    );
    expect(css).toMatch(
      /\.dh-taskrow__cell--priority\s*{[^}]*grid-column:\s*5;/s,
    );
  });

  it("owns contextual action visibility once and opts all row families in", () => {
    // DHDS-08 moved the contract from `base.css` into the shared motion layer.
    // The class names and the behaviour are unchanged; only the file is, and
    // this test's job is to keep it in exactly ONE of them.
    const motion = read("app", "styles", "motion.css");
    const base = read("app", "styles", "base.css");
    const taskRow = read("app", "shared", "task-record", "TaskRow.tsx");
    const recordRow = read("app", "shared", "card", "RecordRow.tsx");
    const schedule = read(
      "app",
      "modules",
      "today",
      "schedule",
      "ScheduleList.tsx",
    );

    expect(motion).toContain(
      '[data-dh-action-context="true"] .dh-action-reveal',
    );
    expect(motion).toContain("pointer-events: none");
    // …and only there: a second copy is how the two drift apart.
    expect(base).not.toContain(".dh-action-reveal {");
    for (const consumer of [taskRow, recordRow, schedule]) {
      expect(consumer).toContain("dh-action-reveal");
      expect(consumer).toContain("data-dh-action-context");
    }
  });

  it("uses the shared TaskGroup for both Tasks and Plan queue bands", () => {
    const tasks = read("app", "modules", "tasks", "TasksWorkspace.tsx");
    const plan = read("app", "modules", "plan", "PlanWorkspace.tsx");

    expect(tasks).toContain("<TaskGroup");
    expect(plan).toContain("<TaskGroup");
    expect(plan).not.toContain('className="dh-plan__queue-band"');
  });
});
