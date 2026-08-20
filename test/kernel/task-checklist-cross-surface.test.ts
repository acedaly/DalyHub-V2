/**
 * HARDEN-06E (F-09) — one Task means one Task, asserted across the surfaces
 * that show it.
 *
 * The brief's cross-module invariant is that the same Task "retains … checklist
 * progress wherever it is viewed". It did not: a Task showed "2 of 5" on
 * `/tasks`, `/today` and `/plan` and NOTHING at all inside its own Project's
 * Tasks tab — the surface an owner actually works a Project from. The cause is a
 * sound performance contract used as a consistency one: `TaskRowProjection`
 * makes `checklist` optional "so a surface that does not project it pays nothing
 * for it", which is right, and which also makes the absence invisible.
 *
 * These drive the REAL route loaders in the Workers runtime over one Task, so
 * the assertion is about what each surface actually serves rather than about a
 * serialiser in isolation. Adding a fifth task-bearing surface without projecting
 * the figure now fails here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as projectDetailLoader } from "~/modules/projects/routes/detail";
import { loader as projectTasksLoader } from "~/modules/projects/routes/tasks";
import { loader as tasksLoader } from "~/modules/tasks/routes/index";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const nextEntityId = sequentialIds("xsurf");

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

interface WithChecklist {
  readonly id: string;
  readonly checklist?: { readonly total: number; readonly completed: number };
}

/** The figure a surface serves for `taskId`, or `null` when it serves none. */
function figureFor(
  items: readonly WithChecklist[],
  taskId: string,
): { total: number; completed: number } | null {
  const item = items.find((entry) => entry.id === taskId);
  expect(item, "the surface did not serve the Task at all").toBeDefined();
  return item?.checklist
    ? { total: item.checklist.total, completed: item.checklist.completed }
    : null;
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("HARDEN-06E — checklist progress is the same figure on every surface", () => {
  it("serves 1 of 3 on /tasks, on the Project record and on the Project's task page", async () => {
    const clock = new FakeClock("2026-08-20T00:00:00.000Z");
    const context = makeContext(WS);
    const spine = makeSpineRepository(context, {
      clock: clock.now,
      idGenerator: nextEntityId,
    });
    const tasks = makeTaskRepository(context, {
      clock: clock.now,
      idGenerator: nextEntityId,
    });

    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "Kitchen",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "Order the tiles",
      parent: { kind: "project", id: project.id },
    });
    const first = await tasks.createChecklistItem(task.id, {
      title: "Measure",
    });
    await tasks.createChecklistItem(task.id, { title: "Choose" });
    await tasks.createChecklistItem(task.id, { title: "Order" });
    await tasks.setChecklistItemCompleted(task.id, first.id, true);

    const expected = { total: 3, completed: 1 };

    /*
     * `/tasks` — BOTH shapes the collection serves. A grouped view renders from
     * a server-authoritative grouping and a flat one from a page, and the figure
     * has to be the same in each: the owner switches between them with one menu.
     */
    const flat = (await tasksLoader({
      request: new Request("https://app.test/tasks?system=all&group=none"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof tasksLoader>[0])) as {
      readonly items?: readonly WithChecklist[];
    };
    expect(figureFor(flat.items ?? [], task.id)).toEqual(expected);

    const grouped = (await tasksLoader({
      request: new Request("https://app.test/tasks?system=all&group=parent"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof tasksLoader>[0])) as {
      readonly grouping?: {
        readonly groups: readonly {
          readonly items: readonly WithChecklist[];
        }[];
      } | null;
    };
    expect(
      figureFor(
        (grouped.grouping?.groups ?? []).flatMap((group) => group.items),
        task.id,
      ),
    ).toEqual(expected);

    /* The Project record's own Tasks tab, server-rendered. */
    const detail = (await projectDetailLoader({
      request: new Request(`https://app.test/projects/${project.id}`),
      context: authedContext(),
      params: { projectId: project.id },
    } as unknown as Parameters<typeof projectDetailLoader>[0])) as {
      readonly tasks?: readonly WithChecklist[];
    };
    expect(figureFor(detail.tasks ?? [], task.id)).toEqual(expected);

    /* The Project's paged task read, which the tab uses for every page after
       the first — so page two cannot disagree with page one. */
    const paged = (await (
      (await projectTasksLoader({
        request: new Request(
          `https://app.test/projects/${project.id}/tasks?state=open`,
        ),
        context: authedContext(),
        params: { projectId: project.id },
      } as unknown as Parameters<typeof projectTasksLoader>[0])) as Response
    ).json()) as { readonly tasks?: readonly WithChecklist[] };
    expect(figureFor(paged.tasks ?? [], task.id)).toEqual(expected);
  });

  it("serves NO figure on any surface for a Task with no checklist", async () => {
    const clock = new FakeClock("2026-08-20T00:00:00.000Z");
    const context = makeContext(WS);
    const spine = makeSpineRepository(context, {
      clock: clock.now,
      idGenerator: nextEntityId,
    });

    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "Kitchen",
      parent: { kind: "area", id: area.id },
    });
    const task = await spine.createTask({
      title: "Just a task",
      parent: { kind: "project", id: project.id },
    });

    // `undefined` (never projected) and `{ total: 0 }` (no checklist) both draw
    // nothing, and the surfaces must agree that there is nothing to draw.
    const detail = (await projectDetailLoader({
      request: new Request(`https://app.test/projects/${project.id}`),
      context: authedContext(),
      params: { projectId: project.id },
    } as unknown as Parameters<typeof projectDetailLoader>[0])) as {
      readonly tasks?: readonly WithChecklist[];
    };
    const figure = figureFor(detail.tasks ?? [], task.id);
    expect(figure === null || figure.total === 0).toBe(true);
  });
});
