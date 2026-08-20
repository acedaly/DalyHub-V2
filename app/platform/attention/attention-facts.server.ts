/**
 * The SHARED attention facts — one derivation, two consumers.
 *
 * Today's attention rail and (NOTIFY-01) the morning digest answer the same
 * question about the same workspace: what is unfiled, what is ageing, which
 * obligations are due, which projects have drifted. Before this module they
 * would have answered it with two sets of reads, and the moment those two drift
 * the product tells the owner two different numbers for one fact — on the same
 * morning, about the same day.
 *
 * So the reads live here, once, and each surface renders them:
 *
 *     readAttentionFacts ──▶ buildAttention()   (Today's rail — STATE)
 *                        └─▶ renderDigest()     (the digest — an EVENT)
 *
 * This file is the "shared facts layer" NOTIFY-01's roadmap item names: if the
 * digest ever wants a fact the rail cannot supply, the fact is added HERE, never
 * computed a second time in the digest.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 * It derives nothing of its own. Project health is `evaluateProjectHealth`, goal
 * alignment is `evaluateGoalAlignment`, an obligation's state is
 * `evaluateObligation` and the Inbox count is the canonical `inbox` system view
 * — every one of them the existing single authority for that judgement. This
 * module reads and shapes; it never decides.
 *
 * Every read degrades independently: a failing module empties its own fact and
 * never fails the caller. Today has always worked that way ("degrade, never
 * blank"), and a background tick has even more reason to — a digest that is
 * missing its project line is worth sending; a tick that throws is not.
 */

import {
  dedupeAttention,
  evaluateObligation,
  type AssetsTodayData,
} from "~/kernel/assets";
import { evaluateProjectHealth } from "~/kernel/project-health";
import { projectWorkflowStatusLabel } from "~/kernel/project-settings";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
} from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  createOwnerHealthContext,
  healthNeedsAttention,
} from "~/shared/project-health";
import type { WorkspaceScope } from "~/platform/workspaces";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/** How many waiting items are read to count them and age the oldest. */
export const WAITING_LIMIT = 50;
/**
 * How many active projects are read before ranking.
 *
 * The repository can only order by recency of UPDATE; the ranking Today needs is
 * recency of ACTIVITY, which lives in the health facts. So a slightly larger
 * bounded page is read and re-ranked in memory — one query, no N+1, and a
 * project that was worked on but not renamed still surfaces.
 */
export const PROJECTS_LIMIT = 12;
/** How many goals are examined for alignment. They arrive neglected-first. */
const GOALS_EXAMINED = 8;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** The waiting fact: how many, and how long the oldest has waited. */
export interface WaitingFacts {
  readonly count: number;
  /** Owner-calendar days the oldest waiting item has waited, or null. */
  readonly oldestDays: number | null;
}

/**
 * One active project with its EXISTING derived health.
 *
 * Structurally the rail's `ContinueProject` (`app/modules/today/day/attention-view.ts`).
 * It is stated here rather than imported because the platform must not depend on
 * a module — and the compiler is the guard against drift: Today passes these
 * straight into `rankContinueProjects`, so losing a field here fails the build
 * there rather than silently changing the rail.
 */
export interface AttentionProjectFacts {
  readonly id: string;
  readonly title: string;
  readonly openCount: number;
  readonly taskTotal: number;
  readonly taskCompleted: number;
  readonly statusLabel: string;
  readonly needsAttention: boolean;
  readonly lastActivityIso: string | null;
  readonly iconKey: string | null;
  readonly colourRank: number;
  readonly colourSlot: string | null;
}

/** A goal the EXISTING alignment evaluation flags as neglected. */
export interface AttentionGoalFacts {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
}

/** Everything both the rail and the digest are built from. */
export interface AttentionFacts {
  readonly inboxCount: number;
  readonly waiting: WaitingFacts;
  readonly assets: AssetsTodayData;
  readonly projects: readonly AttentionProjectFacts[];
  readonly goals: readonly AttentionGoalFacts[];
}

/** A read that degrades to a fallback rather than failing its caller. */
async function safely<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* The reads                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The authoritative Inbox count. It uses the canonical `inbox` system view rather
 * than a bounded planning read, so Today and `/tasks?system=inbox` cannot
 * disagree when the workspace holds more unfiled work than a planning limit
 * returns.
 */
export async function readInboxCount(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<number> {
  return countSystemView(scope, "inbox", todayIso, timezone);
}

/** How many open tasks a system view holds, from the canonical grouped read. */
export async function countSystemView(
  scope: WorkspaceScope,
  view: "inbox" | "today" | "overdue",
  todayIso: string,
  // HARDEN-06C (F-05) — the zone `todayIso` was derived in travels with it.
  timezone: string,
): Promise<number> {
  const grouped = await scope.tasks.listWorkspaceTaskGroups({
    dimension: "parent",
    view,
    todayIso,
    timezone,
    bucketLimit: 1,
  });
  return grouped.groups.reduce((total, group) => total + group.count, 0);
}

/** Asset obligations that need attention and are not already represented by Tasks. */
export async function readAssetAttention(
  scope: WorkspaceScope,
  todayIso: string,
): Promise<AssetsTodayData> {
  const items = await scope.assetHistory.listAttention({ today: todayIso });
  return dedupeAttention(
    items.map((item) => {
      const evaluation = evaluateObligation(
        item.obligation,
        todayIso,
        item.reading,
      );
      return {
        obligationId: item.obligation.id,
        assetId: item.assetId,
        assetTitle: item.assetTitle,
        assetType: item.assetType,
        title: item.obligation.title,
        category: item.obligation.category,
        state: evaluation.state,
        text: evaluation.text,
        hasOpenTask: item.hasOpenTask,
      };
    }),
  );
}

/** The waiting count and the age of the oldest — the fact that earns the row. */
export async function readWaiting(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<WaitingFacts> {
  const page = await scope.tasks.listWaitingTasks({
    limit: WAITING_LIMIT,
    todayIso,
  });
  let oldestDays: number | null = null;
  for (const item of page.items) {
    const days = daysBetween(
      ownerCalendarIso(item.waiting.since, timezone),
      todayIso,
    );
    if (oldestDays === null || days > oldestDays) {
      oldestDays = days;
    }
  }
  return { count: page.items.length, oldestDays };
}

/** Whole days from `from` to `to`; positive when `to` is later. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Every active project, with its EXISTING derived health, in one N+1-free read. */
export async function readActiveProjects(
  scope: WorkspaceScope,
  now: Date,
  todayIso: string,
  timezone: string,
): Promise<readonly AttentionProjectFacts[]> {
  // `state: "open"` excludes Completed and Archived; `workflowStatus: "active"`
  // further restricts to projects the owner has deliberately moved into active
  // work. Both are applied AT the database, never re-filtered in React.
  const page = await scope.projects.listProjects({
    state: "open",
    workflowStatus: "active",
    orderBy: "recent",
    limit: PROJECTS_LIMIT,
  });
  const context = createOwnerHealthContext(now, timezone);
  const facts = await scope.projectHealth.listProjectHealthFacts(
    page.items.map((item) => item.id),
    todayIso,
  );
  return page.items.map((item) => {
    const fact = facts.get(item.id);
    const health = fact ? evaluateProjectHealth(fact, context) : null;
    const needsAttention = health !== null && healthNeedsAttention(health);
    return {
      id: item.id,
      title: item.title,
      openCount: Math.max(0, item.taskTotal - item.taskCompleted),
      taskTotal: item.taskTotal,
      taskCompleted: item.taskCompleted,
      statusLabel: health?.label ?? projectWorkflowStatusLabel("active"),
      needsAttention,
      lastActivityIso: health?.summary.lastActivityIso ?? null,
      iconKey: item.iconKey,
      colourRank: item.colourRank,
      colourSlot: item.colourSlot,
    };
  });
}

/** Goals the EXISTING alignment evaluation flags as neglected. Nothing new. */
export async function readGoalsAtRisk(
  scope: WorkspaceScope,
  now: Date,
  timezone: string,
): Promise<readonly AttentionGoalFacts[]> {
  const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
    createOwnerAlignmentContext(now, timezone);
  const page = await scope.goals.listGoalsByAlignment({
    activeBoundaryIso: recentBoundaryStartIso,
  });
  // `listGoalsByAlignment` already ranks neglected goals first, so a small slice
  // is enough to find the ones at risk without reading the whole collection.
  const items = page.items.slice(0, GOALS_EXAMINED);
  const ids = items.map((item) => item.id);
  const [contributions, activityFacts] = await Promise.all([
    scope.goals.listGoalProjectContributions(ids),
    scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
  ]);
  const atRisk: AttentionGoalFacts[] = [];
  for (const item of items) {
    const alignment = evaluateGoalAlignment(
      composeGoalAlignmentFacts({
        goalId: item.id,
        completedAt: item.completedAt,
        contribution: contributions.get(item.id) ?? {
          total: 0,
          completed: 0,
          incomplete: 0,
          active: 0,
          planned: 0,
          onHold: 0,
          archived: 0,
        },
        activity: activityFacts.get(item.id),
      }),
      evaluation,
    );
    if (alignment.state === "neglected") {
      atRisk.push({
        id: item.id,
        title: item.title,
        statusLabel: alignment.label,
      });
    }
  }
  return atRisk;
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every attention fact, in parallel, each degrading independently.
 *
 * Today does NOT call this — it reads the same functions individually, because
 * it needs the project facts for two purposes (the rail and "Continue working")
 * and already runs one `Promise.all` over ten reads. This composition exists for
 * callers that want the whole picture and nothing else, which is what a
 * background tick is.
 */
export async function readAttentionFacts(
  scope: WorkspaceScope,
  facts: {
    readonly now: Date;
    readonly timezone: string;
    readonly todayIso: string;
  },
): Promise<AttentionFacts> {
  const [inboxCount, waiting, assets, projects, goals] = await Promise.all([
    safely(() => readInboxCount(scope, facts.todayIso, facts.timezone), 0),
    safely(() => readWaiting(scope, facts.todayIso, facts.timezone), {
      count: 0,
      oldestDays: null,
    }),
    safely(() => readAssetAttention(scope, facts.todayIso), {
      items: [],
      trackedAsTasksCount: 0,
      overdueCount: 0,
    }),
    safely(
      () =>
        readActiveProjects(scope, facts.now, facts.todayIso, facts.timezone),
      [] as readonly AttentionProjectFacts[],
    ),
    safely(
      () => readGoalsAtRisk(scope, facts.now, facts.timezone),
      [] as readonly AttentionGoalFacts[],
    ),
  ]);
  return { inboxCount, waiting, assets, projects, goals };
}
