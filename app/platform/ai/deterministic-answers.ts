/**
 * AI-01 platform — the questions DalyHub answers WITHOUT a model.
 *
 * A count is a count. Asking a provider how many overdue Tasks exist would spend
 * the owner's money to have a language model read a number DalyHub already knows,
 * and would make the answer less reliable rather than more. So Ask DalyHub
 * classifies first: an allow-listed deterministic intent is answered from
 * repositories, with citations, and never reaches a provider.
 *
 * The classifier is a small, explicit rule set — not a model, not a heuristic
 * that grows quietly. It matches conservatively: anything it is not sure about
 * falls through to the evidence-backed AI path, which is the safe direction.
 */

import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

/** The deterministic intents DalyHub answers itself. A CLOSED set. */
export const DETERMINISTIC_INTENTS = [
  "overdue_task_count",
  "open_task_count",
  "inbox_count",
  "latest_meeting",
  "upcoming_meeting",
] as const;

export type DeterministicIntent = (typeof DETERMINISTIC_INTENTS)[number];

/** A deterministic answer: the sentence, plus the records it came from. */
export interface DeterministicAnswer {
  readonly intent: DeterministicIntent;
  readonly summary: string;
  readonly citations: readonly {
    readonly title: string;
    readonly href: string | null;
    readonly date: string | null;
  }[];
}

/**
 * Classify a question into a deterministic intent, or `null`.
 *
 * Deliberately narrow. Each rule requires BOTH a subject word and an intent word,
 * so "what did we decide about overdue work?" — a synthesis question that happens
 * to contain "overdue" — is not misrouted into a count.
 */
export function classifyDeterministicIntent(
  question: string,
): DeterministicIntent | null {
  const text = question.toLowerCase();
  const asksCount = /\bhow many\b|\bcount\b|\bnumber of\b/.test(text);
  const asksWhen =
    /\bwhen\b|\blast\b|\bmost recent\b|\bnext\b|\bupcoming\b/.test(text);
  const mentionsTasks = /\btasks?\b/.test(text);
  const mentionsMeetings = /\bmeetings?\b/.test(text);
  const mentionsInbox = /\binbox\b/.test(text);
  const mentionsOverdue = /\boverdue\b|\blate\b|\bpast due\b/.test(text);

  if (asksCount && mentionsTasks && mentionsOverdue)
    return "overdue_task_count";
  if (asksCount && mentionsInbox) return "inbox_count";
  if (asksCount && mentionsTasks) return "open_task_count";
  if (asksWhen && mentionsMeetings && /\bnext\b|\bupcoming\b/.test(text)) {
    return "upcoming_meeting";
  }
  if (asksWhen && mentionsMeetings) return "latest_meeting";
  return null;
}

/**
 * Answer a deterministic intent from repositories.
 *
 * Returns `null` when the facts could not be read — the caller then falls back to
 * the AI path rather than reporting a wrong zero, because "0 overdue tasks"
 * because a query failed is a lie the owner would act on.
 */
export async function answerDeterministically(
  scope: WorkspaceScope,
  intent: DeterministicIntent,
  todayIso: string,
  /**
   * HARDEN-06C (F-14) — the owner's IANA zone, so a Meeting is dated the day it
   * happens FOR THEM. `startsAt` is a UTC instant, and slicing its ISO string
   * gave the assistant a date that could differ by one from the date every
   * other Meetings surface shows for the same record.
   */
  timezone: string,
): Promise<DeterministicAnswer | null> {
  try {
    switch (intent) {
      case "overdue_task_count": {
        const page = await scope.tasks.listTasks({ limit: 200 });
        const overdue = page.items.filter(
          (task) =>
            task.completedAt === null &&
            task.dueDate !== null &&
            task.dueDate < todayIso,
        );
        return {
          intent,
          summary:
            overdue.length === 0
              ? "Nothing is overdue."
              : `${overdue.length} ${overdue.length === 1 ? "Task is" : "Tasks are"} overdue.`,
          citations: overdue.slice(0, 5).map((task) => ({
            title: task.title,
            href: `/tasks?task=${task.id}`,
            date: task.dueDate,
          })),
        };
      }
      case "open_task_count": {
        const page = await scope.tasks.listTasks({ limit: 200 });
        const open = page.items.filter((task) => task.completedAt === null);
        return {
          intent,
          summary: `${open.length} open ${open.length === 1 ? "Task" : "Tasks"}${
            open.length >= 200 ? " (at least — the count is capped at 200)" : ""
          }.`,
          citations: [],
        };
      }
      case "inbox_count": {
        const page = await scope.tasks.listTasks({ limit: 200 });
        const inbox = page.items.filter(
          (task) => task.completedAt === null && task.parent === null,
        );
        return {
          intent,
          summary:
            inbox.length === 0
              ? "The Inbox is clear."
              : `${inbox.length} unassigned ${inbox.length === 1 ? "Task is" : "Tasks are"} in the Inbox.`,
          citations: inbox.slice(0, 5).map((task) => ({
            title: task.title,
            href: `/tasks?task=${task.id}`,
            date: task.dueDate,
          })),
        };
      }
      case "latest_meeting":
      case "upcoming_meeting": {
        const page = await scope.meetings.list({
          view: intent === "latest_meeting" ? "recent" : "upcoming",
          limit: 1,
        });
        const meeting = page.items[0];
        if (!meeting) {
          return {
            intent,
            summary:
              intent === "latest_meeting"
                ? "No past Meetings are recorded."
                : "No upcoming Meetings are scheduled.",
            citations: [],
          };
        }
        const date = ownerCalendarIso(meeting.startsAt, timezone);
        return {
          intent,
          summary:
            intent === "latest_meeting"
              ? `The most recent Meeting was “${meeting.title}” on ${date}.`
              : `The next Meeting is “${meeting.title}” on ${date}.`,
          citations: [
            { title: meeting.title, href: `/meetings/${meeting.id}`, date },
          ],
        };
      }
    }
  } catch {
    return null;
  }
}
