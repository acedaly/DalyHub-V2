import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskCreateAction } from "~/modules/tasks/routes/new";
import type { TasksCreateResult } from "~/modules/tasks/tasks-contract";
import type { CaptureContextContract } from "~/shared/capture/capture-context";

import {
  FakeClock,
  makeContext,
  makePersonRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner", email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

function spine() {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("tc"),
  });
}

function tasks() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("task"),
  });
}

function people() {
  return makePersonRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("person"),
  });
}

function projectSettings() {
  return makeProjectSettingsRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("projset"),
  });
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function runCreate(entries: Record<string, string>) {
  const response = (await taskCreateAction({
    request: new Request("https://app.test/tasks/new", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof taskCreateAction>[0])) as Response;
  return (await response.json()) as TasksCreateResult;
}

function contextFor(source: {
  readonly id: string;
  readonly type: CaptureContextContract["sourceEntityType"];
  readonly title: string;
}): string {
  const context: CaptureContextContract = {
    sourceEntityId: source.id,
    sourceEntityType: source.type,
    sourceEntityTitle: source.title,
    sourceModule: `${source.type}s`,
    originatingRoute: `/${source.type}s/${source.id}`,
    relationshipMeaning:
      source.type === "project" || source.type === "area"
        ? "parent"
        : "related",
    mode: "removable",
  };
  return JSON.stringify(context);
}

async function seedTwoProjects() {
  const s = spine();
  const area = await s.createArea({ title: "Area" });
  const projectA = await s.createProject({
    title: "Project A",
    parent: { kind: "area", id: area.id },
  });
  const projectB = await s.createProject({
    title: "Project B",
    parent: { kind: "area", id: area.id },
  });
  return { area, projectA, projectB };
}

async function structuralLinksFor(taskId: string) {
  return env.DB.prepare(
    `SELECT type, target_entity_id AS targetEntityId
       FROM entity_links
      WHERE workspace_id = ?
        AND source_entity_id = ?
        AND deleted_at IS NULL
        AND type IN ('task.belongs_to_project', 'task.belongs_to_area')
      ORDER BY type, target_entity_id`,
  )
    .bind(WS, taskId)
    .all<{ type: string; targetEntityId: string }>();
}

async function relatedLinksFor(taskId: string) {
  return env.DB.prepare(
    `SELECT type, target_entity_id AS targetEntityId
       FROM entity_links
      WHERE workspace_id = ?
        AND source_entity_id = ?
        AND deleted_at IS NULL
        AND type = 'task.relates_to'
      ORDER BY target_entity_id`,
  )
    .bind(WS, taskId)
    .all<{ type: string; targetEntityId: string }>();
}

async function countTaskEntities(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'task'",
  )
    .bind(WS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("POST /tasks/new capture context parent enforcement", () => {
  it("uses validated Project context instead of a conflicting submitted Project parent", async () => {
    const { area, projectA, projectB } = await seedTwoProjects();

    const result = await runCreate({
      title: "Contextual task",
      parentId: projectB.id,
      parentKind: "project",
      captureContext: contextFor({
        id: projectA.id,
        type: "project",
        title: projectA.title,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = await tasks().getTask(result.taskId);
    expect(task?.project?.id).toBe(projectA.id);
    expect(task?.area?.id).toBe(area.id);
    const links = await structuralLinksFor(result.taskId);
    expect(links.results).toEqual([
      { type: "task.belongs_to_project", targetEntityId: projectA.id },
    ]);
  });

  it("uses validated Area context instead of conflicting submitted parent fields", async () => {
    const { area, projectB } = await seedTwoProjects();

    const result = await runCreate({
      title: "Area contextual task",
      parentId: projectB.id,
      parentKind: "project",
      captureContext: contextFor({
        id: area.id,
        type: "area",
        title: area.title,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = await tasks().getTask(result.taskId);
    expect(task?.area?.id).toBe(area.id);
    expect(task?.project).toBeNull();
    expect(task?.area).toEqual({
      kind: "area",
      id: area.id,
      title: area.title,
    });
    const links = await structuralLinksFor(result.taskId);
    expect(links.results).toEqual([
      { type: "task.belongs_to_area", targetEntityId: area.id },
    ]);
  });

  it("still lets context-free Task creation use the submitted Project or Area parent", async () => {
    const { area, projectA } = await seedTwoProjects();

    const projectResult = await runCreate({
      title: "Normal project task",
      parentId: projectA.id,
      parentKind: "project",
    });
    expect(projectResult.ok).toBe(true);
    if (!projectResult.ok) return;
    expect((await tasks().getTask(projectResult.taskId))?.project?.id).toBe(
      projectA.id,
    );

    const areaResult = await runCreate({
      title: "Normal area task",
      parentId: area.id,
      parentKind: "area",
    });
    expect(areaResult.ok).toBe(true);
    if (!areaResult.ok) return;
    const areaTask = await tasks().getTask(areaResult.taskId);
    expect(areaTask?.project).toBeNull();
    expect(areaTask?.area).toEqual({
      kind: "area",
      id: area.id,
      title: area.title,
    });
  });

  it("keeps non-parent Person context as task.relates_to without changing the submitted parent", async () => {
    const { projectA } = await seedTwoProjects();
    const person = await people().create({ title: "Jane Smith" });

    const result = await runCreate({
      title: "Task about Jane",
      parentId: projectA.id,
      parentKind: "project",
      captureContext: contextFor({
        id: person.id,
        type: "person",
        title: person.title,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = await tasks().getTask(result.taskId);
    expect(task?.project?.id).toBe(projectA.id);
    const links = await relatedLinksFor(result.taskId);
    expect(links.results).toEqual([
      { type: "task.relates_to", targetEntityId: person.id },
    ]);
  });

  it("rejects invalid, deleted or wrong-type structural contexts instead of falling back", async () => {
    const { projectB } = await seedTwoProjects();
    await seedEntity(WS, "deleted-project", {
      type: "project",
      title: "Deleted Project",
      deletedAt: "2026-07-17T00:00:00.000Z",
    });
    await seedEntity(WS, "wrong-type", {
      type: "task",
      title: "Not a Project",
    });

    for (const sourceId of [
      "missing-project",
      "deleted-project",
      "wrong-type",
    ]) {
      const before = await countTaskEntities();
      const result = await runCreate({
        title: `Should not create ${sourceId}`,
        parentId: projectB.id,
        parentKind: "project",
        captureContext: contextFor({
          id: sourceId,
          type: "project",
          title: "Project A",
        }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.formError).toContain("capture context");
      }
      expect(await countTaskEntities()).toBe(before);
    }
  });

  it("does not let an archived contextual Project become an authoritative parent", async () => {
    const { projectA, projectB } = await seedTwoProjects();
    await projectSettings().archive(projectA.id);
    const before = await countTaskEntities();

    const result = await runCreate({
      title: "Archived project task",
      parentId: projectB.id,
      parentKind: "project",
      captureContext: contextFor({
        id: projectA.id,
        type: "project",
        title: projectA.title,
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formError).toBe(
        "That Project or Area is no longer available.",
      );
    }
    expect(await countTaskEntities()).toBe(before);
  });
});
