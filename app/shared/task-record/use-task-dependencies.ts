/**
 * TASKS-12 — the ONE client-side seam between a dependency control and the
 * canonical Task route.
 *
 * The counterpart of `use-task-checklist.ts`, and it holds the same three rules:
 *
 *   - **Not an authority.** Both mutations POST `/tasks/:id`. The cycle check,
 *     both bounds, the workspace scope, the Task-only endpoints and the atomicity
 *     all stay server-side, and the server's answer replaces local state
 *     wholesale.
 *   - **Not a second copy of the graph.** The state below is the SERVER's last
 *     answer and nothing else; every answer carries both directions whole, so it
 *     cannot drift into a parallel truth.
 *   - **Nothing optimistic.** Unlike a checklist tick, whose outcome is knowable
 *     before the round trip, a dependency's outcome is a property of the GRAPH:
 *     only the server knows whether this edge closes a cycle or meets a bound.
 *     Painting it first would mean showing a relationship that is then withdrawn,
 *     which reads as a fault rather than as speed. There is also no offline queue
 *     for a dependency, for exactly the same reason (`PWA_AND_OFFLINE.md`).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { isTaskBlocked, type TaskBlockedSummary } from "~/kernel/tasks";

import type { TaskActionData } from "./contract";
import { postTaskRecordAction } from "./task-inline-edit";
import { blockedSummaryOf, type SerializedTaskDependencies } from "./task-view";

/** What a dependency mutation concluded, in the terms a control needs. */
export interface DependencyOutcome {
  readonly ok: boolean;
  /** The server's own wording for a refusal. Never a status code. */
  readonly message?: string;
}

const OK: DependencyOutcome = { ok: true };

const GENERIC_REFUSAL =
  "That couldn’t be saved. Nothing was changed — try again.";

export interface TaskDependencyApi {
  readonly dependencies: SerializedTaskDependencies;
  /** Derived, exactly as the server derives it: incomplete blockers only. */
  readonly blocked: TaskBlockedSummary | null;
  readonly isBlocked: boolean;
  /** True while any dependency mutation is in flight. */
  readonly busy: boolean;
  readonly addBlocker: (blockerId: string) => Promise<DependencyOutcome>;
  readonly removeBlocker: (blockerId: string) => Promise<DependencyOutcome>;
}

const EMPTY: SerializedTaskDependencies = { blockedBy: [], blocks: [] };

/**
 * Drive one Task's dependencies.
 *
 * @param taskId the Task the relationships are read and written from
 * @param loaded the dependencies as the record's loader delivered them
 * @param basePath the task resource route prefix (tests only; `/tasks` in product)
 * @param onServerChange called after a mutation the SERVER confirmed, so the host
 *   can revalidate the surface behind the record — adding a blocker changes the
 *   row underneath from Planned to Blocked.
 */
export function useTaskDependencies(
  taskId: string,
  loaded: SerializedTaskDependencies | undefined,
  basePath = "/tasks",
  onServerChange?: () => void,
): TaskDependencyApi {
  const [dependencies, setDependencies] = useState<SerializedTaskDependencies>(
    loaded ?? EMPTY,
  );
  const [pending, setPending] = useState(0);
  /*
   * Re-seed from the loader's answer, but only when it is a DIFFERENT answer.
   * Comparing by reference is what stops a re-render of the host throwing away a
   * mutation's fresher result.
   */
  const seeded = useRef<SerializedTaskDependencies | undefined>(undefined);
  useEffect(() => {
    if (seeded.current !== loaded) {
      seeded.current = loaded;
      setDependencies(loaded ?? EMPTY);
    }
  }, [loaded]);

  const post = useCallback(
    async (
      fields: Readonly<Record<string, string>>,
    ): Promise<DependencyOutcome> => {
      setPending((count) => count + 1);
      try {
        const result: TaskActionData = await postTaskRecordAction(
          taskId,
          fields,
          basePath,
        );
        if (result.kind !== "dependency") {
          return { ok: false, message: GENERIC_REFUSAL };
        }
        if (result.status === "success") {
          setDependencies(result.dependencies);
          onServerChange?.();
          return OK;
        }
        return {
          ok: false,
          message:
            result.formError ??
            Object.values(result.fieldErrors ?? {})[0] ??
            GENERIC_REFUSAL,
        };
      } catch {
        // A dependency is never queued: see the module comment.
        return { ok: false, message: GENERIC_REFUSAL };
      } finally {
        setPending((count) => count - 1);
      }
    },
    [basePath, onServerChange, taskId],
  );

  const addBlocker = useCallback(
    (blockerId: string) => post({ intent: "dependency_add", blockerId }),
    [post],
  );
  const removeBlocker = useCallback(
    (blockerId: string) => post({ intent: "dependency_remove", blockerId }),
    [post],
  );

  const blocked = blockedSummaryOf(dependencies);
  return {
    dependencies,
    blocked,
    isBlocked: isTaskBlocked(blocked),
    busy: pending > 0,
    addBlocker,
    removeBlocker,
  };
}
