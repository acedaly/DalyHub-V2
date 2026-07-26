/**
 * TASKS-02 — the shared task Urgency chip.
 *
 * ONE component renders a task's date urgency — **Overdue**, **Due today**, a
 * future **Due** date, **Scheduled today**, or a future **Scheduled** date — as a
 * compact chip on every task-bearing surface (Today, Projects, Tasks, the Drawer).
 * It is driven entirely by the canonical `taskUrgency` evaluator in `task-view.ts`,
 * so urgency reads identically everywhere.
 *
 * Accessibility (AGENTS.md §15, DEBT-27): the WORD carries the meaning — "Overdue"
 * is a word, not a red colour; "Due today" is a word, not merely a nearer date. The
 * colour and icon are reinforcement only. The chip renders nothing when the task
 * has no due or scheduled date, so lists stay calm.
 */

import { taskUrgency } from "./task-view";

export interface UrgencyChipProps {
  /** The minimal date facts the urgency evaluator reads. */
  readonly task: {
    readonly completedAt: string | null;
    readonly dueDate: string | null;
    readonly scheduledDate: string | null;
  };
  /** The owner's current calendar date `YYYY-MM-DD` (server-derived, ADR-022). */
  readonly todayIso: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** A small calendar glyph for scheduled kinds; a clock/alert for due kinds. */
function UrgencyGlyph({ scheduled }: { readonly scheduled: boolean }) {
  if (scheduled) {
    return (
      <svg
        className="dh-urgency__icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <rect
          x="2.5"
          y="3"
          width="11"
          height="10.5"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M2.5 6h11M5.5 2v2M10.5 2v2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className="dh-urgency__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8.5"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M8 5.5v3.2l2 1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Render a task's date urgency as a shared, accessible chip (or nothing). */
export function UrgencyChip({
  task,
  todayIso,
  className,
  "data-testid": testId,
}: UrgencyChipProps) {
  const urgency = taskUrgency(task, todayIso);
  if (urgency === null) {
    return null;
  }
  const scheduled =
    urgency.kind === "scheduled" || urgency.kind === "scheduled_today";
  return (
    <span
      className={["dh-urgency", className].filter(Boolean).join(" ")}
      data-tone={urgency.tone}
      data-kind={urgency.kind}
      data-testid={testId}
    >
      <UrgencyGlyph scheduled={scheduled} />
      <span className="dh-urgency__label">{urgency.label}</span>
    </span>
  );
}
