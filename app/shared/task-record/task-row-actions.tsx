/**
 * TODAY-TASK-01 — the ONE overflow menu a task row carries, wherever it is drawn.
 *
 * DS-04 built the shared `TaskRow` but left its `overflowActions` to the caller,
 * which was right while `/tasks` was the only caller and wrong the moment there
 * were two: the menu is not chrome, it is the row's LONG TAIL — the acts that do
 * not fit on the line but are still things you do to a task — and an owner who
 * finds "Move to Someday / Maybe" on `/tasks` and not on `/today` has learnt that
 * the same object behaves differently depending on where they met it.
 *
 * So the SET lives here and both surfaces build it from the same function. What
 * stays with the caller is only what genuinely differs: the callbacks. Today has
 * no rename-in-place (its rows are a bounded plan, not the collection you file
 * from), so it passes no `onRename` and that one item is absent — an omission the
 * caller states rather than a second menu it assembles.
 *
 * ── Authority ───────────────────────────────────────────────────────────────
 * Nothing here writes. Every item calls back into the host, which posts the SAME
 * canonical intent to the SAME canonical route (`/tasks/:id`, `/tasks/bulk`)
 * every other control on the row already posts to. There is no Today endpoint
 * and no second Task domain handler.
 *
 * ── The anatomy, unchanged from CONTROL-01 §5 ───────────────────────────────
 * Every item carries a LEADING ICON, so the menu is scannable by shape before it
 * is read and every row is the same height whether or not it has one. A
 * description appears only where the label leaves a question open ("Skip this
 * occurrence" — and does that complete it?). The RECORD-LEVEL action sits below a
 * separator at the foot, alone, because it is the only item that changes surface
 * rather than changing the task in place.
 */

import type { MenuItem } from "~/shared/ui";
import {
  ArchiveIcon,
  ChevronRightIcon,
  EditIcon,
  ProjectIcon,
  RepeatIcon,
  TaskIcon,
  TodayIcon,
} from "~/shared/icons";

import type { TaskRowData } from "./TaskRow";

export interface TaskRowActionHandlers {
  /** Open the canonical Task record drawer. Always present — it is the last resort. */
  readonly onOpenRecord: () => void;
  /** Plan the task for the owner's today. Absent on a surface where that is meaningless. */
  readonly onPlanToday?: () => void;
  /** Replace the title with an inline editor. Absent where the surface has none. */
  readonly onRename?: () => void;
  /** Open the shared searchable parent picker over the whole workspace. */
  readonly onMoveToParent?: () => void;
  /** Move the task to Someday / Maybe (`set_commitment`). */
  readonly onSomeday?: () => void;
  /** Advance a recurring occurrence without completing it (`skip_occurrence`). */
  readonly onSkipOccurrence?: () => void;
  /** End the series, keeping every past occurrence (`set_recurrence`). */
  readonly onStopRepeating?: () => void;
}

/**
 * Build a row's overflow items.
 *
 * Three shapes, decided by the task rather than by the surface, exactly as
 * `/tasks` has decided them since CONTROL-01:
 *
 *   - **read-only** (the Deleted view): one door to the record, which says why.
 *   - **completed**: one door to the record. Nothing else on this menu applies to
 *     a finished task, and offering "Plan for today" on one is an invitation to
 *     an act the server would refuse.
 *   - **open**: the long tail, in the order it has always been in.
 */
export function buildTaskRowActions(
  task: Pick<TaskRowData, "completed" | "recurrence">,
  handlers: TaskRowActionHandlers,
  options: { readonly readOnly?: boolean } = {},
): readonly MenuItem[] {
  if (options.readOnly) {
    return [
      {
        id: "open-record",
        label: "Open task",
        icon: <TaskIcon />,
        description: "Read-only until it is restored.",
        onSelect: handlers.onOpenRecord,
      },
    ];
  }
  if (task.completed) {
    return [
      {
        id: "reopen-record",
        label: "Open task",
        icon: <TaskIcon />,
        onSelect: handlers.onOpenRecord,
      },
    ];
  }
  return [
    ...(handlers.onPlanToday
      ? [
          {
            id: "plan-today",
            label: "Plan for today",
            icon: <TodayIcon />,
            // No `ariaLabel` naming the task: the MENU is already "More actions
            // for <title>", so repeating it makes a screen reader say the title
            // twice and makes the item unmatchable by the words on it.
            onSelect: handlers.onPlanToday,
          },
        ]
      : []),
    ...(handlers.onRename
      ? [
          {
            id: "rename",
            label: "Rename",
            icon: <EditIcon />,
            onSelect: handlers.onRename,
          },
        ]
      : []),
    ...(handlers.onMoveToParent
      ? [
          {
            id: "move-to",
            label: "Move to Project or Area…",
            icon: <ProjectIcon />,
            description: "Search the whole workspace.",
            onSelect: handlers.onMoveToParent,
          },
        ]
      : []),
    ...(handlers.onSomeday
      ? [
          {
            id: "someday",
            label: "Move to Someday / Maybe",
            icon: <ArchiveIcon />,
            separatorBefore: true,
            onSelect: handlers.onSomeday,
          },
        ]
      : []),
    // TASKS-07 — the two series operations that belong on a row. Skipping is NOT
    // completing: the occurrence moves one step along the series and the history
    // says it was skipped. Stopping keeps every past occurrence and ends only the
    // future.
    ...(task.recurrence && handlers.onSkipOccurrence
      ? [
          {
            id: "skip-occurrence",
            label: "Skip this occurrence",
            icon: <ChevronRightIcon />,
            description: "Moves to the next date without completing it.",
            separatorBefore: true,
            onSelect: handlers.onSkipOccurrence,
          },
        ]
      : []),
    ...(task.recurrence && handlers.onStopRepeating
      ? [
          {
            id: "stop-repeat",
            label: "Stop repeating",
            icon: <RepeatIcon />,
            description: "Past occurrences are kept.",
            onSelect: handlers.onStopRepeating,
          },
        ]
      : []),
    {
      id: "open-record",
      label: "Open task",
      icon: <TaskIcon />,
      description: "Every property, plus delegation and removal.",
      separatorBefore: true,
      onSelect: handlers.onOpenRecord,
    },
  ];
}
