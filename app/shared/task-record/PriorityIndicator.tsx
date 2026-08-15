/**
 * Shared task priority flag.
 *
 * Priority has one visual language across DalyHub: a flag. Legacy stored `null`
 * is treated as normal Priority 4 in the UI until a deliberate persistence
 * migration changes the database shape.
 */

import type { TaskPriority } from "~/kernel/tasks";

import { taskPriorityLabel, taskPriorityTag } from "./task-view";

export interface PriorityIndicatorProps {
  /** The task's priority, or null for an untriaged task. */
  readonly priority: TaskPriority | null;
  /** Menus, filters, detail panels and quick-add chips show the full label. */
  readonly showLabel?: boolean;
  /** Task rows suppress Priority 4 so normal work does not show a grey flag. */
  readonly hideNormal?: boolean;
  readonly size?: "sm" | "md";
  /**
   * Compatibility prop for older call sites. In the new UI null is Priority 4;
   * this only controls whether a hidden normal value is forced visible.
   */
  readonly showEmpty?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

function priorityKey(priority: TaskPriority | null): TaskPriority {
  return priority ?? "p4";
}

function PriorityFlagGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 21V4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.1 4.7c2.3-1 4.5-1 6.8.1 1.9.9 3.7.9 5.9-.1v9.4c-2.2 1-4 .9-5.9-.1-2.3-1.1-4.5-1.1-6.8-.1V4.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Render a task's priority as the canonical accessible flag. */
export function PriorityFlag({
  priority,
  showLabel = false,
  hideNormal,
  size = "sm",
  showEmpty = false,
  className,
  "data-testid": testId,
}: PriorityIndicatorProps) {
  const key = priorityKey(priority);
  const suppressNormal = hideNormal ?? !showLabel;
  if (suppressNormal && key === "p4" && !showEmpty) {
    return null;
  }

  const label = taskPriorityLabel(key);
  return (
    <span
      className={["dh-priority", className].filter(Boolean).join(" ")}
      data-priority={key}
      data-size={size}
      data-testid={testId}
      aria-label={label}
    >
      <span className="dh-priority__flag" aria-hidden="true">
        <PriorityFlagGlyph />
      </span>
      {showLabel ? (
        <span className="dh-priority__label">{label}</span>
      ) : (
        <span className="dh-visually-hidden">{taskPriorityTag(key)}</span>
      )}
    </span>
  );
}

/** Compatibility name during the migration to `PriorityFlag`. */
export function PriorityIndicator(props: PriorityIndicatorProps) {
  return <PriorityFlag {...props} />;
}
