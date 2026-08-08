/**
 * TODAY-DAY — the day model.
 *
 * These are the rules the Today screen's honesty rests on: what counts as
 * overdue, what counts as on today, when a zero is allowed to paint, and where a
 * task completed this morning goes. Every one is asserted against structured
 * data — never by reading a rendered string.
 */

import { describe, expect, it } from "vitest";

import {
  bucketDay,
  dayChips,
  dayPartForHour,
  dayProgress,
  greetingFor,
  isOnToday,
  isOverdue,
  overdueLabel,
  overdueSlice,
  relativePastLabel,
  type DayTask,
} from "~/modules/today/day/day-view";

const TODAY = "2026-08-08";

function task(overrides: Partial<DayTask> = {}): DayTask {
  return {
    id: "t1",
    title: "Ship it",
    parent: null,
    dueDate: null,
    scheduledDate: null,
    completed: false,
    completedDate: null,
    ...overrides,
  };
}

describe("what is overdue, and what is on today", () => {
  it("a past DUE date is overdue, and a past PLANNED date is too", () => {
    expect(isOverdue(task({ dueDate: "2026-08-06" }), TODAY)).toBe(true);
    expect(isOverdue(task({ scheduledDate: "2026-08-06" }), TODAY)).toBe(true);
  });

  it("due today is NOT overdue — the same rule the /tasks views use", () => {
    expect(isOverdue(task({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOnToday(task({ dueDate: TODAY }), TODAY)).toBe(true);
  });

  it("planned for today counts as on today even with no due date", () => {
    expect(isOnToday(task({ scheduledDate: TODAY }), TODAY)).toBe(true);
  });

  it("a task with no dates at all is on neither list", () => {
    expect(isOverdue(task(), TODAY)).toBe(false);
    expect(isOnToday(task(), TODAY)).toBe(false);
  });

  it("a completed task is never overdue, however far its date has passed", () => {
    const done = task({
      dueDate: "2020-01-01",
      completed: true,
      completedDate: TODAY,
    });
    expect(isOverdue(done, TODAY)).toBe(false);
  });

  it("names WHICH date slipped — a deadline outranks an intention", () => {
    expect(overdueLabel(task({ dueDate: "2026-08-07" }), TODAY)).toBe(
      "Due yesterday",
    );
    expect(overdueLabel(task({ scheduledDate: "2026-08-05" }), TODAY)).toBe(
      "Planned 3 days ago",
    );
    expect(
      overdueLabel(
        task({ dueDate: "2026-08-05", scheduledDate: "2026-08-01" }),
        TODAY,
      ),
    ).toBe("Due 3 days ago");
  });

  it("states the age, never a bare date, and graduates as it grows", () => {
    expect(relativePastLabel("2026-08-07", TODAY)).toBe("yesterday");
    expect(relativePastLabel("2026-07-30", TODAY)).toBe("9 days ago");
    expect(relativePastLabel("2026-07-09", TODAY)).toBe("30 days ago");
    expect(relativePastLabel("2026-07-08", TODAY)).toBe("1 month ago");
    expect(relativePastLabel("2026-05-08", TODAY)).toBe("3 months ago");
    // Precision stops being information: a task due in 2000 is not "9716 days".
    expect(relativePastLabel("2000-01-01", TODAY)).toBe("over a year ago");
  });
});

describe("bucketing", () => {
  const tasks = [
    task({ id: "late-a", title: "B late", dueDate: "2026-08-01" }),
    task({ id: "late-b", title: "A late", dueDate: "2026-08-06" }),
    task({ id: "now-b", title: "Beta", dueDate: TODAY }),
    task({ id: "now-a", title: "Alpha", scheduledDate: TODAY }),
    task({
      id: "done",
      title: "Zeta",
      dueDate: TODAY,
      completed: true,
      completedDate: TODAY,
    }),
    task({
      id: "done-yesterday",
      title: "Old",
      completed: true,
      completedDate: "2026-08-07",
    }),
    task({ id: "someday", title: "No dates" }),
  ];

  it("orders overdue oldest-slip first", () => {
    const buckets = bucketDay(tasks, TODAY);
    expect(buckets.overdue.map((item) => item.id)).toEqual([
      "late-a",
      "late-b",
    ]);
  });

  it("keeps a task completed TODAY at the end of the day's list, not gone", () => {
    const buckets = bucketDay(tasks, TODAY);
    expect(buckets.today.map((item) => item.id)).toEqual([
      "now-a",
      "now-b",
      "done",
    ]);
    expect(buckets.completedToday.map((item) => item.id)).toEqual(["done"]);
  });

  it("drops a task completed on an earlier day, and undated work", () => {
    const ids = bucketDay(tasks, TODAY).today.map((item) => item.id);
    expect(ids).not.toContain("done-yesterday");
    expect(ids).not.toContain("someday");
  });
});

describe("progress", () => {
  it("does not render before the first completion — a 0/8 bar is a guilt meter", () => {
    const buckets = bucketDay(
      [task({ id: "a", dueDate: TODAY }), task({ id: "b", dueDate: TODAY })],
      TODAY,
    );
    expect(dayProgress(buckets)).toBeNull();
  });

  it("counts completions over everything on today, completions included", () => {
    const buckets = bucketDay(
      [
        task({ id: "a", dueDate: TODAY }),
        task({ id: "b", dueDate: TODAY }),
        task({
          id: "c",
          dueDate: TODAY,
          completed: true,
          completedDate: TODAY,
        }),
      ],
      TODAY,
    );
    expect(dayProgress(buckets)).toEqual({ done: 1, total: 3 });
  });
});

describe("chips", () => {
  it("renders nothing at all on a quiet day", () => {
    expect(
      dayChips({ taskCount: 0, meetingCount: 0, overdueCount: 0 }),
    ).toEqual([]);
  });

  it("omits each chip independently, and never paints a zero", () => {
    const chips = dayChips({
      taskCount: 3,
      meetingCount: 0,
      overdueCount: 0,
    });
    expect(chips.map((chip) => chip.id)).toEqual(["tasks"]);
    expect(chips[0]?.label).toBe("3 tasks");
  });

  it("singularises against the noun", () => {
    const chips = dayChips({
      taskCount: 1,
      meetingCount: 1,
      overdueCount: 1,
    });
    expect(chips.map((chip) => chip.label)).toEqual([
      "1 task",
      "1 meeting",
      "1 overdue",
    ]);
  });

  it("spends the error tone on overdue and nothing else", () => {
    const chips = dayChips({
      taskCount: 2,
      meetingCount: 2,
      overdueCount: 2,
    });
    expect(chips.filter((chip) => chip.tone === "error")).toHaveLength(1);
    expect(chips.find((chip) => chip.tone === "error")?.id).toBe("overdue");
  });

  it("sends each chip to the view that holds its number", () => {
    const chips = dayChips({
      taskCount: 1,
      meetingCount: 1,
      overdueCount: 1,
    });
    expect(chips.map((chip) => chip.href)).toEqual([
      "/tasks?system=today",
      "/meetings",
      "/tasks?system=overdue",
    ]);
  });
});

describe("the overdue cap", () => {
  const many = Array.from({ length: 7 }, (_, index) =>
    task({ id: `t${index}`, dueDate: "2026-08-01" }),
  );

  it("draws three and states the true remainder", () => {
    const slice = overdueSlice(many);
    expect(slice.shown).toHaveLength(3);
    expect(slice.hidden).toBe(4);
  });

  it("says nothing about a remainder when there is none", () => {
    expect(overdueSlice(many.slice(0, 2)).hidden).toBe(0);
  });
});

describe("the greeting", () => {
  it("turns over at noon and at five, not at six", () => {
    expect(dayPartForHour(11)).toBe("morning");
    expect(dayPartForHour(12)).toBe("afternoon");
    expect(dayPartForHour(16)).toBe("afternoon");
    expect(dayPartForHour(17)).toBe("evening");
  });

  it("covers the whole clock", () => {
    expect(dayPartForHour(0)).toBe("morning");
    expect(dayPartForHour(23)).toBe("evening");
  });

  it("names the owner when it knows them, and does not guess when it does not", () => {
    expect(greetingFor("morning", "Aidan")).toBe("Good morning, Aidan");
    expect(greetingFor("evening", null)).toBe("Good evening");
    expect(greetingFor("afternoon", "  ")).toBe("Good afternoon");
  });
});
