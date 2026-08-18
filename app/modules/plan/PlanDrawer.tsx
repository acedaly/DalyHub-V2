/**
 * PLAN-01 — the Weekly Planning drawer resolver.
 *
 * Maps a DS-03 drawer key to the panel it opens. There is exactly one kind: the
 * canonical Task record, opened through the SHARED `TaskRecordDrawer` — the one
 * task record surface, with the one task action route behind it (ADR-033). The
 * planner adds no fields, no forms and no mutations of its own, so a Task opened
 * from the week is the same record, edited the same way, as a Task opened from
 * `/tasks`, from a Project or from Today.
 *
 * `task-move:` resolves to the same record for the reason Today records: the
 * shared row's project editor and its overflow both open that key, and the full
 * searchable parent picker lives on the record.
 *
 * An unknown or stale key returns `null`, which the Drawer renders as its
 * graceful not-found panel.
 */

import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

function splitKey(key: string): { readonly kind: string; readonly id: string } {
  const separator = key.indexOf(":");
  if (separator === -1) return { kind: key, id: "" };
  return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
}

export function createPlanDrawerRenderer(
  taskTitles: ReadonlyMap<string, string> = new Map(),
) {
  return function renderPlanDrawer(
    entry: DrawerEntry,
  ): DrawerRenderResult | null {
    const { kind, id } = splitKey(entry.key);
    if (kind !== "task" && kind !== "task-move") return null;
    if (id.length === 0) return null;
    return {
      title: taskTitles.get(id) ?? "Task",
      description: "Task record",
      children: <TaskRecordDrawer taskId={id} />,
    };
  };
}
