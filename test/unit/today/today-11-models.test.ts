/**
 * TODAY-11 — the command centre's three pure models.
 *
 * The week strip's arithmetic, the reflection excerpt's reduction and the stat
 * rank's derivations, tested directly. All three are React-free and clock-free —
 * the owner's calendar day is always supplied — so what is asserted here is the
 * rule itself rather than the rendering of it.
 */

import { describe, expect, it } from "vitest";

import {
  buildWeekStrip,
  weekDatesFor,
  weekStartIso,
  weekStripDayHeading,
  weekStripMonthLabel,
} from "~/modules/today/day/week-strip";
import { reflectionExcerpt } from "~/modules/today/day/reflection";
import {
  completedNote,
  daySeriesSummary,
  todayInsight,
  todayMeasures,
} from "~/modules/today/day/measures";
import type {
  TodayActivityTrend,
  TodayGoal,
} from "~/modules/today/day/goal-progress";
import {
  UNMEASURED_GOAL,
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
} from "~/kernel/goals";

/* -------------------------------------------------------------------------- */
/* The week strip                                                              */
/* -------------------------------------------------------------------------- */

describe("the week strip's arithmetic", () => {
  it("starts the week on Monday, whichever day is asked about", () => {
    // 2026-08-08 is a Saturday; its week began on Monday the 3rd.
    expect(weekStartIso("2026-08-08")).toBe("2026-08-03");
    expect(weekStartIso("2026-08-03")).toBe("2026-08-03");
    // A Sunday belongs to the week that STARTED, not the one about to.
    expect(weekStartIso("2026-08-09")).toBe("2026-08-03");
  });

  it("returns seven consecutive dates, today among them", () => {
    const dates = weekDatesFor("2026-08-08");
    expect(dates).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });

  it("crosses a month boundary without losing a day", () => {
    // 2026-09-02 is a Wednesday, so its week starts on 31 August.
    expect(weekDatesFor("2026-09-02")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("marks exactly one day as today, and counts each day's items", () => {
    const days = buildWeekStrip({
      todayIso: "2026-08-08",
      itemCountFor: (dateIso) => (dateIso === "2026-08-05" ? 3 : 0),
    });
    expect(days.filter((day) => day.isToday).map((day) => day.dateIso)).toEqual(
      ["2026-08-08"],
    );
    expect(days.find((day) => day.dateIso === "2026-08-05")?.itemCount).toBe(3);
    expect(days.find((day) => day.dateIso === "2026-08-06")?.itemCount).toBe(0);
  });

  it("names each day in full for the control's accessible name", () => {
    const days = buildWeekStrip({
      todayIso: "2026-08-08",
      itemCountFor: () => 0,
    });
    const monday = days[0]!;
    expect(monday.weekdayLabel).toBe("Mon");
    expect(monday.dayNumber).toBe("3");
    expect(monday.fullLabel).toBe("Monday 3 August");
  });

  it("keeps the selected day and the owner's today strictly distinct", () => {
    const days = buildWeekStrip({
      todayIso: "2026-08-08",
      itemCountFor: () => 0,
    });
    const today = days.find((day) => day.isToday)!;
    const other = days.find((day) => !day.isToday)!;
    // Selecting a day never makes it "Today" — that word is a fact about the
    // calendar, and a strip that borrowed it would be the same untruth as a
    // "Now" badge on a page showing next week.
    expect(weekStripDayHeading(today)).toBe("Today · Saturday 8 August");
    expect(weekStripDayHeading(other)).not.toMatch(/Today/);
  });

  it("names BOTH months when the week spans two", () => {
    const one = buildWeekStrip({
      todayIso: "2026-08-08",
      itemCountFor: () => 0,
    });
    expect(weekStripMonthLabel(one)).toBe("August 2026");

    const across = buildWeekStrip({
      todayIso: "2026-09-02",
      itemCountFor: () => 0,
    });
    // Four of the seven dates under a bare "September" would be mislabelled.
    expect(weekStripMonthLabel(across)).toBe("August – September 2026");

    const newYear = buildWeekStrip({
      // 2026-12-31 is a Thursday: the week runs 28 December to 3 January.
      todayIso: "2026-12-31",
      itemCountFor: () => 0,
    });
    expect(weekStripMonthLabel(newYear)).toBe("December 2026 – January 2027");
  });
});

/* -------------------------------------------------------------------------- */
/* The reflection excerpt                                                      */
/* -------------------------------------------------------------------------- */

describe("the reflection excerpt", () => {
  it("is null when the entry has no body — never an empty string", () => {
    expect(reflectionExcerpt(null)).toBeNull();
    expect(reflectionExcerpt("   \n\n  ")).toBeNull();
  });

  it("reduces Markdown to the prose a preview can show", () => {
    expect(
      reflectionExcerpt(
        "## The morning\n\n- Shipped the **Q3 plan** and _finally_ closed it.\n",
      ),
    ).toBe("The morning Shipped the Q3 plan and finally closed it.");
  });

  it("keeps a link's text and drops an image entirely", () => {
    expect(
      reflectionExcerpt("Read [the brief](https://example.com/x) again."),
    ).toBe("Read the brief again.");
    expect(reflectionExcerpt("![a photo](photo.png) Went for a walk.")).toBe(
      "Went for a walk.",
    );
  });

  it("never renders HTML — the source survives as its own characters", () => {
    // Nothing here is parsed as markup, so nothing here can be an injection
    // surface: the card prints text, never `dangerouslySetInnerHTML`.
    const excerpt = reflectionExcerpt("<script>alert(1)</script> ok");
    expect(excerpt).toBe("<script>alert(1)</script> ok");
  });

  it("cuts on a word boundary and says that it cut", () => {
    const body = `${"alpha ".repeat(60)}omega`;
    const excerpt = reflectionExcerpt(body, 40)!;
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(41);
    // A preview that stopped mid-word would look like a rendering fault.
    expect(excerpt).not.toMatch(/alph…$/);
  });

  it("adds no ellipsis to an entry that fits", () => {
    expect(reflectionExcerpt("A short one.", 40)).toBe("A short one.");
  });
});

/* -------------------------------------------------------------------------- */
/* The stat rank and the Insights ring                                         */
/* -------------------------------------------------------------------------- */

const TODAY = "2026-08-08";

function trend(over: Partial<TodayActivityTrend> = {}): TodayActivityTrend {
  return {
    days: [
      { dateIso: "2026-08-07", created: 5, completed: 4 },
      { dateIso: TODAY, created: 3, completed: 6 },
    ],
    totalCreated: 30,
    totalCompleted: 24,
    previousCompleted: 16,
    ...over,
  };
}

function goal(id: string, progress: TodayGoal["progress"]): TodayGoal {
  return {
    id,
    title: id,
    areaTitle: "Health",
    areaColourRank: 0,
    areaIconKey: null,
    areaColourSlot: null,
    iconKey: null,
    colourSlot: null,
    progress,
    changeInWindow: null,
    windowDays: 30,
  };
}

const ON_TRACK = evaluateGoalProgress(
  {
    config: normalizeGoalMeasurementConfig({
      type: "target_value",
      unit: "kg",
      baselineValue: 85,
      targetValue: 70,
    }),
    targetDate: "2026-12-31",
    measurements: [{ value: 72, measuredOn: TODAY }],
    startedOn: "2026-06-10",
  },
  { todayIso: TODAY },
);

const UNMEASURED = evaluateGoalProgress(
  { config: UNMEASURED_GOAL, targetDate: null, measurements: [] },
  { todayIso: TODAY },
);

describe("the stat rank", () => {
  it("names a rolling window and states the delta against the previous one", () => {
    expect(completedNote(trend())).toBe("Last 7 days · +8 on the previous 7");
    expect(completedNote(trend({ previousCompleted: 30 }))).toBe(
      "Last 7 days · −6 on the previous 7",
    );
    expect(completedNote(trend({ previousCompleted: 24 }))).toBe(
      "Last 7 days · level with the previous 7",
    );
    // No earlier window is an ABSENCE, never a fabricated "+24".
    expect(completedNote(trend({ previousCompleted: null }))).toBe(
      "Last 7 days",
    );
  });

  it("omits every card whose source is silent", () => {
    expect(todayMeasures({ trend: null, goals: [] })).toEqual([]);
    expect(
      todayMeasures({ trend: null, goals: [goal("g", ON_TRACK)] }).map(
        (measure) => measure.id,
      ),
    ).toEqual(["goals"]);
    expect(
      todayMeasures({ trend: trend(), goals: [] }).map((measure) => measure.id),
    ).toEqual(["completed", "captured"]);
  });

  it("counts only the statuses that genuinely mean on track", () => {
    const measures = todayMeasures({
      trend: null,
      goals: [goal("a", ON_TRACK), goal("b", UNMEASURED)],
    });
    const goals = measures.find((measure) => measure.id === "goals")!;
    // Not `!goalNeedsAttention`: an unmeasured Goal is not a Goal going well.
    expect(goals.value).toBe("1");
    expect(goals.note).toBe("of 2 measurable goals");
  });

  it("links only the figure that has a canonical view of itself", () => {
    const measures = todayMeasures({ trend: trend(), goals: [] });
    expect(measures.find((m) => m.id === "completed")?.href).toBe("/analytics");
    // "Created in the last seven days" has no canonical view, so no link.
    expect(measures.find((m) => m.id === "captured")?.href).toBeNull();
  });

  it("draws both daily series with the SAME primitive, and it is not bars", () => {
    const measures = todayMeasures({ trend: trend(), goals: [] });
    // REDESIGN-03 deleted this screen's bar chart because one linear scale
    // flattens six days to hairlines after a day of bulk capture, and the seeded
    // fixture reproduces it. A sparkline scales to the series' own range.
    expect(measures.find((m) => m.id === "completed")?.chart?.kind).toBe(
      "spark",
    );
    expect(measures.find((m) => m.id === "captured")?.chart?.kind).toBe(
      "spark",
    );
  });

  it("states a daily series in words as well as a shape", () => {
    const points = [
      { dateIso: "2026-08-07", label: "Fri", value: 5 },
      { dateIso: "2026-08-08", label: "Sat", value: 3 },
    ];
    const summary = daySeriesSummary("Tasks captured", points);
    expect(summary).toContain("8 in total");
    expect(summary).toContain("Fri 5");
    expect(summary).toContain("Sat 3");
  });

  it("draws no series from a single point", () => {
    const one = trend({
      days: [{ dateIso: TODAY, created: 3, completed: 6 }],
    });
    // One reading has no direction, and a line through it would assert one.
    expect(
      todayMeasures({ trend: one, goals: [] }).find((m) => m.id === "completed")
        ?.chart,
    ).toBeNull();
  });
});

describe("the Insights ring", () => {
  it("states completions against captures over the named window", () => {
    const insight = todayInsight(trend())!;
    expect(insight.percent).toBe(80);
    expect(insight.ratioText).toBe("24 of 30 captured");
    expect(insight.windowLabel).toBe("Last 7 days");
  });

  it("clamps the ring but never the figures", () => {
    // The two sets are not nested — a task completed this week may have been
    // captured last month — so the ratio can exceed 1. The ring cannot honestly
    // draw more than full; the words beside it stay true.
    const insight = todayInsight(
      trend({ totalCompleted: 40, totalCreated: 10 }),
    )!;
    expect(insight.percent).toBe(100);
    expect(insight.ratioText).toBe("40 of 10 captured");
    expect(insight.summary).toContain("more cleared than came in");
  });

  it("has no percentage to state when nothing was captured", () => {
    const insight = todayInsight(
      trend({ totalCompleted: 4, totalCreated: 0 }),
    )!;
    expect(insight.percent).toBeNull();
    expect(insight.summary).toContain("none captured");
  });

  it("is absent on a week with no activity at all", () => {
    expect(todayInsight(null)).toBeNull();
    expect(
      todayInsight(trend({ totalCompleted: 0, totalCreated: 0 })),
    ).toBeNull();
  });
});
