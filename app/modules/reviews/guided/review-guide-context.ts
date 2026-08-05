/**
 * REVIEW-02 — the ONE bounded review-context projection for the guided flow.
 *
 * Every guided Review step reads its facts from here. No step component queries a
 * repository, and no step composes its own cross-module read: the loader calls
 * this once, it returns exactly what the requested step needs, and the result is
 * JSON-safe and small enough to serialise to the browser without regret.
 *
 * The rules this module holds itself to:
 *
 *   - **Bounded, always.** Every read carries an explicit limit from
 *     `REVIEW_GUIDE_LIMITS`. Nothing here says "load them all".
 *   - **No N+1.** Facts for a whole page of Projects or Goals are gathered in a
 *     fixed number of grouped queries (PROJ-02's `listProjectHealthFacts`,
 *     AREA-03's `listGoalAlignmentFacts`, AREA-02's
 *     `listGoalProjectContributions`) — never one query per record.
 *   - **A fixed query budget per step**, declared in `REVIEW_GUIDE_QUERY_BUDGET`
 *     and asserted by a kernel test, so a future edit that adds a per-record read
 *     fails the build rather than the owner's Review.
 *   - **Derived, never stored.** Project health is PROJ-02's evaluator, Goal
 *     alignment is AREA-03's. Nothing computed here is written anywhere.
 *   - **Truthful bounds.** When a list is longer than its bound, the projection
 *     says so (`hasMore` plus the canonical destination for the full list) rather
 *     than silently truncating.
 */

import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
  type GoalAlignment,
} from "~/kernel/alignment";
import { InvalidSpineCursorError } from "~/kernel/spine";
import {
  evaluateProjectHealth,
  type ProjectHealth,
} from "~/kernel/project-health";
import {
  REVIEW_SECTION_IDS,
  selectPriorPeriodFocus,
  weeklyReviewStep,
  type PriorPeriodFocus,
  type Review,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";
import type { WorkspaceScope } from "~/platform/workspaces";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";
import { createOwnerHealthContext } from "~/shared/project-health";
import {
  serializeTaskListItem,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The server-side bounds of every guided-Review read. Generous enough that a
 * realistic mature workspace finishes a step in one page, small enough that the
 * payload never grows with the workspace.
 */
export const REVIEW_GUIDE_LIMITS = {
  /** Inbox Tasks presented per triage page (the TASKS-04 Review Inbox page size). */
  inboxPage: 25,
  /** Period Task/Diary/Meeting reads behind the "Settle in" counts. */
  periodRecords: 50,
  /** Projects shown in the Project check. */
  projects: 20,
  /**
   * How many of the workspace's most-actionable open Tasks are scanned to find
   * each Project's next action. Bounded on purpose — see `nextAction` below.
   */
  nextActionScan: 100,
  /** Goals shown in the alignment check (alignment-ranked, so the ones worth a look lead). */
  goals: 12,
  /** Areas considered for the attention read. */
  areas: 20,
  /** Completed weekly Reviews scanned for the previous period's focus. */
  focusCandidates: 12,
} as const;

/**
 * The EXACT number of executed D1 statements each step costs, measured against
 * real D1 by `test/kernel/review-guide-context.test.ts`. It is asserted, not
 * described: a future edit that adds a per-record read fails the build rather
 * than the owner's Review.
 *
 * Every step pays 1 for the authoritative Inbox count — the step rail and the
 * completion summary both need it, and it is one grouped aggregate. The rest is
 * the step's own bounded projection. The numbers are flat with respect to the
 * size of the workspace; two separate tests prove that a workspace with fifteen
 * Projects or ten Goals costs exactly what a workspace with three does.
 */
export const REVIEW_GUIDE_QUERY_BUDGET: Readonly<
  Record<WeeklyReviewStepId, number>
> = {
  overview: 9,
  inbox: 2,
  projects: 8,
  alignment: 6,
  reflection: 1,
  focus: 2,
  complete: 1,
};

/* -------------------------------------------------------------------------- */
/* Serialised shapes                                                           */
/* -------------------------------------------------------------------------- */

/** A bounded count that knows whether it is exact. */
export interface BoundedCount {
  /** How many were actually read (never more than the bound). */
  readonly value: number;
  /** True when more exist beyond the bound — so the UI can say "20+". */
  readonly hasMore: boolean;
}

export interface ReviewPeriodFacts {
  readonly tasksCompleted: BoundedCount;
  readonly tasksOverdue: BoundedCount;
  readonly diaryEntries: BoundedCount;
  readonly meetings: BoundedCount;
  readonly activeProjects: BoundedCount;
  /** Goals whose alignment is worth a look, when the alignment read is cheap. */
  readonly goalsWithRecentProgress: number | null;
}

export interface ReviewInboxContext {
  readonly tasks: readonly SerializedTaskListItem[];
  /** The AUTHORITATIVE remaining Inbox total, over the whole workspace scope. */
  readonly remaining: number;
  /** Cursor for the next page of the triage queue, or null at the end. */
  readonly nextCursor: string | null;
  /** True when the read failed; the step says so calmly rather than claiming zero. */
  readonly unavailable: boolean;
}

/**
 * One Project in the Review's Project check. Everything here is derived live:
 * `health` is PROJ-02's evaluator over PROJ-02's facts, the counts come from the
 * same projections the Projects collection uses, and nothing is stored.
 */
export interface ReviewProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly areaTitle: string | null;
  readonly goalTitle: string | null;
  readonly goalId: string | null;
  readonly statusLabel: string;
  readonly status: string;
  readonly health: ProjectHealth | null;
  readonly openTasks: number;
  readonly overdueTasks: number;
  /** Tasks belonging to this Project completed inside the Review's period. */
  readonly completedInPeriod: number;
  /** Owner-calendar date of the Project's last meaningful activity, or null. */
  readonly lastActivityDate: string | null;
  /** Days since that activity, or null when nothing has been recorded. */
  readonly daysSinceActivity: number | null;
  /** Open Tasks that are waiting on someone or something else. */
  readonly waitingTasks: number;
  /**
   * The first credible open Task, or null when none is visible.
   *
   * DalyHub has no `next_action` field, so this is DERIVED by a documented,
   * deterministic rule and never invented: the highest-ranked Task belonging to
   * this Project in the workspace's `active` planning scope under the canonical
   * `smart` sort (open first → priority → due date), taken from a bounded scan of
   * the `nextActionScan` most actionable Tasks. When a Project has open work but
   * none of it appears within that bound, this is `null` and the step says "No
   * next action visible here" with a link to the Project's own Task list — it
   * never claims the Project has no next action.
   */
  readonly nextAction: {
    readonly id: string;
    readonly title: string;
  } | null;
  /** True when the Project was completed inside the Review's period. */
  readonly completedInThisPeriod: boolean;
}

export interface ReviewProjectsContext {
  readonly projects: readonly ReviewProjectSummary[];
  readonly hasMore: boolean;
  readonly unavailable: boolean;
}

export interface ReviewGoalAlignmentSummary {
  readonly id: string;
  readonly title: string;
  readonly alignment: GoalAlignment;
  readonly contributingProjects: number;
  readonly activeContributingProjects: number;
}

export interface ReviewAreaAttention {
  readonly id: string;
  readonly title: string;
  readonly activeProjects: number;
  /** True when at least one of this Area's Projects showed activity in the period. */
  readonly attended: boolean;
}

export interface ReviewAlignmentContext {
  readonly goals: readonly ReviewGoalAlignmentSummary[];
  readonly goalsHasMore: boolean;
  readonly areas: readonly ReviewAreaAttention[];
  readonly areasHasMore: boolean;
  /** Active Projects with no Goal linked — "work without a stated why". */
  readonly projectsWithoutGoal: number;
  /** Active Projects considered, so the count above has a denominator. */
  readonly activeProjectsConsidered: number;
  readonly unavailable: boolean;
}

/** The previous weekly Review's focus, read (never copied) from its own record. */
export interface SerializedPriorFocus {
  readonly reviewId: string;
  readonly reviewTitle: string;
  readonly periodLabel: string;
  readonly body: string;
}

/**
 * The step-specific payload. A discriminated union so a step component cannot
 * read a projection its step never asked for.
 */
export type ReviewGuideStepData =
  | { readonly kind: "period"; readonly period: ReviewPeriodFacts }
  | { readonly kind: "inbox"; readonly inbox: ReviewInboxContext }
  | { readonly kind: "projects"; readonly projects: ReviewProjectsContext }
  | { readonly kind: "alignment"; readonly alignment: ReviewAlignmentContext }
  | { readonly kind: "sections" }
  | {
      readonly kind: "focus";
      readonly priorFocus: SerializedPriorFocus | null;
    }
  | { readonly kind: "summary" };

export interface ReviewGuideContext {
  /** The authoritative remaining Inbox total, or null when it could not be read. */
  readonly inboxRemaining: number | null;
  readonly stepData: ReviewGuideStepData;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function inPeriod(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

function bounded(count: number, limit: number): BoundedCount {
  return { value: Math.min(count, limit), hasMore: count > limit };
}

const PROJECT_STATUS_LABELS: Readonly<Record<string, string>> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

/**
 * The documented display order of the Project check (REVIEWS_MODULE.md).
 * Lower rank leads:
 *
 *   0. blocked or at risk (PROJ-02 says so)
 *   1. has overdue work
 *   2. active with no visible next action
 *   3. recently active
 *   4. completed during the period
 *
 * Uses the EXISTING PROJ-02 vocabulary. It invents no new alarming label, and it
 * is applied to a bounded page that was already selected at the database.
 */
export function reviewProjectOrderRank(project: ReviewProjectSummary): number {
  if (project.completedInThisPeriod) return 4;
  const state = project.health?.state;
  if (state === "blocked" || state === "at_risk") return 0;
  if (project.overdueTasks > 0) return 1;
  if (project.openTasks > 0 && project.nextAction === null) return 2;
  return 3;
}

function compareReviewProjects(
  a: ReviewProjectSummary,
  b: ReviewProjectSummary,
): number {
  const rank = reviewProjectOrderRank(a) - reviewProjectOrderRank(b);
  if (rank !== 0) return rank;
  // Within a band: the least recently touched first (it is the one most likely to
  // need a decision), then title, then id, so the order is fully deterministic.
  const aDays = a.daysSinceActivity ?? Number.MAX_SAFE_INTEGER;
  const bDays = b.daysSinceActivity ?? Number.MAX_SAFE_INTEGER;
  if (aDays !== bDays) return bDays - aDays;
  const title = a.title.localeCompare(b.title);
  if (title !== 0) return title;
  return a.id.localeCompare(b.id);
}

/* -------------------------------------------------------------------------- */
/* The projection                                                              */
/* -------------------------------------------------------------------------- */

export interface ReviewGuideContextInput {
  readonly review: Review;
  readonly stepId: WeeklyReviewStepId;
  readonly now: Date;
  readonly timezone: string;
  readonly todayIso: string;
  /** Formats a wall-calendar date for display, using the owner's preference. */
  readonly formatDate: (iso: string) => string;
}

/**
 * The AUTHORITATIVE remaining Inbox total, read INDEPENDENTLY of the step.
 *
 * The loader needs it before it can derive progress (the Inbox step's completion
 * rule reads it), and progress is what decides which step to render — so this is
 * deliberately its own call rather than part of the step payload.
 */
export async function readReviewInboxRemaining(
  scope: WorkspaceScope,
  todayIso: string,
): Promise<number | null> {
  return readInboxRemaining(scope, todayIso);
}

/** The step-specific payload, once the step has been resolved. */
export async function loadReviewGuideStepData(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
  inboxRemaining: number | null,
): Promise<ReviewGuideStepData> {
  const step = weeklyReviewStep(input.stepId);
  switch (step.context) {
    case "period":
      return { kind: "period", period: await readPeriodFacts(scope, input) };
    case "inbox":
      return {
        kind: "inbox",
        inbox: await readInbox(scope, input, inboxRemaining),
      };
    case "projects":
      return { kind: "projects", projects: await readProjects(scope, input) };
    case "alignment":
      return {
        kind: "alignment",
        alignment: await readAlignment(scope, input),
      };
    case "sections":
      if (input.stepId === "focus") {
        return {
          kind: "focus",
          priorFocus: await readPriorFocus(scope, input),
        };
      }
      return { kind: "sections" };
    case "summary":
      return { kind: "summary" };
  }
}

/** The composed projection: the Inbox total plus the requested step's payload. */
export async function loadReviewGuideContext(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
): Promise<ReviewGuideContext> {
  const inboxRemaining = await readReviewInboxRemaining(scope, input.todayIso);
  return {
    inboxRemaining,
    stepData: await loadReviewGuideStepData(scope, input, inboxRemaining),
  };
}

/**
 * The AUTHORITATIVE remaining Inbox total. `listWorkspaceTaskGroups` returns each
 * bucket's count over the WHOLE active scope, not "how many were loaded", so this
 * is the true number even when the triage queue shows one bounded page. Returns
 * null when the read fails — an unavailable count must never read as "cleared".
 */
async function readInboxRemaining(
  scope: WorkspaceScope,
  todayIso: string,
): Promise<number | null> {
  try {
    const grouping = await scope.tasks.listWorkspaceTaskGroups({
      dimension: "parent",
      view: "inbox",
      bucketLimit: 1,
      todayIso,
    });
    return grouping.groups.reduce((total, group) => total + group.count, 0);
  } catch {
    return null;
  }
}

async function readPeriodFacts(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
): Promise<ReviewPeriodFacts> {
  const limit = REVIEW_GUIDE_LIMITS.periodRecords;
  const { review, timezone, todayIso } = input;
  try {
    const [
      completed,
      overdue,
      diary,
      recentMeetings,
      upcomingMeetings,
      projects,
    ] = await Promise.all([
      scope.tasks.listWorkspaceTasks({ view: "completed", limit, todayIso }),
      scope.tasks.listWorkspaceTasks({ view: "overdue", limit, todayIso }),
      scope.diary.list({ order: "newest", limit }),
      scope.meetings.list({ view: "recent", limit }),
      scope.meetings.list({ view: "upcoming", limit }),
      scope.projects.listProjects({
        state: "open",
        workflowStatus: "active",
        limit: REVIEW_GUIDE_LIMITS.projects,
      }),
    ]);

    const completedInPeriod = completed.items.filter(
      (task) =>
        task.completedAt !== null &&
        inPeriod(
          ownerCalendarIso(task.completedAt, timezone),
          review.periodStart,
          review.periodEnd,
        ),
    ).length;

    const diaryInPeriod = diary.items.filter((entry) =>
      inPeriod(
        ownerCalendarIso(entry.occurredAt, timezone),
        review.periodStart,
        review.periodEnd,
      ),
    ).length;

    const meetingIds = new Set<string>();
    let meetingsInPeriod = 0;
    for (const meeting of [
      ...recentMeetings.items,
      ...upcomingMeetings.items,
    ]) {
      if (meetingIds.has(meeting.id)) continue;
      meetingIds.add(meeting.id);
      if (
        inPeriod(
          ownerCalendarIso(meeting.startsAt, timezone),
          review.periodStart,
          review.periodEnd,
        )
      ) {
        meetingsInPeriod += 1;
      }
    }

    return {
      tasksCompleted: bounded(completedInPeriod, limit),
      tasksOverdue: bounded(overdue.items.length, limit),
      diaryEntries: bounded(diaryInPeriod, limit),
      meetings: bounded(meetingsInPeriod, limit),
      activeProjects: bounded(
        projects.items.length,
        REVIEW_GUIDE_LIMITS.projects,
      ),
      goalsWithRecentProgress: null,
    };
  } catch {
    return {
      tasksCompleted: { value: 0, hasMore: false },
      tasksOverdue: { value: 0, hasMore: false },
      diaryEntries: { value: 0, hasMore: false },
      meetings: { value: 0, hasMore: false },
      activeProjects: { value: 0, hasMore: false },
      goalsWithRecentProgress: null,
    };
  }
}

async function readInbox(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
  remaining: number | null,
): Promise<ReviewInboxContext> {
  try {
    const page = await scope.tasks.listWorkspaceTasks({
      view: "inbox",
      limit: REVIEW_GUIDE_LIMITS.inboxPage,
      todayIso: input.todayIso,
    });
    return {
      tasks: page.items.map(serializeTaskListItem),
      remaining: remaining ?? page.items.length,
      nextCursor: page.nextCursor,
      unavailable: false,
    };
  } catch {
    return { tasks: [], remaining: 0, nextCursor: null, unavailable: true };
  }
}

async function readProjects(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
): Promise<ReviewProjectsContext> {
  const { review, timezone, todayIso, now } = input;
  try {
    /*
     * Which Projects appear (REVIEWS_MODULE.md → Project selection):
     *
     *   - every OPEN Project, most recently updated first, so Projects with
     *     activity in the period lead and stale ones still appear; plus
     *   - Projects COMPLETED during the Review's period, because "we finished it"
     *     is exactly the kind of thing a weekly Review should notice.
     *
     * Never: permanently deleted Projects (they are gone), and never archived
     * Projects with no period relevance — `state` excludes them at the database.
     * The list is bounded and the bound is reported honestly.
     */
    const [openPage, completedPage] = await Promise.all([
      scope.projects.listProjects({
        state: "open",
        orderBy: "recent",
        limit: REVIEW_GUIDE_LIMITS.projects + 1,
      }),
      scope.projects.listProjects({
        state: "completed",
        orderBy: "recent",
        limit: REVIEW_GUIDE_LIMITS.projects,
      }),
    ]);

    const completedInThisPeriod = new Set(
      completedPage.items
        .filter(
          (project) =>
            project.completedAt !== null &&
            inPeriod(
              ownerCalendarIso(project.completedAt, timezone),
              review.periodStart,
              review.periodEnd,
            ),
        )
        .map((project) => project.id),
    );

    const hasMore = openPage.items.length > REVIEW_GUIDE_LIMITS.projects;
    const selected = [
      ...openPage.items.slice(0, REVIEW_GUIDE_LIMITS.projects),
      ...completedPage.items.filter((project) =>
        completedInThisPeriod.has(project.id),
      ),
    ];
    const ids = selected.map((project) => project.id);

    const [healthFacts, actionable, periodCompleted] = await Promise.all([
      scope.projectHealth.listProjectHealthFacts(ids, todayIso),
      // ONE bounded scan of the most actionable open work, bucketed by Project
      // below. Never one query per Project.
      scope.tasks.listWorkspaceTasks({
        view: "active",
        sort: "smart",
        limit: REVIEW_GUIDE_LIMITS.nextActionScan,
        todayIso,
      }),
      scope.tasks.listWorkspaceTasks({
        view: "completed",
        limit: REVIEW_GUIDE_LIMITS.periodRecords,
        todayIso,
      }),
    ]);

    const firstOpenByProject = new Map<string, { id: string; title: string }>();
    for (const task of actionable.items) {
      if (task.parent?.kind !== "project") continue;
      if (task.waiting !== null) continue;
      if (firstOpenByProject.has(task.parent.id)) continue;
      firstOpenByProject.set(task.parent.id, {
        id: task.id,
        title: task.title,
      });
    }

    const completedByProject = new Map<string, number>();
    for (const task of periodCompleted.items) {
      if (task.parent?.kind !== "project" || task.completedAt === null)
        continue;
      if (
        !inPeriod(
          ownerCalendarIso(task.completedAt, timezone),
          review.periodStart,
          review.periodEnd,
        )
      ) {
        continue;
      }
      completedByProject.set(
        task.parent.id,
        (completedByProject.get(task.parent.id) ?? 0) + 1,
      );
    }

    const healthContext = createOwnerHealthContext(now, timezone);
    const projects = selected.map<ReviewProjectSummary>((project) => {
      const facts = healthFacts.get(project.id);
      const health = facts ? evaluateProjectHealth(facts, healthContext) : null;
      return {
        id: project.id,
        title: project.title,
        areaTitle: project.area?.title ?? null,
        goalTitle: project.goal?.title ?? null,
        goalId: project.goal?.id ?? null,
        status: project.status,
        statusLabel: PROJECT_STATUS_LABELS[project.status] ?? project.status,
        health,
        openTasks: health?.summary.openTotal ?? 0,
        overdueTasks: health?.summary.overdueOpen ?? 0,
        waitingTasks: health?.summary.waitingOpen ?? 0,
        completedInPeriod: completedByProject.get(project.id) ?? 0,
        lastActivityDate: health?.summary.lastActivityDate ?? null,
        daysSinceActivity: health?.summary.daysSinceActivity ?? null,
        nextAction: firstOpenByProject.get(project.id) ?? null,
        completedInThisPeriod: completedInThisPeriod.has(project.id),
      };
    });

    return {
      projects: [...projects].sort(compareReviewProjects),
      hasMore,
      unavailable: false,
    };
  } catch {
    return { projects: [], hasMore: false, unavailable: true };
  }
}

async function readAlignment(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
): Promise<ReviewAlignmentContext> {
  try {
    const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
      createOwnerAlignmentContext(input.now);

    let goalPage;
    try {
      goalPage = await scope.goals.listGoalsByAlignment({
        limit: REVIEW_GUIDE_LIMITS.goals + 1,
        activeBoundaryIso: recentBoundaryStartIso,
      });
    } catch (error) {
      if (!(error instanceof InvalidSpineCursorError)) throw error;
      goalPage = await scope.goals.listGoalsByAlignment({
        activeBoundaryIso: recentBoundaryStartIso,
      });
    }

    const goalsHasMore = goalPage.items.length > REVIEW_GUIDE_LIMITS.goals;
    const goalItems = goalPage.items.slice(0, REVIEW_GUIDE_LIMITS.goals);
    const goalIds = goalItems.map((goal) => goal.id);

    const [contributions, activityFacts, areaPage, activeProjects] =
      await Promise.all([
        scope.goals.listGoalProjectContributions(goalIds),
        scope.alignment.listGoalAlignmentFacts(goalIds, {
          recentWindowStartIso,
        }),
        scope.areas.listAreas({ limit: REVIEW_GUIDE_LIMITS.areas + 1 }),
        scope.projects.listProjects({
          state: "open",
          workflowStatus: "active",
          orderBy: "recent",
          limit: REVIEW_GUIDE_LIMITS.projects,
        }),
      ]);

    const goals = goalItems.map<ReviewGoalAlignmentSummary>((goal) => {
      const contribution = contributions.get(goal.id) ?? {
        total: 0,
        completed: 0,
        incomplete: 0,
        active: 0,
        planned: 0,
        onHold: 0,
        archived: 0,
      };
      const alignment: GoalAlignment = evaluateGoalAlignment(
        composeGoalAlignmentFacts({
          goalId: goal.id,
          completedAt: goal.completedAt,
          contribution,
          activity: activityFacts.get(goal.id),
        }),
        evaluation,
      );
      return {
        id: goal.id,
        title: goal.title,
        alignment,
        contributingProjects: contribution.total,
        activeContributingProjects: contribution.active,
      };
    });

    /*
     * Area attention, derived from facts already read: an Area is "attended" when
     * at least one ACTIVE Project belongs to it. That is a deliberately modest,
     * explainable rule — it says where the workspace's active work is pointed, and
     * it never says an Area was neglected in a moral sense. Richer per-period Area
     * attention history is REVIEW-03's, not this PR's.
     */
    const attendedAreaIds = new Set(
      activeProjects.items
        .map((project) => project.area?.id)
        .filter((id): id is string => typeof id === "string"),
    );
    const areasHasMore = areaPage.items.length > REVIEW_GUIDE_LIMITS.areas;
    const areas = areaPage.items
      .slice(0, REVIEW_GUIDE_LIMITS.areas)
      .map<ReviewAreaAttention>((area) => ({
        id: area.id,
        title: area.title,
        activeProjects: area.activeProjectCount,
        attended: attendedAreaIds.has(area.id),
      }));

    return {
      goals,
      goalsHasMore,
      areas,
      areasHasMore,
      projectsWithoutGoal: activeProjects.items.filter(
        (project) => project.goal === null,
      ).length,
      activeProjectsConsidered: activeProjects.items.length,
      unavailable: false,
    };
  } catch {
    return {
      goals: [],
      goalsHasMore: false,
      areas: [],
      areasHasMore: false,
      projectsWithoutGoal: 0,
      activeProjectsConsidered: 0,
      unavailable: true,
    };
  }
}

/**
 * The previous period's focus, DERIVED from whichever completed weekly Review most
 * recently preceded this one. Nothing is copied: the text still lives only in the
 * Review that wrote it, so completing a newer Review supersedes it for free and
 * reopening one removes it immediately.
 */
async function readPriorFocus(
  scope: WorkspaceScope,
  input: ReviewGuideContextInput,
): Promise<SerializedPriorFocus | null> {
  try {
    const page = await scope.reviews.list({
      view: "completed",
      type: "weekly",
      sort: "period",
      limit: REVIEW_GUIDE_LIMITS.focusCandidates,
    });
    const focus: PriorPeriodFocus | null = selectPriorPeriodFocus(
      page.items.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        type: candidate.type,
        status: candidate.status,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
        archivedAt: candidate.archivedAt,
        completedAt: candidate.completedAt,
        focusBody:
          candidate.sections.find(
            (section) => section.sectionId === "summary.next_focus",
          )?.body ?? "",
      })),
      input.review.periodStart,
    );
    if (!focus) return null;
    return {
      reviewId: focus.reviewId,
      reviewTitle: focus.reviewTitle,
      periodLabel: `${input.formatDate(focus.periodStart)}–${input.formatDate(focus.periodEnd)}`,
      body: focus.body,
    };
  } catch {
    return null;
  }
}

/** Every section id the closed REVIEWS-01 vocabulary defines — re-exported so the
 * guide's serialiser and its tests share one list rather than two. */
export const ALL_REVIEW_SECTION_IDS = REVIEW_SECTION_IDS;
