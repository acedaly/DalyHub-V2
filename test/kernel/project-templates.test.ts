/**
 * PROJECT-02 — Project templates against the REAL database (Workers runtime,
 * isolated D1, committed migrations applied).
 *
 * Each of these proves a claim the SCHEMA or a TRANSACTION makes, rather than
 * one the interface merely promises:
 *
 *   - a template is NOT a Project: it writes no `spine_records` row, so it
 *     cannot be read as one, cannot be rolled up, and cannot be counted;
 *   - a template TASK is not a Task: no entity, no spine record, no link;
 *   - workspace isolation is absolute in both directions;
 *   - capturing a Project copies its SHAPE and leaves its HISTORY behind —
 *     completed and cancelled Tasks, dates, waiting states and checklist ticks;
 *   - instantiation mints a fresh id for every row, remaps every relationship,
 *     resets every tick and every completion, and commits as ONE batch;
 *   - a half-created Project is impossible: an unavailable parent creates
 *     nothing at all;
 *   - editing a template afterwards does not touch a Project made from it, and
 *     editing that Project does not touch the template;
 *   - deleting a template leaves its Projects and their work alone;
 *   - the bounds are enforced by the WRITE, not by a read-then-decide;
 *   - a maximal template — every task and every checklist item the bounds allow
 *     — really does commit in one batch against real D1.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import {
  MAX_TEMPLATE_CHECKLIST_ITEMS,
  MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
  MAX_TEMPLATE_TASKS,
  ProjectTemplateChecklistFullError,
  ProjectTemplateFullError,
  ProjectTemplateNotFoundError,
  ProjectTemplateParentUnavailableError,
  ProjectTemplateTaskNotFoundError,
  ProjectTemplateTooLargeError,
} from "~/kernel/project-templates";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeProjectTemplateRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { createProjectTemplateRepository } from "~/platform/storage/d1";

const WS = "ws_templates";
const OTHER = "ws_templates_other";

const nextEntityId = sequentialIds("tpl_ent");
const nextActivityId = sequentialIds("tpl_act");

function templates(ws: string) {
  return makeProjectTemplateRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-19T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function spine(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-19T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function tasks(ws: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-19T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** An Area to hang everything off. */
async function seedArea(ws: string, title = "Work") {
  return await spine(ws).createArea({ title });
}

async function countRows(table: string, where = "1 = 1"): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("a template is not a Project", () => {
  it("writes an entity and a detail row, and NO spine record", async () => {
    const template = await templates(WS).createTemplate({
      name: "Monthly reporting",
      description: "The reporting pack, start to finish.",
    });

    expect(
      await countRows(
        "entities",
        `id = '${template.id}' AND type = 'project_template'`,
      ),
    ).toBe(1);
    expect(
      await countRows(
        "project_template_details",
        `entity_id = '${template.id}'`,
      ),
    ).toBe(1);
    // The whole argument, in one assertion: no spine row means no rollup, no
    // completion, no parent, no health and no place in any Project count.
    expect(
      await countRows("spine_records", `entity_id = '${template.id}'`),
    ).toBe(0);
    // And it is not reachable AS a spine record either.
    expect(await spine(WS).getById(template.id)).toBeNull();
  });

  it("does not appear in the Projects projection or its lifecycle counts", async () => {
    const area = await seedArea(WS);
    await spine(WS).createProject({
      title: "Real project",
      parent: { kind: "area", id: area.id },
    });
    await templates(WS).createTemplate({ name: "Monthly reporting" });

    const { makeProjectRepository } = await import("./support");
    const projects = makeProjectRepository(makeContext(WS));
    const page = await projects.listProjects({});
    expect(page.items.map((item) => item.title)).toEqual(["Real project"]);
    const counts = await projects.countProjectsByLifecycle();
    expect(counts.active).toBe(1);
    expect(counts.completed + counts.archived).toBe(0);
  });

  it("keeps its tasks out of `entities`, `spine_records` and `entity_links`", async () => {
    const template = await templates(WS).createTemplate({ name: "Onboarding" });
    const task = await templates(WS).addTask(template.id, {
      title: "Send the welcome pack",
    });
    await templates(WS).addChecklistItem(template.id, task.id, {
      title: "Attach the brochure",
    });

    expect(await countRows("entities", "type = 'task'")).toBe(0);
    expect(await countRows("spine_records", "kind = 'task'")).toBe(0);
    expect(await countRows("entity_links")).toBe(0);
    // The rows DO exist — as rows.
    expect(await countRows("project_template_tasks")).toBe(1);
    expect(await countRows("project_template_checklist_items")).toBe(1);
  });
});

describe("workspace isolation", () => {
  it("hides a template from another workspace, in both directions", async () => {
    const mine = await templates(WS).createTemplate({ name: "Mine" });
    expect(await templates(OTHER).getTemplate(mine.id)).toBeNull();
    expect(await templates(OTHER).getTemplateDetail(mine.id)).toBeNull();
    expect((await templates(OTHER).listTemplates()).items).toEqual([]);
    await expect(
      templates(OTHER).addTask(mine.id, { title: "Sneak in" }),
    ).rejects.toBeInstanceOf(ProjectTemplateNotFoundError);
    await expect(
      templates(OTHER).instantiate(mine.id, { parentId: "anything" }),
    ).rejects.toBeInstanceOf(ProjectTemplateNotFoundError);
  });

  it("refuses to instantiate under another workspace's Area", async () => {
    const foreignArea = await seedArea(OTHER, "Someone else's area");
    const template = await templates(WS).createTemplate({ name: "Mine" });
    await expect(
      templates(WS).instantiate(template.id, { parentId: foreignArea.id }),
    ).rejects.toBeInstanceOf(ProjectTemplateParentUnavailableError);
    expect(await countRows("entities", "type = 'project'")).toBe(0);
  });
});

describe("capturing a Project", () => {
  /** A Project with a mixture of shape and history. */
  async function seedRichProject() {
    const area = await seedArea(WS);
    const project = await spine(WS).createProject({
      title: "August reporting",
      parent: { kind: "area", id: area.id },
    });
    const repo = tasks(WS);
    const open = await repo.createTask({
      title: "Pull the numbers",
      parent: { kind: "project", id: project.id },
    });
    await repo.updateTask(open.id, {
      priority: "p2",
      dueDate: "2026-08-31",
      scheduledDate: "2026-08-25",
      description: "From the warehouse export.",
    });
    await repo.createChecklistItem(open.id, { title: "Revenue" });
    const ticked = await repo.createChecklistItem(open.id, { title: "Costs" });
    await repo.setChecklistItemCompleted(open.id, ticked.id, true);

    const done = await repo.createTask({
      title: "Last month's retro",
      parent: { kind: "project", id: project.id },
    });
    await repo.completeTask(done.id);

    const cancelled = await repo.createTask({
      title: "Abandoned idea",
      parent: { kind: "project", id: project.id },
    });
    await repo.updateTask(cancelled.id, { status: "cancelled" });

    const someday = await repo.createTask({
      title: "Maybe automate this",
      parent: { kind: "project", id: project.id },
    });
    await repo.updateTask(someday.id, { commitmentState: "someday" });

    return { area, project, open };
  }

  it("copies the SHAPE and leaves the HISTORY behind", async () => {
    const { project, area } = await seedRichProject();
    const summary = await templates(WS).createTemplateFromProject(project.id);
    const detail = await templates(WS).getTemplateDetail(summary.id);

    // Only the open, committed Task travels.
    expect(detail?.tasks.map((task) => task.title)).toEqual([
      "Pull the numbers",
    ]);
    const [task] = detail!.tasks;
    // Structure and intentional defaults: title, description, priority.
    expect(task!.priority).toBe("p2");
    expect(task!.description).toContain("warehouse export");
    // The checklist STRUCTURE, in order, with no tick anywhere to copy.
    expect(task!.checklist.map((item) => item.title)).toEqual([
      "Revenue",
      "Costs",
    ]);
    expect(task!.checklist.map((item) => item.position)).toEqual([0, 1]);
    // The Project's own Area becomes the template's DEFAULT, not a link.
    expect(detail?.defaultParent).toEqual({
      kind: "area",
      id: area.id,
      title: "Work",
    });
    expect(
      await countRows("entity_links", `source_entity_id = '${summary.id}'`),
    ).toBe(0);
    // The template's name defaults to the Project's title.
    expect(detail?.name).toBe("August reporting");
  });

  it("leaves the source Project completely unchanged", async () => {
    const { project, open } = await seedRichProject();
    const before = await tasks(WS).getTask(open.id);
    await templates(WS).createTemplateFromProject(project.id);
    const after = await tasks(WS).getTask(open.id);
    expect(after).toEqual(before);
    expect((await spine(WS).getById(project.id))?.title).toBe(
      "August reporting",
    );
  });

  it("refuses a Project whose task holds MORE steps than a template step may", async () => {
    /*
     * A live Task's checklist may hold a hundred items; a template step may hold
     * twenty. Copying the first twenty and dropping the rest would produce a
     * template that silently disagrees with the Project it claims to be the
     * shape of — so it refuses, and the message names the number.
     */
    const area = await seedArea(WS);
    const project = await spine(WS).createProject({
      title: "Deep",
      parent: { kind: "area", id: area.id },
    });
    const repo = tasks(WS);
    const task = await repo.createTask({
      title: "One very long checklist",
      parent: { kind: "project", id: project.id },
    });
    for (
      let index = 0;
      index <= MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK;
      index += 1
    ) {
      await repo.createChecklistItem(task.id, { title: `Step ${index}` });
    }
    await expect(
      templates(WS).createTemplateFromProject(project.id),
    ).rejects.toBeInstanceOf(ProjectTemplateTooLargeError);
    expect(await countRows("entities", "type = 'project_template'")).toBe(0);
    expect(await countRows("project_template_checklist_items")).toBe(0);
  });

  it("refuses a Project larger than a template may hold, and writes nothing", async () => {
    const area = await seedArea(WS);
    const project = await spine(WS).createProject({
      title: "Enormous",
      parent: { kind: "area", id: area.id },
    });
    const repo = tasks(WS);
    for (let index = 0; index <= MAX_TEMPLATE_TASKS; index += 1) {
      await repo.createTask({
        title: `Step ${index}`,
        parent: { kind: "project", id: project.id },
      });
    }
    await expect(
      templates(WS).createTemplateFromProject(project.id),
    ).rejects.toBeInstanceOf(ProjectTemplateTooLargeError);
    // Refused, not truncated: a template that silently dropped work would be a
    // shape that lies.
    expect(await countRows("entities", "type = 'project_template'")).toBe(0);
    expect(await countRows("project_template_tasks")).toBe(0);
  });
});

describe("instantiation", () => {
  async function seedTemplate() {
    const repo = templates(WS);
    const template = await repo.createTemplate({
      name: "Monthly reporting",
      description: "The reporting pack.",
    });
    const first = await repo.addTask(template.id, {
      title: "Pull the numbers",
      priority: "p2",
      description: "From the warehouse export.",
    });
    const second = await repo.addTask(template.id, {
      title: "Write the summary",
    });
    await repo.addChecklistItem(template.id, second.id, {
      title: "Headline figure",
    });
    await repo.addChecklistItem(template.id, second.id, {
      title: "One risk, one win",
    });
    return { template, first, second };
  }

  it("creates a real Project with every row freshly identified", async () => {
    const area = await seedArea(WS);
    const { template, first, second } = await seedTemplate();

    const result = await templates(WS).instantiate(template.id, {
      title: "August reporting",
      parentId: area.id,
    });

    expect(result.taskCount).toBe(2);
    expect(result.checklistCount).toBe(2);

    // The Project is a REAL Project: entity, spine record, structural link.
    const project = await spine(WS).getById(result.projectId);
    expect(project?.kind).toBe("project");
    expect(project?.title).toBe("August reporting");
    expect(project?.parent).toEqual({ kind: "area", id: area.id });

    // Fresh identity everywhere. Nothing points back at the template.
    expect(result.projectId).not.toBe(template.id);
    const children = await spine(WS).listChildren({
      parentId: result.projectId,
      childKind: "task",
    });
    const created = children.items;
    expect(created.map((task) => task.title)).toEqual([
      "Pull the numbers",
      "Write the summary",
    ]);
    for (const task of created) {
      expect(task.id).not.toBe(first.id);
      expect(task.id).not.toBe(second.id);
    }
    expect(
      await countRows(
        "entity_links",
        `target_entity_id = '${template.id}' OR source_entity_id = '${template.id}'`,
      ),
    ).toBe(0);
  });

  it("creates the Tasks in the TEMPLATE's order, not a random one", async () => {
    /*
     * The regression test for a real defect. Every Task in the batch is written
     * at the same instant, and a Project's task list reads in the canonical
     * `(created_at, id)` sequence — so with one shared timestamp the tiebreak
     * fell to a random UUID and a template's order was lost on the way into the
     * Project. Ten steps, reordered, is what makes the failure unmistakable
     * rather than a coin toss.
     */
    const area = await seedArea(WS);
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Ordered" });
    const titles = Array.from({ length: 10 }, (_, index) => `Step ${index}`);
    const ids: string[] = [];
    for (const title of titles) {
      ids.push((await repo.addTask(template.id, { title })).id);
    }
    // Reverse the template, so the created order cannot accidentally match the
    // order the rows were inserted in.
    await repo.reorderTasks(template.id, [...ids].reverse());

    const result = await repo.instantiate(template.id, { parentId: area.id });
    const children = await spine(WS).listChildren({
      parentId: result.projectId,
      childKind: "task",
      limit: 50,
    });
    expect(children.items.map((child) => child.title)).toEqual(
      [...titles].reverse(),
    );
  });

  it("starts every Task open, undated and unplanned", async () => {
    const area = await seedArea(WS);
    const { template } = await seedTemplate();
    const result = await templates(WS).instantiate(template.id, {
      parentId: area.id,
    });
    const children = await spine(WS).listChildren({
      parentId: result.projectId,
      childKind: "task",
    });
    for (const child of children.items) {
      const task = await tasks(WS).getTask(child.id);
      expect(task?.completedAt).toBeNull();
      expect(task?.status).toBe("todo");
      expect(task?.dueDate).toBeNull();
      expect(task?.scheduledDate).toBeNull();
      expect(task?.timeSector).toBeNull();
      expect(task?.commitmentState).toBe("active");
      expect(task?.waiting).toBeNull();
      expect(task?.delegation).toBeNull();
      expect(task?.recurrence ?? null).toBeNull();
    }
  });

  it("copies checklist structure with every tick reset, and fresh ids", async () => {
    const area = await seedArea(WS);
    const { template, second } = await seedTemplate();
    const result = await templates(WS).instantiate(template.id, {
      parentId: area.id,
    });
    const children = await spine(WS).listChildren({
      parentId: result.projectId,
      childKind: "task",
    });
    const summaryTask = children.items.find(
      (item) => item.title === "Write the summary",
    );
    const checklist = await tasks(WS).listChecklist(summaryTask!.id);
    expect(checklist.map((item) => item.title)).toEqual([
      "Headline figure",
      "One risk, one win",
    ]);
    expect(checklist.map((item) => item.position)).toEqual([0, 1]);
    expect(checklist.every((item) => item.completed === false)).toBe(true);
    const templateItems =
      (await templates(WS).getTemplateDetail(template.id))?.tasks.find(
        (task) => task.id === second.id,
      )?.checklist ?? [];
    const templateItemIds = new Set(templateItems.map((item) => item.id));
    for (const item of checklist) {
      expect(templateItemIds.has(item.id)).toBe(false);
    }
  });

  it("clones no Activity from the template's own history", async () => {
    const area = await seedArea(WS);
    const { template } = await seedTemplate();
    const result = await templates(WS).instantiate(template.id, {
      parentId: area.id,
    });
    /*
     * The new Project's Activity is exactly what CREATING it produced — one
     * `project.created_from_template` event. Nothing from the template's own
     * timeline (its creation, its edits) is copied onto it.
     */
    const rows = await env.DB.prepare(
      `SELECT a.type AS type FROM activities a
       JOIN activity_subjects s ON s.activity_id = a.id
       WHERE s.entity_id = ?`,
    )
      .bind(result.projectId)
      .all<{ type: string }>();
    expect((rows.results ?? []).map((row) => row.type)).toEqual([
      "project.created_from_template",
    ]);
  });

  it("creates NOTHING when the chosen parent is unavailable", async () => {
    const area = await seedArea(WS);
    const { template } = await seedTemplate();
    await spine(WS).softDelete(area.id);

    await expect(
      templates(WS).instantiate(template.id, { parentId: area.id }),
    ).rejects.toBeInstanceOf(ProjectTemplateParentUnavailableError);

    // The whole cascade declined together. No Project, no Tasks, no checklist,
    // no links, no Activity — the half-created Project this design forbids.
    expect(await countRows("entities", "type = 'project'")).toBe(0);
    expect(await countRows("entities", "type = 'task'")).toBe(0);
    expect(await countRows("task_checklist_items")).toBe(0);
    expect(
      await countRows("activities", "type = 'project.created_from_template'"),
    ).toBe(0);
  });

  it("creates NOTHING when the template is deleted mid-flight", async () => {
    /*
     * The gap between reading the template and committing the batch is real: an
     * owner can delete a template on another device while this drawer is open.
     * The Project's own insert re-asserts the template is still active, so the
     * whole cascade declines together rather than producing a Project from a
     * template that no longer exists.
     */
    const area = await seedArea(WS);
    const { template } = await seedTemplate();
    const repo = templates(WS);

    // Delete AFTER the detail read the caller would already have made, and
    // before the batch — which is what the gate exists for. Racing the two
    // calls is the closest a test can get to the real window.
    const [outcome] = await Promise.allSettled([
      repo.instantiate(template.id, { parentId: area.id }),
      repo.deleteTemplate(template.id),
    ]);

    // Whichever order the two land in, the invariant is the same: there is
    // never a Project whose template was already gone when it committed.
    if (outcome.status === "rejected") {
      expect(await countRows("entities", "type = 'project'")).toBe(0);
      expect(await countRows("entities", "type = 'task'")).toBe(0);
      expect(await countRows("task_checklist_items")).toBe(0);
    } else {
      // If the instantiation won, it is a WHOLE Project — never a partial one.
      expect(await countRows("entities", "type = 'project'")).toBe(1);
      expect(await countRows("entities", "type = 'task'")).toBe(2);
      expect(await countRows("task_checklist_items")).toBe(2);
    }

    // And once the delete has definitely landed, a fresh attempt creates
    // nothing at all.
    const projectsBefore = await countRows("entities", "type = 'project'");
    const tasksBefore = await countRows("entities", "type = 'task'");
    await expect(
      repo.instantiate(template.id, { parentId: area.id }),
    ).rejects.toBeInstanceOf(ProjectTemplateNotFoundError);
    expect(await countRows("entities", "type = 'project'")).toBe(
      projectsBefore,
    );
    expect(await countRows("entities", "type = 'task'")).toBe(tasksBefore);
  });

  it("refuses a deleted template and creates nothing", async () => {
    const area = await seedArea(WS);
    const { template } = await seedTemplate();
    await templates(WS).deleteTemplate(template.id);
    await expect(
      templates(WS).instantiate(template.id, { parentId: area.id }),
    ).rejects.toBeInstanceOf(ProjectTemplateNotFoundError);
    expect(await countRows("entities", "type = 'project'")).toBe(0);
  });

  it("creates two independent Projects when instantiated twice", async () => {
    const area = await seedArea(WS);
    const { template } = await seedTemplate();
    const [a, b] = await Promise.all([
      templates(WS).instantiate(template.id, {
        title: "August",
        parentId: area.id,
      }),
      templates(WS).instantiate(template.id, {
        title: "September",
        parentId: area.id,
      }),
    ]);
    expect(a.projectId).not.toBe(b.projectId);
    // Two Projects, four Tasks, four checklist items — each instantiation is a
    // separate act, and a simultaneous pair produces neither a merge nor a
    // clash.
    expect(await countRows("entities", "type = 'project'")).toBe(2);
    expect(await countRows("entities", "type = 'task'")).toBe(4);
    expect(await countRows("task_checklist_items")).toBe(4);
  });

  it("commits a MAXIMAL template in one batch against real D1", async () => {
    /*
     * The measurement behind `MAX_TEMPLATE_TASKS` and
     * `MAX_TEMPLATE_CHECKLIST_ITEMS`: a template filled to both bounds really
     * does instantiate, in one batch, against the real database. If a future
     * change raised a bound past what D1 will commit, this is what fails.
     */
    const area = await seedArea(WS);
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Maximal" });
    const perTask = Math.floor(
      MAX_TEMPLATE_CHECKLIST_ITEMS / MAX_TEMPLATE_TASKS,
    );
    for (let index = 0; index < MAX_TEMPLATE_TASKS; index += 1) {
      const task = await repo.addTask(template.id, { title: `Step ${index}` });
      for (let item = 0; item < perTask; item += 1) {
        await repo.addChecklistItem(template.id, task.id, {
          title: `Check ${index}-${item}`,
        });
      }
    }
    const result = await repo.instantiate(template.id, { parentId: area.id });
    expect(result.taskCount).toBe(MAX_TEMPLATE_TASKS);
    expect(result.checklistCount).toBe(MAX_TEMPLATE_TASKS * perTask);
    expect(await countRows("entities", "type = 'task'")).toBe(
      MAX_TEMPLATE_TASKS,
    );
    expect(await countRows("task_checklist_items")).toBe(
      MAX_TEMPLATE_TASKS * perTask,
    );
  });
});

describe("a template and its Projects are independent", () => {
  it("editing the template does not change an existing Project", async () => {
    const area = await seedArea(WS);
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Monthly reporting" });
    const step = await repo.addTask(template.id, { title: "Pull the numbers" });
    const created = await repo.instantiate(template.id, { parentId: area.id });

    await repo.updateTemplate(template.id, { name: "Quarterly reporting" });
    await repo.updateTask(template.id, step.id, { title: "Pull the figures" });
    await repo.addTask(template.id, { title: "A step added later" });

    const children = await spine(WS).listChildren({
      parentId: created.projectId,
      childKind: "task",
    });
    expect(children.items.map((task) => task.title)).toEqual([
      "Pull the numbers",
    ]);
    expect((await spine(WS).getById(created.projectId))?.title).toBe(
      "Monthly reporting",
    );
  });

  it("editing the Project does not change the template", async () => {
    const area = await seedArea(WS);
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Monthly reporting" });
    await repo.addTask(template.id, { title: "Pull the numbers" });
    const created = await repo.instantiate(template.id, { parentId: area.id });

    const children = await spine(WS).listChildren({
      parentId: created.projectId,
      childKind: "task",
    });
    await tasks(WS).completeTask(children.items[0]!.id);
    await spine(WS).rename(created.projectId, "August reporting");

    const detail = await repo.getTemplateDetail(template.id);
    expect(detail?.name).toBe("Monthly reporting");
    expect(detail?.tasks.map((task) => task.title)).toEqual([
      "Pull the numbers",
    ]);
  });

  it("deleting the template leaves its Projects and their work alone", async () => {
    const area = await seedArea(WS);
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Monthly reporting" });
    const step = await repo.addTask(template.id, { title: "Pull the numbers" });
    await repo.addChecklistItem(template.id, step.id, { title: "Revenue" });
    const created = await repo.instantiate(template.id, { parentId: area.id });

    const deleted = await repo.deleteTemplate(template.id);
    expect(deleted.changed).toBe(true);
    // Idempotent: deleting again is the outcome that was asked for.
    expect((await repo.deleteTemplate(template.id)).changed).toBe(false);

    expect(await repo.getTemplate(template.id)).toBeNull();
    expect((await spine(WS).getById(created.projectId))?.title).toBe(
      "Monthly reporting",
    );
    const children = await spine(WS).listChildren({
      parentId: created.projectId,
      childKind: "task",
    });
    expect(children.items).toHaveLength(1);
    expect(await tasks(WS).listChecklist(children.items[0]!.id)).toHaveLength(
      1,
    );
    // The template's own rows are RETAINED, so a restore is faithful.
    expect(await countRows("project_template_tasks")).toBe(1);
  });
});

describe("template contents", () => {
  it("keeps positions dense across add, delete and reorder", async () => {
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Onboarding" });
    const a = await repo.addTask(template.id, { title: "A" });
    const b = await repo.addTask(template.id, { title: "B" });
    const c = await repo.addTask(template.id, { title: "C" });
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);

    await repo.deleteTask(template.id, b.id);
    let detail = await repo.getTemplateDetail(template.id);
    expect(detail?.tasks.map((task) => [task.title, task.position])).toEqual([
      ["A", 0],
      ["C", 1],
    ]);

    await repo.reorderTasks(template.id, [c.id, a.id]);
    detail = await repo.getTemplateDetail(template.id);
    expect(detail?.tasks.map((task) => [task.title, task.position])).toEqual([
      ["C", 0],
      ["A", 1],
    ]);
  });

  it("refuses a reorder that does not name exactly the current tasks", async () => {
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Onboarding" });
    const a = await repo.addTask(template.id, { title: "A" });
    await repo.addTask(template.id, { title: "B" });
    // A stale list, missing the task another device added.
    await expect(repo.reorderTasks(template.id, [a.id])).rejects.toBeInstanceOf(
      ProjectTemplateTaskNotFoundError,
    );
    const detail = await repo.getTemplateDetail(template.id);
    expect(detail?.tasks.map((task) => task.position)).toEqual([0, 1]);
  });

  it("deletes a task's checklist with it", async () => {
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Onboarding" });
    const task = await repo.addTask(template.id, { title: "A" });
    await repo.addChecklistItem(template.id, task.id, { title: "One" });
    await repo.addChecklistItem(template.id, task.id, { title: "Two" });
    await repo.deleteTask(template.id, task.id);
    expect(await countRows("project_template_checklist_items")).toBe(0);
  });
});

describe("bounds are enforced by the write", () => {
  it("refuses the task past MAX_TEMPLATE_TASKS", async () => {
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Big" });
    for (let index = 0; index < MAX_TEMPLATE_TASKS; index += 1) {
      await repo.addTask(template.id, { title: `Step ${index}` });
    }
    await expect(
      repo.addTask(template.id, { title: "One too many" }),
    ).rejects.toBeInstanceOf(ProjectTemplateFullError);
    expect(await countRows("project_template_tasks")).toBe(MAX_TEMPLATE_TASKS);
  });

  it("holds the bound under CONCURRENT adds at the limit", async () => {
    /*
     * The TASKS-13 lesson, applied one level up. Both adds read a template
     * holding thirty-nine tasks; only one of them may commit, because the count
     * is asserted by the INSERT itself and evaluated at its own commit rather
     * than by a decision made in TypeScript beforehand.
     */
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Racing" });
    for (let index = 0; index < MAX_TEMPLATE_TASKS - 1; index += 1) {
      await repo.addTask(template.id, { title: `Step ${index}` });
    }
    const outcomes = await Promise.allSettled([
      repo.addTask(template.id, { title: "First" }),
      repo.addTask(template.id, { title: "Second" }),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(await countRows("project_template_tasks")).toBe(MAX_TEMPLATE_TASKS);
  });

  it("refuses the checklist item past the per-task bound", async () => {
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Deep" });
    const task = await repo.addTask(template.id, { title: "A" });
    for (
      let index = 0;
      index < MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK;
      index += 1
    ) {
      await repo.addChecklistItem(template.id, task.id, {
        title: `Check ${index}`,
      });
    }
    await expect(
      repo.addChecklistItem(template.id, task.id, { title: "One too many" }),
    ).rejects.toBeInstanceOf(ProjectTemplateChecklistFullError);
    expect(await countRows("project_template_checklist_items")).toBe(
      MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
    );
  });

  it("refuses the checklist item past the template's TOTAL bound", async () => {
    const repo = templates(WS);
    const template = await repo.createTemplate({ name: "Wide" });
    const perTask = MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK;
    const fullTasks = Math.floor(MAX_TEMPLATE_CHECKLIST_ITEMS / perTask);
    for (let t = 0; t < fullTasks; t += 1) {
      const task = await repo.addTask(template.id, { title: `Step ${t}` });
      for (let index = 0; index < perTask; index += 1) {
        await repo.addChecklistItem(template.id, task.id, {
          title: `Check ${t}-${index}`,
        });
      }
    }
    const spare = await repo.addTask(template.id, { title: "Spare" });
    const remaining = MAX_TEMPLATE_CHECKLIST_ITEMS - fullTasks * perTask;
    for (let index = 0; index < remaining; index += 1) {
      await repo.addChecklistItem(template.id, spare.id, {
        title: `Filler ${index}`,
      });
    }
    await expect(
      repo.addChecklistItem(template.id, spare.id, { title: "One too many" }),
    ).rejects.toBeInstanceOf(ProjectTemplateChecklistFullError);
    expect(await countRows("project_template_checklist_items")).toBe(
      MAX_TEMPLATE_CHECKLIST_ITEMS,
    );
  });
});

describe("query bounds", () => {
  it("reads a page of templates in a fixed number of statements", async () => {
    const repo = templates(WS);
    for (let index = 0; index < 12; index += 1) {
      const template = await repo.createTemplate({ name: `Template ${index}` });
      const task = await repo.addTask(template.id, { title: "A step" });
      await repo.addChecklistItem(template.id, task.id, { title: "A check" });
    }

    const counting = countingDb(env.DB);
    const bounded = createProjectTemplateRepository(
      counting.db,
      makeContext(WS),
    );
    counting.reset();
    const page = await bounded.listTemplates();
    expect(page.items).toHaveLength(12);
    expect(page.items.every((item) => item.taskCount === 1)).toBe(true);
    expect(page.items.every((item) => item.checklistCount === 1)).toBe(true);
    /*
     * Three statements for twelve templates: the list, then ONE grouped task
     * count and ONE grouped checklist count over the whole page. Never a query
     * per template — that is the property `no N+1` actually asks for, and this
     * is the assertion that keeps it structural.
     */
    expect(counting.prepareCount()).toBe(3);
  });
});
