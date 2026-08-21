/**
 * TASKS-13 — the ONE client-side seam between a checklist control and the
 * canonical Task route.
 *
 * `task-inline-edit.ts` is the equivalent seam for a Task's own fields; this is
 * its counterpart for the steps inside one. Everything a checklist can do goes
 * through here, so the record, a phone, a keyboard command and a replayed
 * offline tick reach the same five intents on the same protected route.
 *
 * ── What it is NOT ───────────────────────────────────────────────────────────
 *   - **Not an authority.** Every mutation POSTs `/tasks/:id`. Validation,
 *     ordering, workspace scoping, atomicity and the bound all stay server-side,
 *     and the server's answer replaces local state wholesale.
 *   - **Not a second copy of the checklist.** The state below is the SERVER's
 *     last answer, plus — for a tick only — an optimistic flag that is discarded
 *     the moment the server replies. Nothing here can drift into being a
 *     parallel truth, because every answer carries the whole list.
 *   - **Not a store.** It holds no cache across records; opening another Task
 *     re-seeds it from that record's loader payload.
 *
 * ── Why only the TICK is optimistic ──────────────────────────────────────────
 * Completion is the highest-frequency act on a checklist and the only one whose
 * outcome is knowable before the round trip: the item is either done or not.
 * Adding, renaming, deleting and reordering all depend on server-assigned facts
 * (an id, a normalised title, a dense position, whether the list still matches),
 * so painting them ahead of the answer would mean inventing one of those facts
 * and then correcting it — which reads as a glitch rather than as speed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  EMPTY_CHECKLIST_PROGRESS,
  moveChecklistOrder,
  type TaskChecklistProgress,
} from "~/kernel/tasks";

import { ordersDiffer } from "~/shared/drag";

import type { TaskActionData } from "./contract";
import {
  postTaskRecordActionOffline,
  type TaskRecordOutcome,
} from "./task-inline-edit";
import {
  serializedChecklistProgress,
  type SerializedChecklistItem,
} from "./task-view";

/** What a checklist mutation concluded, in the terms a control needs. */
export interface ChecklistOutcome {
  readonly ok: boolean;
  /** The server's own wording for a refusal. Never a status code. */
  readonly message?: string;
  /** True when the change is held on this device rather than confirmed. */
  readonly queued?: boolean;
}

const OK: ChecklistOutcome = { ok: true };

/** The wording used when the server refused without saying why. */
const GENERIC_REFUSAL =
  "That couldn’t be saved. Nothing was changed — try again.";

export interface TaskChecklistApi {
  /** The checklist, in the owner's order, with any optimistic tick applied. */
  readonly items: readonly SerializedChecklistItem[];
  readonly progress: TaskChecklistProgress;
  /** True while any checklist mutation is in flight. */
  readonly busy: boolean;
  readonly addItem: (title: string) => Promise<ChecklistOutcome>;
  readonly renameItem: (
    itemId: string,
    title: string,
  ) => Promise<ChecklistOutcome>;
  readonly setItemCompleted: (
    itemId: string,
    completed: boolean,
  ) => Promise<ChecklistOutcome>;
  readonly deleteItem: (itemId: string) => Promise<ChecklistOutcome>;
  /** Move ONE item by `delta` places. The whole new order is submitted. */
  readonly moveItem: (
    itemId: string,
    delta: number,
  ) => Promise<ChecklistOutcome>;
  /**
   * DHDS-11 — submit a complete new order.
   *
   * The seam a drag reorder commits through, and the one `moveItem` now
   * delegates to. There is deliberately no second route, no second validation
   * and no second refusal wording: "Move up" from the item menu and a drag down
   * the list are the SAME `checklist_reorder` submission, which is why the two
   * can never disagree about what an order is.
   */
  readonly reorderItems: (
    orderedItemIds: readonly string[],
  ) => Promise<ChecklistOutcome>;
}

/**
 * Drive one Task's checklist.
 *
 * @param taskId  the Task that owns it
 * @param loaded  the checklist as the record's loader delivered it
 * @param basePath the task resource route prefix (tests only; `/tasks` in product)
 * @param onServerChange called after a mutation the SERVER confirmed, so the host
 *   can revalidate the surface behind the record — a checklist tick changes the
 *   "2 of 4" on the row underneath.
 */
export function useTaskChecklist(
  taskId: string,
  loaded: readonly SerializedChecklistItem[],
  basePath = "/tasks",
  onServerChange?: () => void,
): TaskChecklistApi {
  const [items, setItems] =
    useState<readonly SerializedChecklistItem[]>(loaded);
  const [pending, setPending] = useState(0);
  /*
   * The loader's answer is the truth this hook re-seeds from — but only when it
   * is a DIFFERENT answer. Comparing by reference is what makes that cheap and
   * what stops a re-render of the host from throwing away a mutation's fresher
   * result: the record reloads after every mutation, and the new array replaces
   * local state exactly once.
   */
  const seeded = useRef<readonly SerializedChecklistItem[] | null>(null);
  useEffect(() => {
    if (seeded.current !== loaded) {
      seeded.current = loaded;
      setItems(loaded);
    }
  }, [loaded]);

  /**
   * Adopt whatever the server said. A success carries the whole list; a refusal
   * carries it only when the refusal itself means the list moved.
   */
  const applyResult = useCallback(
    (result: TaskActionData): ChecklistOutcome => {
      if (result.kind !== "checklist") {
        return { ok: false, message: GENERIC_REFUSAL };
      }
      if (result.status === "success") {
        setItems(result.checklist);
        onServerChange?.();
        return OK;
      }
      if (result.checklist) setItems(result.checklist);
      return {
        ok: false,
        message:
          result.formError ??
          Object.values(result.fieldErrors ?? {})[0] ??
          GENERIC_REFUSAL,
      };
    },
    [onServerChange],
  );

  const post = useCallback(
    async (
      fields: Readonly<Record<string, string>>,
      /** Repeated fields, for the ordered id list a reorder submits. */
      repeated?: readonly [string, readonly string[]],
    ): Promise<ChecklistOutcome> => {
      setPending((count) => count + 1);
      try {
        const body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.set(key, value);
        if (repeated) {
          for (const value of repeated[1]) body.append(repeated[0], value);
        }
        const response = await fetch(
          `${basePath}/${encodeURIComponent(taskId)}`,
          { method: "POST", body },
        );
        const result = (await response.json()) as TaskActionData;
        return applyResult(result);
      } catch {
        // A transport failure on a structural change is reported, not queued:
        // only the tick is offline-capable (see `setItemCompleted`).
        return { ok: false, message: GENERIC_REFUSAL };
      } finally {
        setPending((count) => count - 1);
      }
    },
    [applyResult, basePath, taskId],
  );

  const addItem = useCallback(
    (title: string) => post({ intent: "checklist_add", title }),
    [post],
  );

  const renameItem = useCallback(
    (itemId: string, title: string) =>
      post({ intent: "checklist_rename", itemId, title }),
    [post],
  );

  const deleteItem = useCallback(
    (itemId: string) => post({ intent: "checklist_delete", itemId }),
    [post],
  );

  const reorderItems = useCallback(
    async (orderedItemIds: readonly string[]): Promise<ChecklistOutcome> => {
      const order = items.map((item) => item.id);
      if (!ordersDiffer(order, orderedItemIds)) return OK;
      // The WHOLE order is submitted, so the server can refuse a list that no
      // longer matches its own rather than applying half a move.
      return post({ intent: "checklist_reorder" }, [
        "itemId",
        [...orderedItemIds],
      ]);
    },
    [items, post],
  );

  const moveItem = useCallback(
    async (itemId: string, delta: number): Promise<ChecklistOutcome> => {
      const order = items.map((item) => item.id);
      // The KERNEL's move, not a second copy of it: "move up" must mean exactly
      // the same thing here, in a keyboard command and in a test.
      const next = moveChecklistOrder(order, itemId, delta);
      // `moveChecklistOrder` returns the SAME array for a no-op (already at that
      // end), so an unreachable move costs no request.
      if (next === order) return OK;
      return reorderItems(next);
    },
    [items, reorderItems],
  );

  /**
   * Tick or untick one item.
   *
   * The one optimistic mutation, and the one that can be queued offline. The
   * queued intent carries the item id as its TARGET and the flag the device was
   * showing as its BASE, which is the whole of the conflict contract: two
   * devices ticking two different items merge, and two devices disagreeing about
   * the SAME item is a question the owner is asked rather than a silent
   * overwrite.
   */
  const setItemCompleted = useCallback(
    async (itemId: string, completed: boolean): Promise<ChecklistOutcome> => {
      const before = items.find((item) => item.id === itemId);
      if (!before) return OK;
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, completed } : item,
        ),
      );
      setPending((count) => count + 1);
      let outcome: TaskRecordOutcome;
      try {
        outcome = await postTaskRecordActionOffline(
          taskId,
          {
            intent: "checklist_set_completed",
            itemId,
            completed: completed ? "1" : "",
          },
          {
            operation: "set_checklist_completed",
            targetId: itemId,
            value: completed ? "1" : "",
            baseValue: before.completed ? "1" : "",
            baseUpdatedAt: before.updatedAt,
          },
          basePath,
        );
      } finally {
        setPending((count) => count - 1);
      }
      if (outcome.kind === "server") return applyResult(outcome.data);
      if (outcome.kind === "queued") {
        // The optimistic flag STAYS: the change is real and on this device. It is
        // reported as queued so the surface can say so rather than claim a save.
        return { ok: true, queued: true };
      }
      // Unreachable and unqueueable: put the item back where it was.
      setItems((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, completed: before.completed } : item,
        ),
      );
      return { ok: false, message: outcome.message };
    },
    [applyResult, basePath, items, taskId],
  );

  const progress = useMemo(
    () =>
      items.length === 0
        ? EMPTY_CHECKLIST_PROGRESS
        : serializedChecklistProgress(items),
    [items],
  );

  return {
    items,
    progress,
    busy: pending > 0,
    addItem,
    renameItem,
    setItemCompleted,
    deleteItem,
    moveItem,
    reorderItems,
  };
}
