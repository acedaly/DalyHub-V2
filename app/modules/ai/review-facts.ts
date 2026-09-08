/**
 * V2.14 GROUND-02 — the Weekly Review's FACT BLOCK, from the canonical reads.
 *
 * ## What this replaces, and why it had to change
 *
 * Until V2.14 this module returned five hard-coded zeros — stalled Projects,
 * Projects with no visible next action, Goals with and without activity, and a
 * Diary count — for facts the guided Review computes properly three files away
 * ([DEBT-91](../../../docs/product/PRODUCT_DEBT.md)). The assistant was
 * therefore told, authoritatively, that the owner had no stalled Projects and no
 * Goals with activity, in the one sitting dedicated to noticing exactly those
 * things. Worse: it had no field at all for the owner's `set_aside` condition,
 * so it would have described a Goal the owner had DELIBERATELY put down as
 * neglected — telling them something untrue about their own recorded judgement
 * ([ADR-111](../../../docs/decisions/ARCHITECTURE_DECISIONS.md) d1).
 *
 * ## The rule this module now follows
 *
 * **Call the evaluators; never re-derive them.** Every figure below comes from
 * the authority that already owns it:
 *
 *   | fact | authority |
 *   |---|---|
 *   | Project health, stalled, overdue, waiting | `evaluateProjectHealth` (PROJ-02) |
 *   | a Project's next action | `listProjectNextActions` (STEER-04) |
 *   | a Goal's measurement, movement, alignment, condition | `loadGoalStories` (STEER-03) |
 *   | a Goal's contribution across Reviews | `readAcrossReviews` (INS-02) |
 *   | repeated carry-over | `readAcrossReviews` (INS-02) |
 *   | commitments falling due | `readObligationPage` (V2.10) |
 *
 * There is no second Review fact engine here, and
 * `test/kernel/review-fact-block.test.ts` proves the numbers agree with the
 * guided Review's own step projection over the same seeded period.
 *
 * ## What is deliberately absent
 *
 * **Diary.** The old block carried a Diary count and this one carries nothing at
 * all — no count, no title, no excerpt. Diary is the most private prose in the
 * product, its evidence category is `reflection`, and V2.14 starts grounded AI
 * with Reports, Reviews, Goals, Projects, Tasks and Obligations rather than
 * there. `test/unit/architecture/grounded-ai-boundaries.test.ts` asserts it.
 *
 * **People.** No Person is a fact source, and no fact names one.
 *
 * **Attachments.** Neither content nor filename, exactly as V2.11 requires.
 *
 * ## Every read degrades to nothing
 *
 * A Review the owner cannot open is a broken product; an assistant that cannot
 * be generated is a small disappointment. So every read is wrapped, and a
 * failure removes facts rather than raising — and the block says how many facts
 * it holds, so an emptier block is visible rather than silent.
 */

import {
  aiFeaturePolicy,
  buildFactBlock,
  type FactBlock,
  type FactBound,
  type FactDraft,
  type FactPeriod,
} from "~/kernel/ai";
import {
  DEFAULT_APP_PREFERENCES,
  type FirstDayOfWeek,
} from "~/kernel/preferences";
import { evaluateProjectHealth } from "~/kernel/project-health";
import {
  ACROSS_REVIEWS_SERIES_LENGTH,
  readAcrossReviews,
} from "~/kernel/review-insights";
import { isTaskStillOwed } from "~/kernel/tasks";
import { readObligationPage } from "~/platform/obligations/obligation-facts.server";
import type { WorkspaceScope } from "~/platform/workspaces";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";
import { loadGoalStories } from "~/shared/goal-progress/goal-story-load.server";
import { createOwnerHealthContext } from "~/shared/project-health";

/** How many rows any single read here may return. */
const LIMIT = 200;
/** Projects considered — the guided Review's own bound. */
const PROJECT_PAGE = 20;
/** Goals considered — the guided Review's own bound. */
const GOAL_PAGE = 12;
/** How many named Projects or Goals reach the block. */
const MAX_NAMED = 6;
/** How many named carry-over commitments reach the block. */
const MAX_CARRY_OVER = 5;
/** How many commitments falling due reach the block. */
const MAX_OBLIGATIONS = 6;

/**
 * The deterministic period facts, as counts.
 *
 * Retained as a named shape because the counts are useful on their own and
 * because a test can assert them against the guided Review's projection without
 * going through the rendered block.
 */
export interface WeeklyReviewPeriodFacts {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly tasksCompleted: number;
  readonly tasksOverdue: number;
  readonly inboxRemaining: number;
  readonly activeProjects: number;
  readonly stalledProjects: number;
  readonly projectsAtRisk: number;
  readonly projectsWithoutNextAction: number;
  readonly waitingTasks: number;
  readonly meetingsHeld: number;
  readonly goalsWithActivity: number;
  readonly goalsWithoutActivity: number;
  readonly goalsSetAside: number;
  readonly obligationsDue: number;
}

/** What the builder needs about the Review and the owner. */
export interface ReviewFactBlockInput {
  readonly reviewId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly todayIso: string;
  readonly timezone: string;
  readonly firstDayOfWeek?: FirstDayOfWeek;
  readonly now?: Date;
}

async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

function inPeriod(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

function count(value: number): FactDraft["value"] {
  return { kind: "count", count: value };
}

function countDisplay(value: number): string {
  return new Intl.NumberFormat("en-AU").format(value);
}

/* -------------------------------------------------------------------------- */
/* The builder                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build the Weekly Review's fact block.
 *
 * The reads are grouped rather than sequential and there is no per-record
 * follow-up query anywhere: Project health is one grouped statement over the
 * page's ids, next actions are one ranked statement per chunk of Projects, and
 * `loadGoalStories` composes eight statements for the whole Goal page.
 */
export async function buildReviewFactBlock(
  scope: WorkspaceScope,
  input: ReviewFactBlockInput,
): Promise<{
  readonly block: FactBlock;
  readonly facts: WeeklyReviewPeriodFacts;
}> {
  const now = input.now ?? new Date();
  const { periodStart, periodEnd, todayIso, timezone } = input;

  const [openTasks, planning, meetings, projectPage] = await Promise.all([
    safe(() => scope.tasks.listTasks({ limit: LIMIT })),
    // Completions come from the PLANNING query, not from `listTasks({
    // includeCompleted: true })`: `listTasks` orders open rows first, so in a
    // workspace with LIMIT-or-more open Tasks the page is entirely open work and
    // the period's completions are invisible — the assistant would report
    // "0 completed" for precisely the busy weeks where the number matters most.
    safe(() =>
      scope.tasks.listPlanningTasks({
        todayIso,
        scheduledLimit: 1,
        backlogLimit: 1,
        completedLimit: LIMIT,
      }),
    ),
    safe(() => scope.meetings.list({ view: "recent", limit: 50 })),
    safe(() =>
      scope.projects.listProjects({
        state: "open",
        orderBy: "recent",
        limit: PROJECT_PAGE,
      }),
    ),
  ]);

  const open = (openTasks?.items ?? []).filter(
    (task) => task.completedAt === null,
  );
  const completedInPeriod = (planning?.items ?? []).filter((task) => {
    if (task.completedAt === null) return false;
    return inPeriod(
      ownerCalendarIso(task.completedAt, timezone),
      periodStart,
      periodEnd,
    );
  });
  const meetingsInPeriod = (meetings?.items ?? []).filter((meeting) =>
    inPeriod(
      ownerCalendarIso(meeting.startsAt, timezone),
      periodStart,
      periodEnd,
    ),
  );

  const projects = projectPage?.items ?? [];
  const projectIds = projects.map((project) => project.id);

  const [healthFacts, nextActions] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve(null)
      : safe(() =>
          scope.projectHealth.listProjectHealthFacts(projectIds, todayIso),
        ),
    projectIds.length === 0
      ? Promise.resolve(null)
      : // STEER-04's canonical per-Project next action — ONE ranked statement
        // per chunk of ids, never one query per Project.
        safe(() =>
          scope.tasks.listProjectNextActions({
            projectIds,
            todayIso,
            timezone,
          }),
        ),
  ]);

  const healthContext = createOwnerHealthContext(now, timezone);
  const health = projects.map((project) => {
    const facts = healthFacts?.get(project.id);
    return {
      id: project.id,
      title: project.title,
      health: facts ? evaluateProjectHealth(facts, healthContext) : null,
      hasNextAction: nextActions?.has(project.id) ?? false,
    };
  });

  const stalled = health.filter(
    (entry) => entry.health?.state === "stale",
  ).length;
  const atRisk = health.filter(
    (entry) =>
      entry.health?.state === "at_risk" || entry.health?.state === "blocked",
  ).length;
  const withoutNextAction = health.filter(
    (entry) =>
      !entry.hasNextAction && (entry.health?.summary.openTotal ?? 0) > 0,
  ).length;

  const goals = await readGoalFacts(scope, input, now);
  const across = await readAcross(scope, input, projects, goals.subjects);

  const obligations = await safe(() =>
    readObligationPage({ scope, today: todayIso, limit: 50 }),
  );
  const due = (obligations?.items ?? []).filter(
    (item) => item.dueDate !== null && item.dueDate <= periodEnd,
  );

  const facts: WeeklyReviewPeriodFacts = {
    periodStart,
    periodEnd,
    tasksCompleted: completedInPeriod.length,
    /*
     * V2.4-GATE-02 — overdue is "past due AND still owed". `listTasks` excludes
     * only COMPLETED work, so counting a passed date alone would call a
     * cancelled or Someday/Maybe Task overdue — the same untruth the Task row
     * used to tell, in a number the assistant reports in words.
     */
    tasksOverdue: open.filter(
      (task) =>
        task.dueDate !== null &&
        task.dueDate < todayIso &&
        isTaskStillOwed({
          completed: task.completedAt !== null,
          status: task.status,
          someday: task.commitmentState === "someday",
        }),
    ).length,
    inboxRemaining: open.filter((task) => task.parent === null).length,
    activeProjects: projects.length,
    stalledProjects: stalled,
    projectsAtRisk: atRisk,
    projectsWithoutNextAction: withoutNextAction,
    waitingTasks: open.filter((task) => task.waiting !== null).length,
    meetingsHeld: meetingsInPeriod.length,
    goalsWithActivity: goals.withActivity,
    goalsWithoutActivity: goals.withoutActivity,
    goalsSetAside: goals.setAside,
    obligationsDue: due.length,
  };

  const period: FactPeriod = {
    startIso: periodStart,
    endIso: periodEnd,
    label: `${periodStart} to ${periodEnd}`,
  };

  const drafts: FactDraft[] = [
    {
      label: "Tasks completed in the period",
      value: count(facts.tasksCompleted),
      display: countDisplay(facts.tasksCompleted),
      period,
    },
    {
      label: "Tasks overdue now",
      value: count(facts.tasksOverdue),
      display: countDisplay(facts.tasksOverdue),
      note: "Past due and still owed. Cancelled, on-hold and Someday work is not counted.",
    },
    {
      label: "Tasks still in the Inbox",
      value: count(facts.inboxRemaining),
      display: countDisplay(facts.inboxRemaining),
    },
    {
      label: "Tasks waiting on someone else",
      value: count(facts.waitingTasks),
      display: countDisplay(facts.waitingTasks),
    },
    {
      label: "Meetings held in the period",
      value: count(facts.meetingsHeld),
      display: countDisplay(facts.meetingsHeld),
      period,
    },
    {
      label: "Open Projects considered",
      value: count(facts.activeProjects),
      display: countDisplay(facts.activeProjects),
    },
    {
      label: "Projects with no recent activity",
      value: count(facts.stalledProjects),
      display: countDisplay(facts.stalledProjects),
    },
    {
      label: "Projects at risk or blocked",
      value: count(facts.projectsAtRisk),
      display: countDisplay(facts.projectsAtRisk),
    },
    {
      label: "Projects with open work but no visible next action",
      value: count(facts.projectsWithoutNextAction),
      display: countDisplay(facts.projectsWithoutNextAction),
    },
    {
      label: "Goals with supporting activity",
      value: count(facts.goalsWithActivity),
      display: countDisplay(facts.goalsWithActivity),
    },
    {
      label: "Goals with no supporting activity",
      value: count(facts.goalsWithoutActivity),
      display: countDisplay(facts.goalsWithoutActivity),
    },
    {
      label: "Goals the owner has deliberately set aside",
      value: count(facts.goalsSetAside),
      display: countDisplay(facts.goalsSetAside),
      note: "The owner recorded this decision. A set-aside Goal is not neglected and must never be described as such.",
    },
    {
      label: "Commitments falling due on or before the period ends",
      value: count(facts.obligationsDue),
      display: countDisplay(facts.obligationsDue),
      period,
    },
  ];

  drafts.push(...goals.drafts);
  drafts.push(...projectDrafts(health));
  drafts.push(...across.drafts);
  drafts.push(...obligationDrafts(due));

  const bounds: FactBound[] = [
    {
      code: "bounded",
      text: `Up to ${PROJECT_PAGE} Projects and ${GOAL_PAGE} Goals were considered, most recently active first.`,
    },
    {
      code: "excluded",
      text: "Diary entries and People are not included in these facts at all, and nothing here reads an attachment.",
    },
    ...across.bounds,
  ];

  return {
    facts,
    block: buildFactBlock({
      intent: "weekly_review",
      question: "What stands out about this period?",
      subject: `Weekly Review, ${periodStart} to ${periodEnd}`,
      period,
      facts: drafts,
      maxFacts: aiFeaturePolicy("weekly-review-assistant").maxFacts,
      bounds,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The Goal facts, composed by `loadGoalStories` — the SAME bounded read the
 * Area record and the guided Review's alignment step call.
 *
 * The `set_aside` condition is the reason this matters. It is the owner's own
 * recorded judgement, stored beside the derived signals and never merged with
 * them, and an assistant that did not have it would call a Goal the owner
 * deliberately put down "neglected".
 */
async function readGoalFacts(
  scope: WorkspaceScope,
  input: ReviewFactBlockInput,
  now: Date,
): Promise<{
  readonly withActivity: number;
  readonly withoutActivity: number;
  readonly setAside: number;
  readonly drafts: readonly FactDraft[];
  readonly subjects: readonly { readonly id: string; readonly title: string }[];
}> {
  const empty = {
    withActivity: 0,
    withoutActivity: 0,
    setAside: 0,
    drafts: [] as FactDraft[],
    subjects: [] as { id: string; title: string }[],
  };

  const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
    createOwnerAlignmentContext(now, input.timezone);

  const page = await safe(() =>
    scope.goals.listGoalsByAlignment({
      limit: GOAL_PAGE,
      activeBoundaryIso: recentBoundaryStartIso,
    }),
  );
  const items = page?.items ?? [];
  if (items.length === 0) return empty;

  const stories = await safe(() =>
    loadGoalStories(
      scope,
      items.map((goal) => ({
        id: goal.id,
        title: goal.title,
        createdAt: goal.createdAt,
        completedAt: goal.completedAt,
      })),
      {
        now,
        timezone: input.timezone,
        todayIso: input.todayIso,
        firstDayOfWeek:
          input.firstDayOfWeek ?? DEFAULT_APP_PREFERENCES.firstDayOfWeek,
        evaluation,
        recentWindowStartIso,
      },
    ),
  );
  if (stories === null) return empty;

  let withActivity = 0;
  let withoutActivity = 0;
  let setAside = 0;
  const drafts: FactDraft[] = [];

  for (const goal of items) {
    const story = stories.get(goal.id);
    if (story === undefined) continue;
    const aside = story.condition === "set_aside";
    if (aside) setAside += 1;
    const active = (story.contribution?.active ?? 0) > 0;
    if (active) withActivity += 1;
    else withoutActivity += 1;
  }

  for (const goal of items.slice(0, MAX_NAMED)) {
    const story = stories.get(goal.id);
    if (story === undefined) continue;
    const href = `/goals/${goal.id}`;
    const reference = {
      kind: "goal" as const,
      id: goal.id,
      href,
      label: goal.title,
    };
    drafts.push({
      label: `${goal.title} — contributing Projects that are active`,
      value: count(story.contribution?.active ?? 0),
      display: countDisplay(story.contribution?.active ?? 0),
      reference,
      note:
        story.condition === "set_aside"
          ? "The owner has deliberately set this Goal aside. That is a recorded decision, not neglect."
          : null,
    });
    /*
     * GOAL-02's own evaluation, carried rather than re-derived. `current` is
     * the latest reading (or the completed milestone weight) and
     * `latestMeasuredOn` is when it was taken; the unit belongs to the Goal and
     * is never converted.
     */
    const progress = story.progress;
    if (progress.current !== null && progress.latestMeasuredOn !== null) {
      const unit = progress.unit;
      const formatted = new Intl.NumberFormat("en-AU", {
        maximumFractionDigits: 3,
      }).format(progress.current);
      drafts.push({
        label: `${goal.title} — latest measurement`,
        value: { kind: "value", amount: progress.current, unit },
        display: unit === null ? formatted : `${formatted} ${unit}`,
        period: {
          startIso: progress.latestMeasuredOn,
          endIso: progress.latestMeasuredOn,
          label: progress.latestMeasuredOn,
        },
        reference,
      });
    } else {
      drafts.push({
        label: `${goal.title} — measurements recorded`,
        value: count(progress.measurementCount),
        display: countDisplay(progress.measurementCount),
        reference,
        note: progress.measured
          ? "No reading has been recorded for this Goal yet."
          : "This Goal has no measurement configured, so there is no reading to report.",
      });
    }
  }

  return {
    withActivity,
    withoutActivity,
    setAside,
    drafts,
    subjects: items.map((goal) => ({ id: goal.id, title: goal.title })),
  };
}

/* -------------------------------------------------------------------------- */
/* Projects, across-Reviews and obligations                                    */
/* -------------------------------------------------------------------------- */

function projectDrafts(
  health: readonly {
    readonly id: string;
    readonly title: string;
    readonly health: ReturnType<typeof evaluateProjectHealth> | null;
    readonly hasNextAction: boolean;
  }[],
): readonly FactDraft[] {
  const notable = health.filter(
    (entry) =>
      entry.health !== null &&
      (entry.health.state === "at_risk" ||
        entry.health.state === "blocked" ||
        entry.health.state === "stale" ||
        (!entry.hasNextAction && entry.health.summary.openTotal > 0)),
  );
  return notable.slice(0, MAX_NAMED).map((entry) => ({
    label: `${entry.title} — open Tasks`,
    value: count(entry.health?.summary.openTotal ?? 0),
    display: countDisplay(entry.health?.summary.openTotal ?? 0),
    reference: {
      kind: "project" as const,
      id: entry.id,
      href: `/projects/${entry.id}`,
      label: entry.title,
    },
    note: `Recorded state: ${entry.health?.state ?? "unknown"}.${
      entry.hasNextAction ? "" : " No next action is visible."
    }`,
  }));
}

function obligationDrafts(
  due: readonly {
    readonly id: string;
    readonly title: string;
    readonly href: string;
    readonly dueDate: string | null;
    readonly categoryLabel: string;
    readonly expectedAmountDisplay: string | null;
  }[],
): readonly FactDraft[] {
  return due.slice(0, MAX_OBLIGATIONS).map((item) => ({
    label: `${item.title} — due`,
    value: { kind: "date" as const, iso: item.dueDate ?? "" },
    display: item.dueDate ?? "no date",
    reference: {
      kind: "obligation" as const,
      id: item.id,
      href: item.href,
      label: item.title,
    },
    note:
      item.expectedAmountDisplay === null
        ? `${item.categoryLabel}. No expected amount is recorded.`
        : `${item.categoryLabel}. Expected to cost ${item.expectedAmountDisplay}.`,
  }));
}

/**
 * What the last several Reviews recorded — Project state, Goal contribution and
 * the commitments that carried over at every one of them.
 *
 * INS-02's own read, on INS-02's own anchor and length, so a Project cannot be
 * "at risk at 3 of the last 4" here and something else on the Review panel.
 */
async function readAcross(
  scope: WorkspaceScope,
  input: ReviewFactBlockInput,
  projects: readonly { readonly id: string; readonly title: string }[],
  goals: readonly { readonly id: string; readonly title: string }[],
): Promise<{
  readonly drafts: readonly FactDraft[];
  readonly bounds: readonly FactBound[];
}> {
  const series = await safe(() =>
    scope.reviewInsights.listSnapshotSeries(
      input.reviewId,
      ACROSS_REVIEWS_SERIES_LENGTH,
    ),
  );
  if (series === null || series.length === 0) {
    return { drafts: [], bounds: [] };
  }

  const carryOverIds = new Set(
    series.flatMap((entry) => entry.snapshot.carryOverTaskIds ?? []),
  );
  const carryOverTasks = await safe(() =>
    scope.tasks.listTasks({ limit: LIMIT }),
  );
  const taskSubjects = (carryOverTasks?.items ?? [])
    .filter((task) => carryOverIds.has(task.id))
    .map((task) => ({ id: task.id, title: task.title }));

  const across = readAcrossReviews({
    series,
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
    })),
    goals: goals.map((goal) => ({ id: goal.id, title: goal.title })),
    tasks: taskSubjects,
  });

  const drafts: FactDraft[] = [];
  for (const row of across.projects.slice(0, MAX_NAMED)) {
    drafts.push({
      label: `${row.title} — recorded "${row.state}" at Reviews`,
      value: { kind: "ratio", numerator: row.count, denominator: row.of },
      display: `${row.count} of ${row.of} Reviews`,
      reference: {
        kind: "project",
        id: row.projectId,
        href: `/projects/${row.projectId}`,
        label: row.title,
      },
    });
  }
  for (const row of across.goals.slice(0, MAX_NAMED)) {
    drafts.push({
      label: `${row.title} — contribution recorded as "${row.state}" at Reviews`,
      value: { kind: "ratio", numerator: row.count, denominator: row.of },
      display: `${row.count} of ${row.of} Reviews`,
      reference: {
        kind: "goal",
        id: row.goalId,
        href: `/goals/${row.goalId}`,
        label: row.title,
      },
    });
  }
  for (const row of across.repeatedCarryOver.slice(0, MAX_CARRY_OVER)) {
    drafts.push({
      label: `${row.title} — carried over at every Review in the series`,
      value: { kind: "count", count: row.reviews },
      display: `${row.reviews} Reviews`,
      reference: {
        kind: "task",
        id: row.taskId,
        // DEBT-243 — the `?task=` parameter nothing reads. V2.14 declines to
        // add an eighth caller of it: the drawer contract is what resolves.
        href: `/tasks?drawer=task:${row.taskId}`,
        label: row.title,
      },
    });
  }

  return {
    drafts,
    bounds: [
      {
        code: "bounded",
        text: `The across-Reviews figures cover ${across.reviews} Reviews${
          across.sinceIso === null
            ? ""
            : `, the oldest beginning ${across.sinceIso}`
        }, and say nothing about any period outside them.`,
      },
    ],
  };
}
