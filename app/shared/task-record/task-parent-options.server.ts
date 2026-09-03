/**
 * V2.8 CONV-02 — the ONE bounded parent-candidate read a Task surface makes.
 *
 * The shared row's inline Project editor and the shared bulk bar's "Move" offer
 * the workspace's bounded Project/Area candidates (`searchTaskParents`, limit
 * fifty — `/tasks`'s and Today's own bound); the searchable picker takes over
 * past that. CONV-01 wrote the read for the Project record
 * (`project-tasks-load.server.ts`); CONV-02's Waiting surface needs the same
 * fifty, and a third copy of the same mapping is how one surface comes to
 * offer a candidate without its identity mark. So the read lives here, once,
 * and both call it.
 *
 * ONE statement per surface load, never per row, never per "Load more" page —
 * the candidates do not change with the cursor. It fails SOFT to none: a
 * candidate read that could not be made narrows the menu to its searchable
 * escape hatch; it never takes the surface down.
 *
 * Plain TypeScript, no React and no `cloudflare:workers` import, so the kernel
 * budget tests can count it over a counting D1 exactly as the routes run it.
 */

import type { TaskRepository } from "~/kernel/tasks";

import type { TaskParentOption } from "./TaskRowFields";

/**
 * How many candidate parents the row's inline Project editor offers before its
 * searchable escape hatch takes over — `/tasks`'s and Today's own bound.
 */
export const TASK_PARENT_OPTION_LIMIT = 50;

export async function loadTaskParentOptions(
  tasks: TaskRepository,
): Promise<readonly TaskParentOption[]> {
  const candidates = await tasks
    .searchTaskParents({ limit: TASK_PARENT_OPTION_LIMIT })
    .catch(() => []);
  return candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    // DEBT-144 — the option carries the parent's identity, so the row's
    // optimistic mark is the parent's own colour from the moment it is chosen.
    iconKey: candidate.iconKey ?? null,
    colourSlot: candidate.colourSlot ?? null,
    colourRank: candidate.colourRank ?? null,
  }));
}
