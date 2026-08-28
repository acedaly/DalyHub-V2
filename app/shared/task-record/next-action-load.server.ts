/**
 * STEER-04 — the ONE server-side read of a next action, for both levels.
 *
 * A Project's next action and a Goal's next step are the SAME rule
 * (`~/kernel/tasks/next-action`, ADR-111 decision 4) asked at two levels of the
 * spine, so they are read here, once:
 *
 *     Project → its canonical next action
 *     Goal    → contributing Projects → each Project's canonical next action
 *             → the best of those, by the SAME ordering
 *
 * The Goal level is a COMPOSITION, not a second ranking model. A Goal owns no
 * Tasks — the spine forbids it (`AGENTS.md` §4) — so its next step is whichever
 * of its Projects' next actions the canonical smart ordering puts first, with
 * the Task id as the final tiebreak so a Goal with several Projects selects
 * predictably across reloads.
 *
 * ── What it costs ──────────────────────────────────────────────────────────
 * ONE bounded ranked statement per chunk of 40 Project ids
 * (`listProjectNextActions`), and never one query per Project — which is
 * exactly the N+1 the query-budget test falsifies. A Goal's contributing-Project
 * page is bounded at 50 by its own loader, so a Goal costs at most two
 * statements and normally one.
 *
 * ── Why it lives in `~/shared` ─────────────────────────────────────────────
 * Three modules consume it (Today, Goals, and the Goals workspace pane through
 * the same detail read), and a module may not import another module's
 * internals. `.server` because it reaches the workspace scope.
 */

import { selectGoalNextAction, type NextActionFacts } from "~/kernel/tasks";
import type { TaskListItem } from "~/kernel/tasks";
import type { WorkspaceScope } from "~/platform/workspaces";

import type { SerializedNextAction } from "./NextActionLine";

/**
 * A Task the repository already selected as SOME Project's next action, as the
 * pure rule's facts.
 *
 * `waitingSince` and `blocked` are constants here rather than reads, and that is
 * a statement about the source: the repository's population is the active
 * planning scope minus dependency-blocked work, so a Task that reached this map
 * is by construction neither waiting nor blocked. Reading them again would be
 * asking the database to confirm its own WHERE clause.
 */
function candidateFacts(task: TaskListItem): NextActionFacts {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    status: task.status,
    commitmentState: task.commitmentState,
    priority: task.priority,
    dueDate: task.dueDate,
    waitingSince: null,
    blocked: false,
  };
}

export interface GoalNextActionInput {
  /** The Goal's contributing Projects — id and title, already in hand. */
  readonly projects: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  /** The owner's calendar day (ADR-022), resolved server-side. */
  readonly todayIso: string;
  readonly timezone: string;
}

/**
 * The next step across a Goal's contributing Projects, or `null`.
 *
 * `null` covers three genuinely different situations and states none of them as
 * a fourth: a Goal with no contributing Project, a Goal whose Projects hold no
 * Tasks, and a Goal whose every open Task is completed, cancelled, on hold,
 * Someday, waiting or dependency-blocked. The surface says what it can see —
 * and, where the absence is STRUCTURAL, offers to create the missing Project.
 */
export async function readGoalNextAction(
  scope: WorkspaceScope,
  input: GoalNextActionInput,
): Promise<SerializedNextAction | null> {
  if (input.projects.length === 0) return null;
  const titles = new Map(
    input.projects.map((project) => [project.id, project.title] as const),
  );
  const perProject = await scope.tasks.listProjectNextActions({
    projectIds: input.projects.map((project) => project.id),
    todayIso: input.todayIso,
    timezone: input.timezone,
  });
  if (perProject.size === 0) return null;

  const byId = new Map<string, { task: TaskListItem; projectId: string }>();
  const candidates: NextActionFacts[] = [];
  for (const [projectId, task] of perProject) {
    byId.set(task.id, { task, projectId });
    candidates.push(candidateFacts(task));
  }
  const chosen = selectGoalNextAction(candidates, input.todayIso);
  if (chosen === null) return null;
  const winner = byId.get(chosen.id);
  if (!winner) return null;
  return {
    id: winner.task.id,
    title: winner.task.title,
    projectId: winner.projectId,
    projectTitle: titles.get(winner.projectId) ?? null,
  };
}
