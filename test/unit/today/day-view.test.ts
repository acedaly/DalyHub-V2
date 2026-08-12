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
  FOCUS_BAND_MIN,
  FOCUS_TODAY_SHOWN,
  focusBand,
  focusTodaySlice,
  greetingFor,
  overdueLabel,
  overdueSlice,
  relativePastLabel,
  tasksForTodayCount,
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
    priority: null,
    completed: false,
    completedDate: null,
    ...overrides,
  };
}

describe("what is overdue, and what is on today", () => {
  /*
   * Asserted through `focusBand`, which is the ONE place the day answers both
   * questions since TODAY-10. The rules are unchanged; the helpers that used to
   * answer them separately are gone rather than left beside it as a second
   * definition of "overdue".
   */
  it("a past DUE date is overdue, and a past PLANNED date is too", () => {
    expect(focusBand(task({ dueDate: "2026-08-06" }), TODAY)).toBe("overdue");
    expect(focusBand(task({ scheduledDate: "2026-08-06" }), TODAY)).toBe(
      "overdue",
    );
  });

  it("due today is NOT overdue — the same rule the /tasks views use", () => {
    expect(focusBand(task({ dueDate: TODAY }), TODAY)).toBe("due");
  });

  it("planned for today counts as on today even with no due date", () => {
    expect(focusBand(task({ scheduledDate: TODAY }), TODAY)).toBe("planned");
  });

  it("a task with no dates at all is on neither list", () => {
    expect(focusBand(task(), TODAY)).toBeNull();
  });

  it("a task completed today keeps its band rather than leaving the day", () => {
    // It is finished, so it is not ACTIVE overdue work — the screen stops
    // counting it in the Overdue figure — but it stays where it was, dimmed,
    // instead of jumping to the bottom of the panel.
    const done = task({
      dueDate: "2020-01-01",
      completed: true,
      completedDate: TODAY,
    });
    expect(focusBand(done, TODAY)).toBe("overdue");
    expect(bucketDay([done], TODAY).today).toEqual([]);
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

  it("keeps a task completed TODAY at the end of its band, not gone", () => {
    const buckets = bucketDay(tasks, TODAY);
    // "now-b" is DUE today, so its band comes first; "now-a" is only PLANNED.
    // "done" is due today and finished, so it is last inside the due band.
    expect(buckets.dueToday.map((item) => item.id)).toEqual(["now-b", "done"]);
    expect(buckets.plannedToday.map((item) => item.id)).toEqual(["now-a"]);
    expect(buckets.today.map((item) => item.id)).toEqual([
      "now-b",
      "done",
      "now-a",
    ]);
    expect(buckets.completedToday.map((item) => item.id)).toEqual(["done"]);
  });

  it("drops a task completed on an earlier day, and undated work", () => {
    const ids = bucketDay(tasks, TODAY).today.map((item) => item.id);
    expect(ids).not.toContain("done-yesterday");
    expect(ids).not.toContain("someday");
  });
});

/* -------------------------------------------------------------------------- */
/* TODAY-10 — the Focus bands                                                  */
/* -------------------------------------------------------------------------- */

describe("TODAY-10: which Focus band a task lands in", () => {
  it("files a task DUE today under Due today", () => {
    expect(focusBand(task({ dueDate: TODAY }), TODAY)).toBe("due");
  });

  it("files a task PLANNED today under Planned today", () => {
    expect(focusBand(task({ scheduledDate: TODAY }), TODAY)).toBe("planned");
  });

  it("files a task BOTH due and planned today under Due today, ONCE", () => {
    const both = task({ id: "both", dueDate: TODAY, scheduledDate: TODAY });
    expect(focusBand(both, TODAY)).toBe("due");

    const buckets = bucketDay([both], TODAY);
    expect(buckets.dueToday.map((item) => item.id)).toEqual(["both"]);
    expect(buckets.plannedToday).toEqual([]);
    // The whole day holds exactly one row for it — the duplicate-prevention
    // rule, asserted over the composition rather than over the classifier.
    expect(
      [...buckets.overdue, ...buckets.today].filter(
        (item) => item.id === "both",
      ),
    ).toHaveLength(1);
  });

  it("files slipped work under Overdue whichever date slipped", () => {
    expect(focusBand(task({ dueDate: "2026-08-01" }), TODAY)).toBe("overdue");
    expect(focusBand(task({ scheduledDate: "2026-08-01" }), TODAY)).toBe(
      "overdue",
    );
    // Due TODAY but planned for a day that has passed: it has slipped its plan,
    // so Overdue is where the owner needs it — and it appears there only.
    expect(
      focusBand(task({ dueDate: TODAY, scheduledDate: "2026-08-01" }), TODAY),
    ).toBe("overdue");
  });

  it("excludes a task that is merely in the future, or has no dates", () => {
    expect(focusBand(task({ dueDate: "2026-09-01" }), TODAY)).toBeNull();
    expect(focusBand(task({ scheduledDate: "2026-09-01" }), TODAY)).toBeNull();
    expect(focusBand(task(), TODAY)).toBeNull();
  });

  it("excludes work completed on an earlier day, whatever its dates", () => {
    expect(
      focusBand(
        task({ dueDate: TODAY, completed: true, completedDate: "2026-08-07" }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("does NOT move a task between bands when it is completed", () => {
    // The defect TODAY-10 fixed: ticking an overdue row used to move it out of
    // the overdue band and into "For today", under a heading untrue of it.
    const slipped = { dueDate: "2026-08-01" } as const;
    expect(focusBand(task(slipped), TODAY)).toBe("overdue");
    expect(
      focusBand(
        task({ ...slipped, completed: true, completedDate: TODAY }),
        TODAY,
      ),
    ).toBe("overdue");

    const buckets = bucketDay(
      [
        task({ id: "open-late", dueDate: "2026-08-02" }),
        task({
          id: "done-late",
          dueDate: "2026-08-01",
          completed: true,
          completedDate: TODAY,
        }),
      ],
      TODAY,
    );
    // Open first, the completion dimmed at the END of the band it was already
    // in — never in the day's own list, and never in the progress denominator.
    expect(buckets.overdue.map((item) => item.id)).toEqual([
      "open-late",
      "done-late",
    ]);
    expect(buckets.today).toEqual([]);
    expect(dayProgress(buckets)).toBeNull();
  });
});

describe("TODAY-10: the order the day is worked in", () => {
  it("orders each band by priority, then deadline, then title", () => {
    const buckets = bucketDay(
      [
        task({ id: "d", title: "Aardvark", dueDate: TODAY }),
        task({ id: "c", title: "Zebra", dueDate: TODAY, priority: "p2" }),
        task({ id: "b", title: "Mongoose", dueDate: TODAY, priority: "p1" }),
        task({ id: "a", title: "Badger", dueDate: TODAY, priority: "p2" }),
      ],
      TODAY,
    );
    // P1, then the two P2s by title, then the untriaged one — never A–Z.
    expect(buckets.dueToday.map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("breaks a priority tie on the nearer deadline, missing dates last", () => {
    const buckets = bucketDay(
      [
        task({ id: "none", title: "A", scheduledDate: TODAY }),
        task({
          id: "far",
          title: "B",
          scheduledDate: TODAY,
          dueDate: "2026-12-01",
        }),
        task({
          id: "near",
          title: "C",
          scheduledDate: TODAY,
          dueDate: "2026-08-09",
        }),
      ],
      TODAY,
    );
    expect(buckets.plannedToday.map((item) => item.id)).toEqual([
      "near",
      "far",
      "none",
    ]);
  });

  it("is TOTAL — two otherwise identical tasks always come out the same way", () => {
    const twins = [
      task({ id: "z", title: "Same", dueDate: TODAY }),
      task({ id: "a", title: "Same", dueDate: TODAY }),
    ];
    expect(bucketDay(twins, TODAY).dueToday.map((item) => item.id)).toEqual([
      "a",
      "z",
    ]);
    expect(
      bucketDay([...twins].reverse(), TODAY).dueToday.map((item) => item.id),
    ).toEqual(["a", "z"]);
  });
});

describe("TODAY-10: the canonical count and the display bound", () => {
  it("counts the /tasks?system=today set, INCLUDING work filed under Overdue", () => {
    const buckets = bucketDay(
      [
        task({ id: "due", dueDate: TODAY }),
        task({ id: "planned", scheduledDate: TODAY }),
        // Due today, but its plan slipped — Focus files it under Overdue, and
        // `/tasks?system=today` still counts it.
        task({
          id: "slipped-plan",
          dueDate: TODAY,
          scheduledDate: "2026-08-01",
        }),
        // Slipped outright: NOT one of today's tasks on either surface.
        task({ id: "late", dueDate: "2026-08-01" }),
        // Finished: the figure counts what is left to do.
        task({
          id: "done",
          dueDate: TODAY,
          completed: true,
          completedDate: TODAY,
        }),
      ],
      TODAY,
    );
    expect(tasksForTodayCount(buckets, TODAY)).toBe(3);
  });

  it("draws the whole day when it fits inside the bound", () => {
    const buckets = bucketDay(
      Array.from({ length: FOCUS_TODAY_SHOWN }, (_, index) =>
        task({ id: `t${index}`, title: `Task ${index}`, dueDate: TODAY }),
      ),
      TODAY,
    );
    const slice = focusTodaySlice(buckets);
    expect(slice.dueToday).toHaveLength(FOCUS_TODAY_SHOWN);
    expect(slice.hidden).toBe(0);
  });

  it("bounds the day's own rows and states the TRUE remainder", () => {
    const buckets = bucketDay(
      Array.from({ length: 14 }, (_, index) =>
        task({ id: `t${index}`, title: `Task ${index}`, dueDate: TODAY }),
      ),
      TODAY,
    );
    const slice = focusTodaySlice(buckets);
    expect(slice.dueToday).toHaveLength(FOCUS_TODAY_SHOWN);
    expect(slice.hidden).toBe(14 - FOCUS_TODAY_SHOWN);
  });

  it("gives deadlines the larger share, but never the whole bound", () => {
    const buckets = bucketDay(
      [
        ...Array.from({ length: 10 }, (_, index) =>
          task({ id: `due${index}`, title: `Due ${index}`, dueDate: TODAY }),
        ),
        task({ id: "planned", title: "Planned", scheduledDate: TODAY }),
      ],
      TODAY,
    );
    const slice = focusTodaySlice(buckets);
    // The planned band keeps its one row rather than being deleted whole; the
    // deadlines take everything else.
    expect(slice.plannedToday.map((item) => item.id)).toEqual(["planned"]);
    expect(slice.dueToday).toHaveLength(FOCUS_TODAY_SHOWN - 1);
    expect(slice.hidden).toBe(3);
  });

  it("reserves at most three rows for planned work, and no more", () => {
    const buckets = bucketDay(
      [
        ...Array.from({ length: 10 }, (_, index) =>
          task({ id: `due${index}`, title: `Due ${index}`, dueDate: TODAY }),
        ),
        ...Array.from({ length: 6 }, (_, index) =>
          task({
            id: `plan${index}`,
            title: `Plan ${index}`,
            scheduledDate: TODAY,
          }),
        ),
      ],
      TODAY,
    );
    const slice = focusTodaySlice(buckets);
    expect(slice.dueToday).toHaveLength(FOCUS_TODAY_SHOWN - FOCUS_BAND_MIN);
    expect(slice.plannedToday).toHaveLength(FOCUS_BAND_MIN);
    expect(slice.hidden).toBe(16 - FOCUS_TODAY_SHOWN);
  });

  it("never bounds away a row the owner just ticked", () => {
    // Nine deadlines, one of them finished this morning. The bound counts what
    // is LEFT TO DO, so the completion is drawn after the eight open rows
    // rather than pushed past the slice — ticking a task must never lose it,
    // and the canonical view it would otherwise be recoverable from excludes
    // completed work by definition.
    const buckets = bucketDay(
      [
        ...Array.from({ length: 8 }, (_, index) =>
          task({ id: `due${index}`, title: `Due ${index}`, dueDate: TODAY }),
        ),
        task({
          id: "just-ticked",
          title: "Just ticked",
          dueDate: TODAY,
          completed: true,
          completedDate: TODAY,
        }),
      ],
      TODAY,
    );
    const slice = focusTodaySlice(buckets);
    expect(slice.dueToday).toHaveLength(9);
    expect(slice.dueToday.at(-1)?.id).toBe("just-ticked");
    expect(slice.hidden).toBe(0);
  });

  it("counts only OPEN work in the remainder, on both bounds", () => {
    const buckets = bucketDay(
      [
        // Four open overdue and one finished this morning: the canonical
        // overdue view holds the four, so "+n more" must be 1, not 2.
        ...Array.from({ length: 4 }, (_, index) =>
          task({ id: `late${index}`, dueDate: `2026-08-0${index + 1}` }),
        ),
        task({
          id: "late-done",
          dueDate: "2026-08-01",
          completed: true,
          completedDate: TODAY,
        }),
        // Ten open due-today and one finished: nine drawn is wrong, eight is
        // right, and the remainder is two rather than three.
        ...Array.from({ length: 10 }, (_, index) =>
          task({ id: `due${index}`, title: `Due ${index}`, dueDate: TODAY }),
        ),
        task({
          id: "due-done",
          title: "Done",
          dueDate: TODAY,
          completed: true,
          completedDate: TODAY,
        }),
      ],
      TODAY,
    );
    const overdue = overdueSlice(buckets.overdue);
    expect(overdue.shown.filter((item) => !item.completed)).toHaveLength(3);
    expect(overdue.shown.map((item) => item.id)).toContain("late-done");
    expect(overdue.hidden).toBe(1);

    const slice = focusTodaySlice(buckets);
    expect(slice.dueToday.filter((item) => !item.completed)).toHaveLength(8);
    expect(slice.dueToday.map((item) => item.id)).toContain("due-done");
    expect(slice.hidden).toBe(2);
  });

  it("lets planned work take the whole bound when nothing is due", () => {
    const buckets = bucketDay(
      Array.from({ length: 10 }, (_, index) =>
        task({
          id: `plan${index}`,
          title: `Plan ${index}`,
          scheduledDate: TODAY,
        }),
      ),
      TODAY,
    );
    const slice = focusTodaySlice(buckets);
    expect(slice.dueToday).toEqual([]);
    expect(slice.plannedToday).toHaveLength(FOCUS_TODAY_SHOWN);
    expect(slice.hidden).toBe(2);
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
