import type { TaskPriority } from "~/kernel/tasks";
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
import { UrgencyChip } from "~/shared/task-record/UrgencyChip";
import type {
  TaskUrgencyKind,
  TaskUrgencyTone,
} from "~/shared/task-record/task-view";

import type { SearchResultSignal } from "./types";

const TASK_PRIORITIES: ReadonlySet<string> = new Set(["p1", "p2", "p3", "p4"]);
const TASK_URGENCIES: ReadonlySet<string> = new Set([
  "overdue",
  "due_today",
  "scheduled_today",
]);

function urgencyTone(signal: SearchResultSignal): TaskUrgencyTone {
  switch (signal.tone) {
    case "danger":
      return "danger";
    case "warning":
      return "warning";
    case "accent":
      return "info";
    default:
      return "neutral";
  }
}

export function SearchSignals({
  signals,
}: {
  readonly signals?: readonly SearchResultSignal[];
}) {
  if (signals === undefined || signals.length === 0) {
    return null;
  }
  return (
    <span className="dh-search__signals" aria-label="Result signals">
      {signals.map((signal) => {
        if (
          signal.kind === "priority" &&
          signal.value !== undefined &&
          TASK_PRIORITIES.has(signal.value)
        ) {
          return (
            <PriorityIndicator
              key={signal.id}
              priority={signal.value as TaskPriority}
              className="dh-search__signal"
            />
          );
        }
        if (
          signal.kind === "urgency" &&
          signal.value !== undefined &&
          TASK_URGENCIES.has(signal.value)
        ) {
          return (
            <UrgencyChip
              key={signal.id}
              task={null}
              urgency={{
                kind: signal.value as TaskUrgencyKind,
                label: signal.label,
                tone: urgencyTone(signal),
              }}
              className="dh-search__signal"
            />
          );
        }
        return (
          <span
            key={signal.id}
            className="dh-search__signal dh-search__signal--generic"
            data-tone={signal.tone ?? "neutral"}
            aria-label={signal.accessibleLabel ?? signal.label}
          >
            {signal.label}
          </span>
        );
      })}
    </span>
  );
}
