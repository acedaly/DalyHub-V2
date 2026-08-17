/**
 * TODAY-TASK-01 — Today's HOST for the shared task row's mutations.
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
 * ── Why Today does not simply reuse `/tasks`'s `useTaskQuickMutation` ───────
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

import { useCallback, useState } from "react";
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
export type DayTaskPatches = ReadonlyMap<string, TaskListItemPatch>;

export interface DayTaskActions {
  readonly patches: DayTaskPatches;
  /** Drop every patch — the screen calls this when fresh loader data arrives. */
  readonly clearPatches: () => void;
  readonly announcement: string | null;
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
}

function withPatch(
  patches: DayTaskPatches,
  taskId: string,
  patch: TaskListItemPatch,
): DayTaskPatches {
  const next = new Map(patches);
  // Two edits to one row before either answers MERGE rather than replace:
  // changing a priority and then a date must not make the first look undone.
  next.set(taskId, { ...next.get(taskId), ...patch });
  return next;
}

function withoutKeys(
  patches: DayTaskPatches,
  taskId: string,
  keys: readonly (keyof TaskListItemPatch)[],
): DayTaskPatches {
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

export function useDayTaskActions(): DayTaskActions {
  const revalidator = useRevalidator();
  const { notifyError } = useFeedback();
  const [patches, setPatches] = useState<DayTaskPatches>(new Map());
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const clearPatches = useCallback(() => {
    setPatches((previous) => (previous.size === 0 ? previous : new Map()));
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
          setAnnouncement(
            completed ? `Completed ${title}.` : `Reopened ${title}.`,
          );
          revalidator.revalidate();
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, ["completedAt"]));
    },
    [refuse, revalidator],
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
          setAnnouncement(label);
          revalidator.revalidate();
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [refuse, revalidator],
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
          setAnnouncement(label);
          revalidator.revalidate();
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [refuse, revalidator],
  );

  const reportInlineSave = useCallback(
    (save: TaskRowFieldSave) => {
      setPatches((previous) => withPatch(previous, save.taskId, save.patch));
      setAnnouncement(save.message);
      revalidator.revalidate();
    },
    [revalidator],
  );

  return {
    patches,
    clearPatches,
    announcement,
    setCompleted,
    setField,
    setRecord,
    reportInlineSave,
  };
}
