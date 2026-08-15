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
  /**
   * Menus, filters, detail panels and quick-add chips show the full label
   * ("Priority 2"); ordinary rows show the short tag ("P2").
   */
  readonly showLabel?: boolean;
  /**
   * Opt a surface out of drawing Priority 4 entirely. Rows DRAW P4 by default
   * (a grey flag holds the column) — pass this only where a blank is wanted.
   */
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

/*
 * The flag is FILLED, not outlined.
 *
 * Every reference draws priority as a small solid pennant in the priority's own
 * colour, and an outline at 15px reads as a grey smudge at a glance — which
 * defeats the one job the flag has, which is to be scanned rather than read. The
 * mast stays a stroke so the shape keeps its stem at small sizes; the banner is
 * a fill in `currentColor`, so the whole mark takes the priority colour the
 * container sets.
 */
function PriorityFlagGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 21V5" />
      <path
        d="M5 5c2.6-1.3 5.1-1.3 7.6 0 2.1 1.1 4.2 1.1 6.4 0v9c-2.2 1.1-4.3 1.1-6.4 0-2.5-1.3-5-1.3-7.6 0"
        fill="currentColor"
        stroke="none"
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
  /*
   * P4 is DRAWN in ordinary rows, not suppressed.
   *
   * The visual references show all four priorities in the list — a grey flag and
   * a grey "P4" beside the red, orange and blue ones — and they are right about
   * why: a row with nothing in the priority column is ambiguous between "normal"
   * and "not triaged yet", and the column then has a ragged hole in it that
   * breaks the list's vertical rhythm. Grey on grey is quiet enough that P4 does
   * not compete, while the slot stays occupied and the eye keeps its column.
   *
   * `hideNormal` remains honoured when a caller asks for it explicitly, so a
   * surface that genuinely wants the old behaviour still has it.
   */
  if (hideNormal === true && key === "p4" && !showEmpty) {
    return null;
  }

  const label = taskPriorityLabel(key);
  const tag = taskPriorityTag(key);
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
      {/*
       * The TAG is visible in ordinary rows; the full label belongs to pickers,
       * filters and the detail panel, where there is room to spell it out.
       *
       * Either way the accessible name on the container is the full "Priority 2"
       * — so colour is never the only carrier of the meaning (AGENTS.md §15) and
       * a screen reader hears the same words on every surface. The rendered text
       * is `aria-hidden` so the name is not read twice.
       */}
      <span className="dh-priority__label" aria-hidden="true">
        {showLabel ? label : tag}
      </span>
    </span>
  );
}

/** Compatibility name during the migration to `PriorityFlag`. */
export function PriorityIndicator(props: PriorityIndicatorProps) {
  return <PriorityFlag {...props} />;
}
