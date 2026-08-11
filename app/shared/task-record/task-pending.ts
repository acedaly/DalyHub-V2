/**
 * PWA-12 — turning queued Task intents into what a surface actually shows.
 *
 * Pure, React-free and Task-shaped: it converts the offline kernel's mutation
 * records into the two things a Task surface needs — the {@link TaskListItemPatch}
 * that makes a row display the owner's change, and the ONE restrained line of
 * text that says the change is not confirmed yet.
 *
 * ── Why the patch is built here and not in the queue ─────────────────────────
 * The queue stores INTENT ("this Task's priority should become P2"), not a Task.
 * Something has to turn intent into presentation, and doing it here means the
 * offline layer never learns what a Task looks like and the Tasks module never
 * learns what a queue looks like. It also means an offline row and an in-flight
 * online row are painted by the SAME `applyTaskPatch` — so there is no display
 * state that only an offline row can have (ADR-086's rule, unchanged).
 *
 * ── The distinction this exists to make ──────────────────────────────────────
 * `local pending ≠ server confirmed`. A patched row shows the owner's change,
 * and the label beside it says, in words, that DalyHub has not accepted it yet.
 * Neither is ever inferred from colour, and neither is shown when there is
 * nothing outstanding — a Task with no queued change carries no sync chrome at
 * all, which is the whole of §29.
 */

import {
  mutationStatusLabel,
  orderMutations,
  type OfflineMutationRecord,
  type OfflineMutationStatus,
} from "~/kernel/offline";
import type { TaskPriority } from "~/kernel/tasks";

import type { TaskListItemPatch } from "./task-view";

/** What one Task's outstanding changes amount to, for display. */
export interface PendingTaskState {
  /** The presentation patch: the owner's change, applied over the server's record. */
  readonly patch: TaskListItemPatch;
  /**
   * The single line shown beside the row. Text, always — never a colour and
   * never an icon alone (`AGENTS.md §15`).
   */
  readonly label: string;
  /** True when this Task is waiting on the OWNER rather than on the network. */
  readonly needsAttention: boolean;
}

/** The per-Task lookup a surface renders from. Empty is the steady state. */
export type PendingTaskMap = ReadonlyMap<string, PendingTaskState>;

export const NO_PENDING_TASKS: PendingTaskMap = new Map();

/**
 * How loudly each status speaks, when one Task holds several changes.
 *
 * A conflict on a Task that also has two edits merely waiting is what the owner
 * needs to see; three labels on one row would be noise, and showing the newest
 * would let a decision the owner has to make be hidden by a change that does not
 * need them at all.
 */
const STATUS_RANK: Record<OfflineMutationStatus, number> = {
  synced: 0,
  pending: 1,
  syncing: 2,
  blocked: 3,
  failed: 4,
  conflict: 5,
};

/** The presentation change one queued intent describes. */
function patchFor(record: OfflineMutationRecord): TaskListItemPatch {
  switch (record.operation) {
    case "complete":
      // The device clock is honest about WHEN the owner ticked it, and this value
      // is presentation only: the authoritative `completedAt` is the server's,
      // and it replaces this the moment the change is confirmed.
      return { completedAt: record.createdAt };
    case "reopen":
      return { completedAt: null };
    case "set_title":
      return { title: record.value ?? "" };
    case "set_priority":
      return { priority: (record.value as TaskPriority | null) ?? null };
    case "set_due":
      return { dueDate: record.value };
    case "set_planned":
      return { scheduledDate: record.value };
  }
}

/**
 * Reduce a queue into per-Task presentation.
 *
 * Records are folded in CAUSAL order, so a rename followed by a completion
 * displays as both — and a later intent for the same field wins, exactly as it
 * will when the two replay in that order. A `synced` record contributes nothing:
 * its effect is already in the server's own answer, and painting it again would
 * be the client restating something it no longer owns.
 */
export function pendingTaskStates(
  records: readonly OfflineMutationRecord[],
): PendingTaskMap {
  if (records.length === 0) return NO_PENDING_TASKS;
  const patches = new Map<string, TaskListItemPatch>();
  const loudest = new Map<string, OfflineMutationStatus>();
  for (const record of orderMutations(records)) {
    if (record.status === "synced") continue;
    patches.set(record.entityId, {
      ...patches.get(record.entityId),
      ...patchFor(record),
    });
    const current = loudest.get(record.entityId);
    if (
      current === undefined ||
      STATUS_RANK[record.status] > STATUS_RANK[current]
    ) {
      loudest.set(record.entityId, record.status);
    }
  }

  const states = new Map<string, PendingTaskState>();
  for (const [taskId, patch] of patches) {
    const status = loudest.get(taskId) ?? "pending";
    states.set(taskId, {
      patch,
      label: mutationStatusLabel(status),
      needsAttention: status === "conflict" || status === "failed",
    });
  }
  return states;
}
