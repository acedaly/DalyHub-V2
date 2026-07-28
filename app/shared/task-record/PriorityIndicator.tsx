/**
 * TASKS-02 — the shared task Priority indicator.
 *
 * ONE component renders a task's Eisenhower priority (P1–P4) as a compact, coloured
 * indicator on every task-bearing surface (Today, Projects, Tasks, the Drawer). It
 * is driven entirely by the canonical `taskPriorityTag` / `taskPriorityLabel` /
 * `priorityQuadrant` derivations in `task-view.ts`, so priority reads identically
 * everywhere and there is no second, drifting vocabulary.
 *
 * Accessibility (AGENTS.md §15, DEBT-28): the meaning is carried by TEXT, never by
 * colour alone. The short tag ("P1") is visible; the concise priority language is
 * available to assistive technology via a
 * visually-hidden suffix, so a monochrome or screen-reader user loses nothing. The
 * colour is reinforcement only. The indicator stays legible at compact density and
 * at 320px because it degrades to just the tag + accessible text.
 */

import type { TaskPriority } from "~/kernel/tasks";

import {
  priorityQuadrant,
  taskPriorityLabel,
  taskPriorityTag,
} from "./task-view";

export interface PriorityIndicatorProps {
  /** The task's priority, or null for an untriaged task. */
  readonly priority: TaskPriority | null;
  /**
   * When true, an untriaged (null) priority renders a muted "No priority" chip
   * instead of nothing. Off by default so lists stay calm — absence of a priority
   * badge already reads as "no priority" in a collection.
   */
  readonly showEmpty?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** Render a task's priority as a shared, accessible, coloured indicator. */
export function PriorityIndicator({
  priority,
  showEmpty = false,
  className,
  "data-testid": testId,
}: PriorityIndicatorProps) {
  const quadrant = priorityQuadrant(priority);

  if (priority === null || quadrant === null) {
    if (!showEmpty) {
      return null;
    }
    return (
      <span
        className={["dh-priority", "dh-priority--none", className]
          .filter(Boolean)
          .join(" ")}
        data-priority="none"
        data-testid={testId}
      >
        <span className="dh-priority__tag">No priority</span>
      </span>
    );
  }

  const action = taskPriorityLabel(priority);
  return (
    <span
      className={["dh-priority", className].filter(Boolean).join(" ")}
      data-priority={priority}
      data-testid={testId}
    >
      <span className="dh-priority__dot" aria-hidden="true" />
      <span className="dh-priority__tag">{taskPriorityTag(priority)}</span>
      <span className="dh-visually-hidden"> priority — {action}</span>
    </span>
  );
}
