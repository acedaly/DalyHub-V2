/**
 * TASKS-03 — the Tasks workspace's capture row.
 *
 * The row itself is now the SHARED `InlineCaptureRow` (`~/shared/task-record`),
 * which every task-bearing surface draws: the workspace, each board column, a
 * Project record's Tasks tab and Today's plan. This file is what remains that is
 * genuinely Tasks-specific — the workspace's default destination, the
 * classification the current view is carrying, and the hand-off to the full
 * capture Drawer — so the module keeps its own name for the thing without owning
 * a second implementation of it.
 */

import { InlineCaptureRow } from "~/shared/task-record/InlineCaptureRow";

import type { TaskParentOption } from "./tasks-contract";

export interface TasksQuickAddProps {
  /** The resolved chosen destination, or null for Inbox / Unassigned. */
  readonly defaultParent: TaskParentOption | null;
  /**
   * Classification carried for the SESSION from the current view, so a task added
   * while looking at "This week / P1" lands there instead of in a generic inbox the
   * user then has to re-file. Never persisted — it follows what is on screen.
   */
  readonly sessionDefaults: {
    readonly priority?: string;
    readonly timeSector?: string;
    readonly scheduledDate?: string;
  };
  readonly todayIso: string;
  /** Opens the full capture Drawer for anything this row deliberately cannot do. */
  readonly onOpenFullForm: () => void;
  /** The workspace's own polite live region, so the row does not add a second. */
  readonly announce?: (message: string) => void;
}

export function TasksQuickAdd({
  defaultParent,
  sessionDefaults,
  todayIso,
  onOpenFullForm,
  announce,
}: TasksQuickAddProps) {
  return (
    <InlineCaptureRow
      destination={defaultParent}
      defaults={sessionDefaults}
      todayIso={todayIso}
      onOpenFullForm={onOpenFullForm}
      inputTestId="tasks-quickadd-input"
      announce={announce}
    />
  );
}
