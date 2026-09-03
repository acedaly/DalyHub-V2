/**
 * TODAY-TASK-01 / PLAN-01 — the SHARED host for a bounded surface's task row
 * mutations.
 *
 * PLAN-01 moved this file from `app/modules/today/day/` into the shared Task
 * surfaces without changing a line of its behaviour. The reason is the reason the
 * body already gives: it is the per-surface reconciliation policy for a BOUNDED
 * task surface — one page of rows, revalidated unconditionally, with no grouping
 * dimension to reason about — and Weekly Planning is exactly a second one of
 * those. The alternative was a second copy of the patch map, the rollback rule
 * and the announcement channel, which is how two surfaces come to disagree about
 * whether a refused write was rolled back.
 *
 * Today is unchanged: it imports the same hook from here.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * It is not a second mutation authority, and there is no Today task endpoint.
 * Every write below goes through the SAME canonical client posters `/tasks` uses
 * (`postTaskRecordActionOffline`, `postTaskRecordAction`, `postTaskBulkAction` —
 * `~/shared/task-record/task-inline-edit`) to the SAME canonical routes
 * (`POST /tasks/:id`, `POST /tasks/bulk`) and the SAME Task domain handlers. The
 * inline field editors on the row do not even come through here: they own their
 * own request (DS-16 needs a promise-returning save) and report the SERVER's
 * answer to `reportInlineSave`, which is how their outcome reaches one
 * announcement channel and one revalidation rather than two.
 *
 * ── What it IS ──────────────────────────────────────────────────────────────
 * The per-surface presentation state ADR-086 splits out: a map of in-flight
 * patches keyed by task id, an announcement, and a revalidation. The rule ADR-086
 * records is "presentation may lead the server; announcements, Activity and any
 * claim of success may not", and both halves hold here:
 *
 *   - a patch is applied immediately and is the CLIENT's guess. It survives only
 *     until the loader answers (the screen drops every patch when fresh data
 *     arrives) or until the write is refused, at which point exactly the keys
 *     that write applied are rolled back — so a refused due date cannot also
 *     un-paint a priority the server accepted a moment earlier;
 *   - the announcement and the notification fire only AFTER the server has said
 *     yes, and a refusal is stated in words rather than silently reverted.
 *
 * ── Why a bounded surface does not reuse `/tasks`'s `useTaskQuickMutation` ──
 * That hook is not a general host: it also owns the Tasks view's REVALIDATION
 * PREDICATE (whether a change touches the grouping dimension the current
 * configuration is sorted by), the undo notification for a completion, and the
 * offline title queue — three things that are properties of a filtered,
 * grouped, paginated collection. Today has one bounded day, revalidates it
 * unconditionally, and has no grouping dimension to reason about. What the two
 * genuinely share — the canonical posters, the patch shape, the row, its fields,
 * and its overflow set — they DO share; what differs is the surface's own
 * reconciliation policy, and pretending otherwise would mean a hook with a mode
 * switch for each caller.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { useFeedback } from "~/shared/feedback";
import {
  postTaskBulkAction,
  postTaskRecordAction,
  postTaskRecordActionOffline,
} from "~/shared/task-record/task-inline-edit";
import type { TaskRowFieldSave } from "~/shared/task-record/TaskRowFields";
import type { TaskListItemPatch } from "~/shared/task-record/task-view";

/** The calm sentence a row falls back to when the server said no more than that. */
const GENERIC_ROW_REFUSAL = "That couldn’t be saved. Please try again.";

/** In-flight patches, keyed by task id. Empty is the steady state. */
export type TaskSurfacePatches = ReadonlyMap<string, TaskListItemPatch>;

export interface TaskSurfaceActions {
  readonly patches: TaskSurfacePatches;
  /**
   * Drop the guesses fresh loader data has ANSWERED — the screen calls this
   * when that data arrives.
   *
   * With no argument every patch is dropped: the surface's loader returns the
   * whole of what it shows, so a fresh answer retires every guess made against
   * the previous one. A surface that accumulates keyset pages beneath a
   * revalidated first page (V2.8 CONV-02, `useKeysetPagination`'s `merge`
   * mode) passes the ids that fresh page holds instead: a patch on a row the
   * re-read did not mention — an accepted completion on a loaded page two —
   * is the only current value the surface has, and dropping it would snap the
   * row back to the stale copy the accumulator still holds. It stays until a
   * read answers for that row (it slides into page one, or the scope changes
   * and the accumulation restarts).
   */
  readonly clearPatches: (answered?: Iterable<string>) => void;
  readonly announcement: string | null;
  /**
   * V2.8 CONV-01 — the ids this surface has JUST changed, and the whole of what
   * makes a departing row legitimate (DHDS-11, `use-departing-rows.ts`).
   *
   * A row may LEAVE — collapse while its neighbours close the gap and focus is
   * handed on — only when the owner's own act is what removed it from the
   * loader's answer. Changing a filter, paging and navigating remove rows too,
   * and none of those is a departure. An id is added here when the SERVER
   * accepts a change to it and drops out again once the exit could have run,
   * exactly as `/tasks` has done since DHDS-11; a surface that keeps completed
   * work never produces a departure, because the id is still in its list.
   *
   * Today and Plan do not pass this to `useDepartingRows` and are unchanged.
   */
  readonly departing: ReadonlySet<string>;
  readonly setCompleted: (
    taskId: string,
    completed: boolean,
    title: string,
  ) => void;
  /** A single-id `/tasks/bulk` field change, painted while it is in flight. */
  readonly setField: (
    taskId: string,
    fields: Record<string, string>,
    label: string,
    patch: TaskListItemPatch,
  ) => void;
  /** A canonical `/tasks/:id` record mutation — the series and commitment acts. */
  readonly setRecord: (
    taskId: string,
    fields: Record<string, string>,
    label: string,
    patch?: TaskListItemPatch,
  ) => void;
  /** Report a save the ROW's own inline field already persisted. */
  readonly reportInlineSave: (save: TaskRowFieldSave) => void;
  /**
   * PWA-12 — report a rename that was accepted LOCALLY because DalyHub could
   * not be reached (`TaskTitleEditor`'s `onQueued`).
   *
   * It paints the new title — the owner's change is real and the row must
   * show it — and announces it as waiting to sync. It does NOT revalidate:
   * there is nothing new on the server to read, and asking would be a request
   * this device has just proven it cannot make. The same rule `/tasks` applies
   * in its own host; without it a queued rename snapped the row back to the
   * old title and then replayed later, renaming the Task with no warning.
   */
  readonly reportQueuedTitle: (taskId: string, title: string) => void;
  /**
   * V2.8 CONV-01 — announce a COMMITTED outcome the surface did not paint, and
   * re-read.
   *
   * The shared bulk bar's success path: a bulk change is a deliberate operation
   * over a whole selection, the selection is cleared by the same commit, and
   * there is no row left on screen for a patch to belong to — so it announces
   * and revalidates, through THIS channel, so a surface has exactly one live
   * region whatever produced the sentence.
   */
  readonly announce: (message: string) => void;
}

function withPatch(
  patches: TaskSurfacePatches,
  taskId: string,
  patch: TaskListItemPatch,
): TaskSurfacePatches {
  const next = new Map(patches);
  // Two edits to one row before either answers MERGE rather than replace:
  // changing a priority and then a date must not make the first look undone.
  next.set(taskId, { ...next.get(taskId), ...patch });
  return next;
}

function withoutKeys(
  patches: TaskSurfacePatches,
  taskId: string,
  keys: readonly (keyof TaskListItemPatch)[],
): TaskSurfacePatches {
  const current = patches.get(taskId);
  if (current === undefined) return patches;
  const next = new Map(patches);
  if (keys.length === 0) {
    next.delete(taskId);
    return next;
  }
  const remaining: Record<string, unknown> = { ...current };
  for (const key of keys) delete remaining[key];
  if (Object.keys(remaining).length === 0) next.delete(taskId);
  else next.set(taskId, remaining as TaskListItemPatch);
  return next;
}

/**
 * How long an accepted change keeps its row ELIGIBLE to depart.
 *
 * Long enough for the loader's answer to arrive and the exit to run, short
 * enough that an unrelated later removal of the same row — a filter change a
 * few seconds afterwards — is not mistaken for the consequence of an act the
 * owner has stopped thinking about. The same figure `/tasks` uses.
 */
const DEPARTURE_ELIGIBILITY_MS = 2_000;

/** The steady state: nothing has been changed, so nothing may depart. */
const NO_DEPARTING_TASKS: ReadonlySet<string> = new Set<string>();

export function useTaskSurfaceActions(): TaskSurfaceActions {
  const revalidator = useRevalidator();
  const { notifyError } = useFeedback();
  const [patches, setPatches] = useState<TaskSurfacePatches>(new Map());
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [departing, setDeparting] =
    useState<ReadonlySet<string>>(NO_DEPARTING_TASKS);
  const departTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const markDeparting = useCallback((taskId: string) => {
    setDeparting((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
    const existing = departTimers.current.get(taskId);
    if (existing !== undefined) clearTimeout(existing);
    departTimers.current.set(
      taskId,
      setTimeout(() => {
        departTimers.current.delete(taskId);
        setDeparting((current) => {
          if (!current.has(taskId)) return current;
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }, DEPARTURE_ELIGIBILITY_MS),
    );
  }, []);
  useEffect(() => {
    const timers = departTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const clearPatches = useCallback((answered?: Iterable<string>) => {
    setPatches((previous) => {
      if (previous.size === 0) return previous;
      if (answered === undefined) return new Map();
      const next = new Map(previous);
      for (const id of answered) next.delete(id);
      return next.size === previous.size ? previous : next;
    });
  }, []);

  /**
   * A refusal: roll back exactly what this write painted, and SAY SO.
   *
   * A row must never be left displaying a value the server did not persist —
   * that is the one failure mode an optimistic surface can have that is worse
   * than being slow, because the owner has no way to know it happened.
   */
  const refuse = useCallback(
    (
      taskId: string,
      message: string,
      keys: readonly (keyof TaskListItemPatch)[],
    ) => {
      setPatches((previous) => withoutKeys(previous, taskId, keys));
      notifyError(message);
    },
    [notifyError],
  );

  const setCompleted = useCallback(
    (taskId: string, completed: boolean, title: string) => {
      setPatches((previous) =>
        withPatch(previous, taskId, {
          completedAt: completed ? new Date().toISOString() : null,
        }),
      );
      void postTaskRecordActionOffline(
        taskId,
        { intent: completed ? "complete" : "reopen" },
        // PWA-12 — ticking a Task offline queues the canonical COMPLETION intent
        // and nothing else. The client never computes a recurrence successor:
        // that engine is server-side and runs when the intent replays.
        { operation: completed ? "complete" : "reopen" },
      )
        .then((outcome) => {
          if (outcome.kind === "refused") {
            refuse(taskId, outcome.message, ["completedAt"]);
            return;
          }
          if (outcome.kind === "queued") {
            // Queued, NOT confirmed. The patch stays (the row shows the owner's
            // change) and the words say what actually happened.
            setAnnouncement(
              completed
                ? `Completed ${title}. Waiting to sync.`
                : `Reopened ${title}. Waiting to sync.`,
            );
            return;
          }
          const result = outcome.data;
          if (result.kind !== "completion" || result.ok === false) {
            refuse(
              taskId,
              result.kind === "completion"
                ? (result.message ?? GENERIC_ROW_REFUSAL)
                : GENERIC_ROW_REFUSAL,
              ["completedAt"],
            );
            return;
          }
          // The change is the SERVER's now, so the row may legitimately leave
          // a surface that does not keep completed work.
          markDeparting(taskId);
          setAnnouncement(
            completed ? `Completed ${title}.` : `Reopened ${title}.`,
          );
          revalidator.revalidate();
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, ["completedAt"]));
    },
    [markDeparting, refuse, revalidator],
  );

  const setField = useCallback(
    (
      taskId: string,
      fields: Record<string, string>,
      label: string,
      patch: TaskListItemPatch,
    ) => {
      const keys = Object.keys(patch) as (keyof TaskListItemPatch)[];
      setPatches((previous) => withPatch(previous, taskId, patch));
      void postTaskBulkAction([taskId], fields)
        .then((outcome) => {
          if (!outcome.ok) {
            refuse(taskId, outcome.message, keys);
            return;
          }
          markDeparting(taskId);
          setAnnouncement(label);
          revalidator.revalidate();
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [markDeparting, refuse, revalidator],
  );

  const setRecord = useCallback(
    (
      taskId: string,
      fields: Record<string, string>,
      label: string,
      patch?: TaskListItemPatch,
    ) => {
      const keys = patch
        ? (Object.keys(patch) as (keyof TaskListItemPatch)[])
        : [];
      if (patch) setPatches((previous) => withPatch(previous, taskId, patch));
      void postTaskRecordAction(taskId, fields)
        .then((result) => {
          const refused =
            (result.kind === "update" ||
              result.kind === "planning" ||
              result.kind === "waiting") &&
            result.status === "error";
          if (refused) {
            refuse(
              taskId,
              result.formError ??
                Object.values(result.fieldErrors ?? {})[0] ??
                GENERIC_ROW_REFUSAL,
              keys,
            );
            return;
          }
          markDeparting(taskId);
          setAnnouncement(label);
          revalidator.revalidate();
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [markDeparting, refuse, revalidator],
  );

  const reportInlineSave = useCallback(
    (save: TaskRowFieldSave) => {
      setPatches((previous) => withPatch(previous, save.taskId, save.patch));
      // An accepted inline save is a server-accepted change too: re-filing a
      // Task out of the Project it is read on is how a row leaves that scope.
      markDeparting(save.taskId);
      setAnnouncement(save.message);
      revalidator.revalidate();
    },
    [markDeparting, revalidator],
  );

  const reportQueuedTitle = useCallback((taskId: string, title: string) => {
    setPatches((previous) => withPatch(previous, taskId, { title }));
    setAnnouncement(`Renamed to ${title}. Waiting to sync.`);
  }, []);

  const announce = useCallback(
    (message: string) => {
      setAnnouncement(message);
      revalidator.revalidate();
    },
    [revalidator],
  );

  return {
    patches,
    clearPatches,
    announcement,
    departing,
    announce,
    setCompleted,
    setField,
    setRecord,
    reportInlineSave,
    reportQueuedTitle,
  };
}
