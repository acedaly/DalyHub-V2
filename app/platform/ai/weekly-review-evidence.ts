/**
 * AI-01 platform — the Weekly Review assistant's input.
 *
 * The FACTS are DalyHub's, not the model's. Counts, overdue work, stalled
 * Projects and Goal alignment are all things the product already computes
 * deterministically for the guided Review (REVIEW-02, ADR-072); recomputing them
 * with a language model would be slower, more expensive and less correct.
 *
 * So the model receives a compact structured summary DalyHub calculated, plus a
 * small, cited set of supporting records — never hundreds of raw rows. That is
 * also what lets the output distinguish RECORDED FACT (in the facts block),
 * DERIVED CALCULATION (also in the facts block, labelled) and AI INFERENCE (the
 * `classification` field on each pattern).
 */

import {
  selectEvidence,
  type EvidenceCandidate,
  type EvidenceLimits,
  type EvidenceSet,
  type PrivacyCategory,
} from "~/kernel/ai";
import type { WorkspaceScope } from "~/platform/workspaces";

import { EMPTY_CANDIDATES, type RetrievalResult } from "./evidence-retrieval";

/** The deterministic facts about a Review period. All computed by DalyHub. */
export interface WeeklyReviewFacts {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly tasksCompleted: number;
  readonly tasksOverdue: number;
  readonly inboxRemaining: number;
  readonly activeProjects: number;
  readonly stalledProjects: number;
  readonly projectsWithoutNextAction: number;
  readonly waitingTasks: number;
  readonly meetingsHeld: number;
  readonly diaryEntries: number;
  readonly goalsWithActivity: number;
  readonly goalsWithoutActivity: number;
}

/** How many supporting records the assistant may cite. Bounded, deliberately. */
const MAX_SUPPORTING = 18;

/**
 * Assemble the Weekly Review assistant's evidence.
 *
 * `facts` come from the caller — the guided Review already loaded them for the
 * step the owner is on, so the assistant adds no extra database work beyond the
 * bounded supporting-record read below.
 */
export async function retrieveWeeklyReviewEvidence(
  scope: WorkspaceScope,
  facts: WeeklyReviewFacts,
  limits: EvidenceLimits,
  allowed: ReadonlySet<PrivacyCategory>,
): Promise<RetrievalResult> {
  const candidates: EvidenceCandidate[] = [];

  // Supporting records: the open work that the attention items will point at.
  // One bounded read; no per-project follow-up query.
  try {
    const page = await scope.tasks.listTasks({ limit: 60 });
    const open = page.items.filter((task) => task.completedAt === null);
    const overdue = open.filter(
      (task) => task.dueDate !== null && task.dueDate < facts.periodEnd,
    );
    const rest = open.filter((task) => !overdue.includes(task));

    for (const [index, task] of [...overdue, ...rest]
      .slice(0, MAX_SUPPORTING)
      .entries()) {
      candidates.push({
        kind: "task",
        entityId: task.id,
        title: task.title,
        date: task.dueDate ?? task.scheduledDate,
        href: `/tasks?task=${task.id}`,
        text: `Task: ${task.title}${
          task.parent ? ` in ${task.parent.title}` : " (unassigned)"
        }. Status ${task.status}${task.dueDate ? `, due ${task.dueDate}` : ""}${
          task.waiting ? ", waiting" : ""
        }.`,
        category: "general",
        updatedAt: task.updatedAt.toISOString(),
        rank: index,
      });
    }
  } catch {
    // A supporting-record failure degrades the assistant to facts-only rather
    // than failing the owner's Review.
  }

  const evidence: EvidenceSet = selectEvidence(candidates, limits, allowed);

  return {
    evidence,
    candidates: EMPTY_CANDIDATES,
    derivedFacts: renderWeeklyReviewFacts(facts),
  };
}

/**
 * Render the facts block. Every line is a number DalyHub calculated; the prompt
 * tells the model these are authoritative and must not be recomputed.
 */
export function renderWeeklyReviewFacts(facts: WeeklyReviewFacts): string {
  return [
    `period: ${facts.periodStart} to ${facts.periodEnd}`,
    `tasks completed in period: ${facts.tasksCompleted}`,
    `tasks overdue now: ${facts.tasksOverdue}`,
    `inbox tasks remaining: ${facts.inboxRemaining}`,
    `active projects: ${facts.activeProjects}`,
    `projects with no recent activity: ${facts.stalledProjects}`,
    `projects with no visible next action: ${facts.projectsWithoutNextAction}`,
    `tasks waiting on other people: ${facts.waitingTasks}`,
    `meetings in period: ${facts.meetingsHeld}`,
    `diary entries in period: ${facts.diaryEntries}`,
    `goals with supporting activity: ${facts.goalsWithActivity}`,
    `goals with no supporting activity: ${facts.goalsWithoutActivity}`,
  ].join("\n");
}
