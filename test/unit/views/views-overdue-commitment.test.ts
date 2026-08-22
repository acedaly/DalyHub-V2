/**
 * "Overdue" is a claim about work the owner still OWES.
 *
 * A record nobody is going to do cannot be late, and DHDS-13 gave the cross-view
 * date a colour — so a wrong answer here stopped being a wording slip and became
 * manufactured urgency in the danger red, which is the one thing
 * [`AGENTS.md` §2.4](../../../AGENTS.md) ("calm over urgent") rules out.
 *
 * The three closed states are the kernel's own, not this surface's judgement:
 * `app/kernel/tasks/task.ts` names them together as "the three TERMINAL/parked-
 * out-of-commitment states the whole product excludes: completed, cancelled and
 * Someday/Maybe". The two PARKED states — `waiting` and `on_hold` — are
 * deliberately absent from that list, because the same kernel note keeps them in
 * the `open` scope: they are work the owner still intends to do, blocked rather
 * than abandoned, and a Task somebody else is sitting on genuinely IS late.
 *
 * Both halves are asserted, because they are two different lies: `dateLabel`
 * says the word "Overdue", and `overdue` paints it.
 */

import { describe, expect, it } from "vitest";

import type { CrossViewResult, TaskResultDetail } from "~/kernel/views";
import { resultToItem } from "~/modules/views/views-presentation";

const TODAY = "2026-08-22";
const PAST = "2026-07-06";

function taskResult(detail: Partial<TaskResultDetail>): CrossViewResult {
  return {
    scope: "task",
    entityType: "task",
    id: "task-1",
    title: "Strip out the old kitchen",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    area: null,
    project: null,
    goal: null,
    archived: false,
    dueDate: PAST,
    detail: {
      kind: "task",
      status: "todo",
      priority: null,
      timeSector: null,
      completed: false,
      waiting: false,
      delegatedTo: null,
      someday: false,
      ...detail,
    },
  };
}

const item = (detail: Partial<TaskResultDetail>) =>
  resultToItem(taskResult(detail), TODAY, "d_mmm_yyyy");

describe("a cross-view date is overdue only while the Task is still owed", () => {
  it("calls an open Task with a passed due date overdue, in words and in state", () => {
    const open = item({});
    expect(open.overdue).toBe(true);
    expect(open.dateLabel).toMatch(/^Overdue/);
  });

  it("keeps a WAITING Task overdue — blocked is not abandoned", () => {
    const waiting = item({ status: "todo", waiting: true });
    expect(waiting.overdue).toBe(true);
    expect(waiting.dateLabel).toMatch(/^Overdue/);
  });

  it("keeps an ON HOLD Task overdue, for the same reason", () => {
    const onHold = item({ status: "on_hold" });
    expect(onHold.overdue).toBe(true);
  });

  for (const [name, detail] of [
    ["completed", { completed: true }],
    ["cancelled", { status: "cancelled" as const }],
    ["Someday / Maybe", { someday: true }],
  ] as const) {
    it(`never calls a ${name} Task overdue, and never says the word`, () => {
      const closed = item(detail);
      expect(closed.overdue).toBe(false);
      // The label is the other half: it printed "Overdue — due 6 Jul 2026"
      // beside the record's own "Cancelled" status word before this was fixed.
      expect(closed.dateLabel).not.toMatch(/Overdue/);
      expect(closed.dateLabel).toBe("Due 6 Jul 2026");
    });
  }

  it("lets Someday/Maybe win over waiting, because commitment is the question", () => {
    /*
     * A Task can be both, and the seeded `t-ds-71` is: `someday` with a waiting
     * note. `statusLabelOf` prints "Waiting" first, so the row SAYS Waiting
     * while the record is parked out of commitment — and out of commitment is
     * what decides whether a date can be late. Pinned because the two states
     * disagree about which word is shown, and a future reader will otherwise
     * read the row as a waiting Task that lost its overdue mark.
     */
    const both = item({ waiting: true, someday: true });
    expect(both.overdue).toBe(false);
    expect(both.dateLabel).not.toMatch(/Overdue/);
  });

  it("does not call a FUTURE date on an open Task overdue", () => {
    const future = resultToItem(
      { ...taskResult({}), dueDate: "2026-09-01" },
      TODAY,
      "d_mmm_yyyy",
    );
    expect(future.overdue).toBe(false);
  });

  it("has nothing to say about a Task with no due date", () => {
    const undated = resultToItem(
      { ...taskResult({}), dueDate: null },
      TODAY,
      "d_mmm_yyyy",
    );
    expect(undated.overdue).toBe(false);
    expect(undated.dateLabel).toBeNull();
  });
});
