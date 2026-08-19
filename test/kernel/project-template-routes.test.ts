/**
 * PROJECT-02 — the trusted template boundaries, exercised as the surfaces use
 * them.
 *
 * `/projects/new`, `/projects/:projectId/mutate` and
 * `/projects/templates/:templateId/mutate` are the ONLY ways a template is
 * created, changed or turned into a Project. What matters here is that the
 * ACTIONS are right for every shape a browser can produce, and that no
 * browser-supplied value can widen them:
 *
 *   - creating a BLANK project is byte-for-byte the behaviour it had before
 *     templates existed;
 *   - a malformed, deleted or cross-workspace template id is refused and writes
 *     nothing;
 *   - an unavailable Area/Goal is refused and writes nothing;
 *   - workspace and actor come from the authenticated session, never the form.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import { env } from "cloudflare:test";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as createProjectAction } from "~/modules/projects/routes/new";
import type { CreateProjectResult } from "~/modules/projects/routes/new";
import { action as projectMutateAction } from "~/modules/projects/routes/mutate";
import type { ProjectMutationResult } from "~/modules/projects/routes/mutate";
import { action as templateMutateAction } from "~/modules/projects/routes/template-mutate";
import type { TemplateMutationResult } from "~/modules/projects/routes/template-mutate";

import {
  makeContext,
  makeProjectTemplateRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "other-workspace";

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  setAuthenticatedSession(context, session);
  return context;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function createProject(
  entries: Record<string, string>,
): Promise<CreateProjectResult> {
  const response = (await createProjectAction({
    request: new Request("https://app.test/projects/new", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createProjectAction>[0])) as Response;
  return (await response.json()) as CreateProjectResult;
}

async function mutateProject(
  projectId: string,
  entries: Record<string, string>,
): Promise<ProjectMutationResult> {
  const response = (await projectMutateAction({
    request: new Request(`https://app.test/projects/${projectId}/mutate`, {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof projectMutateAction>[0])) as Response;
  return (await response.json()) as ProjectMutationResult;
}

async function mutateTemplate(
  templateId: string,
  entries: Record<string, string>,
): Promise<TemplateMutationResult> {
  const response = (await templateMutateAction({
    request: new Request(
      `https://app.test/projects/templates/${templateId}/mutate`,
      { method: "POST", body: formData(entries) },
    ),
    context: authedContext(),
    params: { templateId },
  } as unknown as Parameters<typeof templateMutateAction>[0])) as Response;
  return (await response.json()) as TemplateMutationResult;
}

async function countRows(table: string, where = "1 = 1"): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

const context = () => makeContext(WS);

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

async function seedArea(ws = WS, title = "Work") {
  return await makeSpineRepository(makeContext(ws)).createArea({ title });
}

/** A template with two ordered tasks and one step. */
async function seedTemplate(ws = WS) {
  const templates = makeProjectTemplateRepository(makeContext(ws));
  const template = await templates.createTemplate({
    name: "Monthly reporting",
  });
  const first = await templates.addTask(template.id, {
    title: "Pull the numbers",
    priority: "p2",
  });
  await templates.addTask(template.id, { title: "Write the summary" });
  await templates.addChecklistItem(template.id, first.id, {
    title: "Headline figure",
  });
  return template;
}

describe("POST /projects/new", () => {
  it("creates a BLANK project exactly as it always did", async () => {
    const area = await seedArea();
    const result = await createProject({
      title: "A plain project",
      parentId: area.id,
      // The field the form always sends, empty. Blank creation must not depend
      // on it being absent.
      templateId: "",
      iconKey: "",
      colourSlot: "",
    });
    expect(result.ok).toBe(true);
    expect(await countRows("entities", "type = 'project'")).toBe(1);
    // No Tasks: a blank project is blank.
    expect(await countRows("entities", "type = 'task'")).toBe(0);
  });

  it("creates a project FROM a template, with its tasks and steps", async () => {
    const area = await seedArea();
    const template = await seedTemplate();
    const result = await createProject({
      title: "August reporting",
      parentId: area.id,
      templateId: template.id,
      iconKey: "",
      colourSlot: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const spine = makeSpineRepository(context());
    expect((await spine.getById(result.projectId))?.title).toBe(
      "August reporting",
    );
    const children = await spine.listChildren({
      parentId: result.projectId,
      childKind: "task",
    });
    expect(children.items.map((child) => child.title)).toEqual([
      "Pull the numbers",
      "Write the summary",
    ]);
    const checklist = await makeTaskRepository(context()).listChecklist(
      children.items[0]!.id,
    );
    expect(checklist.map((item) => item.title)).toEqual(["Headline figure"]);
    expect(checklist.every((item) => item.completed === false)).toBe(true);
  });

  it("refuses a malformed template id and writes nothing", async () => {
    const area = await seedArea();
    const result = await createProject({
      title: "Nope",
      parentId: area.id,
      // A syntactically impossible id: over the 64-character bound.
      templateId: "x".repeat(200),
      iconKey: "",
      colourSlot: "",
    });
    expect(result.ok).toBe(false);
    expect(await countRows("entities", "type = 'project'")).toBe(0);
  });

  it("refuses a template from ANOTHER workspace and writes nothing", async () => {
    const area = await seedArea();
    const foreign = await seedTemplate(OTHER);
    const result = await createProject({
      title: "Nope",
      parentId: area.id,
      templateId: foreign.id,
      iconKey: "",
      colourSlot: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Indistinguishable from "never existed" — the isolation guarantee,
      // expressed as a message.
      expect(result.fieldErrors?.templateId).toBe(
        "That template is no longer here.",
      );
    }
    expect(await countRows("entities", "type = 'project'")).toBe(0);
    expect(await countRows("entities", `type = 'task'`)).toBe(0);
  });

  it("refuses a DELETED template and writes nothing", async () => {
    const area = await seedArea();
    const template = await seedTemplate();
    await makeProjectTemplateRepository(context()).deleteTemplate(template.id);
    const result = await createProject({
      title: "Nope",
      parentId: area.id,
      templateId: template.id,
      iconKey: "",
      colourSlot: "",
    });
    expect(result.ok).toBe(false);
    expect(await countRows("entities", "type = 'project'")).toBe(0);
  });

  it("refuses an unavailable parent and writes nothing", async () => {
    const template = await seedTemplate();
    const result = await createProject({
      title: "Nope",
      // A Task id is not an Area or a Goal.
      parentId: template.id,
      templateId: template.id,
      iconKey: "",
      colourSlot: "",
    });
    expect(result.ok).toBe(false);
    expect(await countRows("entities", "type = 'project'")).toBe(0);
    expect(await countRows("entities", "type = 'task'")).toBe(0);
  });
});

describe("POST /projects/:projectId/mutate — save_as_template", () => {
  it("captures the Project's open work and reports what it captured", async () => {
    const area = await seedArea();
    const spine = makeSpineRepository(context());
    const project = await spine.createProject({
      title: "August reporting",
      parent: { kind: "area", id: area.id },
    });
    const tasks = makeTaskRepository(context());
    const open = await tasks.createTask({
      title: "Pull the numbers",
      parent: { kind: "project", id: project.id },
    });
    await tasks.createChecklistItem(open.id, { title: "Revenue" });
    const done = await tasks.createTask({
      title: "Last month's retro",
      parent: { kind: "project", id: project.id },
    });
    await tasks.completeTask(done.id);

    const result = await mutateProject(project.id, {
      intent: "save_as_template",
      name: "Monthly reporting",
    });
    expect(result.kind).toBe("saveAsTemplate");
    if (result.kind !== "saveAsTemplate" || !result.ok) {
      throw new Error("expected a successful capture");
    }
    expect(result.name).toBe("Monthly reporting");
    // ONE task: the completed one is history, not shape.
    expect(result.taskCount).toBe(1);
    expect(result.checklistCount).toBe(1);
  });

  it("refuses save_as_template on an ARCHIVED project", async () => {
    const area = await seedArea();
    const spine = makeSpineRepository(context());
    const project = await spine.createProject({
      title: "Old work",
      parent: { kind: "area", id: area.id },
    });
    await mutateProject(project.id, { intent: "archive" });
    const result = await mutateProject(project.id, {
      intent: "save_as_template",
    });
    // The route's own archived gate answers first, before the template
    // repository is reached — an archived Project is read-only, and capturing
    // it would be a mutation attempted against it.
    expect(result.kind).toBe("settings");
    expect(await countRows("entities", "type = 'project_template'")).toBe(0);
  });
});

describe("POST /projects/templates/:templateId/mutate", () => {
  it("refuses an unknown intent without writing", async () => {
    const template = await seedTemplate();
    const result = await mutateTemplate(template.id, { intent: "drop_table" });
    expect(result.ok).toBe(false);
    expect(await countRows("project_template_tasks")).toBe(2);
  });

  it("writes nothing into another workspace's template, whatever the intent", async () => {
    const foreign = await seedTemplate(OTHER);
    for (const intent of ["rename", "addTask", "deleteTask", "instantiate"]) {
      const result = await mutateTemplate(foreign.id, {
        intent,
        name: "Renamed",
        title: "Injected",
        taskId: "whatever",
        parentId: "whatever",
      });
      expect(result.ok, intent).toBe(false);
    }
    /*
     * `delete` is the ONE intent that reports `ok` for a template it cannot
     * see, and that is the correct answer rather than a leak: deletion is
     * idempotent by design, so "it is not there" is the outcome that was asked
     * for. Reporting a refusal here would DISCLOSE that a template with this id
     * exists somewhere — the one thing workspace isolation must not do. What
     * matters is that nothing was written, which the assertions below prove.
     */
    const deleted = await mutateTemplate(foreign.id, { intent: "delete" });
    expect(deleted.ok).toBe(true);

    const templates = makeProjectTemplateRepository(makeContext(OTHER));
    const detail = await templates.getTemplateDetail(foreign.id);
    expect(detail?.name).toBe("Monthly reporting");
    expect(detail?.tasks).toHaveLength(2);
    // And no Project was created in EITHER workspace by the instantiate above.
    expect(await countRows("entities", "type = 'project'")).toBe(0);
  });

  it("refuses an oversized task title and writes nothing", async () => {
    const template = await seedTemplate();
    const result = await mutateTemplate(template.id, {
      intent: "addTask",
      title: "x".repeat(2000),
    });
    expect(result.ok).toBe(false);
    expect(await countRows("project_template_tasks")).toBe(2);
  });

  it("instantiates, and refuses an unavailable parent without writing", async () => {
    const area = await seedArea();
    const template = await seedTemplate();

    const bad = await mutateTemplate(template.id, {
      intent: "instantiate",
      title: "Nope",
      parentId: "not-an-area",
    });
    expect(bad.ok).toBe(false);
    expect(await countRows("entities", "type = 'project'")).toBe(0);

    const good = await mutateTemplate(template.id, {
      intent: "instantiate",
      title: "August reporting",
      parentId: area.id,
    });
    expect(good.ok).toBe(true);
    expect(await countRows("entities", "type = 'project'")).toBe(1);
    expect(await countRows("entities", "type = 'task'")).toBe(2);
  });

  it("deletes a template without touching a Project made from it", async () => {
    const area = await seedArea();
    const template = await seedTemplate();
    const created = await mutateTemplate(template.id, {
      intent: "instantiate",
      title: "August reporting",
      parentId: area.id,
    });
    expect(created.ok).toBe(true);

    const deleted = await mutateTemplate(template.id, { intent: "delete" });
    expect(deleted.ok).toBe(true);

    expect(await countRows("entities", "type = 'project'")).toBe(1);
    expect(await countRows("entities", "type = 'task'")).toBe(2);
    expect(await countRows("task_checklist_items")).toBe(1);
  });
});
